/**
 * ThemeSwitcher Island — the shuffle die.
 *
 * No fixed theme list in the UI anymore: one button rolls a fresh warm/airy
 * theme from the constrained generator (core/theme/randomTheme.ts) and
 * persists it. On mount it restores the last roll (or the bubblegum default)
 * from localStorage — the _app.tsx FOUC script has already painted it.
 */

import { useEffect } from "preact/hooks";
import { createThemeSystem } from "@core/theme/themeEngine.ts";
import { proMapperThemeConfig } from "@core/theme/themes.ts";
import { generateThemeParts } from "@core/theme/randomTheme.ts";
import { soundToggle } from "@utils/sound.ts";

// Instantiated once per hydration root so it isn't re-created on render.
const themeSystem = createThemeSystem({
  ...proMapperThemeConfig,
  randomEnabled: false,
});

/** Circular hue distance in degrees. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

// The roll must visibly change. Under the NEON OFFICE generator the ground is
// always paper, so the ACCENT is what carries a roll's identity — anti-repeat
// on that, not on the ground family (which no longer varies enough to matter).
let lastAccentHue = -999;
const MIN_ACCENT_TRAVEL = 40;

export default function ThemeSwitcher() {
  // Init on mount: apply the saved theme (named default or last shuffle).
  useEffect(() => {
    themeSystem.init();
  }, []);

  function shuffle() {
    let parts = generateThemeParts();
    for (
      let tries = 0;
      tries < 6 && hueDist(parts.hue, lastAccentHue) < MIN_ACCENT_TRAVEL;
      tries++
    ) {
      parts = generateThemeParts();
    }
    lastAccentHue = parts.hue;
    themeSystem.applyCustomTheme(parts.theme);
    soundToggle(true);
  }

  return (
    <button
      type="button"
      onClick={shuffle}
      class="header-icon-btn"
      data-tip="Shuffle the vibe"
      data-tip-align="right"
      aria-label="Shuffle the color theme"
    >
      <i class="fa fa-dice-five" aria-hidden="true"></i>
    </button>
  );
}
