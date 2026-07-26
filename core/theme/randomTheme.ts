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
 * cobalt sulk.
 *
 * ⚠️ JULY 26, 2026 — these are now LAB PRESETS ONLY. The dice no longer deals
 * from this list; `generateThemeParts` rolls the NEON OFFICE generator below.
 * The pairs survive because /dev/colors uses them as starting points to tune
 * from, and because they document the couples that were hand-approved. */
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

// ===================================================================
// NEON OFFICE — the generator (July 26, 2026)
// ===================================================================
/**
 * Replaces the curated-pair dice. Three sources, one recipe:
 *
 *  · GROUND is always PAPER. Chroma 0.016–0.036, from the Flexoki base ramp
 *    (~/Documents/reference/BRAND-flexoki-palette.md — measured at C 0.015,
 *    h95). The room is paper; it never competes with the accent. This is the
 *    "neutral office".
 *  · ACCENTS come from HARMONY MATH off a base hue anywhere on the wheel —
 *    the old conversation_mapper ThemeRandomizerService's scheme, which is
 *    where its genuinely surprising module colours came from. Eleven
 *    hand-picked couples could only ever deal eleven moods.
 *  · NEON comes from riding each hue's OWN sRGB chroma ceiling at its OWN
 *    peak-vividness lightness, instead of one fixed L/C register for every
 *    hue. That register is precisely why the old deck read flat: it made lime
 *    into khaki and left cobalt sulking.
 *
 * Opinionated, not chaotic: the harmony rules and the paper floor are the
 * opinion. Reopened deliberately by Pablo on July 26 — green-family accents
 * (the "hospital pink and green" veto was green on PINK grounds; on paper it
 * is a different proposition, and LIME #00af82 was always a named theme), and
 * a second/third hue for nodes and modules. Header bands stay MONO.
 */

/** Weighted toward harmonies yielding DISTINCT-but-related hues. Monochrome
 * and analogous are kept but rare — they are what the old deck already did. */
export const HARMONIES: ReadonlyArray<readonly [string, number]> = [
  ["split-complementary", 4],
  ["golden", 4],
  ["triadic", 3],
  ["double-split", 3],
  ["complementary", 2],
  ["tetradic", 2],
  ["wildcard", 2],
  ["analogous", 1],
];

const GOLDEN_ANGLE = 360 * 0.618033988749895;

export function pickHarmony(rand: () => number): string {
  const total = HARMONIES.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [name, w] of HARMONIES) {
    if (r < w) return name;
    r -= w;
  }
  return "golden";
}

/** Base hue plus its companions, per harmony. Always returns >= 3 hues. */
export function harmonyHues(
  base: number,
  harmony: string,
  rand: () => number,
): number[] {
  const j = (a: number, b: number) => a + rand() * (b - a);
  switch (harmony) {
    case "analogous":
      return [base, base + 30, base + 60];
    case "complementary":
      return [base, base + 180, base + j(150, 210)];
    case "triadic":
      return [base, base + 120, base + 240];
    case "tetradic": {
      const o = j(80, 100);
      return [base, base + o, base + 180, base + 180 + o];
    }
    case "split-complementary":
      return [base, base + 150, base + 210];
    case "double-split": {
      const s = j(20, 40);
      return [base, base + 180 - s, base + 180 + s];
    }
    case "golden":
      return [0, 1, 2, 3].map((i) => base + GOLDEN_ANGLE * i);
    case "wildcard": {
      // Every hue >= 90 degrees from the others — the old service's
      // getDistantHue, the source of its genuinely surprising rolls.
      const out = [base];
      for (let n = 0; n < 2; n++) {
        let placed = false;
        for (let t = 0; t < 16 && !placed; t++) {
          const h = rand() * 360;
          if (
            out.every((o) => {
              const d = Math.abs(wrap(h) - wrap(o));
              return Math.min(d, 360 - d) >= 90;
            })
          ) {
            out.push(h);
            placed = true;
          }
        }
        // Deterministic fallback so the harmony always yields 3 hues even
        // when the rejection sampler runs out of tries.
        if (!placed) out.push(base + 120 * (n + 1));
      }
      return out;
    }
    default:
      return [base, base + 30, base + 60];
  }
}

/**
 * The lightness at which THIS hue is most vivid. In OKLCH the sRGB chroma
 * ceiling peaks at a different L for every hue: yellow-green tops out bright
 * (~0.85), blue tops out deep (~0.47). One shared L register keeps hues at
 * equal perceived WEIGHT but costs them their vividness — which is the exact
 * trade that turned lime into khaki. Neon wants the peak.
 *
 * Clamped to [0.56, 0.82]: below 0.56 an accent reads "too dark" as a candy
 * plate and above 0.82 it cannot hold a band (both vetoed live, July 2026).
 */
export function peakLightness(hue: number): number {
  let bestL = 0.62;
  let bestC = 0;
  for (let L = 0.45; L <= 0.9; L += 0.01) {
    const c = maxChroma(L, wrap(hue));
    if (c > bestC) {
      bestC = c;
      bestL = L;
    }
  }
  return Math.min(0.82, Math.max(0.56, bestL));
}

