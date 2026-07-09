/**
 * Speaker colors — every voice in a conversation gets one stable color, drawn
 * from the locked vivid-pop palette (the same family the five themes use).
 * The SAME color identifies a speaker everywhere: their name in the
 * transcript, their bar in Voices, and their dot on an action item.
 *
 * Pure + framework-neutral. Color is by position in the speakers list (stable
 * for a conversation); names not in the list fall back to a hash so ad-hoc
 * assignees ("Me") still get a consistent color.
 */

export const SPEAKER_PALETTE = [
  "#FF62D7", // bubblegum
  "#00BFFF", // sky
  "#7659FF", // grape
  "#32CD32", // lime
  "#F5A300", // gold (deepened for visibility on cream)
] as const;

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function speakerColor(
  name: string,
  speakers: readonly string[],
): string {
  const trimmed = name.trim();
  const index = speakers.findIndex((s) => s.trim() === trimmed);
  const i = index >= 0 ? index : nameHash(trimmed);
  return SPEAKER_PALETTE[i % SPEAKER_PALETTE.length];
}
