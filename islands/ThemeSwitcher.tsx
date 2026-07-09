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
import { generateTheme } from "@core/theme/randomTheme.ts";
import { soundToggle } from "@utils/sound.ts";

// Instantiated once per hydration root so it isn't re-created on render.
const themeSystem = createThemeSystem({
  ...proMapperThemeConfig,
  randomEnabled: false,
});

export default function ThemeSwitcher() {
  // Init on mount: apply the saved theme (named default or last shuffle).
  useEffect(() => {
    themeSystem.init();
  }, []);

  function shuffle() {
    themeSystem.applyCustomTheme(generateTheme());
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
