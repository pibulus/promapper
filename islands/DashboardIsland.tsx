/**
 * Dashboard Island - Simplified with Extracted Components
 *
 * Clean grid layout coordinating cards
 */

import { conversationData } from "@signals/conversationStore.ts";
import { renameSpeaker, setActionItems } from "@signals/actionItemsStore.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import { sendWhiteboardUpdate } from "@signals/partyService.ts";
import TranscriptCard from "../components/TranscriptCard.tsx";
import SummaryCard from "../components/SummaryCard.tsx";
import ActionItemsCard from "../components/ActionItemsCard.tsx";
import ActionItemsBack from "../components/ActionItemsBack.tsx";
import TopicVisualizationsCard from "./TopicVisualizationsCard.tsx";
import SharedWhiteboard from "./SharedWhiteboard.tsx";
import FlipCard from "./FlipCard.tsx";
import ReaderModal from "./ReaderModal.tsx";

export default function DashboardIsland() {
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
          <div style={{ gridColumn: "1 / -1" }}>
            <div class="whiteboard-toolbar">
              <span
                style={{
                  fontSize: "var(--tiny-size)",
                  fontWeight: 700,
                  color: "var(--color-text)",
                }}
              >
                Whiteboard
              </span>
            </div>
            <SharedWhiteboard
              roomId={liveSession.value.roomId}
              onSceneChange={(scene) => sendWhiteboardUpdate(scene)}
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
