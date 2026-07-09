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

/**
 * If the summary is one long unbroken paragraph, regroup it into short
 * paragraphs of a couple of sentences each. Anything that already has
 * structure (blank lines, bullets, headings) is left exactly as written.
 */
export function paragraphizeSummary(text: string): string {
  if (!text) return text;
  const trimmed = text.trim();
  // Already structured — real paragraphs, list items, or headings.
  if (/\n\s*\n/.test(trimmed) || /^\s*([-*+]|\d+\.|#)\s/m.test(trimmed)) {
    return text;
  }
  const sentences = splitSentences(trimmed);
  if (sentences.length <= SENTENCES_PER_PARA + 1) return text;

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
