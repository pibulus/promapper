/**
 * Backup / Import
 *
 * Framework-neutral serialization for bulk export/import of all conversations.
 * Pure functions over StoredConversation records so they are unit-testable and
 * reusable by any UI. The emergency path deliberately bypasses any schema
 * version gate so a future format bump can never trap a user's data.
 */

import type { StoredConversation } from "./localStorage.ts";

export const BACKUP_FORMAT = "promapper-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  conversations: StoredConversation[];
}

/**
 * Build a backup payload from the conversations map.
 */
export function buildBackup(
  conversations: Record<string, StoredConversation>,
  now: string,
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    conversations: Object.values(conversations),
  };
}

/**
 * Serialize a backup to a pretty JSON string (ready for download).
 */
export function serializeBackup(
  conversations: Record<string, StoredConversation>,
  now: string,
): string {
  return JSON.stringify(buildBackup(conversations, now), null, 2);
}

/**
 * Parse + validate a backup file string into conversation records.
 *
 * Tolerant by design: accepts the wrapped { format, conversations } shape, a
 * bare array of conversations, or a bare id->conversation map. This is the
 * version-agnostic emergency-recovery path — it never rejects on a version
 * mismatch, it just salvages whatever conversations it can find. Returns a
 * keyed map ready to merge into storage. Throws only on non-JSON input.
 */
export function parseBackup(
  raw: string,
): Record<string, StoredConversation> {
  const parsed = JSON.parse(raw);

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && Array.isArray(parsed.conversations)) {
    list = parsed.conversations;
  } else if (parsed && typeof parsed === "object") {
    list = Object.values(parsed);
  } else {
    return {};
  }

  const out: Record<string, StoredConversation> = {};
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const conv = item as Partial<StoredConversation>;
    const id = conv.id ?? conv.conversation?.id;
    if (!id) continue;
    out[id] = { ...(conv as StoredConversation), id };
  }
  return out;
}

/**
 * Merge imported conversations into the existing set. On id collision, the
 * record with the newer updatedAt wins (so importing an older backup never
 * clobbers fresher local work).
 */
export function mergeBackup(
  existing: Record<string, StoredConversation>,
  imported: Record<string, StoredConversation>,
): Record<string, StoredConversation> {
  const merged: Record<string, StoredConversation> = { ...existing };
  for (const [id, conv] of Object.entries(imported)) {
    const current = merged[id];
    if (!current) {
      merged[id] = conv;
      continue;
    }
    const a = new Date(current.updatedAt ?? 0).getTime();
    const b = new Date(conv.updatedAt ?? 0).getTime();
    merged[id] = b >= a ? conv : current;
  }
  return merged;
}
