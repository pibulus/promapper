/**
 * Dashboard Island - Simplified with Extracted Components
 *
 * Clean grid layout coordinating cards
 */

import { conversationData } from "@signals/conversationStore.ts";
import { renameSpeaker, setActionItems } from "@signals/actionItemsStore.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import { sendWhiteboardUpdate } from "@signals/partyService.ts";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { showToast } from "@utils/toast.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import TranscriptCard from "../components/TranscriptCard.tsx";
import SummaryCard from "../components/SummaryCard.tsx";
import ActionItemsCard from "../components/ActionItemsCard.tsx";
import ActionItemsBack from "../components/ActionItemsBack.tsx";
import TopicVisualizationsCard from "./TopicVisualizationsCard.tsx";
import SharedWhiteboard from "./SharedWhiteboard.tsx";
import FlipCard from "./FlipCard.tsx";
import ReaderModal from "./ReaderModal.tsx";

/** Minimum seconds between auto-draws so it doesn't fire too often. */
const AUTO_DRAW_COOLDOWN_MS = 30_000;
/** Fire an auto-draw every Nth transcript chunk. */
const AUTO_DRAW_EVERY = 3;

export default function DashboardIsland() {
  // Throttle whiteboard broadcasts during active drawing (~60fps onChange).
  // sendWhiteboardUpdate fires at most every 200ms for live sync.
  // conversationData persistence is debounced at 2s to avoid hammering signals.
  const lastWhiteboardPush = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSceneChange(scene: string) {
    sendWhiteboardUpdate(scene);

    // Debounce conversationData write — only persist after user stops drawing.
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (conversationData.value) {
        conversationData.value = {
          ...conversationData.value,
          whiteboardScene: scene,
        };
        lastWhiteboardPush.current = Date.now();
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
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Card 1: Transcript */}
        <TranscriptCard
          transcript={transcript}
          onRenameSpeaker={renameSpeaker}
        />

        {/* Card 2: Summary */}
        <SummaryCard
          summary={summary ?? null}
          nodes={nodes}
          conversationSource={conversation.source}
        />

        {/* Card 3: Action Items — flips to an overview/bulk-actions back */}
        <FlipCard
          label="Action Items"
          front={
            <ActionItemsCard
              actionItems={actionItems}
              conversationId={conversation.id ?? ""}
              onUpdateItems={setActionItems}
            />
          }
          back={
            <ActionItemsBack
              items={actionItems}
              onMarkAllDone={() =>
                setActionItems(
                  actionItems.map((i) => ({
                    ...i,
                    status: "completed" as const,
                  })),
                )}
              onClearDone={() =>
                setActionItems(
                  actionItems.filter((i) => i.status !== "completed"),
                )}
            />
          }
        />

        {/* Card 4: Topic Visualizations - FULL WIDTH (spans all columns) */}
        <TopicVisualizationsCard />

        {/* Card 5: Whiteboard — only in live meetings, full width */}
        {liveSession.value && (
          <div style={{ gridColumn: "1 / -1" }} ref={whiteboardRef}>
            <div class="whiteboard-toolbar">
              <span class="whiteboard-toolbar-label">
                ✏️ Whiteboard
              </span>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                <button
                  onClick={() =>
                    downloadBoard()}
                  class="whiteboard-draw-btn"
                  title="Download board as PNG"
                >
                  ⬇️
                </button>
                <button
                  onClick={() =>
                    drawFromConversation(false)}
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
