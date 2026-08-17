import { assertEquals } from "./_assert.ts";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
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
  // Track the constant, not a literal — the version bumps when the payload
  // grows (v2 added snapshots) and the shape assertions below are the point.
  assertEquals(backup.version, BACKUP_VERSION);
  assertEquals(backup.exportedAt, now);
  assertEquals(backup.conversations.length, 1);
});

Deno.test("serializeBackup round-trips through parseBackup (wrapped form)", () => {
  const json = serializeBackup(
    { a: conv("a", now), b: conv("b", now) },
    now,
    [],
  );
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

Deno.test("parseBackup normalizes salvaged records so the drawer can't crash", () => {
  // The shape tolerance is the point of this path — but the history drawer
  // reads conv.conversation.title / conv.nodes.length straight off whatever
  // gets stored, so an array-less record used to persist and throw on every
  // render, permanently, in the UI you'd recover through.
  const json = JSON.stringify([{ id: "bare", updatedAt: now }]);
  const parsed = parseBackup(json);
  assertEquals(parsed.bare.nodes, []);
  assertEquals(parsed.bare.edges, []);
  assertEquals(parsed.bare.actionItems, []);
  assertEquals(parsed.bare.statusUpdates, []);
  assertEquals(parsed.bare.conversation.id, "bare");
  assertEquals(parsed.bare.transcript.speakers, []);
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

Deno.test("mergeBackup treats a garbage date as oldest, not NaN-drop", () => {
  // A malformed (not absent) updatedAt must not become NaN and silently lose.
  const existing = { a: conv("a", "garbage-date") };
  const importedValid = { a: conv("a", now) };
  // valid import (epoch > 0) beats the garbage existing (coerced to 0)
  assertEquals(mergeBackup(existing, importedValid).a.updatedAt, now);

  // and a garbage IMPORT does not beat a valid existing record
  const existingValid = { a: conv("a", now) };
  const importedGarbage = { a: conv("a", "nonsense") };
  assertEquals(mergeBackup(existingValid, importedGarbage).a.updatedAt, now);
});

Deno.test("a backup carries link/text scraps but never file pointers", () => {
  // Magpie file rows point at bytes in THIS device's Blob store, which JSON
  // cannot carry. Left in, they restore on another machine looking entirely
  // real — right name, right size — until clicked. A backup must not contain
  // a promise it can't keep.
  const now = "2026-08-17T00:00:00.000Z";
  const c = conv("a", now);
  c.magpie = [
    { id: "1", kind: "link", value: "https://x.org/a", addedAt: now },
    { id: "2", kind: "text", value: "remember the pelicans", addedAt: now },
    {
      id: "3",
      kind: "file",
      value: "blob-id",
      name: "council-letter.pdf",
      size: 8412,
      mime: "application/pdf",
      addedAt: now,
    },
  ];

  const kinds = buildBackup({ a: c }, now).conversations[0].magpie?.map((i) =>
    i.kind
  );
  assertEquals(kinds, ["link", "text"]);
  // ...and the live conversation is untouched — stripping is for the copy.
  assertEquals(c.magpie?.length, 3);
});
