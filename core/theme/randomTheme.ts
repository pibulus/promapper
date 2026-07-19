/**
 * Theme shuffle — no fixed themes, just a generator that rolls airy, pastel,
 * whimsical, CONSISTENT looks on demand. A roll is a SPACE, not an office
 * product: lush light washes, one candy accent, deep ink where words live.
 *
 * July 20 rebuild — OKLCH curated pairs (docs/COLOR-SYSTEM.md is the law):
 *   - every color is authored in OKLCH and stored as hex. Equal L = equal
 *     perceived weight across hues; chroma is clamped to each hue's sRGB
 *     ceiling instead of pretending one saturation number fits all.
 *   - the dice picks between DESIGNED couples (ground family × accent arc),
 *     each carrying its own accent L/C target derived from the beloved
 *     anchors (Miami coral, rebel purple, raspberry, DAYBREAK cobalt).
 *     Free random pairing kept rolling combos nobody would choose.
 *   - headers are MONO (July 20 ruling): every band is the accent band.
 *     The colour relationships live between LAYERS (ground family ↔ band ↔
 *     CTA plate — the trio law), never between header hues.
 *   - accents are CORAL / RASPBERRY / COBALT / ORCHID only (green-family
 *     accents incl. teal are dead: "hospital pink and green"). Aqua/lagoon
 *     survives as a GROUND, always under a warm accent. Blues live at hue
 *     246–262, never 264–275 (the OKLCH blue trap).
 *   - --accent-ink / --accent-strong = a DEEP COMPANION of the same hue,
 *     lightness walked down until white-on-it AND it-on-cream both clear
 *     AA by construction. Every text-bearing accent element routes through
 *     these tokens; band/wash recipes stay the SAME static color-mix
 *     recipes the named themes use.
 */

import type { Theme } from "@core/theme/types.ts";
import { hexToOklch, maxChroma, oklchToHex } from "@core/theme/oklch.ts";

/** CURATED PAIRS v2 — OKLCH hue arcs (arcs may pass 360: mod applied at
 * generation). Per-pair accent registers keep every family in its own
 * proven register instead of one global range that made coral scream and
 * cobalt sulk. */
