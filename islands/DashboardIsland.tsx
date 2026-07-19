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
import { remoteWhiteboardUpdate } from "@signals/partyConnectionStore.ts";
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
import ModuleRack from "./ModuleRack.tsx";
import { moduleRegistry } from "./modules/moduleRegistry.ts";
import NotesModule from "./modules/NotesModule.tsx";
import TakesModule from "./modules/TakesModule.tsx";
import { enabledModules } from "@signals/moduleStore.ts";

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
    // Capture the conversation the stroke belongs to: switching mid-debounce
    // must DROP the sketch, not stamp it onto the new conversation.
    const forId = conversationData.value?.conversation.id;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const current = conversationData.value;
      if (!current || current.conversation.id !== forId) return;
      conversationData.value = { ...current, whiteboardScene: scene };
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

  // Map ↔ Canvas flip state. The canvas (Excalidraw + a React root) is heavy,
  // so solo boards mount on first flip; live sessions mount immediately —
  // remote strokes and AI draws need a live API even while the map shows.
  const canvasShowing = useSignal(false);
  const canvasMounted = useSignal(false);
  // News dots: something landed on the face you're not looking at.
  const canvasNews = useSignal(false);
  const mapNews = useSignal(false);

  useEffect(() => {
    if (liveSession.value) canvasMounted.value = true;
  }, [liveSession.value]);

  // Remote strokes while the map is up → dot on the flip button.
  useEffect(() => {
    let first = true;
    const unsubscribe = remoteWhiteboardUpdate.subscribe(() => {
      // subscribe() fires immediately with the current value — that's
      // history, not news.
      if (first) {
        first = false;
        return;
      }
      if (!canvasShowing.value) canvasNews.value = true;
    });
    return unsubscribe;
  }, []);

  // Topic changes while the canvas is up → dot on the flip-back button.
  const prevNodesSig = useRef("");
  useEffect(() => {
    const sig = (conversationData.value?.nodes ?? [])
      .map((n: { id: string }) => n.id)
      .join("|");
    if (
      prevNodesSig.current && sig !== prevNodesSig.current &&
      canvasShowing.value
    ) {
      mapNews.value = true;
    }
    prevNodesSig.current = sig;
  }, [conversationData.value]);

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
    // The API rides the .shared-whiteboard container INSIDE the flip wrapper
    // (SharedWhiteboard attaches it to its own div, not to our ref).
    const el = whiteboardRef.current?.querySelector(".shared-whiteboard") as
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
        // The AI drew on the hidden face — light the flip button.
        if (!canvasShowing.value) canvasNews.value = true;
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
    <div class="dashboard-shell">
      {/* Grid Container - Simple CSS Grid */}
      {
        /* 6-unit rack grid (4 on tablet): core cards span 2, small modules
          span 1, wide spans the row — docs/MODULES.md */
      }
      <div class="dashboard-grid grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {
          /* Mobile hierarchy: a returning user's question is "what do I do
            next" — Action Items lead the single-column stack, transcript
            recedes to the bottom. Desktop reading order (Transcript |
            Summary | Actions) is restored with md:order-none. */
        }

        {/* Card 1: Transcript — flips to Voices (who held the floor) */}
        <div class="order-3 md:order-none min-w-0 md:col-span-2">
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
        <div class="order-2 md:order-none min-w-0 md:col-span-2">
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
        <div class="order-1 md:order-none min-w-0 md:col-span-2">
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

        {
          /* Card 4: the centerpiece, two authors — the AI draws the front
            (topic map), you draw the back (canvas). One spatial surface,
            flipped. News dots mark activity on the hidden face. Keyed by
            conversation so a switch resets flip state AND remounts the
            board (no stale scene bleeding across conversations). */
        }
        <div
          class="w-full md:col-span-4 lg:col-span-6 order-4 md:order-none"
          ref={whiteboardRef}
        >
          <FlipCard
            key={conversation.id}
            label="Canvas"
            frontBadge={canvasNews.value}
            backBadge={mapNews.value}
            onFlip={(flipped) => {
              canvasShowing.value = flipped;
              if (flipped) {
                canvasMounted.value = true;
                canvasNews.value = false;
              } else {
                mapNews.value = false;
              }
            }}
            front={<TopicVisualizationsCard />}
            back={
              <div class="dashboard-card">
                <div class="dashboard-card-header">
                  <h3>Canvas</h3>
                  <span class="card-header-tagline">
                    {liveSession.value
                      ? "live with the room"
                      : "draw alongside the map"}
                  </span>
                  <div class="card-header-actions">
                    <button
                      type="button"
                      onClick={() => downloadBoard()}
                      data-tip="Download as PNG"
                      aria-label="Download the board as an image"
                    >
                      <i class="fa fa-download" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => drawFromConversation(false)}
                      disabled={isDrawing.value}
                      data-tip="AI adds to the board"
                      aria-label="Ask the AI to draw from the conversation"
                    >
                      <i
                        class={`fa ${
                          isDrawing.value
                            ? "fa-hourglass-half"
                            : "fa-wand-magic-sparkles"
                        }`}
                        aria-hidden="true"
                      >
                      </i>
                    </button>
                  </div>
                </div>
                <div class="dashboard-card-body canvas-flip-body">
                  {canvasMounted.value && (
                    <SharedWhiteboard
                      roomId={liveSession.value?.roomId ?? "local"}
                      initialScene={conversationData.value?.whiteboardScene}
                      onSceneChange={handleSceneChange}
                    />
                  )}
                </div>
              </div>
            }
          />
        </div>

        {
          /* Optional modules — registry order (the board stays arranged),
            switched on in the rack. Sizes: small tucks into leftover cells,
            standard matches core cards, wide spans the row. */
        }
        {
          /* Conversation-scoped keys: switching conversations REMOUNTS every
            module, so stale textareas/canvases/in-flight answers can't leak
            across conversations (Bumblefuzz's hall-of-fame find). */
        }
        {(() => {
          const enabled = moduleRegistry.filter((m) =>
            enabledModules.value.includes(m.id)
          );
          // Notes + Takes share one cell when both are on: scraps on the
          // front, recordings on the back (same-data-adjacent, both quiet
          // surfaces). Either alone renders as its own card.
          const paired = enabled.some((m) => m.id === "notes") &&
            enabled.some((m) => m.id === "takes");
          const cells = paired
            ? enabled.filter((m) => m.id !== "takes")
            : enabled;
          const renderModule = (m: (typeof cells)[number]) =>
            paired && m.id === "notes"
              ? (
                <FlipCard
                  label="Takes"
                  front={<NotesModule />}
                  back={<TakesModule />}
                />
              )
              : <m.component />;
          // Half-tall smalls STACK in pairs — two short instruments share
          // one pillar (Pablo's 1/1/2, the height half), so the module row
          // closes flat instead of leaving dead air under short tiles.
          const groups: (typeof cells)[] = [];
          for (const m of cells) {
            const last = groups[groups.length - 1];
            if (
              m.size === "small" && last && last.length === 1 &&
              last[0].size === "small"
            ) {
              last.push(m);
            } else {
              groups.push([m]);
            }
          }
          return groups.map((group) => (
            <div
              key={`${conversation.id}-${group.map((m) => m.id).join("-")}`}
              class={`order-6 md:order-none min-w-0 module-cell module-cell--${
                group[0].size
              }${group.length > 1 ? " module-cell--stack" : ""}`}
            >
              {group.map((m) => (
                <div key={m.id} class="module-stack-slot">
                  {renderModule(m)}
                </div>
              ))}
            </div>
          ));
        })()}

        {/* The rack — ghost tile, always last. */}
        <div class="order-last md:order-none min-w-0 module-cell module-cell--small">
          <ModuleRack />
        </div>
      </div>

      {
        /* Roomy reader for long transcript/summary content — opened from a card's
          expand button, keeps the grid itself compact + equal-height. */
      }
      <ReaderModal />
    </div>
  );
}
