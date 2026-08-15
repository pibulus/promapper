/**
 * Deck export — parseDeckJson validation + the gz. encoding roundtrip
 * (decoded here exactly the way slideomatic's deck-persistence.js does).
 */

import { assertEquals } from "./_assert.ts";
import {
  buildDeckUrl,
  encodeDeckParam,
  parseDeckJson,
} from "../../utils/deckExport.ts";

const deck = [
  { type: "title", title: "Garden Plan", subtitle: "Spring session" },
  {
    type: "standard",
    badge: "Next steps",
    headline: "Who does what",
    body: ["Pablo waters the beds", "Sam orders seeds"],
  },
];

Deno.test("parseDeckJson accepts a bare slides array", () => {
  assertEquals(parseDeckJson(JSON.stringify(deck))?.length, 2);
});

Deno.test("parseDeckJson accepts a {slides} wrapper and strips fences", () => {
  const fenced = "```json\n" + JSON.stringify({ slides: deck }) + "\n```";
  assertEquals(parseDeckJson(fenced)?.length, 2);
});

Deno.test("parseDeckJson rejects non-deck output", () => {
  assertEquals(parseDeckJson("Here are your slides!"), null);
  assertEquals(parseDeckJson("[]"), null);
  assertEquals(
    parseDeckJson(JSON.stringify([{ type: "discussion", headline: "nope" }])),
    null,
  );
  assertEquals(parseDeckJson(JSON.stringify([{ headline: "typeless" }])), null);
});

Deno.test("encodeDeckParam roundtrips through slideomatic's decode", async () => {
  const param = await encodeDeckParam(deck);
  assertEquals(param.startsWith("gz."), true);
  // Slideomatic's decodeDataParam, verbatim logic:
  const b64 = param.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(stream).text();
  assertEquals(JSON.parse(json), deck);
});

Deno.test("buildDeckUrl targets slideomatic's deck page", async () => {
  const url = await buildDeckUrl(deck);
  assertEquals(
    url.startsWith("https://slideomatic.app/deck.html?data=gz."),
    true,
  );
});
