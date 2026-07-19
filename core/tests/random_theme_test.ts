/**
 * Shuffle-theme guards for the OKLCH curated-pair scheme (docs/
 * COLOR-SYSTEM.md): every roll must land in a designed couple's arcs, keep
 * the accent in its per-pair punk register, carry exactly ONE supporting
 * band hue at ≤ 18° from the accent, and hold contrast BY CONSTRUCTION —
 * dark ink over the roll's 62% band tint, white over the solved
 * --accent-strong, the deep companion readable as ink on cream, and the
 * background family light enough that body ink stays readable everywhere.
 *
 * The 300-roll seeded sweep is the guard that caught real failures — keep it.
 */

import { assert } from "./_assert.ts";
import {
  BAND_CREAM,
  contrast,
  CURATED_PAIRS,
  generateThemeParts,
  hexToOklch,
  mixHex,
  oklchToHex,
  SURFACE_CREAM,
  WARM_FAMILIES,
} from "../theme/randomTheme.ts";

/** Deterministic LCG so the sweep is reproducible. */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const wrap = (h: number) => ((h % 360) + 360) % 360;

/** Circular hue distance in degrees. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 360 - d);
}

Deno.test("accents come from a curated pair's arc — never green/teal/yellow, never alarm-red", () => {
  const rand = seededRand(28);
  for (let i = 0; i < 300; i++) {
    const { hue, lightness } = generateThemeParts(rand);
    const inArc = CURATED_PAIRS.some(({ accent: [lo, hi] }) =>
      hue >= lo && hue <= hi
    );
    assert(inArc, `accent hue ${hue} escaped every curated pair`);
    const h = wrap(hue);
    // Banned accent territory (OKLCH degrees): the whole yellow → green →
    // teal → sky stretch. Cobalt starts at 246.
    assert(!(h > 60 && h < 244), `yellow/green/teal accent: ${h}`);
    // Alarm-red guard: OKLCH hues 8–27 are the true no-man's land. The
    // raspberry arc wraps past 360 into 0–8 (beloved #E85D8F is H 0.7) and
    // the coral arc starts at 27 AND rides L ≥ 0.65 — alarm red is a
    // low-lightness phenomenon.
    assert(!(h > 8 && h < 27), `alarm-red accent: ${h}`);
    if (h >= 27 && h < 60) {
      assert(lightness >= 0.65, `coral too dark (alarm risk): L${lightness}`);
    }
  }
});

Deno.test("accents stay in their pair's punk register — saturated mid-tones, never muted or pastel", () => {
  const rand = seededRand(505);
  for (let i = 0; i < 300; i++) {
    const { chroma, lightness } = generateThemeParts(rand);
    assert(
      lightness >= 0.56 && lightness <= 0.72,
      `outside the punk mid-tone band: L${lightness}`,
    );
    assert(chroma >= 0.12, `muted accent: C${chroma}`);
  }
});

Deno.test("headers are MONO — rolls emit no supporting band hues", () => {
  const rand = seededRand(719);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    assert(
      theme.cssVars?.["--band-hue-b"] === undefined,
      "--band-hue-b has returned — headers are mono (July 20 ruling)",
    );
    assert(
      theme.cssVars?.["--band-hue-c"] === undefined,
      "--band-hue-c has returned — the carnival stays dead",
    );
  }
});

Deno.test("the CTA plate carries white ink on every roll", () => {
  // styles.css: --cta-plate = color-mix(accent-fill 42%, soft-black). On a
  // roll, accent-fill is the solved deep companion — the plate is darker
  // still, but pin it so the recipe can never drift readable-to-not.
  const SOFT_BLACK = "#1e1714";
  const rand = seededRand(4242);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const fill = theme.cssVars?.["--accent-fill"] as string;
    const plate = mixHex(fill, SOFT_BLACK, 0.42);
    const ratio = contrast("#ffffff", plate);
    assert(ratio >= 4.5, `white/plate ${ratio.toFixed(2)} for ${plate}`);
  }
});

Deno.test("ink on the roll's header band tint passes AA for every roll", () => {
  const rand = seededRand(1982);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    // The roll's --header-band = color-mix(accent 62%, BAND_CREAM)
    const band = mixHex(theme.accent, BAND_CREAM, 0.62);
    const ratio = contrast(theme.text, band);
    assert(ratio >= 4.5, `ink/band ${ratio.toFixed(2)} for ${theme.accent}`);
  }
});

Deno.test("white on the solved --accent-strong passes AA for every roll", () => {
  const rand = seededRand(777);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const strong = theme.cssVars?.["--accent-strong"] as string;
    assert(!!strong && strong.startsWith("#"), "roll missing --accent-strong");
    const ratio = contrast("#ffffff", strong);
    assert(ratio >= 4.5, `white/strong ${ratio.toFixed(2)} for ${strong}`);
    // Ink and fill route through the same solved companion.
    assert(theme.cssVars?.["--accent-ink"] === strong, "ink != strong");
    assert(theme.cssVars?.["--accent-fill"] === strong, "fill != strong");
  }
});

Deno.test("the deep companion reads as ink on cream for every roll", () => {
  const rand = seededRand(41);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const strong = theme.cssVars?.["--accent-strong"] as string;
    const ratio = contrast(strong, SURFACE_CREAM);
    assert(ratio >= 4.5, `strong/cream ${ratio.toFixed(2)} for ${strong}`);
  }
});

Deno.test("background family stays light — body ink readable everywhere", () => {
  const rand = seededRand(90210);
  for (let i = 0; i < 300; i++) {
    const { theme, bgWashes, bgBase } = generateThemeParts(rand);
    const baseSolid = theme.cssVars?.["--color-base-solid"] as string;
    // 5.5 floor: only footer/empty-state text sits directly on the bg, and
    // AA is 4.5 — this keeps a wide margin while letting the saturated
    // dusk/violet washes (lowest luminance per lightness) stay lush.
    for (const layer of [...bgWashes, ...bgBase, baseSolid]) {
      const ratio = contrast(theme.text, layer);
      assert(
        ratio >= 5.5,
        `ink/bg ${ratio.toFixed(2)} on ${layer} (accent ${theme.accent})`,
      );
    }
  }
});

Deno.test("the background always lives in a curated ground family, never the accent's", () => {
  const rand = seededRand(333);
  for (let i = 0; i < 300; i++) {
    const { bgHue } = generateThemeParts(rand);
    const inFamily = WARM_FAMILIES.some(([lo, hi]) =>
      bgHue >= lo && bgHue <= hi
    );
    assert(inFamily, `bg hue ${bgHue} escaped the ground families`);
  }
});

Deno.test("every roll re-tints the app background gradient", () => {
  const a = generateThemeParts(seededRand(1));
  const b = generateThemeParts(seededRand(2));
  const ga = a.theme.cssVars?.["--gradient-bg"] as string;
  const gb = b.theme.cssVars?.["--gradient-bg"] as string;
  assert(!!ga && ga.includes("radial-gradient"), "roll missing bg mesh");
  assert(ga !== gb, "two different rolls produced the same background");
});

Deno.test("oklch round-trip sanity", () => {
  // Known anchor: DAYBREAK cobalt #4a7bc9 ≈ oklch(0.586 0.132 259.3)
  const [L, C, H] = hexToOklch("#4a7bc9");
  assert(Math.abs(L - 0.586) < 0.01, `L ${L}`);
  assert(Math.abs(C - 0.132) < 0.01, `C ${C}`);
  assert(Math.abs(H - 259.3) < 1, `H ${H}`);
  // Round trip lands on the same hex.
  assert(oklchToHex(L, C, H) === "#4a7bc9", oklchToHex(L, C, H));
  // Gamut clamp: an impossible chroma request degrades to a valid color at
  // the same hue/lightness instead of skewing.
  const clamped = oklchToHex(0.9, 0.4, 260);
  const [cl, , ch] = hexToOklch(clamped);
  assert(Math.abs(cl - 0.9) < 0.02, `clamped L drifted: ${cl}`);
  assert(Math.abs(ch - 260) < 3, `clamped hue drifted: ${ch}`);
});
