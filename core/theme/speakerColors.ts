/**
 * Speaker colors — every voice in a conversation gets one stable color. The
 * SAME color identifies a speaker everywhere: their name in the transcript,
 * their bar in Voices, and their dot on an action item.
 *
 * THE LUSH RAINBOW (July 9 decree): rich, warm, classy versions of every
 * hue — terracotta not crayon-red, ochre not yellow, teal not lime, denim
 * not cyan. All readable as 600-weight names on cream, all unisex, zero
 * kids'-crayon neon.
 *
 * Pure + framework-neutral. Color is by position in the speakers list (stable
 * for a conversation); names not in the list fall back to a hash so ad-hoc
 * assignees ("Me") still get a consistent color.
 */

export const SPEAKER_PALETTE = [
  "#D4553B", // terracotta
  "#2E8C7E", // deep teal
  "#4A6FC3", // denim
  "#C64B77", // raspberry
  "#A8721F", // ochre
  "#7E56BD", // violet
  "#AC5286", // plum
  "#467F96", // petrol
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
