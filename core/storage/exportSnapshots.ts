/**
 * Export Snapshots — saved markdown outputs.
 *
 * The export drawer used to own the `markdown_outputs` key directly, with raw
 * getItem/setItem and none of the safety the rest of the storage layer learned:
 * no quota-safe writes, no cleanup when a conversation was deleted, not in
 * "clear all", not in backup/import. Snapshots orphaned forever and were
 * silently absent from the one disaster-recovery path users are told to trust.
 *
 * This module is that key's home. Pure-ish and framework-neutral like its
 * neighbours; the drawer calls these instead of touching localStorage.
 */

export const SNAPSHOTS_KEY = "markdown_outputs";

export interface ExportSnapshot {
  id: string;
  conversation_id: string;
  content: string;
  prompt: string;
  created_at: string;
  /** Auto-derived display title (older snapshots may not have one). */
  title?: string;
}

/**
 * A snapshot's display title, derived — never asked for. The document's own
 * first heading wins (it's what the export is ABOUT); otherwise the format
 * plus the conversation's title. Pablo's 2026-08-13 ask: snapshots in the
 * drawer were unlabeled beyond their format name.
 */
export function deriveSnapshotTitle(
  content: string,
  promptLabel: string,
  conversationTitle?: string,
): string {
  const heading = content.match(/^#{1,3}\s+(.+?)\s*$/m)?.[1]
    .replace(/[*_`]/g, "").trim();
  if (heading) return heading.slice(0, 80);
  const ctx = conversationTitle?.trim();
  return ctx ? `${promptLabel} — ${ctx}`.slice(0, 80) : promptLabel;
}

/**
 * Cap total stored snapshots. Exports are the biggest blobs this app writes
 * (a full document each), and localStorage is a shared ~5MB budget — an
 * unbounded pile here takes down CONVERSATION autosave, which is the failure
 * the user actually can't afford. Oldest go first.
 */
export const MAX_SNAPSHOTS = 100;

// ===================================================================
// READ / WRITE PRIMITIVES
// ===================================================================

/** Read every snapshot. A corrupt store reads as empty rather than throwing. */
export function getAllSnapshots(): ExportSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Error reading export snapshots:", err);
    return [];
  }
}

/**
 * Persist the full list, trimming to MAX_SNAPSHOTS (oldest first).
 * Returns whether the write landed — callers MUST check: a quota failure that
 * reports success is how the drawer used to tell users their export was saved
 * when it wasn't.
 */
export function writeSnapshots(list: ExportSnapshot[]): boolean {
  if (typeof window === "undefined") return false;
  const trimmed = list.length > MAX_SNAPSHOTS
    ? list.slice(list.length - MAX_SNAPSHOTS)
    : list;
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
    return true;
  } catch (err) {
    console.error("Export snapshot write failed:", err);
    return false;
  }
}

/** The snapshots belonging to one conversation, oldest first. */
export function getSnapshotsFor(conversationId: string): ExportSnapshot[] {
  return getAllSnapshots().filter((o) => o.conversation_id === conversationId);
}

// ===================================================================
// LIFECYCLE — the seams the old inline version never had
// ===================================================================

/**
 * Drop every snapshot belonging to a deleted conversation and RETURN them, so
 * the caller can hand them back on undo. Delete-conversation is undoable, so a
 * one-way purge here would make undo quietly lossy: the conversation returns
 * and its exports don't.
 */
export function deleteSnapshotsFor(conversationId: string): ExportSnapshot[] {
  const all = getAllSnapshots();
  const removed = all.filter((o) => o.conversation_id === conversationId);
  if (removed.length) {
    // Return value deliberately unchecked here and in sweepOrphanSnapshots:
    // both write a SHORTER list to a key that already holds the longer one, so
    // quota can't bite, and the only failure mode (storage unavailable) leaves
    // the snapshots in place rather than losing them. Only the GROWING writes
    // (restoreSnapshots, the import path, the drawer's save) need a check.
    writeSnapshots(all.filter((o) => o.conversation_id !== conversationId));
  }
  return removed;
}

/**
 * Put back snapshots taken by deleteSnapshotsFor (the undo half). Returns
 * whether they landed — this write GROWS the store, so unlike the shrinking
 * writes above it can genuinely hit quota, and an undo that silently returns
 * the conversation without its exports is exactly the lossy undo this pair
 * exists to prevent.
 */
export function restoreSnapshots(list: ExportSnapshot[]): boolean {
  if (!list.length) return true;
  return writeSnapshots(mergeSnapshots(getAllSnapshots(), list));
}

/** Wipe the store. Part of "clear all conversations" — clear must mean clear. */
export function clearAllSnapshots(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SNAPSHOTS_KEY);
}

/**
 * Garbage-collect snapshots whose conversation no longer exists. A backstop for
 * records orphaned before this module existed (and for any delete that bypassed
 * deleteSnapshotsFor). Pass the set of live conversation ids.
 *
 * Refuses to sweep against an EMPTY live set — a corrupt conversations store
 * reads as {} and would otherwise take every snapshot with it. Same guard as
 * sweepOrphans in the recordings DB, and for the same reason.
 */
export function sweepOrphanSnapshots(liveConversationIds: Set<string>): number {
  if (liveConversationIds.size === 0) return 0;
  const all = getAllSnapshots();
  const kept = all.filter((o) => liveConversationIds.has(o.conversation_id));
  const dropped = all.length - kept.length;
  if (dropped > 0) writeSnapshots(kept);
  return dropped;
}

// ===================================================================
// BACKUP
// ===================================================================

/**
 * Merge imported snapshots into the existing set, keyed by id so re-importing
 * the same backup can't duplicate them. Existing records win on collision (the
 * local copy may have been edited since the backup was taken).
 */
export function mergeSnapshots(
  existing: ExportSnapshot[],
  imported: ExportSnapshot[],
): ExportSnapshot[] {
  const byId = new Map(existing.map((o) => [o.id, o]));
  for (const snap of imported) {
    if (!snap?.id || typeof snap.content !== "string") continue;
    if (!byId.has(snap.id)) byId.set(snap.id, snap);
  }
  return [...byId.values()];
}
