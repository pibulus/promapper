/**
 * Backup / Import
 *
 * Framework-neutral serialization for bulk export/import of all conversations.
 * Pure functions over StoredConversation records so they are unit-testable and
 * reusable by any UI. The emergency path deliberately bypasses any schema
 * version gate so a future format bump can never trap a user's data.
 */

import { ts } from "./dates.ts";

import { normalizeStored, type StoredConversation } from "./localStorage.ts";
import type { ExportSnapshot } from "./exportSnapshots.ts";

export const BACKUP_FORMAT = "promapper-backup";
// v2 adds `snapshots` (saved markdown exports). Backups were conversation-only,
// so "back up, wipe the browser, restore" silently lost every saved export —
// data loss in the one path users are told to trust. Reading stays tolerant:
// a v1 file just has no snapshots array.
export const BACKUP_VERSION = 2;

export interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  conversations: StoredConversation[];
  snapshots?: ExportSnapshot[];
}

/**
 * Build a backup payload from the conversations map (+ their saved exports).
 */
export function buildBackup(
  conversations: Record<string, StoredConversation>,
  now: string,
  snapshots: ExportSnapshot[] = [],
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    conversations: Object.values(conversations).map(stripLocalOnlyPointers),
    snapshots,
  };
}

/**
 * Magpie file rows point at bytes in this device's Blob store, and a JSON
 * backup cannot carry bytes. Left in, they restore on a new machine as rows
 * that look completely real — right name, right size — until someone clicks
 * one and gets "that's no longer on the shelf". A backup should never contain
 * a promise it can't keep, so the pointers come out. Links, images and text
 * scraps are self-contained and travel fine.
 */
function stripLocalOnlyPointers(c: StoredConversation): StoredConversation {
  if (!c.magpie?.some((i) => i.kind === "file")) return c;
  return { ...c, magpie: c.magpie.filter((i) => i.kind !== "file") };
}

/**
 * Serialize a backup to a pretty JSON string (ready for download).
 */
export function serializeBackup(
  conversations: Record<string, StoredConversation>,
  now: string,
  // NOT optional. It defaulted to [], which let a caller quietly emit a
  // version-2 backup with zero saved exports — a file that looks complete
  // and silently loses every export on restore. Callers with none pass [].
  snapshots: ExportSnapshot[],
): string {
  return JSON.stringify(buildBackup(conversations, now, snapshots), null, 2);
}

/**
 * Pull saved exports out of a backup file. Tolerant like parseBackup: a v1
 * file (or any shape without a snapshots array) yields none rather than
 * throwing — recovery must never be trapped by a format bump.
 */
export function parseBackupSnapshots(raw: string): ExportSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (parsed as BackupFile)?.snapshots;
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is ExportSnapshot =>
    !!s && typeof s === "object" &&
    typeof (s as ExportSnapshot).id === "string" &&
    typeof (s as ExportSnapshot).conversation_id === "string" &&
    typeof (s as ExportSnapshot).content === "string"
  );
}

/**
 * Parse + validate a backup file string into conversation records.
 *
 * Tolerant by design: accepts the wrapped { format, conversations } shape, a
 * bare array of conversations, or a bare id->conversation map. This is the
 * version-agnostic emergency-recovery path — it never rejects on a version
 * mismatch, it just salvages whatever conversations it can find. Returns a
 * keyed map ready to merge into storage. Throws only on non-JSON input.
 *
 * Every salvaged record goes through `normalizeStored` — whose own docstring
 * calls itself "belt-and-suspenders against the deliberately-permissive import
 * path", while this was the one path that never wore it. A record missing
 * `nodes`/`actionItems` (foreign shape, hand-edited file, pre-array schema)
 * was written to storage raw, and the history drawer reads those arrays
 * directly: the recovery path produced a permanent crash in the UI you'd
 * recover through. Tolerant on the way in, sound on the way out.
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
    out[id] = normalizeStored({ ...(conv as StoredConversation), id });
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
    // Coerce invalid/garbage date strings to 0 so a malformed updatedAt can't
    // become NaN (which would always lose the comparison and silently drop the
    // import — the opposite of this module's never-trap-data intent).
    merged[id] = ts(conv.updatedAt) >= ts(current.updatedAt) ? conv : current;
  }
  return merged;
}
