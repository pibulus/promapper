/**
 * Theme shuffle — no fixed themes, just a generator that rolls warm, airy,
 * fresh, CONSISTENT looks on demand.
 *
 * Everything in the app derives from a handful of tokens (accent + inks over
 * the constant warm cream wash), so a "theme" is really one well-chosen hue.
 * Constraints keep every roll on-brand:
 *   - hue only from the vivid-pop arcs (gold → green → sky/purple → pink);
 *     the red/brown band is skipped entirely (no-red law, no mud)
 *   - saturation high (confident pop, never grandma-pastel)
 *   - accent lightness banded so dark ink on its 12% band tint AND white on
 *     --accent-strong (72% accent + near-black) pass AA by construction
 *   - text ink is a dark, hue-tinted near-black (like the hand-made themes)
 */

import type { Theme } from "@core/theme/types.ts";
import { WARM_BG } from "@core/theme/themes.ts";

/** Allowed hue arc [start, end] in degrees — sky → blue → purple → violet →
 * pink → magenta. Computed, not vibes: this is the exact range where a
 * saturated accent at airy lightness (50–62) still leaves white text AA on
 * --accent-strong (72% mix with near-black). Yellow/green pops are luminous
 * enough to fail that mix at any non-muddy lightness, so they're out — every
 * roll stays fresh AND readable by construction. */
export const HUE_ARCS: ReadonlyArray<readonly [number, number]> = [
  [210, 345],
];

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) =>
    Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export interface ShuffleParts {
  hue: number;
  saturation: number;
  lightness: number;
  theme: Theme;
}

const VIBES = [
  "fresh roll",
  "new coat of paint",
  "today's flavor",
  "clean slate",
  "another mood",
];

/**
 * Roll a complete theme. `rand` is injectable for deterministic tests.
 */
export function generateThemeParts(
  rand: () => number = Math.random,
): ShuffleParts {
  const arc = HUE_ARCS[Math.floor(rand() * HUE_ARCS.length) % HUE_ARCS.length];
  const hue = arc[0] + rand() * (arc[1] - arc[0]);
  // Confident pop: high saturation, airy lightness (the arc guarantees
  // contrast at this whole band — see HUE_ARCS).
  const saturation = 82 + rand() * 16; // 82–98
  const lightness = 50 + rand() * 12; // 50–62

  const accent = hslToHex(hue, saturation, lightness);
  // Dark hue-tinted ink (the hand-made themes all did this: #2b2430 etc.)
  const text = hslToHex(hue, 18 + rand() * 10, 17 + rand() * 4);
  const textSecondary = hslToHex(hue, 10 + rand() * 8, 54 + rand() * 6);

  const theme: Theme = {
    name: "SHUFFLE",
    vibe: VIBES[Math.floor(rand() * VIBES.length) % VIBES.length],
    base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
    secondary: "rgba(255, 255, 255, 0.62)",
    accent,
    text,
    textSecondary,
    border: `${text}1a`, // ~10% alpha ink, same recipe as the named themes
    cssVars: {
      "--color-base-solid": "#ffe2cf",
      "--shadow-soft": `0 4px 12px ${accent}1f`,
      "--gradient-bg": WARM_BG,
    },
  };

  return { hue, saturation, lightness, theme };
}

export function generateTheme(rand: () => number = Math.random): Theme {
  return generateThemeParts(rand).theme;
}
