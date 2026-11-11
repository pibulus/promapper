/**
 * ThemeSwitcher Island — Palette Studio Popover & Shuffle Die.
 *
 * Restores the 6 curated ProMapper palettes (Daybreak, Bubblegum, Sky, Grape,
 * Lime, Gold) alongside a 1-tap "Roll fresh vibe" shuffle button powered by
 * the constrained OKLCH harmony generator (core/theme/randomTheme.ts).
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { createThemeSystem, type Theme } from "@core/theme/themeEngine.ts";
import { proMapperThemeConfig } from "@core/theme/themes.ts";
import { generateThemeParts } from "@core/theme/randomTheme.ts";
import { hexToOklch } from "@core/theme/oklch.ts";
import { soundToggle } from "@utils/sound.ts";
import { isSpanish } from "@utils/i18n.ts";

// Instantiated once per hydration root so it isn't re-created on render.
const themeSystem = createThemeSystem({
  ...proMapperThemeConfig,
  randomEnabled: false,
});

const THEME_LABELS: Record<string, { en: string; es: string }> = {
  DAYBREAK: { en: "Daybreak", es: "Amanecer" },
  BUBBLEGUM: { en: "Bubblegum", es: "Chicle" },
  SKY: { en: "Sky", es: "Cielo" },
  GRAPE: { en: "Grape", es: "Uva" },
  LIME: { en: "Lime", es: "Lima" },
  GOLD: { en: "Gold", es: "Sol" },
};

/** Circular hue distance in degrees. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

let lastAccentHue = -999;
const MIN_ACCENT_TRAVEL = 40;

export default function ThemeSwitcher() {
  const isOpen = useSignal(false);
  const activeName = useSignal<string>("DAYBREAK");
  const activeVibe = useSignal<string>("fresh & steady");
  const activeAccent = useSignal<string>("#2f6bff");
  const wrapRef = useRef<HTMLDivElement>(null);

  function syncActiveState(theme: Theme) {
    activeName.value = theme.name;
    activeVibe.value = theme.vibe || "fresh & steady";
    activeAccent.value = theme.accent;
    if (/^#[0-9a-f]{6}$/i.test(theme.accent)) {
      lastAccentHue = hexToOklch(theme.accent)[2];
    }
  }

  function selectNamed(name: string) {
    const applied = themeSystem.setThemeByName(name);
    if (applied) {
      syncActiveState(applied);
      soundToggle(true);
    }
  }

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
    const applied = themeSystem.applyCustomTheme(parts.theme);
    syncActiveState(applied);
    if (!silent) soundToggle(true);
  }

  useEffect(() => {
    const theme = themeSystem.init();
    syncActiveState(theme);
  }, []);

  useEffect(() => {
    if (!isOpen.value) return;
    function onDocPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        isOpen.value = false;
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") isOpen.value = false;
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen.value]);

  const es = isSpanish();
  const themes = themeSystem.getThemes();

  return (
    <div ref={wrapRef} class="theme-switcher-wrap">
      <button
        type="button"
        onClick={() => {
          isOpen.value = !isOpen.value;
        }}
        class={`header-icon-btn theme-trigger-btn${
          isOpen.value ? " is-open" : ""
        }`}
        data-tip={isOpen.value
          ? undefined
          : (es ? "Tema y colores" : "Theme & palette")}
        data-tip-align="right"
        aria-label={es ? "Abrir selector de tema" : "Choose color palette"}
        aria-expanded={isOpen.value}
        aria-haspopup="dialog"
      >
        <span
          class="theme-trigger-dot"
          style={{ backgroundColor: activeAccent.value }}
          aria-hidden="true"
        />
        <i class="fa fa-dice-five" aria-hidden="true"></i>
      </button>

      {isOpen.value && (
        <div
          class="theme-popover"
          role="dialog"
          aria-label={es ? "Paleta de colores" : "Color palette"}
        >
          <div class="theme-popover__head">
            <span class="theme-popover__title">
              {es ? "Paleta" : "Palette"}
            </span>
            <span class="theme-popover__vibe">{activeVibe.value}</span>
          </div>

          <div class="theme-swatch-grid">
            {themes.map((t) => {
              const selected = activeName.value === t.name;
              const ground = (t.cssVars?.["--color-base-solid"] as string) ||
                "#ffb98a";
              const label = THEME_LABELS[t.name]
                ? (es ? THEME_LABELS[t.name].es : THEME_LABELS[t.name].en)
                : t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => selectNamed(t.name)}
                  class={`theme-swatch${selected ? " is-active" : ""}`}
                  aria-pressed={selected}
                >
                  <span
                    class="theme-swatch__chip"
                    style={{
                      background:
                        `linear-gradient(135deg, ${ground} 50%, ${t.accent} 50%)`,
                    }}
                    aria-hidden="true"
                  />
                  <span class="theme-swatch__name">{label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => shuffle(false)}
            class={`theme-roll-btn${
              activeName.value === "SHUFFLE" ? " is-active" : ""
            }`}
          >
            <i class="fa fa-dice-five" aria-hidden="true"></i>
            <span>{es ? "Tirar vibra nueva" : "Roll fresh vibe"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
