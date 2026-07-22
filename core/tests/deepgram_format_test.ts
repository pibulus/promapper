/**
 * Tests for services/deepgram.ts — the response formatter that shapes
 * Deepgram's diarised utterances into the pipeline's "Speaker1:" contract.
 */

import { assertEquals } from "./_assert.ts";
import { formatDeepgramResult } from "../../services/deepgram.ts";

Deno.test("multi-speaker utterances get Speaker-prefixed lines", () => {
  const result = formatDeepgramResult({
    results: {
      utterances: [
        { transcript: "the mural needs more octopus", speaker: 0 },
        { transcript: "way more octopus", speaker: 1 },
        { transcript: "and glitter", speaker: 0 },
      ],
    },
  });
  assertEquals(
    result.text,
    "Speaker1: the mural needs more octopus\nSpeaker2: way more octopus\nSpeaker1: and glitter",
  );
  assertEquals(result.speakers, ["Speaker1", "Speaker2"]);
});

Deno.test("single speaker stays plain — no label noise", () => {
  const result = formatDeepgramResult({
    results: {
      utterances: [
        { transcript: "note to self:", speaker: 0 },
        { transcript: "feed the sourdough", speaker: 0 },
      ],
    },
  });
  assertEquals(result.text, "note to self: feed the sourdough");
  assertEquals(result.speakers, []);
});

Deno.test("no utterances falls back to channel transcript", () => {
  const result = formatDeepgramResult({
    results: {
      channels: [{ alternatives: [{ transcript: "  hola hola  " }] }],
    },
  });
  assertEquals(result.text, "hola hola");
  assertEquals(result.speakers, []);
});

Deno.test("empty response yields empty text, not a crash", () => {
  const result = formatDeepgramResult({});
  assertEquals(result.text, "");
  assertEquals(result.speakers, []);
});

Deno.test("blank utterances are dropped before speaker counting", () => {
  const result = formatDeepgramResult({
    results: {
      utterances: [
        { transcript: "   ", speaker: 1 },
        { transcript: "solo voice", speaker: 0 },
      ],
    },
  });
  assertEquals(result.text, "solo voice");
  assertEquals(result.speakers, []);
});
