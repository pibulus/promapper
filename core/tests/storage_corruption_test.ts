/**
 * Tests for classifyConversationsRaw — the empty-vs-corrupt distinction that
 * stops a JSON.parse failure from looking like "no conversations". Without it,
 * the next autosave would overwrite the whole store with a one-entry map,
 * destroying every other saved conversation AND the recoverable corrupt bytes.
 *
 * Pure function, no browser globals (same approach as backup_test.ts).
 */

import { assertEquals } from "./_assert.ts";
import { classifyConversationsRaw } from "../storage/localStorage.ts";

Deno.test("null/empty input is genuinely empty, NOT corrupt", () => {
  assertEquals(classifyConversationsRaw(null), { map: {}, corrupt: false });
  assertEquals(classifyConversationsRaw(""), { map: {}, corrupt: false });
});

Deno.test("valid JSON parses with corrupt: false", () => {
  const json = JSON.stringify({ moth: { id: "moth" } });
  const out = classifyConversationsRaw(json);
  assertEquals(out.corrupt, false);
  assertEquals(Object.keys(out.map), ["moth"]);
});

Deno.test("invalid JSON is flagged corrupt with an empty map", () => {
  // The critical case: this must report corrupt:true, NOT look empty. A writer
  // seeing corrupt:true refuses to save, so the recoverable bytes survive.
  const out = classifyConversationsRaw("{not valid json at all");
  assertEquals(out, { map: {}, corrupt: true });
});

Deno.test("a single garbage char is corrupt, not empty", () => {
  // Belt-and-suspenders: a one-byte truncation (the kind a crashed write leaves)
  // is corrupt, not absent — so we never mistake it for a fresh empty store.
  assertEquals(classifyConversationsRaw("x"), { map: {}, corrupt: true });
});
