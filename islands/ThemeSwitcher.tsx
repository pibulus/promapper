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
import { CURATED_PAIRS, generateThemeParts } from "@core/theme/randomTheme.ts";
import { soundToggle } from "@utils/sound.ts";

// Instantiated once per hydration root so it isn't re-created on render.
const themeSystem = createThemeSystem({
  ...proMapperThemeConfig,
  randomEnabled: false,
});

/** Which curated ground family a hue belongs to (index into CURATED_PAIRS
 * grounds), for the anti-repeat below. */
function groundFamilyOf(bgHue: number): number {
  return CURATED_PAIRS.findIndex(({ ground: [lo, hi] }) =>
    bgHue >= lo && bgHue <= hi
  );
}

// The SKY must visibly change on every roll — several pairs share a ground
// family, so pure random could deal the same-looking sky twice in a row.
let lastGroundFamily = -1;

export default function ThemeSwitcher() {
  // Init on mount: apply the saved theme (named default or last shuffle).
  useEffect(() => {
    themeSystem.init();
  }, []);

  function shuffle() {
    let parts = generateThemeParts();
    for (
      let tries = 0;
      tries < 6 && groundFamilyOf(parts.bgHue) === lastGroundFamily;
      tries++
    ) {
      parts = generateThemeParts();
    }
    lastGroundFamily = groundFamilyOf(parts.bgHue);
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
