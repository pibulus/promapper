/**
 * Conversation Operations
 *
 * Pure, framework-neutral transforms over ConversationData. These return a NEW
 * ConversationData (never mutate the input) so signal/state layers can assign
 * the result directly. Keeping them here makes the domain logic unit-testable
 * and gives islands/stores a single source of truth for these mutations.
 */

import type { ConversationData } from "../types/conversation-data.ts";

type ActionItem = ConversationData["actionItems"][number];

/**
 * Replace the action item list (e.g. after reorder/edit/delete in the UI).
 */
export function updateActionItems(
  data: ConversationData,
  actionItems: ActionItem[],
): ConversationData {
  return { ...data, actionItems };
}

/**
 * Toggle a single action item's completed/pending status by id, stamping
 * updated_at. Clears the ai_checked flag since this is a manual user action.
 */
export function toggleActionItemStatus(
  data: ConversationData,
  id: string,
  now: string,
): ConversationData {
  const actionItems = data.actionItems.map((item) =>
    item.id === id
      ? {
        ...item,
        status: item.status === "completed"
          ? ("pending" as const)
          : ("completed" as const),
        updated_at: now,
      }
      : item
  );
  return { ...data, actionItems };
}

/**
 * Rename a speaker everywhere it appears: the transcript text, the conversation
 * transcript copy, and the speakers list (deduped). No-op for an empty/identical
 * rename. Returns the same object reference when nothing changes.
 */
export function renameSpeaker(
  data: ConversationData,
  oldName: string,
  newName: string,
): ConversationData {
  const trimmedNew = newName.trim();
  if (!oldName || !trimmedNew || oldName === trimmedNew) return data;

  const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const speakerPrefix = new RegExp(`(^|\\n)${escapedOldName}:`, "g");

  const updatedText = data.transcript.text.replace(
    speakerPrefix,
    `$1${trimmedNew}:`,
  );
  const updatedConversationTranscript = data.conversation.transcript.replace(
    speakerPrefix,
    `$1${trimmedNew}:`,
  );
  const nextSpeakers = data.transcript.speakers.map((speaker) =>
    speaker === oldName ? trimmedNew : speaker
  );

  return {
    ...data,
    conversation: {
      ...data.conversation,
      transcript: updatedConversationTranscript,
    },
    transcript: {
      ...data.transcript,
      text: updatedText,
      speakers: Array.from(new Set(nextSpeakers)),
    },
  };
}
