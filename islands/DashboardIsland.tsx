/**
 * Dashboard Island - Simplified with Extracted Components
 *
 * Clean grid layout coordinating cards
 */

import { conversationData } from "@signals/conversationStore.ts";
import { renameSpeaker, setActionItems } from "@signals/actionItemsStore.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import { sendWhiteboardUpdate } from "@signals/partyService.ts";
import { useRef } from "preact/hooks";
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

/** Minimum seconds between auto-sketches so it doesn't fire too often. */
const AUTO_SKETCH_COOLDOWN_MS = 30_000;
/** Fire an auto-sketch every Nth transcript chunk. */
const AUTO_SKETCH_EVERY = 3;

export default function DashboardIsland() {
  // Throttle whiteboard broadcasts during active drawing (~60fps onChange)
  const lastWhiteboardPush = useRef(0);

  function handleSceneChange(scene: string) {
    const now = Date.now();
    if (now - lastWhiteboardPush.current < 200) return;
    lastWhiteboardPush.current = now;
    sendWhiteboardUpdate(scene);
  }

  // ---------------------------------------------------------------
  // Sketch from conversation (manual + auto)
  // ---------------------------------------------------------------
  const isSketching = useSignal(false);
  const transcriptChunkCount = useRef(0);
  const lastAutoSketch = useRef(0);
  const whiteboardContainerRef = useRef<HTMLDivElement>(null);

  function getExcalidrawAPI() {
    const el = whiteboardContainerRef.current as
      | (HTMLElement & {
        excalidrawAPI?: {
          getSceneElements?: () => unknown[];
          updateScene(
            opts: { elements: unknown[]; commitToHistory?: boolean },
          ): void;
        };
      })
      | null;
    return el?.excalidrawAPI;
  }

  async function sketchFromConversation(silent = false) {
    if (isSketching.value) return;
    const api = getExcalidrawAPI();
    const sceneElements = api?.getSceneElements;
    if (!sceneElements) {
      if (!silent) showToast("Whiteboard isn't ready yet", "warning");
      return;
    }

    const transcript = conversationData.value?.transcript?.text?.trim();
    if (!transcript) {
      if (!silent) {
        showToast(
          "Nothing to sketch from yet. Record something first.",
          "warning",
        );
      }
      return;
    }

    isSketching.value = true;
    if (!silent) showToast("Sketching from the conversation…", "info");

    try {
      await ensureApiSession();
      const elements = sceneElements();
      const topicLabels = conversationData.value?.nodes
        ?.map((n: { label?: string }) => n.label)
        .filter(Boolean) ?? [];
      const res = await fetch("/api/live/whiteboard-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements, transcript, topicLabels }),
      });
      if (!res.ok) {
        if (!silent) {
          showToast("Couldn't sketch right now — try again", "warning");
        }
        return;
      }
      const { elements: updated } = await res.json();
      if (updated && Array.isArray(updated)) {
        api?.updateScene({ elements: updated, commitToHistory: false });
        sendWhiteboardUpdate(
          JSON.stringify({ elements: updated, appState: {} }),
        );
        if (!silent) showToast("Whiteboard updated", "success");
      }
    } catch {
      if (!silent) {
        showToast("Couldn't sketch right now — try again", "warning");
      }
    } finally {
      isSketching.value = false;
    }
  }

  /** Call this when a new transcript chunk arrives in live mode — auto-sketches
   *  every Nth chunk, with a cooldown so it doesn't flood the API. */
  (globalThis as Record<string, unknown>).__onTranscriptChunk = () => {
    if (!liveSession.value) return;
    transcriptChunkCount.current++;
    const now = Date.now();
    if (
      transcriptChunkCount.current % AUTO_SKETCH_EVERY === 0 &&
      now - lastAutoSketch.current > AUTO_SKETCH_COOLDOWN_MS
    ) {
      lastAutoSketch.current = now;
      sketchFromConversation(true);
    }
  };

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
          <div style={{ gridColumn: "1 / -1" }} ref={whiteboardContainerRef}>
            <div class="whiteboard-toolbar">
              <span class="whiteboard-toolbar-label">
                ✏️ Whiteboard
              </span>
              <button
                onClick={() =>
                  sketchFromConversation(false)}
                disabled={isSketching.value}
                class="whiteboard-sketch-btn"
              >
                {isSketching.value ? "Sketching…" : "✏️  Sketch from chat"}
              </button>
            </div>
            <SharedWhiteboard
              roomId={liveSession.value.roomId}
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
