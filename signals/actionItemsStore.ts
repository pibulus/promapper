/**
 * Action Items + Conversation Mutations Store
 *
 * Signal-aware actions that operate on the global conversationData signal by
 * delegating to the pure transforms in core/orchestration/conversation-ops.ts.
 * Islands should call these instead of mutating conversationData inline, so the
 * mutation logic lives in one tested place (and a future live-collab layer has
 * a single seam to hook).
 */

import {
  conversationData,
  isViewingShared,
  withUndo,
} from "@signals/conversationStore.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";
import {
  addTopic as addTopicOp,
  deleteEdge as deleteEdgeOp,
  deleteTopic as deleteTopicOp,
  mergeTopics as mergeTopicsOp,
  persistTopicPositions as persistTopicPositionsOp,
  renameSpeaker as renameSpeakerOp,
  renameTopic as renameTopicOp,
  toggleActionItemStatus as toggleActionItemStatusOp,
  updateActionItems as updateActionItemsOp,
} from "../core/orchestration/conversation-ops.ts";

type ActionItem = ConversationData["actionItems"][number];

/**
 * The conversation, but only when it's ours to change.
 *
 * A `/shared/<id>` snapshot has nowhere to write: the share API is GET-only and
 * a URL share is bytes in a link. Mutations still ran on it, though — the whole
 * editing surface worked, armed undo toasts, and threw the work away on the
 * next refresh, with one banner line as the only warning. A snapshot is a
 * photo; nothing done to it can become true.
 *
 * The UI hides these affordances too (that's the honest half). This is the net
 * under it, in the one place every map mutation already routes through, so a
 * surface added later can't quietly reintroduce the lie. Live rooms are NOT
 * shared views — everyone in a room owns their copy and edits for real.
 */
function editableConversation(): ConversationData | null {
  if (isViewingShared.value) return null;
  return conversationData.value;
}

export function setActionItems(actionItems: ActionItem[]): void {
  const current = editableConversation();
  if (!current) return;
  // Arm undo: replacing the list covers delete-item and clear-done, both lossy.
  withUndo(() => {
    conversationData.value = updateActionItemsOp(current, actionItems);
  });
}

export function toggleActionItem(id: string): void {
  const current = editableConversation();
  if (!current) return;
  withUndo(() => {
    conversationData.value = toggleActionItemStatusOp(
      current,
      id,
      new Date().toISOString(),
    );
  });
}

export function renameSpeaker(oldName: string, newName: string): void {
  const current = editableConversation();
  if (!current) return;
  // Undoable: a speaker rename rewrites the transcript + conversation.transcript,
  // the most destructive of the rename ops.
  withUndo(() => {
    conversationData.value = renameSpeakerOp(current, oldName, newName);
  });
}

// ===================================================================
// TOPIC GRAPH
// ===================================================================

export function renameTopic(id: string, label: string): void {
  const current = editableConversation();
  if (!current) return;
  withUndo(() => {
    conversationData.value = renameTopicOp(current, id, label);
  });
}

/**
 * Add a topic node through the store (undoable, validated) instead of a
 * hand-rolled spread in the island. Returns the new node id (or null on empty
 * label) so the caller can select it.
 */
export function addTopic(
  input: { label: string; emoji?: string; color?: string },
): string | null {
  const current = editableConversation();
  if (!current) return null;
  let newId: string | null = null;
  withUndo(() => {
    const { data, id } = addTopicOp(current, input);
    if (id) {
      conversationData.value = data;
      newId = id;
    }
  });
  return newId;
}

export function deleteTopic(id: string): void {
  const current = editableConversation();
  if (!current) return;
  withUndo(() => {
    conversationData.value = deleteTopicOp(current, id);
  });
}

export function mergeTopics(sourceId: string, targetId: string): void {
  const current = editableConversation();
  if (!current) return;
  // Drag-to-merge silently destroys a node — the most likely accidental loss.
  withUndo(() => {
    conversationData.value = mergeTopicsOp(current, sourceId, targetId);
  });
}

export function deleteEdge(sourceId: string, targetId: string): void {
  const current = editableConversation();
  if (!current) return;
  withUndo(() => {
    conversationData.value = deleteEdgeOp(current, sourceId, targetId);
  });
}

export function persistTopicPositions(
  positions: Record<string, { x: number; y: number }>,
): void {
  const current = editableConversation();
  if (!current) return;
  conversationData.value = persistTopicPositionsOp(current, positions);
}
