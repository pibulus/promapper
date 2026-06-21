/**
 * ProMapper - Curated Pastel-Punk Themes
 *
 * 5 on-brand themes: warm, white-background-friendly, zero neon.
 * The first theme (PEACH) exactly reproduces the styles.css default values
 * so the default look is unchanged when no saved preference exists.
 *
 * CSS variable contract (set by ThemeSystem.applyTheme):
 *   --color-base          gradient or solid background
 *   --color-base-solid    solid fallback extracted from gradient
 *   --color-secondary     cards / sections (usually translucent white)
 *   --color-accent        CTAs / highlights
 *   --color-text          primary text
 *   --color-text-secondary muted / helper text
 *   --color-border        border colour
 *   --gradient-bg         page-level decorative gradient (in cssVars)
 *   --shadow-soft         standard card shadow (in cssVars)
 */

import type { Theme, ThemeSystemConfig } from "@core/theme/types.ts";

// ===================================================================
// THEME DEFINITIONS
// ===================================================================

/**
 * Warm Peach (default)
 * Reproduces the styles.css :root defaults exactly.
 * --color-base, --color-base-solid, --color-accent, --color-text, etc.
 */
export const warmPeach: Theme = {
  name: "PEACH",
  vibe: "warm & welcoming",
  base: "linear-gradient(135deg, #ffebd4 0%, #ffd9b8 100%)",
  secondary: "rgba(255, 255, 255, 0.6)",
  accent: "#b84a70",
  text: "#2c2c2c",
  textSecondary: "#6b6b6b",
  border: "rgba(61, 57, 53, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffebd4",
    "--shadow-soft": "0 4px 12px rgba(30, 23, 20, 0.08)",
    "--gradient-bg":
      "radial-gradient(circle at 20% 20%, rgba(255, 138, 170, 0.16), transparent 45%), radial-gradient(circle at 80% 10%, rgba(255, 198, 114, 0.14), transparent 50%), linear-gradient(125deg, #fff8f1 0%, #f8f2ff 50%, #f1fbf4 100%)",
  },
};

/**
 * Soft Mint
 * Cool, clear, energising — gentle green tones.
 */
export const softMint: Theme = {
  name: "MINT",
  vibe: "fresh & clear",
  base: "linear-gradient(135deg, #e8f8f5 0%, #cdeee8 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#2a8071",
  text: "#2c4a42",
  textSecondary: "#7a9690",
  border: "rgba(44, 74, 66, 0.1)",
  cssVars: {
    "--color-base-solid": "#e8f8f5",
    "--shadow-soft": "0 4px 12px rgba(93, 190, 170, 0.12)",
    // Cool theme: pull card surfaces a few degrees toward the page's near-white
    // so cards belong to the page instead of floating warm-cream.
    "--surface-card": "#f2fbf8",
    "--surface-card-deep": "#e9f6f2",
    "--gradient-bg":
      "radial-gradient(circle at 20% 20%, rgba(93, 190, 170, 0.14), transparent 45%), radial-gradient(circle at 80% 10%, rgba(200, 240, 220, 0.18), transparent 50%), linear-gradient(125deg, #f4fdf9 0%, #e8f8f5 50%, #f0fdf7 100%)",
  },
};

/**
 * Lavender Dusk
 * Calm, creative, slightly dreamy purple palette.
 */
export const lavenderDusk: Theme = {
  name: "LAVENDER",
  vibe: "calm & creative",
  base: "linear-gradient(135deg, #efe5f7 0%, #dbc9ed 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#6f4fa8",
  text: "#3d3a42",
  textSecondary: "#8b8390",
  border: "rgba(61, 58, 66, 0.1)",
  cssVars: {
    "--color-base-solid": "#efe5f7",
    "--shadow-soft": "0 4px 12px rgba(155, 126, 199, 0.12)",
    // Cool theme: nudge card surfaces toward the page's lilac near-white.
    "--surface-card": "#f8f4fd",
    "--surface-card-deep": "#f0eafa",
    "--gradient-bg":
      "radial-gradient(circle at 20% 20%, rgba(155, 126, 199, 0.14), transparent 45%), radial-gradient(circle at 80% 10%, rgba(219, 201, 237, 0.18), transparent 50%), linear-gradient(125deg, #faf7ff 0%, #f0e8f8 50%, #f5f0ff 100%)",
  },
};

/**
 * Butter Yellow
 * Sunny, optimistic, warm without being orange.
 */
export const butterYellow: Theme = {
  name: "BUTTER",
  vibe: "sunny & optimistic",
  base: "linear-gradient(135deg, #fff8d6 0%, #ffeea3 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#8f6b00",
  text: "#3a3220",
  textSecondary: "#7a6e54",
  border: "rgba(58, 50, 32, 0.1)",
  cssVars: {
    "--color-base-solid": "#fff8d6",
    "--shadow-soft": "0 4px 12px rgba(212, 160, 26, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 20% 20%, rgba(255, 220, 80, 0.14), transparent 45%), radial-gradient(circle at 80% 10%, rgba(255, 248, 214, 0.18), transparent 50%), linear-gradient(125deg, #fffef5 0%, #fff9e0 50%, #fffcf0 100%)",
  },
};

/**
 * Dusty Rose
 * Soft pinkish-mauve, a quieter alternative to the peach default.
 */
export const dustyRose: Theme = {
  name: "ROSE",
  vibe: "soft & romantic",
  base: "linear-gradient(135deg, #ffe6f0 0%, #ffcce0 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#a83f5e",
  text: "#3d2a35",
  textSecondary: "#8b7580",
  border: "rgba(61, 42, 53, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe6f0",
    "--shadow-soft": "0 4px 12px rgba(196, 96, 122, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 20% 20%, rgba(232, 93, 143, 0.14), transparent 45%), radial-gradient(circle at 80% 10%, rgba(255, 204, 224, 0.18), transparent 50%), linear-gradient(125deg, #fff5f9 0%, #ffe8f2 50%, #fff0f7 100%)",
  },
};

// ===================================================================
// EXPORTED COLLECTION
// ===================================================================

export const proMapperThemes: Theme[] = [
  warmPeach,
  softMint,
  lavenderDusk,
  butterYellow,
  dustyRose,
];

export const proMapperThemeConfig: ThemeSystemConfig = {
  themes: proMapperThemes,
  defaultTheme: "PEACH",
  storageKey: "promapper-theme",
  randomEnabled: false,
  cssPrefix: "--color",
};
