/**
 * ProMapper - Theme Engine
 *
 * Provider-agnostic: load/save/applyTheme/applyCustomTheme/init. Zero
 * Preact/Fresh imports — safe to use in core/ (server or client).
 * document/localStorage access is guarded with typeof checks.
 *
 * Ported from the canonical CMF ThemeSystem (theme-system/mod.ts). The port
 * carried a getThemes/getCurrentTheme/setTheme/subscribe surface that nothing
 * here ever called — the observer's listener array was permanently empty —
 * so it's gone. The app rolls a theme (applyCustomTheme) or restores the
 * saved one (init); that's the whole story. Add back what a caller needs.
 */

import type { Theme, ThemeSystemConfig } from "./types.ts";
export type { Theme, ThemeSystemConfig };

/** Persisted SHUFFLE rolls carry their generator's schema version. Bump this
 * whenever the generator's taste changes materially — stale saved rolls are
 * then DISCARDED on load (falling back to the default theme) instead of
 * replaying frozen old vars forever. Mirror the literal in the _app.tsx FOUC
 * script. */
export const SHUFFLE_SCHEMA_VERSION = 9;

// ===================================================================
// THEME SYSTEM CLASS
// ===================================================================

export class ThemeSystem {
  private config: ThemeSystemConfig;
  private currentTheme: Theme;
  // Keys set by the PREVIOUS theme's `cssVars` block. A theme-specific var (e.g.
  // GOLD's --accent-strong) would otherwise persist as an inline :root style
  // after switching to a theme that doesn't define it, overriding the static-CSS
  // default. We clear last theme's extras that the new theme doesn't redefine.
  private appliedCssVarKeys: string[] = [];

  constructor(config: ThemeSystemConfig) {
    this.config = {
      storageKey: "app-theme",
      cssPrefix: "--color",
      randomEnabled: false,
      ...config,
    };

    const defaultTheme = config.defaultTheme
      ? config.themes.find((t) => t.name === config.defaultTheme)
      : config.themes[0];

    this.currentTheme = defaultTheme || config.themes[0];
  }

  // ===================================================================
  // PUBLIC API
  // ===================================================================

  /**
   * Apply a theme object to the document root via CSS custom properties.
   * No-ops on the server (typeof document guard).
   */
  applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const prefix = this.config.cssPrefix;

