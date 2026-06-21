/**
 * Action Items + Conversation Mutations Store
 *
 * Signal-aware actions that operate on the global conversationData signal by
 * delegating to the pure transforms in core/orchestration/conversation-ops.ts.
 * Islands should call these instead of mutating conversationData inline, so the
 * mutation logic lives in one tested place (and a future live-collab layer has
 * a single seam to hook).
 */

import { conversationData } from "./conversationStore.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";
import {
  renameSpeaker as renameSpeakerOp,
  toggleActionItemStatus as toggleActionItemStatusOp,
  updateActionItems as updateActionItemsOp,
} from "../core/orchestration/conversation-ops.ts";

type ActionItem = ConversationData["actionItems"][number];

export function setActionItems(actionItems: ActionItem[]): void {
  const current = conversationData.value;
  if (!current) return;
  conversationData.value = updateActionItemsOp(current, actionItems);
}

export function toggleActionItem(id: string): void {
  const current = conversationData.value;
  if (!current) return;
  conversationData.value = toggleActionItemStatusOp(
    current,
    id,
    new Date().toISOString(),
  );
}

export function renameSpeaker(oldName: string, newName: string): void {
  const current = conversationData.value;
  if (!current) return;
  conversationData.value = renameSpeakerOp(current, oldName, newName);
}