/** An accent riding its hue's own sRGB chroma ceiling. */
export function neonAt(L: number, hue: number, ride = 0.94): string {
  return oklchToHex(L, maxChroma(L, wrap(hue)) * ride, wrap(hue));
}

/** Warm near-white — the only light ink allowed (never #ffffff). */
export const WARM_WHITE = "#fffef7";
/** Warm near-black — the only dark ink allowed (never #000000). */
export const SOFT_BLACK = "#1e1714";

/**
 * THE BAND IS THE ACCENT.
 *
 * It used to be a 62% tint over cream, then briefly a mix solved to one fixed
 * lightness. Both were the same mistake wearing different hats: pinning every
 * band to a single weight means DILUTING deep hues to reach it, and the header
 * band is the largest block of colour on a card. Measured on the fixed-weight
 * version, a vivid indigo accent lost 59% of its chroma on the way to its own
 * header (#505ef7 C0.226 → #a9a8e9 C0.093). Neon accent, pastel card.
 *
 * So the band keeps the accent's hue at its chroma ceiling and the INK adapts:
 * bright hues (lime, cyan, coral, amber) carry warm-black; deep ones (indigo,
 * violet, blue) go a step deeper and carry warm-white. Both outcomes are
 * saturated — the choice is only ever which ink survives on them, and that is
 * solved rather than assumed, so AA holds by construction on every hue.
 */
export function solveBandAndInk(
  hue: number,
  lightness: number,
): { band: string; ink: string } {
  const at = (L: number) =>
    oklchToHex(L, maxChroma(L, wrap(hue)) * 0.94, wrap(hue));

  // Prefer the accent exactly as it is, with whichever ink clears AA.
  const own = at(lightness);
  if (contrast(own, SOFT_BLACK) >= 4.5) return { band: own, ink: SOFT_BLACK };
  if (contrast(own, WARM_WHITE) >= 4.5) return { band: own, ink: WARM_WHITE };

  // Mid-lightness hues clear neither. Walk DEEPER (never paler — paler is how
  // we got here) until warm-white lands. Deeper also reads bolder, which is
  // the direction this whole system is trying to go.
  for (let L = lightness; L >= 0.3; L -= 0.01) {
    const band = at(L);
    if (contrast(band, WARM_WHITE) >= 4.5) return { band, ink: WARM_WHITE };
  }
  return { band: at(0.3), ink: WARM_WHITE };
}

/**
 * The CTA plate stays a CANDY plate: bright fill, warm-black ink — the taste
 * ruling that survived three rounds (dark fill + white ink was vetoed twice).
 * So unlike the band it can only move one way: light enough that dark ink
 * lands, and no lighter.
 */
export function solvePlate(hue: number, lightness: number): string {
  const at = (L: number) =>
    oklchToHex(L, maxChroma(L, wrap(hue)) * 0.94, wrap(hue));
  for (let L = Math.max(lightness, 0.6); L <= 0.92; L += 0.01) {
    const plate = at(L);
    if (contrast(plate, SOFT_BLACK) >= 4.5) return plate;
  }
  return mixHex(at(0.92), BAND_CREAM, 0.8);
}

/** Ground families, derived from the curated pairs (kept as an export for
 * the test sweeps and the ThemeSwitcher anti-repeat). */
export const WARM_FAMILIES: ReadonlyArray<readonly [number, number]> =
  CURATED_PAIRS.map((p) => p.ground);

export interface ShuffleParts {
  /** Accent OKLCH hue (may exceed 360 when a harmony wraps; wrapped for
   * output, raw here so tests can check membership directly). */
  hue: number;
  /** Accent OKLCH chroma (post-gamut-clamp actual). */
  chroma: number;
  /** Accent OKLCH lightness. */
  lightness: number;
  /** Hue the paper ground landed on. */
  bgHue: number;
  /** The three wash hexes composited into --gradient-bg (light → the eye;
   * exported so tests can guard bg lightness). */
  bgWashes: string[];
  /** Linear base stops under the washes. */
  bgBase: string[];
  /** Which harmony dealt this roll (for debugging and the lab). */
  harmony: string;
  /** The companion hues — worn by nodes, speakers and module chrome, never
   * by a second header band (headers stay MONO). */
  secondary: string;
  tertiary: string;
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
  /** Ground OKLCH hue + wash registers. */
  bgHue: number;
  groundL: number;
  groundC: number;
  /** Companion hues for nodes/modules. Default to the accent's own hue, so
   * the /dev/colors lab (which tunes one accent) still composes cleanly. */
  secondaryHue?: number;
  tertiaryHue?: number;
  /** Which harmony produced this, for the lab readout. */
  harmony?: string;
  /** Jitter source for wash positions/vibe. Defaults to centered. */
  rand?: () => number;
}

