// assembleTake: what the take journal hands back after a crash.

import { assertEquals } from "./_assert.ts";
import {
  assembleTake,
  type JournalRow,
  MIN_RECOVERABLE_BYTES,
  type TakeMeta,
} from "../storage/takeJournal.ts";

const meta: TakeMeta = {
  mimeType: "audio/mp4",
  startedAt: "2026-09-25T10:00:00.000Z",
  conversationId: "map-1",
  title: "Band practice",
};
const chunk = (seq: number, text: string): JournalRow => ({
  seq,
  data: new Blob([text.padEnd(600, ".")]),
});

Deno.test("chunks reassemble in seq order, whatever order IDB returns them in", async () => {
  const take = assembleTake(meta, [
    chunk(2, "C"),
    chunk(0, "A"),
    chunk(1, "B"),
  ]);
  const text = await take!.blob.text();
  assertEquals([text[0], text[600], text[1200]], ["A", "B", "C"]);
  assertEquals(take!.chunks, 3);
  // The recorder's own type — Safari's mp4 must not come back labelled webm.
  assertEquals(take!.blob.type, "audio/mp4");
  assertEquals(take!.meta.conversationId, "map-1");
});

Deno.test("nothing to hand back without meta, rows, or more than a blink", () => {
  assertEquals(assembleTake(undefined, [chunk(0, "A"), chunk(1, "B")]), null);
  assertEquals(assembleTake(meta, []), null);
  assertEquals(assembleTake(meta, undefined), null);
  // One 600-byte chunk is a blink-tap, below the server's floor.
  assertEquals(600 < MIN_RECOVERABLE_BYTES, true);
  assertEquals(assembleTake(meta, [chunk(0, "A")]), null);
});
