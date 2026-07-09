/**
 * Talk share — who held the floor, computed from the transcript text.
 *
 * Transcripts are "Name: what they said" lines (a speaker's turn may span
 * multiple lines until the next "Name:" prefix). Word counts per speaker turn
 * into proportion shares for the Transcript card's flip side. Pure +
 * framework-neutral so it's unit-testable.
 */

export interface SpeakerShare {
  speaker: string;
  words: number;
  /** 0..1 fraction of all attributed words. */
  share: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Compute per-speaker word counts + shares, most talkative first. Only names
 * in `speakers` are treated as turn starts (an arbitrary "word:" mid-text
 * can't invent a phantom speaker). Unattributed text (before the first turn)
 * is ignored. Returns [] when there are no speakers or no attributed words.
 */
export function computeTalkShare(
  text: string,
  speakers: string[],
): SpeakerShare[] {
  if (!text.trim() || speakers.length === 0) return [];

  const known = new Set(speakers.map((s) => s.trim()).filter(Boolean));
  if (known.size === 0) return [];

  const counts = new Map<string, number>();
  let current: string | null = null;

  for (const line of text.split("\n")) {
    const match = /^([^:\n]{1,100}):\s*(.*)$/.exec(line);
    if (match && known.has(match[1].trim())) {
      current = match[1].trim();
      counts.set(current, (counts.get(current) ?? 0) + countWords(match[2]));
    } else if (current) {
      counts.set(current, (counts.get(current) ?? 0) + countWords(line));
    }
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  return [...counts.entries()]
    .map(([speaker, words]) => ({ speaker, words, share: words / total }))
    .sort((a, b) => b.words - a.words);
}

/** Total word count of the whole transcript (speaker labels excluded-ish —
 * good enough for a "~N words" stat). */
export function transcriptWordCount(text: string): number {
  return countWords(text);
}