/**
 * Roll a complete theme — NEON OFFICE. `rand` is injectable for tests.
 *
 * Base hue lands anywhere on the wheel, a weighted harmony deals its
 * companions, the ground goes to paper, and every accent sits at its own
 * peak-vividness lightness riding its own chroma ceiling.
 */
export function generateThemeParts(
  rand: () => number = Math.random,
): ShuffleParts {
  const base = rand() * 360;
  const harmony = pickHarmony(rand);
  const H = harmonyHues(base, harmony, rand);

  // The accent is the FIRST companion, not the base — the base hue belongs to
  // the paper, and paper wants the quiet end of the roll.
  const accentHue = wrap(H[1 % H.length]);
  // One shared nudge keeps the three companions at a consistent relative
  // weight instead of drifting apart roll to roll.
  const nudge = (rand() - 0.5) * 0.04;
  const lightness = Math.min(
    0.82,
    Math.max(0.56, peakLightness(accentHue) + nudge),
  );
  const accentHex = neonAt(lightness, accentHue);
  const [, chroma] = hexToOklch(accentHex);

  return composeTheme({
    hue: accentHue,
    lightness,
    chroma,
    bgHue: wrap(H[0]),
    // PAPER. Flexoki's base ramp register.
    groundL: 0.925 + rand() * 0.025,
    groundC: 0.016 + rand() * 0.02,
    secondaryHue: wrap(H[2 % H.length]),
    tertiaryHue: wrap(H[3 % H.length]),
    harmony,
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
  // as the hand-made themes). It tints toward the GROUND now, not the accent
  // — on a paper room the body copy belongs to the paper.
  const text = oklchToHex(0.3, 0.03, bgHue);
  const textSecondary = oklchToHex(0.52, 0.025, bgHue);

  // The companions — nodes, speakers and module chrome wear these. Headers
  // stay MONO (the July 20 ruling survives): these never become a band.
  const secondaryHue = wrap(input.secondaryHue ?? hue);
  const tertiaryHue = wrap(input.tertiaryHue ?? hue);
  const secondary = neonAt(peakLightness(secondaryHue), secondaryHue);
  const tertiary = neonAt(peakLightness(tertiaryHue), tertiaryHue);

  // The band IS the accent; the ink adapts to it. The plate stays candy.
  const { band, ink: bandInk } = solveBandAndInk(hue, lightness);
  const plate = solvePlate(hue, lightness);

  // PAPER SKY: the ground is a barely-tinted paper that still travels — two
  // whisper washes hug the top corners in the ground family, and the accent
  // leaves ONE low-chroma breath near the floor. That breath is the only
  // place the neon touches the room; everything else is paper, which is what
  // lets the accent be as loud as it is.
  const j = () => rand() * 10 - 5;
  const gL = groundL;
  const gC = groundC;
  // Two-hue family JOURNEY (July 20, from the conversation_mapper study):
  // the second wash sits a real analogous step away (+22°), so the sky
  // travels inside its family instead of one hue fading out.
  const washes = [
    oklchToHex(gL - 0.012, gC + 0.012, wrap(bgHue - 8)),
    oklchToHex(gL + 0.008, gC, wrap(bgHue + 22)),
    // Fixed chroma, NOT min(gC, …): on a paper ground gC is so low that
    // deriving the accent breath from it erased the breath entirely.
    oklchToHex(Math.min(gL + 0.03, 0.97), 0.045, wrap(hue)),
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
    oklchToHex(gL + 0.015, gC, wrap(bgHue - 4)),
    oklchToHex(0.955, gC * 0.5, wrap(bgHue + 4)),
    "#fff4e8",
  ];
  const gradientBg = `${radials.join(", ")}, linear-gradient(168deg, ` +
    `${bgBase[0]} 0%, ${bgBase[1]} 40%, ${bgBase[2]} 80%)`;
  const baseSolid = oklchToHex(0.94, gC * 0.6, wrap(bgHue));

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
      // SOLVED per roll, not left to the static 62/70% recipes: those are
      // tuned for mid-lightness accents and wash out a peak-vividness one.
      "--header-band": band,
      // Solved WITH the band, not derived from the theme ink — on a fully
      // saturated band the old "text 65% into soft-black" recipe was a coin
      // flip. Deep bands get warm-white, bright ones warm-black.
      "--header-band-ink": bandInk,
      "--header-band-sub": bandInk === WARM_WHITE
        ? "rgba(255,254,247,0.72)"
        : "rgba(30,23,20,0.66)",
      "--cta-plate": plate,
      // The harmony's companions. Nodes, speakers and module chrome only —
      // never a second header band (headers stay MONO).
      "--accent-2": secondary,
      "--accent-3": tertiary,
    },
  };

  return {
    hue,
    chroma,
    lightness,
    bgHue,
    bgWashes: washes,
    bgBase,
    harmony: input.harmony ?? "lab",
    secondary,
    tertiary,
    theme,
  };
}

export function generateTheme(rand: () => number = Math.random): Theme {
  return generateThemeParts(rand).theme;
}

export { hexToOklch, maxChroma, oklchToHex };
