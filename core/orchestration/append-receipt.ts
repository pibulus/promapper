/**
 * Append Receipt — "what did that take actually change?"
 *
 * Computed client-side after an append reconciles, by diffing the request-time
 * base snapshot against the reconciled result. Completions/reopens are only
 * attributed to the take when the AI flagged them (ai_checked) — a user toggle
 * made mid-flight belongs to the user, not the recording.
 *
 * Additions get the same discipline via `theirs` (the server's own result).
 * Reconcile deliberately KEEPS entities that exist only in MINE (a topic or
 * task the user added while the round-trip was in flight), so "in next, not in
 * base" also catches the user's own work and billed it to the recording —
 * "Take mapped — +1 topic" for a topic the AI never heard of. An addition only
 * counts when it is in BOTH `theirs` (the AI made it) and `next` (reconcile
 * kept it — a tombstoned or duplicate suggestion never reached the map).
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
  theirs: ConversationData,
): AppendReceipt {
  const baseNodeIds = new Set((base?.nodes ?? []).map((n) => n.id));
  const baseItems = new Map(
    (base?.actionItems ?? []).map((item) => [item.id, item]),
  );
  const theirsNodeIds = new Set(theirs.nodes.map((n) => n.id));
  const theirsItemIds = new Set(theirs.actionItems.map((i) => i.id));

  const topicsAdded =
    next.nodes.filter((n) => !baseNodeIds.has(n.id) && theirsNodeIds.has(n.id))
      .length;

  let itemsAdded = 0;
  let itemsCompleted = 0;
  let itemsReopened = 0;
  for (const item of next.actionItems) {
    const before = baseItems.get(item.id);
    if (!before) {
      if (theirsItemIds.has(item.id)) itemsAdded++;
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
