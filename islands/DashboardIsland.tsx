/**
 * Dashboard Island - Simplified with Extracted Components
 *
 * Clean grid layout coordinating cards
 */

import { conversationData } from "@signals/conversationStore.ts";
import { renameSpeaker, setActionItems } from "@signals/actionItemsStore.ts";
import {
  clearCompletedActionItems,
  completeAllActionItems,
} from "@core/orchestration/conversation-ops.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import { sendWhiteboardUpdate } from "@signals/partyService.ts";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { showToast } from "@utils/toast.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import TranscriptCard from "../components/TranscriptCard.tsx";
import TranscriptBack from "../components/TranscriptBack.tsx";
import SummaryCard from "../components/SummaryCard.tsx";
import SummaryBack from "../components/SummaryBack.tsx";
import ActionItemsCard from "../components/ActionItemsCard.tsx";
import ActionItemsBack from "../components/ActionItemsBack.tsx";
import {
  listRecordings,
  type StoredRecording,
} from "@core/storage/recordingsDB.ts";
import { getAllConversations } from "../core/storage/localStorage.ts";
import { serializeBackup } from "../core/storage/backup.ts";
import TopicVisualizationsCard from "./TopicVisualizationsCard.tsx";
import SharedWhiteboard from "./SharedWhiteboard.tsx";
import FlipCard from "./FlipCard.tsx";
import ReaderModal from "./ReaderModal.tsx";

/** Minimum seconds between auto-draws so it doesn't fire too often. */
const AUTO_DRAW_COOLDOWN_MS = 30_000;
/** Fire an auto-draw every Nth transcript chunk. */
const AUTO_DRAW_EVERY = 3;