export const CURATED_PAIRS: ReadonlyArray<{
  readonly name: string;
  /** Ground-family OKLCH hue arc (sky washes live here). */
  readonly ground: readonly [number, number];
  /** Accent OKLCH hue arc. */
  readonly accent: readonly [number, number];
  /** Accent lightness register. */
  readonly accentL: readonly [number, number];
  /** Accent chroma register (pre-gamut-clamp). */
  readonly accentC: readonly [number, number];
  /** Ground wash lightness target (aqua families ride lighter — that airy
   * pool feel is a lightness fact, preserved per pair). */
  readonly groundL: number;
  /** Ground wash chroma target. */
  readonly groundC: number;
}> = [
  // sunrise coral/peach × denim cobalt (the DAYBREAK register)
  {
    name: "sunset-cobalt",
    ground: [38, 60],
    accent: [246, 262],
    accentL: [0.58, 0.63],
    accentC: [0.13, 0.17],
    groundL: 0.85,
    groundC: 0.085,
  },
  // coral glow × orchid punch (rebel-purple #9B59B6 territory)
  {
    name: "coral-orchid",
    ground: [30, 52],
    accent: [306, 322],
    accentL: [0.57, 0.63],
    accentC: [0.17, 0.22],
    groundL: 0.85,
    groundC: 0.085,
  },
  // orchid dusk × juicy coral (#FF6B6B — the zombie-sheriff look)
  {
    name: "dusk-coral",
    ground: [318, 336],
    accent: [27, 40],
    accentL: [0.66, 0.71],
    accentC: [0.16, 0.19],
    groundL: 0.84,
    groundC: 0.1,
  },
  // lagoon × coral pop (Miami inverted)
  {
    name: "lagoon-coral",
    ground: [188, 210],
    accent: [27, 40],
    accentL: [0.66, 0.71],
    accentC: [0.16, 0.19],
    groundL: 0.9,
    groundC: 0.075,
  },
  // aqua pool × raspberry (#E85D8F — the historic beloved accent)
  {
    name: "poolside",
    ground: [183, 205],
    accent: [350, 366],
    accentL: [0.63, 0.68],
    accentC: [0.17, 0.2],
    groundL: 0.9,
    groundC: 0.075,
  },
  // sunrise × raspberry (the peachyCream × rose historic default)
  {
    name: "dawn-rose",
    ground: [42, 64],
    accent: [350, 366],
    accentL: [0.63, 0.68],
    accentC: [0.17, 0.2],
    groundL: 0.85,
    groundC: 0.085,
  },
  // THE DARING PAIRS (July 20, "dare to be fresh and bold sometimes"):
  // same trio law, chroma pushed to the fluoro ceiling. Roughly a quarter
  // of rolls land here — sometimes, not always.
  // vaporwave: lavender dusk sky × riso fluoro pink (#FF48B0 register,
  // oklch 0.69 0.24 350 — high L AND near-ceiling C is the fluoro recipe)
  {
    name: "vaporwave",
    ground: [292, 314],
    accent: [346, 360],
    accentL: [0.66, 0.7],
    accentC: [0.21, 0.24],
    groundL: 0.85,
    groundC: 0.105,
  },
  // neon office: cool pool-paper ground × electric violet (the GRAPE
  // #8335ff register) — fluorescent tube light over calm water
  {
    name: "neon-office",
    ground: [196, 218],
    accent: [288, 300],
    accentL: [0.56, 0.61],
    accentC: [0.24, 0.27],
    groundL: 0.9,
    groundC: 0.08,
  },
  // watermelon: mint-dew rind × pink flesh ("young succulent in the
  // morning dew" — the July 20 inspo drop). Mint lives as GROUND only,
  // so the pink/green combo stays fresh-fruit, never hospital.
  {
    name: "watermelon",
    ground: [162, 180],
    accent: [352, 368],
    accentL: [0.64, 0.69],
    accentC: [0.19, 0.22],
    groundL: 0.9,
    groundC: 0.08,
  },
  // sunset neon: amber glow × hot magenta (the hexbloop hexagon — the
  // blue→magenta→orange spectrum folded into one couple)
  {
    name: "sunset-neon",
    ground: [55, 75],
    accent: [330, 344],
    accentL: [0.62, 0.66],
    accentC: [0.22, 0.25],
    groundL: 0.85,
    groundC: 0.105,
  },
  // gum-blueberry: periwinkle-indigo sky × gum pink (#5a4edb ground
  // family under #ea88b9 punched up — the soft-bold pairing)
  {
    name: "gum-blueberry",
    ground: [268, 288],
    accent: [350, 366],
    accentL: [0.66, 0.71],
    accentC: [0.16, 0.19],
    groundL: 0.87,
    groundC: 0.085,
  },
];

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
export const SURFACE_CREAM = "#fbf1e4";

/** The warmer cream the header band mixes against (styles.css
 * --header-band) — sunshine in the bands without raising the accent %.
 * Tests mirror this value. */
export const BAND_CREAM = "#ffefdc";

/** The deep companion: same hue as the accent, chroma capped so the deep
 * tone reads rich instead of neon, lightness walked down until it clears
 * AA against cream (and therefore white-on-it) with margin. OKLCH descent
 * holds the hue honest — the old HSL walk drifted it. */
export function deriveStrong(hue: number, chroma: number): string {
  const c = Math.min(chroma, 0.15);
  for (let L = 0.55; L >= 0.2; L -= 0.01) {
    const hex = oklchToHex(L, c, hue);
    if (contrast(hex, SURFACE_CREAM) >= 4.6) return hex;
  }
  return oklchToHex(0.2, c, hue);
}

const wrap = (h: number) => ((h % 360) + 360) % 360;

/** Ground families, derived from the curated pairs (kept as an export for
 * the test sweeps and the ThemeSwitcher anti-repeat). */
export const WARM_FAMILIES: ReadonlyArray<readonly [number, number]> =
  CURATED_PAIRS.map((p) => p.ground);

