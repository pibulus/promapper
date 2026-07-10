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

/** CURATED PAIRS — the dice picks between DESIGNED couples, not raw hues.
 * Free random pairing kept rolling combos nobody would choose (mint on baby
 * pink = kids' party). Each pair is a ground family + a PUNK accent arc from
 * Pablo's own palette language (BRAND docs): "pastel backgrounds with punk
 * accents" — Miami Gradient (#FFD700→#FF6B6B→#4ECDC4), Sunset Spectrum,
 * riso fluoro pink #FF48B0, rebel purple #9B59B6, zombie-sheriff
 * orchid+coral. Grounds: sunrise coral/peach, orchid/magenta, aqua.
 * Accents: teal, cobalt, rebel purple, coral-red, hot pink — never mint,
 * never yellow, never baby pink. */
export const CURATED_PAIRS: ReadonlyArray<{
  readonly name: string;
  readonly ground: readonly [number, number];
  readonly accent: readonly [number, number];
}> = [
  // GREEN-FAMILY ACCENTS ARE DEAD (teal included): teal-on-pink/sunrise kept
  // reading "hospital pink and green" no matter the saturation. Accents are
  // coral, raspberry, cobalt, violet — full stop. Aqua survives only as a
  // GROUND, always paired with a warm accent.
  // sunrise × cornflower/cobalt (#5C9DD5 / #5B8DEF register)
  { name: "sunset-cobalt", ground: [12, 28], accent: [208, 228] },
  // coral glow × orchid punch (#9D50BB register)
  { name: "coral-orchid", ground: [8, 24], accent: [278, 298] },
  // orchid dusk × juicy coral (#FF6B6B — the zombie-sheriff look)
  { name: "dusk-coral", ground: [288, 314], accent: [8, 20] },
  // lagoon × coral pop (Miami inverted)
  { name: "lagoon-coral", ground: [172, 190], accent: [8, 20] },
  // aqua pool × raspberry (#E85D8F — the historic beloved accent)
  { name: "poolside", ground: [168, 188], accent: [328, 346] },
  // sunrise × raspberry (the peachyCream × rose historic default)
  { name: "dawn-rose", ground: [16, 30], accent: [330, 346] },
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

/** The warmer cream the header band mixes against (styles.css
 * --header-band) — sunshine in the bands without raising the accent %.
 * Tests mirror this value. */
export const BAND_CREAM = "#ffefdc";

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

/** Ground families, derived from the curated pairs (kept as an export for
 * the test sweeps). */
export const WARM_FAMILIES: ReadonlyArray<readonly [number, number]> =
  CURATED_PAIRS.map((p) => p.ground);

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
  const pair = CURATED_PAIRS[
    Math.floor(rand() * CURATED_PAIRS.length) % CURATED_PAIRS.length
  ];
  const hue = pair.accent[0] + rand() * (pair.accent[1] - pair.accent[0]);
  // PUNK accents ("pastel backgrounds with punk accents" — the BRAND law):
  // saturated mid-tones in #FF6B6B / #4ECDC4 / #9B59B6 territory. Never a
  // whisper-pastel, never muted, and not too dark either (L58–66 — the
  // L54 floor read "too dark"). Ink contrast rides the solved companion.
  const saturation = 76 + rand() * 20; // 76–96 (warmer/juicier bands)
  const lightness = 58 + rand() * 8; // 58–66

  const accent = hslToHex(hue, saturation, lightness);
  const strong = deriveStrong(hue, saturation);
  // Dark hue-tinted ink (same recipe family as the hand-made themes).
  const text = hslToHex(hue, 16 + rand() * 8, 16 + rand() * 4);
  const textSecondary = hslToHex(hue, 10 + rand() * 6, 46 + rand() * 6);

  // Ground comes from the SAME curated pair — the couple was designed
  // together, so ground and accent always play off each other on purpose.
  const bgHue = pair.ground[0] + rand() * (pair.ground[1] - pair.ground[0]);

  // AIRY SKY: the ground is a colored sky at the TOP that FADES INTO CREAM
  // where the components live — a full-saturation full-bleed field read as
  // "a toy". Two family washes hug the top corners; the accent leaves one
  // low-alpha whisper near the bottom. Never pigment-mix complementary
  // pastels — sRGB mixing makes grey; washes are pure-hue pastels.
  const j = () => rand() * 10 - 5;
  const washes = [
    hslToHex(wrap(bgHue - 8), 88 + rand() * 12, 79 + rand() * 3),
    hslToHex(wrap(bgHue + 10), 86 + rand() * 14, 81 + rand() * 3),
    hslToHex(hue, 78 + rand() * 14, 82 + rand() * 3),
  ];
  const washAlphas = [0.85, 0.7, 0.35];
  const positions: Array<[number, number]> = [
    [18 + j(), 0],
    [82 + j(), 6 + j() / 2],
    [78 + j(), 96],
  ];
  const radials = washes.map((w, i) => {
    const [r, g, b] = hexToRgb(w);
    const [x, y] = positions[i];
    return `radial-gradient(circle at ${Math.round(x)}% ${Math.round(y)}%, ` +
      `rgba(${r},${g},${b},${washAlphas[i]}), transparent 52%)`;
  });
  // Linear journey: saturated family sky → soft tint → warm cream. The
  // cream floor is what makes it AIRY instead of toy-solid.
  const bgBase = [
    hslToHex(wrap(bgHue - 4), 85 + rand() * 15, 80 + rand() * 3),
    hslToHex(wrap(bgHue + 4), 75 + rand() * 15, 89),
    "#fff4e8",
  ];
  const gradientBg = `${radials.join(", ")}, linear-gradient(168deg, ` +
    `${bgBase[0]} 0%, ${bgBase[1]} 38%, ${bgBase[2]} 78%)`;
  const baseSolid = hslToHex(bgHue, 70, 90);

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
      // Bands/washes/chips derive from --color-accent via the SAME static
      // recipes as the named themes (styles.css) — one downstream system,
      // no per-roll special cases.
      "--accent-strong": strong,
      "--accent-ink": strong,
      "--accent-fill": strong,
    },
  };

  return { hue, saturation, lightness, bgHue, bgWashes: washes, bgBase, theme };
}

export function generateTheme(rand: () => number = Math.random): Theme {
  return generateThemeParts(rand).theme;
}
