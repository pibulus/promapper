/**
 * Shuffle-theme guards for the PASTEL scheme: every roll must land in the
 * no-red hue arc, and contrast must hold BY CONSTRUCTION — dark ink over the
 * roll's own 42% band tint, white over the solved --accent-strong, the deep
 * companion readable as ink on cream, and the background family light enough
 * that body ink stays comfortably readable everywhere.
 *
 * The 300-roll seeded sweep is the guard that caught real failures — keep it.
 */

import { assert } from "./_assert.ts";
import {
  contrast,
  CURATED_PAIRS,
  generateThemeParts,
  hslToHex,
  mixHex,
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

Deno.test("accents come from a curated pair's punk arc — never mint, yellow, or baby pink", () => {
  const rand = seededRand(28);
  for (let i = 0; i < 300; i++) {
    const { hue } = generateThemeParts(rand);
    const inArc = CURATED_PAIRS.some(({ accent: [lo, hi] }) =>
      hue >= lo && hue <= hi
    );
    assert(inArc, `accent hue ${hue} escaped every curated pair`);
    // The banned zones from the live taste session:
    assert(!(hue > 24 && hue < 168), `yellow/green/mint accent: ${hue}`);
    assert(!(hue > 346 || hue < 8), `alarm-red/baby-pink accent: ${hue}`);
  }
});

Deno.test("accents are PUNK — saturated mid-tones, never muted or pastel", () => {
  const rand = seededRand(505);
  for (let i = 0; i < 300; i++) {
    const { saturation, lightness } = generateThemeParts(rand);
    assert(
      lightness >= 54 && lightness <= 64,
      `outside the punk mid-tone band: L${lightness}`,
    );
    assert(saturation >= 68, `muted accent: S${saturation}`);
  }
});

Deno.test("ink on the roll's header band tint passes AA for every roll", () => {
  const rand = seededRand(1982);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    // The roll overrides --header-band = color-mix(accent 55%, surface-cream)
    const band = mixHex(theme.accent, SURFACE_CREAM, 0.55);
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
    // blue/violet washes (lowest luminance per lightness) stay lush.
    for (const layer of [...bgWashes, ...bgBase, baseSolid]) {
      const ratio = contrast(theme.text, layer);
      assert(
        ratio >= 5.5,
        `ink/bg ${ratio.toFixed(2)} on ${layer} (accent ${theme.accent})`,
      );
    }
  }
});

Deno.test("the background always lives in a warm family, never the accent's", () => {
  const rand = seededRand(333);
  for (let i = 0; i < 300; i++) {
    const { bgHue } = generateThemeParts(rand);
    const warm = WARM_FAMILIES.some(([lo, hi]) => bgHue >= lo && bgHue <= hi);
    assert(warm, `bg hue ${bgHue} escaped the warm families`);
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

Deno.test("hslToHex sanity", () => {
  assert(hslToHex(0, 100, 50) === "#ff0000");
  assert(hslToHex(120, 100, 25).startsWith("#00"));
});
