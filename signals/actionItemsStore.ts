/**
 * Action Items + Conversation Mutations Store
 *
 * Signal-aware actions that operate on the global conversationData signal by
 * delegating to the pure transforms in core/orchestration/conversation-ops.ts.
 * Islands should call these instead of mutating conversationData inline, so the
 * mutation logic lives in one tested place (and a future live-collab layer has
 * a single seam to hook).
 */

import { conversationData, withUndo } from "@signals/conversationStore.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";
import {
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

export function setActionItems(actionItems: ActionItem[]): void {
  const current = conversationData.value;
  if (!current) return;
  // Arm undo: replacing the list covers delete-item and clear-done, both lossy.
  withUndo(() => {
    conversationData.value = updateActionItemsOp(current, actionItems);
  });
}

export function toggleActionItem(id: string): void {
  const current = conversationData.value;
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
  const current = conversationData.value;
  if (!current) return;
  conversationData.value = renameSpeakerOp(current, oldName, newName);
}

// ===================================================================
// TOPIC GRAPH
// ===================================================================

export function renameTopic(id: string, label: string): void {
  const current = conversationData.value;
  if (!current) return;
  conversationData.value = renameTopicOp(current, id, label);
}

export function deleteTopic(id: string): void {
  const current = conversationData.value;
  if (!current) return;
  withUndo(() => {
    conversationData.value = deleteTopicOp(current, id);
  });
}

export function mergeTopics(sourceId: string, targetId: string): void {
  const current = conversationData.value;
  if (!current) return;
  // Drag-to-merge silently destroys a node — the most likely accidental loss.
  withUndo(() => {
    conversationData.value = mergeTopicsOp(current, sourceId, targetId);
  });
}

export function deleteEdge(sourceId: string, targetId: string): void {
  const current = conversationData.value;
  if (!current) return;
  withUndo(() => {
    conversationData.value = deleteEdgeOp(current, sourceId, targetId);
  });
}

export function persistTopicPositions(
  positions: Record<string, { x: number; y: number }>,
): void {
  const current = conversationData.value;
  if (!current) return;
  conversationData.value = persistTopicPositionsOp(current, positions);
}
