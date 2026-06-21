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
 * Bubblegum (default)
 * Neo-pastel fluoro-pop: a bright candy-pink accent used as a POP (pale-tint
 * header bands + dots + active states), never as a text background. Soft
 * pink→cream→lilac wash behind. Light, lush, playful.
 * Header band uses a pale tint with dark ink (set via --header-band* below).
 */
export const bubblegum: Theme = {
  name: "BUBBLEGUM",
  vibe: "light, lush & playful",
  base: "linear-gradient(135deg, #ffe8f3 0%, #fff3ec 100%)",
  secondary: "rgba(255, 255, 255, 0.62)",
  accent: "#ff4d97",
  text: "#2b2430",
  textSecondary: "#8a7e88",
  border: "rgba(43, 36, 48, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe8f3",
    "--shadow-soft": "0 4px 12px rgba(255, 77, 151, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 18% 18%, rgba(255, 95, 162, 0.18), transparent 46%), radial-gradient(circle at 82% 12%, rgba(168, 224, 255, 0.18), transparent 50%), radial-gradient(circle at 70% 85%, rgba(212, 181, 247, 0.16), transparent 52%), linear-gradient(125deg, #fff6fb 0%, #fdf3ff 50%, #fff4ee 100%)",
  },
};

/**
 * Sky — vivid deep-sky-blue pop. Fresh, hip, electric.
 */
export const sky: Theme = {
  name: "SKY",
  vibe: "fresh & electric",
  base: "linear-gradient(135deg, #e3f4ff 0%, #eef9ff 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#0aa6ff",
  text: "#1f3344",
  textSecondary: "#6f8597",
  border: "rgba(31, 51, 68, 0.1)",
  cssVars: {
    "--color-base-solid": "#e3f4ff",
    "--shadow-soft": "0 4px 12px rgba(10, 166, 255, 0.12)",
    "--surface-card": "#f3faff",
    "--surface-card-deep": "#e8f5ff",
    "--gradient-bg":
      "radial-gradient(circle at 18% 18%, rgba(10, 166, 255, 0.16), transparent 46%), radial-gradient(circle at 82% 12%, rgba(120, 220, 255, 0.18), transparent 50%), radial-gradient(circle at 70% 85%, rgba(168, 247, 220, 0.14), transparent 52%), linear-gradient(125deg, #f2fbff 0%, #eef9ff 50%, #f4feff 100%)",
  },
};

/**
 * Grape — electric purple pop. Bold, creative, confident.
 */
export const grape: Theme = {
  name: "GRAPE",
  vibe: "bold & creative",
  base: "linear-gradient(135deg, #f0ebff 0%, #f6f1ff 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#7c5cff",
  text: "#312a45",
  textSecondary: "#807a96",
  border: "rgba(49, 42, 69, 0.1)",
  cssVars: {
    "--color-base-solid": "#f0ebff",
    "--shadow-soft": "0 4px 12px rgba(124, 92, 255, 0.12)",
    "--surface-card": "#f7f4ff",
    "--surface-card-deep": "#efe9ff",
    "--gradient-bg":
      "radial-gradient(circle at 18% 18%, rgba(124, 92, 255, 0.16), transparent 46%), radial-gradient(circle at 82% 12%, rgba(255, 120, 200, 0.16), transparent 50%), radial-gradient(circle at 70% 85%, rgba(120, 200, 255, 0.14), transparent 52%), linear-gradient(125deg, #f7f3ff 0%, #f4f0ff 50%, #fbf4ff 100%)",
  },
};

/**
 * Lime — vivid fresh green pop. Zingy, optimistic, alive.
 */
export const lime: Theme = {
  name: "LIME",
  vibe: "zingy & alive",
  base: "linear-gradient(135deg, #e6fbef 0%, #f0fdf5 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#10b550",
  text: "#1f3a2b",
  textSecondary: "#6f8c7c",
  border: "rgba(31, 58, 43, 0.1)",
  cssVars: {
    "--color-base-solid": "#e6fbef",
    "--shadow-soft": "0 4px 12px rgba(16, 181, 80, 0.12)",
    "--surface-card": "#f2fdf6",
    "--surface-card-deep": "#e8fbef",
    "--gradient-bg":
      "radial-gradient(circle at 18% 18%, rgba(16, 181, 80, 0.16), transparent 46%), radial-gradient(circle at 82% 12%, rgba(255, 224, 110, 0.16), transparent 50%), radial-gradient(circle at 70% 85%, rgba(120, 220, 255, 0.12), transparent 52%), linear-gradient(125deg, #f3fef7 0%, #eefdf3 50%, #f6fef8 100%)",
  },
};

/**
 * Gold — bright confident gold pop (the GOOD yellow, never vom-mustard).
 */
export const gold: Theme = {
  name: "GOLD",
  vibe: "sunny & confident",
  base: "linear-gradient(135deg, #fff6da 0%, #fffaea 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#f5b300",
  text: "#3a3016",
  textSecondary: "#8a7b54",
  border: "rgba(58, 48, 22, 0.1)",
  cssVars: {
    "--color-base-solid": "#fff6da",
    "--shadow-soft": "0 4px 12px rgba(245, 179, 0, 0.14)",
    "--gradient-bg":
      "radial-gradient(circle at 18% 18%, rgba(255, 200, 30, 0.18), transparent 46%), radial-gradient(circle at 82% 12%, rgba(255, 130, 190, 0.14), transparent 50%), radial-gradient(circle at 70% 85%, rgba(120, 220, 255, 0.12), transparent 52%), linear-gradient(125deg, #fffdf2 0%, #fffae6 50%, #fffef4 100%)",
  },
};

// ===================================================================
// EXPORTED COLLECTION
// ===================================================================

export const proMapperThemes: Theme[] = [
  bubblegum,
  sky,
  grape,
  lime,
  gold,
];

export const proMapperThemeConfig: ThemeSystemConfig = {
  themes: proMapperThemes,
  defaultTheme: "BUBBLEGUM",
  storageKey: "promapper-theme",
  randomEnabled: false,
  cssPrefix: "--color",
};