export default function DashboardIsland() {
  // Throttle whiteboard broadcasts during active drawing: Excalidraw's
  // onChange fires at pointer-move rate and scenes run up to 500KB, so an
  // ungated send is megabytes/sec through the room. Leading send + trailing
  // send so the final stroke state always lands.
  // conversationData persistence is debounced at 2s to avoid hammering signals.
  const WB_THROTTLE_MS = 200;
  const lastWhiteboardPush = useRef(0);
  const wbTrailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSceneChange(scene: string) {
    const now = Date.now();
    const elapsed = now - lastWhiteboardPush.current;
    if (wbTrailingTimer.current) clearTimeout(wbTrailingTimer.current);
    if (elapsed >= WB_THROTTLE_MS) {
      lastWhiteboardPush.current = now;
      sendWhiteboardUpdate(scene);
    } else {
      wbTrailingTimer.current = setTimeout(() => {
        lastWhiteboardPush.current = Date.now();
        sendWhiteboardUpdate(scene);
      }, WB_THROTTLE_MS - elapsed);
    }

    // Debounce conversationData write — only persist after user stops drawing.
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (conversationData.value) {
        conversationData.value = {
          ...conversationData.value,
          whiteboardScene: scene,
        };
      }
    }, 2000);
  }

  // ---------------------------------------------------------------
  // The board draws itself from the conversation.
  // Manual: click the pencil.  Auto: every few transcript chunks.
  // ---------------------------------------------------------------
  const isDrawing = useSignal(false);
  const transcriptChunkCount = useRef(0);
  const lastAutoDraw = useRef(0);
  const lastDrawnLength = useRef(0);
  const whiteboardRef = useRef<HTMLDivElement>(null);

  // Takes (with append receipts) for the Summary card's Pulse back. Reloaded
  // whenever the conversation changes — an append finishing updates the store,
  // which re-runs this and picks up the freshly stamped receipt.
  const takes = useSignal<StoredRecording[]>([]);
  const activeConversationId = conversationData.value?.conversation.id ?? "";
  useEffect(() => {
    let cancelled = false;
    if (!activeConversationId) {
      takes.value = [];
      return;
    }
    listRecordings(activeConversationId).then((stored) => {
      if (!cancelled) takes.value = stored;
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, conversationData.value]);

  // Same backup as the history drawer — surfaced on the Pulse back so the
  // saving story lives next to the growing story.
  function downloadBackup() {
    try {
      const json = serializeBackup(
        getAllConversations(),
        new Date().toISOString(),
      );
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const dateTag = new Date().toISOString().slice(0, 10);
      anchor.download = `promapper-backup-${dateTag}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded — keep it somewhere safe", "success");
    } catch (error) {
      console.error("Backup failed:", error);
      showToast("Couldn't build the backup", "error");
    }
  }

  function getExcalidrawAPI() {
    const el = whiteboardRef.current as
      | (HTMLElement & {
        excalidrawAPI?: {
          getSceneElements?: () => unknown[];
          updateScene(
            opts: { elements: unknown[]; commitToHistory?: boolean },
          ): void;
          exportToBlob(opts: {
            mimeType?: string;
            quality?: number;
          }): Promise<Blob>;
        };
      })
      | null;
    return el?.excalidrawAPI;
  }

  async function downloadBoard() {
    const api = getExcalidrawAPI();
    const blob = await api?.exportToBlob({
      mimeType: "image/png",
      quality: 1,
    });
    if (!blob) {
      showToast("Couldn't export the board", "warning");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function drawFromConversation(silent = false) {
    if (isDrawing.value) return;
    const api = getExcalidrawAPI();
    const sceneElements = api?.getSceneElements;
    if (!sceneElements) {
      if (!silent) showToast("The board isn't ready yet", "warning");
      return;
    }

    const transcript = conversationData.value?.transcript?.text?.trim();
    if (!transcript) {
      if (!silent) {
        showToast("Nothing to draw from yet. Say something first.", "warning");
      }
      return;
    }

    isDrawing.value = true;

    try {
      await ensureApiSession();
      const elements = sceneElements();
      const topics = conversationData.value?.nodes
        ?.map((n: { label?: string; emoji?: string; color?: string }) => ({
          label: n.label || "",
          emoji: n.emoji,
          color: n.color,
        }))
        .filter((t) => t.label) ?? [];
      const res = await fetch("/api/live/whiteboard-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements, transcript, topics }),
      });
      if (!res.ok) {
        if (!silent) {
          showToast("Couldn't draw right now — try again", "warning");
        }
        return;
      }
      const payload = await res.json().catch(() => null);
      const updated = payload && typeof payload === "object"
        ? (payload as { elements?: unknown }).elements
        : null;
      if (updated && Array.isArray(updated)) {
        api?.updateScene({ elements: updated, commitToHistory: false });
        sendWhiteboardUpdate(
          JSON.stringify({ elements: updated, appState: {} }),
        );
        if (!silent) showToast("Added to the board", "success");
      }
    } catch {
      if (!silent) {
        showToast("Couldn't draw right now — try again", "warning");
      }
    } finally {
      isDrawing.value = false;
    }
  }

  // Registered in an effect (not the render body) so it's not a render-phase
  // side effect, and cleaned up on unmount so a stale closure never lingers on
  // globalThis after the dashboard goes away.
  useEffect(() => {
    const g = globalThis as typeof globalThis & {
      __onTranscriptChunk?: () => void;
    };
    g.__onTranscriptChunk = () => {
      if (!liveSession.value) return;
      transcriptChunkCount.current++;
      const now = Date.now();
      if (transcriptChunkCount.current % AUTO_DRAW_EVERY !== 0) return;
      if (now - lastAutoDraw.current < AUTO_DRAW_COOLDOWN_MS) return;
      // Skip if barely anything new was said — saves a call for "yeah"/"okay".
      const currentLen = conversationData.value?.transcript?.text?.length ?? 0;
      if (currentLen - lastDrawnLength.current < 200) return;
      lastDrawnLength.current = currentLen;
      lastAutoDraw.current = now;
      drawFromConversation(true);
    };
    return () => {
      delete g.__onTranscriptChunk;
    };
  }, []);

  if (!conversationData.value) {
    return (
      <div class="dashboard-skeleton-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            class="skeleton dashboard-skeleton-card skeleton-pulse"
            key={index}
          >
            <div class="skeleton-line skeleton-lg"></div>
            <div class="skeleton-line" style="width: 70%"></div>
            <div class="skeleton-line" style="width: 85%"></div>
            <div class="skeleton-line" style="width: 55%"></div>
          </div>
        ))}
      </div>
    );
  }

  const { conversation, transcript, actionItems, nodes, summary } =
    conversationData.value;

  // Mutations delegate to the action-items store (pure transforms in core/).
  return (
    <div>
      {/* Grid Container - Simple CSS Grid */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pb-8">
        {
          /* Mobile hierarchy: a returning user's question is "what do I do
            next" — Action Items lead the single-column stack, transcript
            recedes to the bottom. Desktop reading order (Transcript |
            Summary | Actions) is restored with md:order-none. */
        }

        {/* Card 1: Transcript — flips to Voices (who held the floor) */}
        <div class="order-3 md:order-none min-w-0">
          <FlipCard
            label="Transcript insights"
            front={
              <TranscriptCard
                transcript={transcript}
                onRenameSpeaker={renameSpeaker}
              />
            }
            back={
              <TranscriptBack
                text={transcript?.text ?? ""}
                speakers={transcript?.speakers ?? []}
              />
            }
          />
        </div>

        {/* Card 2: Summary — flips to Pulse (takes + receipts, the append story) */}
        <div class="order-2 md:order-none min-w-0">
          <FlipCard
            label="Project pulse"
            front={<SummaryCard summary={summary ?? null} />}
            back={
              <SummaryBack
                summary={summary ?? ""}
                transcriptText={transcript?.text ?? ""}
                topicCount={nodes.length}
                taskCount={actionItems.length}
                createdAt={conversation.created_at}
                takes={takes.value}
                onBackup={downloadBackup}
              />
            }
          />
        </div>

        {/* Card 3: Action Items — flips to an overview/bulk-actions back */}
        <div class="order-1 md:order-none min-w-0">
          <FlipCard
            label="Action Items"
            front={
              <ActionItemsCard
                actionItems={actionItems}
                conversationId={conversation.id ?? ""}
                speakers={transcript?.speakers ?? []}
                onUpdateItems={setActionItems}
              />
            }
            back={
              <ActionItemsBack
                items={actionItems}
                // Same pure ops as the front card, so both faces stamp
                // updated_at and strip AI-attribution flags identically.
                onMarkAllDone={() =>
                  setActionItems(
                    completeAllActionItems(
                      actionItems,
                      new Date().toISOString(),
                    ),
                  )}
                onClearDone={() =>
                  setActionItems(clearCompletedActionItems(actionItems))}
              />
            }
          />
        </div>

        {/* Card 4: Topic Visualizations - FULL WIDTH (spans all columns) */}
        <TopicVisualizationsCard />

        {/* Card 5: Whiteboard — only in live meetings, full width */}
        {liveSession.value && (
          <div
            class="order-5 md:order-none"
            style={{ gridColumn: "1 / -1" }}
            ref={whiteboardRef}
          >
            <div class="whiteboard-toolbar">
              <span class="whiteboard-toolbar-label">
                <i class="fa fa-pen-ruler" aria-hidden="true"></i> Whiteboard
              </span>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                <button
                  onClick={() => downloadBoard()}
                  class="whiteboard-draw-btn"
                  title="Download board as PNG"
                >
                  ⬇️
                </button>
                <button
                  onClick={() => drawFromConversation(false)}
                  disabled={isDrawing.value}
                  class="whiteboard-draw-btn"
                >
                  {isDrawing.value ? "…" : "✏️  Draw"}
                </button>
              </div>
            </div>
            <SharedWhiteboard
              roomId={liveSession.value.roomId}
              initialScene={conversationData.value?.whiteboardScene}
              onSceneChange={handleSceneChange}
            />
          </div>
        )}
      </div>

      {
        /* Roomy reader for long transcript/summary content — opened from a card's
          expand button, keeps the grid itself compact + equal-height. */
      }
      <ReaderModal />
    </div>
  );
}