    // Silence transitions for this swap (see .is-theming in styles.css) —
    // otherwise `transition: all/background/color` rules animate the var
    // change and the blend reads as a phantom in-between theme. Two rAFs:
    // the first fires before the next paint, the second after it.
    root.classList.add("is-theming");
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.classList.remove("is-theming"))
      );
    } else {
      root.classList.remove("is-theming");
    }

    // Apply base, secondary, accent, text, border
    this.setCSSVar(root, `${prefix}-secondary`, theme.secondary);
    this.setCSSVar(root, `${prefix}-accent`, theme.accent);
    this.setCSSVar(root, `${prefix}-text`, theme.text);
    this.setCSSVar(root, `${prefix}-border`, theme.border);

    // Handle base — detect gradient vs solid.
    // (--color-base-gradient used to be set here too, in both branches, and
    // in themeToVars, and six times in the _app.tsx FOUC map. Nothing in any
    // stylesheet ever read it. Dropped: it was pure write.)
    this.setCSSVar(root, `${prefix}-base`, theme.base);
    if (theme.base.includes("gradient")) {
      const fallback = this.extractColorFromGradient(theme.base) || "#FFEBD4";
      this.setCSSVar(root, `${prefix}-base-solid`, fallback);
    } else {
      this.setCSSVar(root, `${prefix}-base-solid`, theme.base);
    }

    // Optional fields
    if (theme.textSecondary) {
      this.setCSSVar(root, `${prefix}-text-secondary`, theme.textSecondary);
    }
    if (theme.shadow) {
      this.setCSSVar(root, `${prefix}-shadow`, theme.shadow);
    }

    // Extra cssVars overrides (e.g. --shadow-soft, --gradient-bg). Clear any
    // extras the PREVIOUS theme set that this one doesn't redefine, so a
    // theme-specific var doesn't leak across the switch as inline residue.
    const nextKeys = theme.cssVars ? Object.keys(theme.cssVars) : [];
    for (const stale of this.appliedCssVarKeys) {
      if (!nextKeys.includes(stale)) root.style.removeProperty(stale);
    }
    if (theme.cssVars) {
      for (const [key, value] of Object.entries(theme.cssVars)) {
        root.style.setProperty(key, value);
      }
    }
    this.appliedCssVarKeys = nextKeys;

    // Persist selection
    this.saveTheme(theme);
  }

  /**
   * Load the saved theme from localStorage.
   * Falls back to the current/default theme if nothing is saved or the name
   * no longer exists in the theme list.
   * No-ops on the server (typeof window guard).
   */
  loadTheme(): Theme {
    if (typeof window === "undefined") return this.currentTheme;

    const storageKey = this.config.storageKey || "app-theme";
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // A shuffled theme isn't in the named list — rebuild it from storage.
        // Rolls from an older generator schema are dropped (default applies).
        if (
          parsed.name === "SHUFFLE" &&
          parsed.v === SHUFFLE_SCHEMA_VERSION &&
          parsed.custom?.theme?.accent
        ) {
          this.currentTheme = parsed.custom.theme as Theme;
          return this.currentTheme;
        }
        const theme = this.config.themes.find((t) => t.name === parsed.name);
        if (theme) {
          this.currentTheme = theme;
          return theme;
        }
      } catch {
        // Fall through to default
      }
    }

    return this.currentTheme;
  }

  /**
   * Initialise on client mount: load saved theme from localStorage, apply it
   * to the document, and return the resolved theme.
   */
  init(): Theme {
    const theme = this.loadTheme();
    this.applyTheme(theme);
    return theme;
  }

  // ===================================================================
  // PRIVATE HELPERS
  // ===================================================================

  private setCSSVar(root: HTMLElement, property: string, value: string): void {
    root.style.setProperty(property, value);
  }

  /** Extract the first hex colour from a gradient string, or return null. */
  private extractColorFromGradient(gradient: string): string | null {
    const match = gradient.match(/#[0-9A-Fa-f]{6}/);
    return match ? match[0] : null;
  }

  /** Apply a theme OBJECT (e.g. a shuffle roll) — not limited to the named
   * list. Applies, notifies, persists. */
  applyCustomTheme(theme: Theme): Theme {
    this.currentTheme = theme;
    // applyTheme() already persists on its way out — the extra saveTheme()
    // that used to sit below meant every dice roll serialised the whole
    // theme plus its flat var map and wrote localStorage TWICE.
    this.applyTheme(theme);
    return theme;
  }

  /** Flat CSS-var map for a theme — mirrors applyTheme's assignments so the
   * FOUC script can set them verbatim before first paint. */
  private themeToVars(theme: Theme): Record<string, string> {
    const prefix = this.config.cssPrefix;
    const vars: Record<string, string> = {
      [`${prefix}-secondary`]: theme.secondary,
      [`${prefix}-accent`]: theme.accent,
      [`${prefix}-text`]: theme.text,
      [`${prefix}-border`]: theme.border,
      [`${prefix}-base`]: theme.base,
      [`${prefix}-base-solid`]:
        (theme.cssVars?.["--color-base-solid"] as string) ?? theme.base,
    };
    if (theme.textSecondary) {
      vars[`${prefix}-text-secondary`] = theme.textSecondary;
    }
    for (const [k, v] of Object.entries(theme.cssVars ?? {})) {
      vars[k] = String(v);
    }
    return vars;
  }

  private saveTheme(theme: Theme): void {
    if (typeof window !== "undefined") {
      const storageKey = this.config.storageKey || "app-theme";
      try {
        // SHUFFLE rolls aren't in the named-theme list, so persist the
        // full theme + a flat CSS-var map (the FOUC script applies the vars
        // directly before first paint without knowing how to derive them).
        const payload: Record<string, unknown> = {
          name: theme.name,
          timestamp: Date.now(),
        };
        if (theme.name === "SHUFFLE") {
          payload.v = SHUFFLE_SCHEMA_VERSION;
          payload.custom = { theme, vars: this.themeToVars(theme) };
        }
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (err) {
        console.error("Failed to save theme to localStorage:", err);
      }
    }
  }
}

// ===================================================================
// CONVENIENCE FACTORY
// ===================================================================

export function createThemeSystem(config: ThemeSystemConfig): ThemeSystem {
  return new ThemeSystem(config);
}
