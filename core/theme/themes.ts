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
// The constant warm peach→tangerine wash sits behind EVERY theme (the references
// always have a warm bg; only the accent pop changes). Shared so it stays one
// source of truth.
export const WARM_BG =
  "radial-gradient(circle at 15% 12%, rgba(255,209,176,0.9), transparent 55%), radial-gradient(circle at 85% 18%, rgba(255,173,156,0.85), transparent 55%), radial-gradient(circle at 75% 88%, rgba(255,198,150,0.8), transparent 55%), linear-gradient(135deg, #ffe7d4 0%, #ffd2bd 55%, #ffe0cd 100%)";

export const bubblegum: Theme = {
  name: "BUBBLEGUM",
  vibe: "warm & playful",
  base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
  secondary: "rgba(255, 255, 255, 0.62)",
  accent: "#ff2e88",
  text: "#2b2430",
  textSecondary: "#8a7e88",
  border: "rgba(43, 36, 48, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe2cf",
    "--shadow-soft": "0 4px 12px rgba(255, 77, 151, 0.12)",
    "--gradient-bg": WARM_BG,
  },
};

/**
 * Sky — vivid deep-sky-blue pop. Fresh, hip, electric.
 */
export const sky: Theme = {
  name: "SKY",
  vibe: "fresh & electric",
  base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#0095ff",
  text: "#1f3344",
  textSecondary: "#6f8597",
  border: "rgba(31, 51, 68, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe2cf",
    "--shadow-soft": "0 4px 12px rgba(10, 166, 255, 0.12)",
    "--gradient-bg": WARM_BG,
  },
};

/**
 * Grape — electric purple pop. Bold, creative, confident.
 */
export const grape: Theme = {
  name: "GRAPE",
  vibe: "bold & creative",
  base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#7c3aed",
  text: "#312a45",
  textSecondary: "#807a96",
  border: "rgba(49, 42, 69, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe2cf",
    "--shadow-soft": "0 4px 12px rgba(124, 92, 255, 0.12)",
    "--gradient-bg": WARM_BG,
  },
};

/**
 * Lime — vivid fresh green pop. Zingy, optimistic, alive.
 */
export const lime: Theme = {
  name: "LIME",
  vibe: "zingy & alive",
  base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#0fb255",
  text: "#1f3a2b",
  textSecondary: "#6f8c7c",
  border: "rgba(31, 58, 43, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe2cf",
    "--shadow-soft": "0 4px 12px rgba(16, 181, 80, 0.12)",
    "--gradient-bg": WARM_BG,
  },
};

/**
 * Gold — bright confident gold pop (the GOOD yellow, never vom-mustard).
 */
export const gold: Theme = {
  name: "GOLD",
  vibe: "sunny & confident",
  base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#f5a300",
  text: "#3a3016",
  textSecondary: "#8a7b54",
  border: "rgba(58, 48, 22, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe2cf",
    "--shadow-soft": "0 4px 12px rgba(245, 179, 0, 0.14)",
    "--accent-strong": "#a06a00",
    "--gradient-bg": WARM_BG,
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
