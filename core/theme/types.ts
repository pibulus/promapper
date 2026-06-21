/**
 * ProMapper - Theme Types
 *
 * Pure data contracts for the theme system. Kept separate from themeEngine.ts
 * (which references DOM globals) so theme DATA modules and tests never pull in
 * browser types.
 */

export interface Theme {
  name: string;
  vibe: string;
  /** 60% — main background (may be a gradient string) */
  base: string;
  /** 30% — cards / sections */
  secondary: string;
  /** 10% — CTAs / highlights */
  accent: string;
  /** Primary text color */
  text: string;
  /** Secondary / muted text (optional) */
  textSecondary?: string;
  /** Border color */
  border: string;
  /** Shadow color (optional) */
  shadow?: string;
  /** Extra CSS variable overrides keyed by full property name */
  cssVars?: Record<string, string>;
}

export interface ThemeSystemConfig {
  themes: Theme[];
  defaultTheme?: string;
  storageKey?: string;
  randomEnabled?: boolean;
  cssPrefix?: string;
}
