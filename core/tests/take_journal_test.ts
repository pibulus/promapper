// assembleTakes: what the take journal hands back after a crash, and what it
// throws away.

import { assertEquals } from "./_assert.ts";
import {
  assembleTakes,
  type JournalRow,
  type TakeMeta,
} from "../storage/takeJournal.ts";

const meta = (takeId: string, startedAt: string, extra = {}): TakeMeta => ({
  takeId,
  mimeType: "audio/mp4",
  startedAt,
  ...extra,
});
// 600 bytes a chunk: one alone is a blink-tap, two are worth keeping.
const row = (takeId: string, seq: number, mark: string): JournalRow => ({
  takeId,
  seq,
  data: new Blob([mark.padEnd(600, ".")]),
});

Deno.test("each take reassembles from its own chunks, in seq order", async () => {
  const { ready, junk } = assembleTakes(
    [meta("a", "2026-09-25T10:00:00Z", { conversationId: "map-1" })],
    [row("a", 2, "C"), row("b", 0, "X"), row("a", 0, "A"), row("a", 1, "B")],
  );
  assertEquals(ready.length, 1);
  const text = await ready[0].blob.text();
  assertEquals([text[0], text[600], text[1200]], ["A", "B", "C"]);
  // Safari's mp4 must not come back labelled webm.
  assertEquals(ready[0].blob.type, "audio/mp4");
  assertEquals(ready[0].meta.conversationId, "map-1");
  // Take b's chunk has no take left to belong to.
  assertEquals(junk, ["b"]);
});

Deno.test("two takes never share a slot, and the newest comes first", () => {
  const { ready } = assembleTakes(
    [meta("old", "2026-09-25T09:00:00Z"), meta("new", "2026-09-25T11:00:00Z")],
    [
      row("old", 0, "O"),
      row("old", 1, "O"),
      row("new", 0, "N"),
      row("new", 1, "N"),
    ],
  );
  assertEquals(ready.map((t) => t.meta.takeId), ["new", "old"]);
});

Deno.test("a take missing chunk 0 or under a blink is junk, not handed back", () => {
  const { ready, junk } = assembleTakes(
    [
      meta("headless", "2026-09-25T10:00:00Z"),
      meta("blink", "2026-09-25T10:01:00Z"),
    ],
    // headless: the container header never landed, so nothing after it decodes.
    [row("headless", 1, "B"), row("headless", 2, "C"), row("blink", 0, "A")],
  );
  assertEquals(ready, []);
  assertEquals(junk.sort(), ["blink", "headless"]);
});
