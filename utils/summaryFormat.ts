/**
 * Summary presentation — break the AI's wall of text into breathable
 * paragraphs BEFORE markdown rendering. Pure text-in text-out (the result
 * still goes through formatMarkdownSafe), so it composes with real markdown:
 * summaries that already have structure (paragraph breaks, bullets,
 * headings) pass through untouched.
 */

/** Sentences per paragraph — two reads airy without going staccato. */
const SENTENCES_PER_PARA = 2;

/** Titles/abbreviations whose trailing dot is NOT a sentence end — people
 * talk about each other in transcripts, so honorifics show up constantly. */
const NON_TERMINAL = /\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e)\.$/i;

/** Split prose into sentences, keeping each sentence's terminator, then
 * re-join chunks that ended on an abbreviation dot ("...bit Mrs." +
 * "Patterson..."). */
function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?:\s+|$)|[^.!?]+$/g)?.map(
    (s) => s.trim(),
  ).filter((s) => s.length > 0) ?? [];
  const merged: string[] = [];
  for (const chunk of raw) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && NON_TERMINAL.test(prev)) {
      merged[merged.length - 1] = `${prev} ${chunk}`;
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

/** Generic titles the model likes to open with. The card header already says
 * "Summary", so a leading "# Summary"/"## Overview" renders as a giant
 * duplicate title (Pablo's 2026-08-13 dogfood find). Specific headings
 * ("# The Pig Situation") are real structure and stay. */
const REDUNDANT_TITLE =
  /^#{1,3}\s+((conversation|meeting)\s+)?(summary|recap|overview|main\s+points):?\s*$/i;

/** Drop a leading generic markdown title (and a bare bold variant of it). */
function stripRedundantTitle(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (
    i < lines.length && (
      lines[i].trim() === "" ||
      REDUNDANT_TITLE.test(lines[i].trim()) ||
      REDUNDANT_TITLE.test(lines[i].trim().replace(/^\*\*(.*)\*\*$/, "# $1"))
    )
  ) i++;
  return i > 0 ? lines.slice(i).join("\n") : text;
}

/**
 * If the summary is one long unbroken paragraph, regroup it into short
 * paragraphs of a couple of sentences each. Anything that already has
 * structure (blank lines, bullets, headings) is left exactly as written —
 * except a leading generic title, which is always stripped (the card
 * header owns the word "Summary").
 */
export function paragraphizeSummary(text: string): string {
  if (!text) return text;
  const trimmed = stripRedundantTitle(text.trim()).trim();
  // Already structured — real paragraphs, list items, or headings.
  if (/\n\s*\n/.test(trimmed) || /^\s*([-*+]|\d+\.|#)\s/m.test(trimmed)) {
    return trimmed;
  }
  const sentences = splitSentences(trimmed);
  if (sentences.length <= SENTENCES_PER_PARA + 1) return trimmed;

  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
    paras.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(" "));
  }
  // Don't strand a single short sentence as the final "paragraph".
  if (
    paras.length > 1 &&
    paras[paras.length - 1].length < 60
  ) {
    const last = paras.pop()!;
    paras[paras.length - 1] += ` ${last}`;
  }
  return paras.join("\n\n");
}
