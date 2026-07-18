import type { ActionItem } from "../types/index.ts";

interface AppendStatusUpdate {
  id: string;
  status: "completed" | "pending";
  reason: string;
}

// Minimal node/edge shapes for merging. We accept either the rich server Node
// (with conversation_id/created_at) or the leaner stored node — both carry the
// fields we union on, and `position` lives only on the stored/existing side.
interface MergeNode {
  id: string;
  label: string;
  emoji: string;
  color: string;
  position?: { x: number; y: number };
}

interface MergeEdge {
  id?: string;
  source_topic_id: string;
  target_topic_id: string;
  color: string;
}

/**
 * Union existing topic nodes with the freshly-extracted ones so an append GROWS
 * the map instead of replacing it.
 *
 * Rules (decided product behavior):
 *  - Existing topics NEVER vanish — the AI re-emitting an id is a hint, never
 *    the source of truth. A topic the new clip didn't mention still survives.
 *  - When both sides have a topic (same id), the NEW recording wins on
 *    label/emoji/color (the map reflects the latest understanding)...
 *  - ...but the hand-dragged `position` is always carried over from the
 *    existing node, so the user's layout is never scrambled.
 *  - Brand-new topics from the new clip are appended.
 */
export function mergeAppendNodes<T extends MergeNode>(
  existingNodes: T[],
  extractedNodes: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const node of existingNodes) {
    if (node?.id) byId.set(node.id, node);
  }

  for (const node of extractedNodes) {
    if (!node?.id) continue;
    const prior = byId.get(node.id);
    if (prior) {
      // New wins on content; existing position is preserved.
      byId.set(node.id, {
        ...prior,
        ...node,
        position: prior.position ?? node.position,
      });
    } else {
      byId.set(node.id, node);
    }
  }

  return [...byId.values()];
}

/**
 * Union existing topic edges with extracted ones, keyed by source->target so an
 * append never drops an existing relationship and never duplicates one. Existing
 * edges keep their identity (id/color); a genuinely new pair is added. Self
 * loops and edges whose endpoints aren't in the final node set are dropped.
 */
export function mergeAppendEdges<T extends MergeEdge>(
  existingEdges: T[],
  extractedEdges: T[],
  validNodeIds: Set<string>,
): T[] {
  const byPair = new Map<string, T>();

  const consider = (edge: T) => {
    if (!edge) return;
    const { source_topic_id: s, target_topic_id: t } = edge;
    if (!s || !t || s === t) return; // missing endpoint or self-loop
    if (!validNodeIds.has(s) || !validNodeIds.has(t)) return; // dangling
    const key = `${s}->${t}`;
    // Existing edges are considered first, so they keep their identity; an
    // extracted edge for the same pair won't overwrite it.
    if (!byPair.has(key)) byPair.set(key, edge);
  };

  for (const edge of existingEdges) consider(edge);
  for (const edge of extractedEdges) consider(edge);

  return [...byPair.values()];
}

// Filler words that don't change the meaning of a task, so two descriptions
// that differ only by these should be treated as the same item.
const FILLER_WORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "please",
  "pls",
  "just",
  "also",
  "and",
  "then",
]);

/**
 * Normalize an action item description for duplicate detection.
 *
 * Lowercases, strips punctuation, collapses whitespace, and drops common
 * filler words so that semantically identical tasks ("Send the recap email"
 * vs "send recap e-mail.") compare equal. Deliberately conservative: it only
 * removes noise, never reorders or stems words, so distinct tasks stay distinct.
 */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation -> space (keeps unicode letters)
    .split(/\s+/)
    .filter((word) => word.length > 0 && !FILLER_WORDS.has(word))
    .join(" ")
    .trim();
}

export function mergeAppendActionItems(
  existingActionItems: ActionItem[],
  extractedActionItems: ActionItem[],
  statusUpdates: AppendStatusUpdate[],
  now = new Date().toISOString(),
): ActionItem[] {
  const updatesById = new Map(statusUpdates.map((update) => [
    update.id,
    update,
  ]));

  const updatedExisting = existingActionItems.map((item) => {
    const statusUpdate = updatesById.get(item.id);
    if (!statusUpdate) return item;

    return {
      ...item,
      status: statusUpdate.status,
      updated_at: now,
      ai_checked: true,
      checked_reason: statusUpdate.reason,
    };
  });

  const merged = [...updatedExisting];

  // Track normalized descriptions already in the list so we skip semantic
  // duplicates within the extracted batch as well as against existing items.
  const seen = new Set(
    merged.map((item) => normalizeDescription(item.description)),
  );

  for (const newItem of extractedActionItems) {
    const key = normalizeDescription(newItem.description);

    // An empty key means the description was all punctuation/filler — keep it
    // rather than collapsing unrelated near-empty items together.
    if (key.length > 0 && seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(newItem);
  }

  return merged;
}

/**
 * Marker separating the base summary from the latest-recording update block.
 * Shared by /api/append and /api/live/analyze so both merge summaries the
 * same way.
 */
export const SUMMARY_UPDATE_MARKER = "**Update from latest recording:**";

/**
 * Append summaries without unbounded growth: keep the original base summary
 * and only the LATEST update block. An empty new summary (short/lightweight
 * round) leaves the existing summary untouched.
 */
export function mergeAppendSummary(
  existingSummary: string | null | undefined,
  newSummary: string,
): string {
  if (!newSummary) return existingSummary ?? "";
  if (!existingSummary) return newSummary;
  const base = existingSummary.split(SUMMARY_UPDATE_MARKER)[0].trim();
  return `${base}\n\n${SUMMARY_UPDATE_MARKER}\n${newSummary}`;
}
