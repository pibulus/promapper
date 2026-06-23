/**
 * ProMapper - Theme Engine
 *
 * Provider-agnostic theme system: get/set/cycle/load/save/applyTheme/subscribe/init.
 * Zero Preact/Fresh imports — safe to use in core/ (server or client).
 * document/localStorage access is guarded with typeof checks.
 *
 * Ported from the canonical CMF ThemeSystem (theme-system/mod.ts).
 * RandomThemeGenerator omitted intentionally — ProMapper uses curated palettes.
 */

import type { Theme, ThemeSystemConfig } from "./types.ts";
export type { Theme, ThemeSystemConfig };

// ===================================================================
// THEME SYSTEM CLASS
// ===================================================================

export class ThemeSystem {
  private config: ThemeSystemConfig;
  private currentTheme: Theme;
  private listeners: Array<(theme: Theme) => void> = [];
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

  /** Return all available themes. */
  getThemes(): Theme[] {
    return this.config.themes;
  }

  /** Return the currently active theme. */
  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  /** Switch to a named theme; throws if name not found. */
  setTheme(themeName: string): Theme {
    const theme = this.config.themes.find((t) => t.name === themeName);
    if (!theme) {
      throw new Error(`Theme '${themeName}' not found`);
    }
    this.currentTheme = theme;
    this.applyTheme(theme);
    this.notifyListeners(theme);
    return theme;
  }

  /**
   * Apply a theme object to the document root via CSS custom properties.
   * No-ops on the server (typeof document guard).
   */
  applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const prefix = this.config.cssPrefix;

    // Apply base, secondary, accent, text, border
    this.setCSSVar(root, `${prefix}-secondary`, theme.secondary);
    this.setCSSVar(root, `${prefix}-accent`, theme.accent);
    this.setCSSVar(root, `${prefix}-text`, theme.text);
    this.setCSSVar(root, `${prefix}-border`, theme.border);

    // Handle base — detect gradient vs solid
    if (theme.base.includes("gradient")) {
      this.setCSSVar(root, `${prefix}-base`, theme.base);
      this.setCSSVar(root, `${prefix}-base-gradient`, theme.base);
      const fallback = this.extractColorFromGradient(theme.base) || "#FFEBD4";
      this.setCSSVar(root, `${prefix}-base-solid`, fallback);
    } else {
      this.setCSSVar(root, `${prefix}-base`, theme.base);
      this.setCSSVar(root, `${prefix}-base-gradient`, theme.base);
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
   * Subscribe to theme change events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (theme: Theme) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
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

  private saveTheme(theme: Theme): void {
    if (typeof window !== "undefined") {
      const storageKey = this.config.storageKey || "app-theme";
      localStorage.setItem(
        storageKey,
        JSON.stringify({ name: theme.name, timestamp: Date.now() }),
      );
    }
  }

  private notifyListeners(theme: Theme): void {
    this.listeners.forEach((listener) => listener(theme));
  }
}

// ===================================================================
// CONVENIENCE FACTORY
// ===================================================================

export function createThemeSystem(config: ThemeSystemConfig): ThemeSystem {
  return new ThemeSystem(config);
}
