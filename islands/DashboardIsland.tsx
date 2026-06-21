/**
 * Dashboard Island - Simplified with Extracted Components
 *
 * Clean grid layout coordinating cards
 */

import { conversationData } from "@signals/conversationStore.ts";
import TranscriptCard from "../components/TranscriptCard.tsx";
import SummaryCard from "../components/SummaryCard.tsx";
import ActionItemsCard from "../components/ActionItemsCard.tsx";
import TopicVisualizationsCard from "../components/TopicVisualizationsCard.tsx";

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

  // Handler to update action items
  function handleUpdateActionItems(updatedItems: typeof actionItems) {
    conversationData.value = {
      ...conversationData.value!,
      actionItems: updatedItems,
    };
  }

  function handleRenameSpeaker(oldName: string, newName: string) {
    const current = conversationData.value;
    if (!current || oldName === newName) return;

    const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const speakerPrefix = new RegExp(`(^|\\n)${escapedOldName}:`, "g");
    const updatedText = current.transcript.text.replace(
      speakerPrefix,
      `$1${newName}:`,
    );

    const updatedConversationTranscript = current.conversation.transcript
      .replace(speakerPrefix, `$1${newName}:`);

    const nextSpeakers = current.transcript.speakers.map((speaker) =>
      speaker === oldName ? newName : speaker
    );

    conversationData.value = {
      ...current,
      conversation: {
        ...current.conversation,
        transcript: updatedConversationTranscript,
      },
      transcript: {
        ...current.transcript,
        text: updatedText,
        speakers: Array.from(new Set(nextSpeakers)),
      },
    };
  }

  return (
    <div>
      {/* Grid Container - Simple CSS Grid */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Card 1: Transcript */}
        <TranscriptCard
          transcript={transcript}
          onRenameSpeaker={handleRenameSpeaker}
        />

        {/* Card 2: Summary */}
        <SummaryCard
          summary={summary ?? null}
          nodes={nodes}
          conversationSource={conversation.source}
        />

        {/* Card 3: Action Items */}
        <ActionItemsCard
          actionItems={actionItems}
          onUpdateItems={handleUpdateActionItems}
        />

        {/* Card 4: Topic Visualizations - FULL WIDTH (spans all columns) */}
        <TopicVisualizationsCard />
      </div>
    </div>
  );
}
