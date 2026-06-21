/**
 * Guard: every theme accent must keep enough contrast with white text, since
 * accent is used as a button/pill background with white labels across the UI.
 * Catches a future "prettier but unreadable" accent regression.
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

Deno.test("every theme accent passes WCAG AA (4.5:1) with white text", () => {
  for (const theme of proMapperThemes) {
    const ratio = contrast("#ffffff", theme.accent);
    assertEquals(
      ratio >= 4.5,
      true,
      `Theme "${theme.name}" accent ${theme.accent} is ${
        ratio.toFixed(2)
      }:1 with white — below the 4.5:1 AA floor for white-on-accent labels`,
    );
  }
});
