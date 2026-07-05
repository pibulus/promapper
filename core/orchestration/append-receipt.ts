/**
 * Append Receipt — "what did that take actually change?"
 *
 * Computed client-side after an append reconciles, by diffing the request-time
 * base snapshot against the reconciled result. Completions/reopens are only
 * attributed to the take when the AI flagged them (ai_checked) — a user toggle
 * made mid-flight belongs to the user, not the recording.
 */

import type { ConversationData } from "../types/conversation-data.ts";

export interface AppendReceipt {
  topicsAdded: number;
  itemsAdded: number;
  itemsCompleted: number;
  itemsReopened: number;
}

export function computeAppendReceipt(
  base: ConversationData | null,
  next: ConversationData,
): AppendReceipt {
  const baseNodeIds = new Set((base?.nodes ?? []).map((n) => n.id));
  const baseItems = new Map(
    (base?.actionItems ?? []).map((item) => [item.id, item]),
  );

  const topicsAdded = next.nodes.filter((n) => !baseNodeIds.has(n.id)).length;

  let itemsAdded = 0;
  let itemsCompleted = 0;
  let itemsReopened = 0;
  for (const item of next.actionItems) {
    const before = baseItems.get(item.id);
    if (!before) {
      itemsAdded++;
      continue;
    }
    if (before.status === item.status) continue;
    // Only count AI-driven flips — ai_checked is stamped by the server merge
    // for exactly the items this append's status check touched (and stripped
    // again the moment the user manually overrides).
    const aiFlipped = (item as { ai_checked?: boolean }).ai_checked === true;
    if (!aiFlipped) continue;
    if (item.status === "completed") itemsCompleted++;
    else itemsReopened++;
  }

  return { topicsAdded, itemsAdded, itemsCompleted, itemsReopened };
}

/**
 * One human line, e.g. "+2 topics · 3 new tasks · ✓ 1 done".
 * Empty string when the take changed nothing countable.
 */
export function formatAppendReceipt(receipt: AppendReceipt): string {
  const parts: string[] = [];
  if (receipt.topicsAdded > 0) {
    parts.push(
      `+${receipt.topicsAdded} topic${receipt.topicsAdded === 1 ? "" : "s"}`,
    );
  }
  if (receipt.itemsAdded > 0) {
    parts.push(
      `${receipt.itemsAdded} new task${receipt.itemsAdded === 1 ? "" : "s"}`,
    );
  }
  if (receipt.itemsCompleted > 0) {
    parts.push(`✓ ${receipt.itemsCompleted} done`);
  }
  if (receipt.itemsReopened > 0) {
    parts.push(`↺ ${receipt.itemsReopened} reopened`);
  }
  return parts.join(" · ");
}
