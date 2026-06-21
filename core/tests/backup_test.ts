import { assertEquals } from "./_assert.ts";
import {
  BACKUP_FORMAT,
  buildBackup,
  mergeBackup,
  parseBackup,
  serializeBackup,
} from "../storage/backup.ts";
import type { StoredConversation } from "../storage/localStorage.ts";

function conv(id: string, updatedAt: string): StoredConversation {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    conversation: { id, source: "text", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [],
    edges: [],
    actionItems: [],
    statusUpdates: [],
  } as StoredConversation;
}

const now = "2026-06-21T12:00:00.000Z";

Deno.test("buildBackup wraps conversations with format/version/timestamp", () => {
  const backup = buildBackup({ a: conv("a", now) }, now);
  assertEquals(backup.format, BACKUP_FORMAT);
  assertEquals(backup.version, 1);
  assertEquals(backup.exportedAt, now);
  assertEquals(backup.conversations.length, 1);
});

Deno.test("serializeBackup round-trips through parseBackup (wrapped form)", () => {
  const json = serializeBackup({ a: conv("a", now), b: conv("b", now) }, now);
  const parsed = parseBackup(json);
  assertEquals(Object.keys(parsed).sort(), ["a", "b"]);
});

Deno.test("parseBackup salvages a bare array (version-agnostic recovery)", () => {
  const json = JSON.stringify([conv("x", now), conv("y", now)]);
  const parsed = parseBackup(json);
  assertEquals(Object.keys(parsed).sort(), ["x", "y"]);
});

Deno.test("parseBackup salvages a bare id->conversation map", () => {
  const json = JSON.stringify({ x: conv("x", now) });
  const parsed = parseBackup(json);
  assertEquals(Object.keys(parsed), ["x"]);
});

Deno.test("parseBackup ignores entries without an id", () => {
  const json = JSON.stringify([{ foo: 1 }, conv("ok", now)]);
  const parsed = parseBackup(json);
  assertEquals(Object.keys(parsed), ["ok"]);
});

Deno.test("mergeBackup keeps the newer record on id collision", () => {
  const existing = { a: conv("a", "2026-06-21T10:00:00.000Z") };
  const importedNewer = { a: conv("a", "2026-06-21T11:00:00.000Z") };
  const importedOlder = { a: conv("a", "2026-06-21T09:00:00.000Z") };

  assertEquals(
    mergeBackup(existing, importedNewer).a.updatedAt,
    "2026-06-21T11:00:00.000Z",
  );
  // importing an older backup must NOT clobber fresher local work
  assertEquals(
    mergeBackup(existing, importedOlder).a.updatedAt,
    "2026-06-21T10:00:00.000Z",
  );
});

Deno.test("mergeBackup adds brand-new conversations", () => {
  const merged = mergeBackup({ a: conv("a", now) }, { b: conv("b", now) });
  assertEquals(Object.keys(merged).sort(), ["a", "b"]);
});