export interface ShuffleParts {
  /** Accent OKLCH hue (may exceed 360 when the pair arc wraps; wrapped for
   * output, raw here so tests can check arc membership directly). */
  hue: number;
  /** Accent OKLCH chroma (pre-clamp target). */
  chroma: number;
  /** Accent OKLCH lightness. */
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

/** Everything composeTheme needs to build a full roll. The dice fills this
 * from a curated pair; the /dev/colors lab fills it from sliders — SAME
 * derivation, so what you tune in the lab is exactly what the dice deals. */
export interface ComposeInput {
  /** Accent OKLCH (hue may exceed 360 for wrap arcs). */
  hue: number;
  lightness: number;
  chroma: number;
  /** Ground-family OKLCH hue + wash registers. */
  bgHue: number;
  groundL: number;
  groundC: number;
  /** Jitter source for wash positions/vibe. Defaults to centered. */
  rand?: () => number;
}

/**
 * Roll a complete theme. `rand` is injectable for deterministic tests.
 */
export function generateThemeParts(
  rand: () => number = Math.random,
): ShuffleParts {
  const pair = CURATED_PAIRS[
    Math.floor(rand() * CURATED_PAIRS.length) % CURATED_PAIRS.length
  ];
  const span = (a: readonly [number, number]) => a[0] + rand() * (a[1] - a[0]);
  return composeTheme({
    hue: span(pair.accent),
    lightness: span(pair.accentL),
    chroma: span(pair.accentC),
    bgHue: span(pair.ground),
    groundL: pair.groundL,
    groundC: pair.groundC,
    rand,
  });
}

/** Build the full ShuffleParts from explicit OKLCH values — the one
 * derivation behind both the dice and the /dev/colors lab. */
export function composeTheme(input: ComposeInput): ShuffleParts {
  const { hue, lightness, chroma, bgHue, groundL, groundC } = input;
  const rand = input.rand ?? (() => 0.5);

  const accent = oklchToHex(lightness, chroma, hue);
  const strong = deriveStrong(hue, chroma);
  // Ink is a COLOR: hue-tinted near-black, never grey (same recipe family
  // as the hand-made themes).
  const text = oklchToHex(0.3, 0.035, hue);
  const textSecondary = oklchToHex(0.52, 0.03, hue);

  // AIRY SKY: the ground is a colored sky at the TOP that FADES INTO CREAM
  // where the components live — a full-saturation full-bleed field read as
  // "a toy". Two family washes hug the top corners; the accent leaves one
  // low-chroma whisper near the bottom. Chroma rides each hue's own gamut
  // ceiling (oklchToHex clamps), so aqua and dusk skies carry the same
  // perceived weight as sunrise ones.
  const j = () => rand() * 10 - 5;
  const gL = groundL;
  const gC = groundC;
  // Two-hue family JOURNEY (July 20, from the conversation_mapper study):
  // the second wash sits a real analogous step away (+22°), so the sky
  // travels inside its family instead of one hue fading out — present,
  // never a carnival (washes live below the C 0.05–0.10 clash floor).
  const washes = [
    oklchToHex(gL - 0.01, gC + 0.015, wrap(bgHue - 8)),
    oklchToHex(gL + 0.01, gC, wrap(bgHue + 22)),
    oklchToHex(gL + 0.05, Math.min(gC, 0.06), wrap(hue)),
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
  // Linear journey: colored family sky → soft tint → warm cream. The
  // cream floor is what makes it AIRY instead of toy-solid.
  const bgBase = [
    oklchToHex(gL + 0.02, gC, wrap(bgHue - 4)),
    oklchToHex(0.93, gC * 0.55, wrap(bgHue + 4)),
    "#fff4e8",
  ];
  const gradientBg = `${radials.join(", ")}, linear-gradient(168deg, ` +
    `${bgBase[0]} 0%, ${bgBase[1]} 38%, ${bgBase[2]} 78%)`;
  const baseSolid = oklchToHex(0.91, gC * 0.6, wrap(bgHue));

  const theme: Theme = {
    name: "SHUFFLE",
    vibe: VIBES[Math.floor(rand() * VIBES.length) % VIBES.length],
    base: `linear-gradient(135deg, ${bgBase[0]} 0%, ${bgBase[1]} 100%)`,
    secondary: "rgba(255, 250, 243, 0.62)",
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

  return { hue, chroma, lightness, bgHue, bgWashes: washes, bgBase, theme };
}

export function generateTheme(rand: () => number = Math.random): Theme {
  return generateThemeParts(rand).theme;
}

export { hexToOklch, maxChroma, oklchToHex };
