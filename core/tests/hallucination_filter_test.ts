/**
 * Tests for transcript cleanup and noise/hallucination filtering.
 */

import { assertEquals } from "./_assert.ts";
import { cleanTranscriptText, isNoiseOrHallucination } from "../ai/helpers.ts";

Deno.test("preserves valid single-line speech", () => {
  const input = "We need to finalize the roadmap by Friday.";
  assertEquals(cleanTranscriptText(input), input);
  assertEquals(isNoiseOrHallucination(input), false);
});

Deno.test("preserves valid multi-speaker speech", () => {
  const input = "Speaker1: Let's ship this.\nSpeaker2: Agreed, looks solid.";
  assertEquals(cleanTranscriptText(input), input);
  assertEquals(isNoiseOrHallucination(input), false);
});

Deno.test("preserves Spanish and non-Latin speech", () => {
  const es = "Tenemos que revisar el despliegue mañana por la mañana.";
  assertEquals(cleanTranscriptText(es), es);
  assertEquals(isNoiseOrHallucination(es), false);

  const jp = "プロジェクトの進捗を確認しましょう。";
  assertEquals(cleanTranscriptText(jp), jp);
  assertEquals(isNoiseOrHallucination(jp), false);
});

Deno.test("filters out common YouTube and Whisper hallucination phrases", () => {
  const hallucinations = [
    "Thank you for watching.",
    "Thanks for watching!",
    "Please subscribe to my channel.",
    "Like and subscribe.",
    "Don't forget to subscribe.",
    "Subtitles by OpenSubtitles.org",
    "Translated by someone",
    "amara.org",
    "The End.",
    "To be continued...",
    "Bye-bye.",
    "See you next time.",
    "MBC 뉴스",
  ];

  for (const h of hallucinations) {
    assertEquals(
      cleanTranscriptText(h),
      "",
      `Expected "${h}" to be filtered out`,
    );
    assertEquals(isNoiseOrHallucination(h), true);
  }
});

Deno.test("filters out bracketed and parenthetical noise annotations", () => {
  const noises = [
    "[Music]",
    "[Silence]",
    "[Applause]",
    "[Laughter]",
    "[BLANK_AUDIO]",
    "(music)",
    "(applause)",
    "(silence)",
    "*music*",
  ];

  for (const n of noises) {
    assertEquals(
      cleanTranscriptText(n),
      "",
      `Expected "${n}" to be filtered out`,
    );
    assertEquals(isNoiseOrHallucination(n), true);
  }
});

Deno.test("strips inline non-speech tags while keeping genuine speech", () => {
  const mixed = "[Music] We should definitely launch next Tuesday. [Applause]";
  assertEquals(
    cleanTranscriptText(mixed),
    "We should definitely launch next Tuesday.",
  );
  assertEquals(isNoiseOrHallucination(mixed), false);
});

Deno.test("detects repetition loops from low-energy noise / audio hallucinations", () => {
  const loops = [
    "yeah yeah yeah yeah yeah yeah",
    "Thank you. Thank you. Thank you. Thank you.",
    "I'm sorry. I'm sorry. I'm sorry. I'm sorry.",
    "you know you know you know you know you know",
  ];

  for (const l of loops) {
    assertEquals(
      cleanTranscriptText(l),
      "",
      `Expected loop "${l}" to be detected`,
    );
    assertEquals(isNoiseOrHallucination(l), true);
  }
});

Deno.test("filters out punctuation-only or symbol artifacts", () => {
  const junk = [
    "...",
    "---",
    "???",
    "!!",
    "   ",
    "",
  ];

  for (const j of junk) {
    assertEquals(cleanTranscriptText(j), "");
    assertEquals(isNoiseOrHallucination(j), true);
  }
});
