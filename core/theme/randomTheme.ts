/**
 * Theme shuffle — no fixed themes, just a generator that rolls airy, pastel,
 * whimsical, CONSISTENT looks on demand. A roll is a SPACE, not an office
 * product: lush light washes, one candy accent, deep ink where words live.
 *
 * The scheme (July 9 pastel rework):
 *   - accent = a FRESH PASTEL (high saturation + high lightness — dusty/greyed
 *     pastel is grandma, saturated pastel is sorbet). It colors SURFACES:
 *     bands, chips, washes, the background family.
 *   - --accent-ink / --accent-strong = a DEEP COMPANION of the same hue,
 *     solved numerically so white text passes AA on it by construction.
 *     Every text-bearing accent element routes through these tokens.
 *   - the app background re-tints per roll: a mesh of analogous pastel washes
 *     (peach→coral, pink→lavender, mint→sky — whatever family the hue lands
 *     in) over a light warm-blended base, same structure as the proven
 *     WARM_BG.
 *   - hue arc skips the red/brown band entirely (no-red law, no mud) but is
 *     otherwise free: butter → lime → mint → sky → lilac → pink.
 *   - band/wash recipes are overridden per roll at HIGHER mix percentages —
 *     a pastel at 12% is invisible where a vivid pop wasn't. Named themes
 *     keep the static recipes.
 */

import type { Theme } from "@core/theme/types.ts";

/** Allowed hue arc [start, end] in degrees — butter/gold → green → sky →
 * purple → pink/magenta. Only the red/coral/brown band (340–40) is excluded:
 * with contrast carried by the solved deep companion (not the accent itself),
 * every other family is readable by construction, so the arc is taste, not
 * math — reds go alarm/mud, everything else stays fresh. */
