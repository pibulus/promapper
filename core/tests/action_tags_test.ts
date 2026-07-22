/**
 * The @/# sentence system: tokenizing, quick-add extraction, tag listing.
 * Colors are viewer-local (localStorage) and not tested here.
 */

import { assert, assertEquals } from "./_assert.ts";
import {
  parseQuickAdd,
  tagsIn,
  tokenizeActionText,
} from "../../utils/actionTags.ts";

Deno.test("tokenize: text, @person and #tag runs in order", () => {
  const tokens = tokenizeActionText("fix the fence @mabel for the #garden");
  assertEquals(tokens.map((t) => t.kind), [
    "text",
    "person",
    "text",
    "tag",
  ]);
  assertEquals(tokens[1].value, "mabel");
  assertEquals(tokens[3].value, "garden");
  assertEquals(
    tokens.map((t) => t.raw).join(""),
    "fix the fence @mabel for the #garden",
  );
});

Deno.test("tokenize: bare @ or # without a word stays plain text", () => {
  const tokens = tokenizeActionText("meet @ 5 # ok");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0].kind, "text");
});

Deno.test("quick-add: first @word becomes assignee and leaves the sentence", () => {
  const parsed = parseQuickAdd("@mabel fix the fence #garden");
  assertEquals(parsed.assignee, "mabel");
  assertEquals(parsed.description, "fix the fence #garden");
});

Deno.test("quick-add: later @words stay in the sentence", () => {
  const parsed = parseQuickAdd("ask @doc about @perkins");
  assertEquals(parsed.assignee, "doc");
  assertEquals(parsed.description, "ask about @perkins");
});

Deno.test("quick-add: no @ means no assignee, text untouched", () => {
  const parsed = parseQuickAdd("paint the moon shed");
  assertEquals(parsed.assignee, null);
  assertEquals(parsed.description, "paint the moon shed");
});

Deno.test("tagsIn: unique, lowercased", () => {
  assertEquals(tagsIn("tune #Radio then fix #radio and #garden"), [
    "radio",
    "garden",
  ]);
  assert(tagsIn("nothing here").length === 0);
});
