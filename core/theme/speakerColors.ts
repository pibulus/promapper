/**
 * Speaker colors — every voice in a conversation gets one stable color. The
 * SAME color identifies a speaker everywhere: their name in the transcript,
 * their bar in Voices, and their dot on an action item.
 *
 * THE SPRITZY RAINBOW (July 10 decree, v2 of the lush one): fresh, bright,
 * warm — aperol-hour tones, never primary/garish/flat/earthy. Ordered
 * warm/cool alternating so adjacent speakers read distinct at a glance.
 * Every tone holds a white check on the assignee checkbox-pin AND reads as
 * a 600-weight name on cream. Deliberately THEME-INDEPENDENT: a person's
 * color is their identity anchor — it must survive every dice roll.
 *
 * Pure + framework-neutral. Color is by position in the speakers list (stable
 * for a conversation); names not in the list fall back to a hash so ad-hoc
 * assignees ("Me") still get a consistent color.
 */

export const SPEAKER_PALETTE = [
  "#EA5A3F", // watermelon
  "#4E8BE0", // sky
  "#E14E86", // guava
  "#22A38F", // fresh teal
  "#D95B22", // clementine
  "#9061DB", // violet
  "#C853A8", // orchid
  "#1F97AA", // lagoon
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