export const HUE_ARCS: ReadonlyArray<readonly [number, number]> = [
  [40, 340],
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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** sRGB mix of two hexes — same math as CSS `color-mix(in srgb, A p%, B)`. */
export function mixHex(a: string, b: string, pOfA: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const m = ra.map((v, i) => Math.round(v * pOfA + rb[i] * (1 - pOfA)));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Solid card cream (--surface-cream). The deep companion is solved against
 * THIS, not white: it doubles as ink on cream surfaces, and cream is the
 * harder of the two checks — passing it guarantees white-on-strong too. */
export const SURFACE_CREAM = "#fff7ef";

/** The deep companion: same hue as the pastel accent, lightness walked down
 * until it clears AA against cream (and therefore white) with margin.
 * Golds keep their saturation (dropping it goes olive); cool hues shed a
 * little so the deep tone reads rich, not neon. */
export function deriveStrong(hue: number, sat: number): string {
  const s = hue < 95 ? Math.min(94, sat + 8) : Math.max(48, sat - 10);
  for (let l = 48; l >= 20; l--) {
    const hex = hslToHex(hue, s, l);
    if (contrast(hex, SURFACE_CREAM) >= 4.6) return hex;
  }
  return hslToHex(hue, s, 20);
}

const wrap = (h: number) => ((h % 360) + 360) % 360;

/** The warm families the background is allowed to live in — blush coral,
 * peach (the original), apricot butter, petal pink. Airy and classy by
 * construction; the roll picks the one farthest from the accent hue. */
export const WARM_FAMILIES: ReadonlyArray<readonly [number, number]> = [
  [6, 18],
  [18, 36],
  [36, 50],
  [330, 352],
];

export interface ShuffleParts {
  hue: number;
  saturation: number;
  lightness: number;
  /** Hue the background family landed on (always inside WARM_FAMILIES). */
  bgHue: number;
  /** The three pastel wash hexes composited into --gradient-bg (light → the
   * eye; exported so tests can guard bg lightness). */
  bgWashes: string[];
  /** Linear base stops under the washes. */
  bgBase: string[];
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
  // Sorbet pastel: saturation stays HIGH (fresh, not dusty), lightness airy.
  const saturation = 68 + rand() * 24; // 68–92
  const lightness = 78 + rand() * 8; // 78–86

  const accent = hslToHex(hue, saturation, lightness);
  const strong = deriveStrong(hue, saturation);
  // Dark hue-tinted ink (same recipe family as the hand-made themes).
  const text = hslToHex(hue, 16 + rand() * 8, 16 + rand() * 4);
  const textSecondary = hslToHex(hue, 10 + rand() * 6, 46 + rand() * 6);

  // Background: ALWAYS one of the warm families (airy, classy, gradientish —
  // the original peach wash energy), never the accent's own family. We pick
  // the warm family FARTHEST from the accent hue so the header bands play
  // against the space instead of dissolving into it: sky accent → the classic
  // peach, pink accent → apricot butter, mint accent → petal pink.
  const mid = ([lo, hi]: readonly [number, number]) => (lo + hi) / 2;
  const circDist = (a: number, b: number) => {
    const d = Math.abs(wrap(a) - wrap(b));
    return Math.min(d, 360 - d);
  };
  const family = WARM_FAMILIES.reduce((best, f) =>
    circDist(hue, mid(f)) > circDist(hue, mid(best)) ? f : best
  );
  const bgHue = family[0] + rand() * (family[1] - family[0]);

  // Two warm washes + one soft accent-family glow in the low corner (the
  // interplay). The glow is a PASTELIZED pure-family tone, never a pigment
  // mix with the warm wash — sRGB-mixing complementary pastels makes grey.
  const j = () => rand() * 12 - 6;
  const washes = [
    hslToHex(wrap(bgHue - 8), 80 + rand() * 15, 84 + rand() * 3),
    hslToHex(wrap(bgHue + 10), 78 + rand() * 18, 85 + rand() * 3),
    hslToHex(hue, 68 + rand() * 12, 87 + rand() * 3),
  ];
  const washAlphas = [0.9, 0.8, 0.55];
  const positions: Array<[number, number]> = [
    [15 + j(), 12 + j()],
    [85 + j(), 18 + j()],
    [75 + j(), 88 + j()],
  ];
  const radials = washes.map((w, i) => {
    const [r, g, b] = hexToRgb(w);
    const [x, y] = positions[i];
    return `radial-gradient(circle at ${Math.round(x)}% ${Math.round(y)}%, ` +
      `rgba(${r},${g},${b},${washAlphas[i]}), transparent 55%)`;
  });
  // Linear base — same recipe territory as the beloved original
  // (#ffe7d4 → #ffd2bd → #ffe0cd): warm, saturated, light.
  const bgBase = [
    hslToHex(wrap(bgHue + 6), 72 + rand() * 20, 92),
    hslToHex(wrap(bgHue - 6), 85 + rand() * 15, 88),
    hslToHex(wrap(bgHue + 2), 80 + rand() * 18, 91),
  ];
  const gradientBg = `${radials.join(", ")}, linear-gradient(135deg, ` +
    `${bgBase[0]} 0%, ${bgBase[1]} 55%, ${bgBase[2]} 100%)`;
  const baseSolid = hslToHex(bgHue, 70, 91);

  const theme: Theme = {
    name: "SHUFFLE",
    vibe: VIBES[Math.floor(rand() * VIBES.length) % VIBES.length],
    base: `linear-gradient(135deg, ${bgBase[0]} 0%, ${bgBase[1]} 100%)`,
    secondary: "rgba(255, 255, 255, 0.62)",
    accent,
    text,
    textSecondary,
    border: `${text}1a`, // ~10% alpha ink, same recipe as the named themes
    cssVars: {
      "--color-base-solid": baseSolid,
      "--shadow-soft": `0 4px 12px ${strong}1f`,
      "--gradient-bg": gradientBg,
      // The deep companion carries every text-bearing accent element.
      "--accent-strong": strong,
      "--accent-ink": strong,
      "--accent-fill": strong,
      // Pastel surfaces need MORE accent in the mix than vivid pops did —
      // the static recipes (12%/10%) assume a saturated mid-lightness accent.
      "--header-band":
        "color-mix(in srgb, var(--color-accent) 42%, var(--surface-cream))",
      "--footer-band":
        "color-mix(in srgb, var(--color-accent) 32%, var(--surface-card))",
      "--accent-rose-wash":
        "color-mix(in srgb, var(--color-accent) 30%, transparent)",
      "--accent-rose-wash-soft":
        "color-mix(in srgb, var(--color-accent) 20%, transparent)",
    },
  };

  return { hue, saturation, lightness, bgHue, bgWashes: washes, bgBase, theme };
}

export function generateTheme(rand: () => number = Math.random): Theme {
  return generateThemeParts(rand).theme;
}
