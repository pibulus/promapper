/**
 * ThemeSwitcher Island
 *
 * Lets users cycle through or pick ProMapper's curated pastel-punk themes.
 * On mount it calls themeSystem.init() to restore the last saved choice from
 * localStorage (key: "promapper-theme") and apply it before the first paint
 * would be visible anyway.
 *
 * Renders a button that opens a small dropdown of colour-previewed theme
 * options. Closes on outside click.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { createThemeSystem, type Theme } from "@core/theme/themeEngine.ts";
import { proMapperThemeConfig } from "@core/theme/themes.ts";

// ===================================================================
// SINGLETON THEME SYSTEM
// Instantiated once per hydration root so it isn't re-created on render.
// ===================================================================

const themeSystem = createThemeSystem({
  ...proMapperThemeConfig,
  randomEnabled: false,
});

// ===================================================================
// COMPONENT
// ===================================================================

export default function ThemeSwitcher() {
  const currentTheme = useSignal<Theme>(themeSystem.getCurrentTheme());
  const showPicker = useSignal(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Init on mount: apply saved theme and subscribe to future changes.
  useEffect(() => {
    const resolved = themeSystem.init();
    currentTheme.value = resolved;

    const unsubscribe = themeSystem.subscribe((theme) => {
      currentTheme.value = theme;
    });

    return unsubscribe;
  }, []);

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!showPicker.value) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        showPicker.value = false;
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker.value]);

  const handlePick = (theme: Theme) => {
    themeSystem.setTheme(theme.name);
    showPicker.value = false;
  };

  return (
    <div class="theme-switcher relative" ref={dropdownRef}>
      {
        /* ============================================================
          Toggle button
          ============================================================ */
      }
      <button
        type="button"
        onClick={() => {
          showPicker.value = !showPicker.value;
        }}
        class="px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:brightness-110 active:scale-95"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "white",
          border: "2px solid var(--color-border)",
          boxShadow: "var(--shadow-soft)",
        }}
        title={`Theme: ${currentTheme.value.name} — ${currentTheme.value.vibe}`}
        aria-haspopup="true"
        aria-expanded={showPicker.value}
      >
        <span class="mr-1.5" aria-hidden="true">🎨</span>
        {currentTheme.value.name}
      </button>

      {
        /* ============================================================
          Theme picker dropdown
          ============================================================ */
      }
      {showPicker.value && (
        <div
          class="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-50"
          role="menu"
          style={{
            backgroundColor: "white",
            border: "2px solid var(--color-border)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
            width: "220px",
          }}
        >
          <div class="p-3 space-y-2">
            {themeSystem.getThemes().map((theme) => {
              const isActive = theme.name === currentTheme.value.name;
              return (
                <button
                  key={theme.name}
                  type="button"
                  role="menuitem"
                  onClick={() => handlePick(theme)}
                  class="w-full px-4 py-3 rounded-lg text-sm font-semibold hover:scale-[1.02] transition-all"
                  style={{
                    background: theme.base,
                    color: theme.text,
                    border: `2px solid ${theme.border}`,
                    boxShadow: isActive
                      ? `0 0 0 2px ${theme.accent} inset`
                      : "none",
                  }}
                >
                  <div class="flex items-center justify-between">
                    <div class="text-left">
                      <div class="font-bold">{theme.name}</div>
                      <div class="text-xs opacity-60">{theme.vibe}</div>
                    </div>
                    {isActive && <span aria-hidden="true">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
