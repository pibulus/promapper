/**
 * Shuffle-theme guards: every roll must land in the vivid-pop hue arcs (the
 * red/brown band is forbidden), and contrast must hold BY CONSTRUCTION —
 * dark ink over the 12% band tint, and white over --accent-strong.
 */

import { assert } from "./_assert.ts";
import {
  generateThemeParts,
  hslToHex,
  HUE_ARCS,
} from "../theme/randomTheme.ts";

/** Deterministic LCG so the sweep is reproducible. */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** sRGB approximation of `color-mix(in srgb, A p%, B)`. */
function mixHex(a: string, b: string, pOfA: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const m = ra.map((v, i) => Math.round(v * pOfA + rb[i] * (1 - pOfA)));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

Deno.test("rolls stay inside the vivid-pop hue arcs (no red, no mud)", () => {
  const rand = seededRand(28);
  for (let i = 0; i < 300; i++) {
    const { hue } = generateThemeParts(rand);
    const inArc = HUE_ARCS.some(([lo, hi]) => hue >= lo && hue <= hi);
    assert(inArc, `hue ${hue} escaped the arcs`);
    assert(hue >= 210 && hue <= 345, `hue outside safe arc: ${hue}`);
  }
});

Deno.test("ink on the header band tint passes AA for every roll", () => {
  const rand = seededRand(1982);
  const cream = "#fffef7"; // ~--surface-cream
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    // --header-band = color-mix(accent 12%, surface-cream)
    const band = mixHex(theme.accent, cream, 0.12);
    const ratio = contrast(theme.text, band);
    assert(ratio >= 4.5, `ink/band ${ratio.toFixed(2)} for ${theme.accent}`);
  }
});

Deno.test("white on --accent-strong passes AA for every roll", () => {
  const rand = seededRand(777);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    // --accent-strong = color-mix(accent 72%, #1b1020)
    const strong = mixHex(theme.accent, "#1b1020", 0.72);
    const ratio = contrast("#ffffff", strong);
    assert(
      ratio >= 4.5,
      `white/strong ${ratio.toFixed(2)} for ${theme.accent}`,
    );
  }
});

Deno.test("hslToHex sanity", () => {
  assert(hslToHex(0, 100, 50) === "#ff0000");
  assert(hslToHex(120, 100, 25).startsWith("#00"));
});
