import type { ActionItem } from "../types/index.ts";

interface AppendStatusUpdate {
  id: string;
  status: "completed" | "pending";
  reason: string;
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
