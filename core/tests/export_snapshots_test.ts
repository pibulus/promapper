/**
 * Export snapshots — the lifecycle seams the drawer's inline version never had.
 *
 * These pin the three ways saved exports used to go wrong SILENTLY: orphaned
 * forever when their conversation was deleted, absent from backup/import (data
 * loss in the one recovery path users trust), and left behind by "clear all".
 */

import { assert, assertEquals } from "./_assert.ts";
import {
  clearAllSnapshots,
  deleteSnapshotsFor,
  type ExportSnapshot,
  getAllSnapshots,
  getSnapshotsFor,
  MAX_SNAPSHOTS,
  mergeSnapshots,
  restoreSnapshots,
  SNAPSHOTS_KEY,
  sweepOrphanSnapshots,
  writeSnapshots,
} from "../storage/exportSnapshots.ts";
import { parseBackupSnapshots, serializeBackup } from "../storage/backup.ts";

// Minimal localStorage stand-in — these functions are the storage boundary, so
// the test needs a real key/value surface, not a mock of themselves.
function setLocalStorage(impl: Record<string, unknown>) {
  // defineProperty, not assignment: Deno's real `localStorage` is a getter-only
  // global, so `globalThis.localStorage = x` silently keeps the original and
  // the module under test reads Deno's store instead of the stub.
  Object.defineProperty(globalThis, "localStorage", {
    value: impl,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
    writable: true,
  });
}

function installLocalStorage() {
  const map = new Map<string, string>();
  setLocalStorage({
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
  return map;
}

function snap(id: string, conversationId: string): ExportSnapshot {
  return {
    id,
    conversation_id: conversationId,
    content: `# ${id}\n\nbody`,
    prompt: "Summary",
    created_at: "2026-07-25T00:00:00.000Z",
  };
}

Deno.test("deleting a conversation takes its snapshots — and hands them back for undo", () => {
  installLocalStorage();
  writeSnapshots([
    snap("a", "conv-1"),
    snap("b", "conv-1"),
    snap("c", "conv-2"),
  ]);

  const removed = deleteSnapshotsFor("conv-1");
  assertEquals(removed.map((s) => s.id), ["a", "b"]);
  // conv-2 untouched; conv-1's are gone rather than orphaned forever.
  assertEquals(getAllSnapshots().map((s) => s.id), ["c"]);

  restoreSnapshots(removed);
  assertEquals(getSnapshotsFor("conv-1").map((s) => s.id), ["a", "b"]);
});

Deno.test("restore is idempotent — a double undo can't duplicate snapshots", () => {
  installLocalStorage();
  writeSnapshots([snap("a", "conv-1")]);
  const removed = deleteSnapshotsFor("conv-1");
  restoreSnapshots(removed);
  restoreSnapshots(removed);
  assertEquals(getAllSnapshots().length, 1);
});

Deno.test("clear-all really clears — snapshots don't survive a wipe", () => {
  installLocalStorage();
  writeSnapshots([snap("a", "conv-1")]);
  clearAllSnapshots();
  assertEquals(getAllSnapshots(), []);
});

Deno.test("sweep drops orphans but REFUSES an empty live set", () => {
  installLocalStorage();
  writeSnapshots([snap("a", "conv-1"), snap("b", "gone")]);

  // A corrupt conversations store reads as {} — sweeping then would delete
  // every snapshot the user has. Refuse instead.
  assertEquals(sweepOrphanSnapshots(new Set()), 0);
  assertEquals(getAllSnapshots().length, 2);

  assertEquals(sweepOrphanSnapshots(new Set(["conv-1"])), 1);
  assertEquals(getAllSnapshots().map((s) => s.id), ["a"]);
});

Deno.test("the store is capped — oldest go first", () => {
  installLocalStorage();
  const many = Array.from(
    { length: MAX_SNAPSHOTS + 5 },
    (_, i) => snap(`s${i}`, "conv-1"),
  );
  writeSnapshots(many);
  const stored = getAllSnapshots();
  assertEquals(stored.length, MAX_SNAPSHOTS);
  // The five oldest were trimmed, the newest survived.
  assertEquals(stored[0].id, "s5");
  assertEquals(stored[stored.length - 1].id, `s${MAX_SNAPSHOTS + 4}`);
});

Deno.test("a corrupt store reads as empty instead of throwing", () => {
  const map = installLocalStorage();
  map.set(SNAPSHOTS_KEY, "{not json");
  assertEquals(getAllSnapshots().length, 0);
  // A non-array payload is equally unusable.
  map.set(SNAPSHOTS_KEY, '{"nope":true}');
  assertEquals(getAllSnapshots().length, 0);
});

Deno.test("writeSnapshots reports failure instead of pretending it saved", () => {
  // A localStorage whose setItem throws (quota) — the write must report false
  // so the caller can tell the user, not show a success toast.
  setLocalStorage({
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  });
  assertEquals(writeSnapshots([snap("a", "conv-1")]), false);
});

Deno.test("mergeSnapshots keeps the local copy on id collision", () => {
  const local = { ...snap("a", "conv-1"), content: "edited locally" };
  const incoming = { ...snap("a", "conv-1"), content: "from backup" };
  const merged = mergeSnapshots([local], [incoming, snap("b", "conv-1")]);
  assertEquals(merged.length, 2);
  assertEquals(merged.find((s) => s.id === "a")?.content, "edited locally");
});

Deno.test("snapshots survive a backup round-trip", () => {
  const snapshots = [snap("a", "conv-1"), snap("b", "conv-2")];
  const json = serializeBackup({}, "2026-07-25T00:00:00.000Z", snapshots);
  assertEquals(parseBackupSnapshots(json).map((s) => s.id), ["a", "b"]);
});

Deno.test("a v1 backup (no snapshots) imports without error", () => {
  const v1 = JSON.stringify({
    format: "promapper-backup",
    version: 1,
    exportedAt: "2026-07-01T00:00:00.000Z",
    conversations: [],
  });
  assertEquals(parseBackupSnapshots(v1), []);
  assertEquals(parseBackupSnapshots("{not json"), []);
});

Deno.test("backup import rejects malformed snapshot records", () => {
  const json = JSON.stringify({
    snapshots: [
      snap("good", "conv-1"),
      { id: "no-content", conversation_id: "conv-1" },
      null,
      "nope",
    ],
  });
  const parsed = parseBackupSnapshots(json);
  assertEquals(parsed.length, 1);
  assert(parsed[0].id === "good");
});
