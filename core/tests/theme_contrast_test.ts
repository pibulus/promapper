/**
 * Guard: the candy header band is a PALE TINT of the accent over the card
 * surface, with DARK ink (the theme's text color) — so the band+ink must pass
 * WCAG AA. (We deliberately do NOT put white/dark text directly on the vivid
 * accent anymore; bright fluoro accents are used as pops/tints, never as a text
 * background. That's why the old "accent vs white" rule is gone — it forced
 * muddy accents.) Catches a future "prettier but unreadable header" regression.
 */

import { assertEquals } from "./_assert.ts";
import { proMapperThemes } from "../theme/themes.ts";

function relLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix two hex colors by weight (mirrors CSS color-mix in srgb). */
function mix(a: string, b: string, aWeight: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const out = [0, 2, 4].map((i) => {
    const v = Math.round(ch(pa, i) * aWeight + ch(pb, i) * (1 - aWeight));
    return v.toString(16).padStart(2, "0");
  });
  return "#" + out.join("");
}

// The default card surface (--surface-card → --soft-cream). Cool themes nudge it
// but stay near this lightness, so it's a faithful contrast baseline.
const CARD_SURFACE = "#fff7ef";
const DEEPEN = "#1b1020"; // CSS: --accent-strong = color-mix(accent 72%, #1b1020)

Deno.test("every theme's VIVID header band passes AA with white text", () => {
  for (const theme of proMapperThemes) {
    // CSS: band is built on --accent-strong (accent 72% + deepen), white ink.
    // GOLD overrides --accent-strong to a deeper shade (its hue is light).
    const strong = theme.cssVars?.["--accent-strong"] ??
      mix(theme.accent, DEEPEN, 0.72);
    const ratio = contrast("#ffffff", strong);
    assertEquals(
      ratio >= 4.5,
      true,
      `Theme "${theme.name}" header band ${strong} vs white is ${
        ratio.toFixed(2)
      }:1 — below the 4.5:1 AA floor (deepen --accent-strong for this theme)`,
    );
  }
});

Deno.test("every theme's ink passes AA on the 62% header band", () => {
  // CSS: --header-band = color-mix(accent 62%, --surface-cream), dark ink.
  // One recipe for named themes AND shuffle rolls (rolls have their own
  // 300-roll sweep in random_theme_test.ts).
  for (const theme of proMapperThemes) {
    const band = mix(theme.accent, CARD_SURFACE, 0.62);
    const ratio = contrast(theme.text, band);
    assertEquals(
      ratio >= 4.5,
      true,
      `Theme "${theme.name}" ink on band ${band} is ${
        ratio.toFixed(2)
      }:1 — below the 4.5:1 AA floor`,
    );
  }
});

Deno.test("every theme body text passes AA on the card surface", () => {
  for (const theme of proMapperThemes) {
    const ratio = contrast(theme.text, CARD_SURFACE);
    assertEquals(
      ratio >= 4.5,
      true,
      `Theme "${theme.name}" text ${theme.text} is ${
        ratio.toFixed(2)
      }:1 on the card surface — below AA`,
    );
  }
});
