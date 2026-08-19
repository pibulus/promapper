/**
 * Vibe Curator (was ThemeSwitcher) — the color picker.
 *
 * Lets users pick from a few hand-curated vibes or roll the dice for the
 * neon office generator.
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { createThemeSystem } from "@core/theme/themeEngine.ts";
import { proMapperThemeConfig } from "@core/theme/themes.ts";
import { generateThemeParts, CURATED_PAIRS, composeTheme } from "@core/theme/randomTheme.ts";
import { soundToggle, soundHover } from "@utils/sound.ts";

const themeSystem = createThemeSystem({
  ...proMapperThemeConfig,
  randomEnabled: false,
});

function hueDist(a: number, b: number): number {
  const d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

let lastAccentHue = -999;
const MIN_ACCENT_TRAVEL = 40;

export default function VibeCurator() {
  const menuOpen = useSignal(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        menuOpen.value &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        menuOpen.value = false;
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function shuffle(silent = false) {
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
    if (!silent) soundToggle(true);
    menuOpen.value = false;
  }

  function applyCurated(pairIndex: number) {
    const p = CURATED_PAIRS[pairIndex];
    if (!p) return;
    const mid = (a: readonly [number, number]) => (a[0] + a[1]) / 2;
    const parts = composeTheme({
      hue: mid(p.accent),
      lightness: mid(p.accentL),
      chroma: mid(p.accentC),
      bgHue: mid(p.ground),
      groundL: p.groundL,
      groundC: p.groundC,
    });
    themeSystem.applyCustomTheme({ ...parts.theme, name: p.name });
    soundToggle(true);
    menuOpen.value = false;
  }

  useEffect(() => {
    const theme = themeSystem.init();
    if (theme.name === "SHUFFLE" || theme.name === "random") shuffle(true);
  }, []);

  return (
    <div class="relative" ref={containerRef}>
      <button
        type="button"
        onMouseEnter={soundHover} onClick={() => { menuOpen.value = !menuOpen.value; if (menuOpen.value) soundToggle(true); }}
        class="header-icon-btn"
        data-tip="Curate vibe"
        data-tip-align="right"
        aria-label="Open vibe curator"
      >
        <i class="fa fa-palette" aria-hidden="true"></i>
      </button>

      {menuOpen.value && (
        <div class="absolute right-0 top-12 mt-2 p-2 bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col gap-2 z-50 min-w-[140px] shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
          <div class="text-[10px] uppercase font-bold text-slate-400 px-2 pt-1">Vibe</div>
          
          <button
            class="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-50 rounded-lg text-sm text-slate-600 transition-colors"
            onMouseEnter={soundHover} onClick={() => shuffle()}
          >
            <div class="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-400 to-pink-400 flex items-center justify-center text-white shadow-inner">
              <i class="fa fa-dice-five text-[10px]" />
            </div>
            Random Roll
          </button>
          
          <div class="h-px bg-slate-100 mx-2" />

          {CURATED_PAIRS.map((p, i) => {
            const mid = (a: readonly [number, number]) => (a[0] + a[1]) / 2;
            const accentL = mid(p.accentL);
            const accentC = mid(p.accentC);
            const accentH = mid(p.accent);
            // approximate hex for the preview circle (we can just use the actual oklch in CSS)
            const cssOklch = `oklch(${accentL} ${accentC} ${accentH})`;
            return (
              <button
                key={p.name}
                class="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-50 rounded-lg text-sm text-slate-600 capitalize transition-colors"
                onMouseEnter={soundHover} onClick={() => applyCurated(i)}
              >
                <div 
                  class="w-5 h-5 rounded-full shadow-inner" 
                  style={{ backgroundColor: cssOklch }}
                />
                {p.name.replace('-', ' ')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
