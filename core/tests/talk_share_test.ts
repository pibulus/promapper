/**
 * Talk-share guards: multi-line turns attribute to the current speaker, only
 * known speakers start turns, and shares are ordered most-talkative first.
 */

import { assert, assertEquals } from "./_assert.ts";
import {
  computeTalkShare,
  transcriptWordCount,
} from "../orchestration/talk-share.ts";

const TRANSCRIPT = `Nan: Gerald the moth has tenure now.
He sits in on every meeting.
The Goat: I disagree with the moth.
Nan: You disagree with everything.`;

Deno.test("attributes multi-line turns to the current speaker", () => {
  const shares = computeTalkShare(TRANSCRIPT, ["Nan", "The Goat"]);
  assertEquals(shares.length, 2);
  assertEquals(shares[0].speaker, "Nan"); // most words first
  // Nan: 6 + 7 + 4 = 17 words of turns... count exactly:
  // "Gerald the moth has tenure now." = 6, "He sits in on every meeting." = 6,
  // "You disagree with everything." = 4 → 16
  assertEquals(shares[0].words, 16);
  assertEquals(shares[1].words, 5); // "I disagree with the moth." = 5
  assert(Math.abs(shares[0].share + shares[1].share - 1) < 1e-9);
});

Deno.test("unknown 'word:' prefixes cannot invent speakers", () => {
  const text = "Nan: The recipe says: add three frogs.\nWarning: do not.";
  const shares = computeTalkShare(text, ["Nan"]);
  assertEquals(shares.length, 1);
  // "Warning:" is not a known speaker → its whole line ("Warning: do not." =
  // 3 words) belongs to Nan's turn, plus her own 6 words.
  assertEquals(shares[0].words, 6 + 3);
});

Deno.test("empty inputs return empty", () => {
  assertEquals(computeTalkShare("", ["Nan"]), []);
  assertEquals(computeTalkShare("Nan: hi", []), []);
  assertEquals(computeTalkShare("no speakers here at all", ["Nan"]), []);
});

Deno.test("transcriptWordCount counts plain words", () => {
  assertEquals(transcriptWordCount("  three  little   words "), 3);
  assertEquals(transcriptWordCount(""), 0);
});
