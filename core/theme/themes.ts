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
// DAYBREAK's sunrise wash — since July 20 each named theme carries its OWN
// ground family (the trio law, docs/COLOR-SYSTEM.md: ground ↔ band ↔ pop are
// designed together, so the sky changes with the theme). The ground is
// genuinely COLORED (a two-hue family journey, not a tinted white) and ALWAYS
// fades to the cream floor where components live — cards get their freshness
// from figure/ground separation. Mirror any change into the _app.tsx FOUC map.
export const WARM_BG =
  "radial-gradient(circle at 18% 0%, rgba(255,166,128,0.85), transparent 52%), radial-gradient(circle at 82% 6%, rgba(255,143,112,0.7), transparent 52%), linear-gradient(168deg, #ffb28c 0%, #ffe0c9 38%, #fff4e8 78%)";

/**
 * Daybreak (default) — cobalt on the sunrise sky. The old hot-pink default
 * meant every fresh load (and every discarded stale roll) greeted the user
 * with bubblegum; a denim-cobalt accent on the coral-fade ground is the
 * unisex, fresh face of the app.
 */
export const daybreak: Theme = {
  name: "DAYBREAK",
  vibe: "fresh & steady",
  base: "linear-gradient(135deg, #ffe2cf 0%, #ffd0bd 100%)",
  secondary: "rgba(255, 255, 255, 0.62)",
  accent: "#4a7bc9",
  text: "#232a3a",
  textSecondary: "#6b7386",
  border: "rgba(35, 42, 58, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffe2cf",
    "--shadow-soft": "0 4px 12px rgba(74, 123, 201, 0.14)",
    "--gradient-bg": WARM_BG,
  },
};

export const bubblegum: Theme = {
  name: "BUBBLEGUM",
  vibe: "warm & playful",
  base: "linear-gradient(135deg, #ffd9e5 0%, #ffcbd7 100%)",
  secondary: "rgba(255, 255, 255, 0.62)",
  accent: "#ff2e88",
  text: "#2b2430",
  textSecondary: "#8a7e88",
  border: "rgba(43, 36, 48, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffd9e5",
    "--shadow-soft": "0 4px 12px rgba(255, 77, 151, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 18% 0%, rgba(255,185,184,0.85), transparent 52%), radial-gradient(circle at 82% 6%, rgba(255,186,215,0.7), transparent 52%), linear-gradient(168deg, #ffbcc7 0%, #ffddeb 38%, #fff4e8 78%)",
  },
};

/**
 * Sky — vivid deep-sky-blue pop. Fresh, hip, electric.
 */
export const sky: Theme = {
  name: "SKY",
  vibe: "fresh & electric",
  base: "linear-gradient(135deg, #c2f2f9 0%, #adeaf9 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#0095ff",
  text: "#1f3344",
  textSecondary: "#6f8597",
  border: "rgba(31, 51, 68, 0.1)",
  cssVars: {
    "--color-base-solid": "#c2f2f9",
    "--shadow-soft": "0 4px 12px rgba(10, 166, 255, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 18% 0%, rgba(157,238,247,0.85), transparent 52%), radial-gradient(circle at 82% 6%, rgba(176,227,255,0.7), transparent 52%), linear-gradient(168deg, #a0edfb 0%, #cff2ff 38%, #fff4e8 78%)",
  },
};

/**
 * Grape — electric purple pop. Bold, creative, confident.
 */
export const grape: Theme = {
  name: "GRAPE",
  vibe: "bold & creative",
  base: "linear-gradient(135deg, #fdd7f3 0%, #f1ccf7 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#8335ff",
  text: "#312a45",
  textSecondary: "#807a96",
  border: "rgba(49, 42, 69, 0.1)",
  cssVars: {
    "--color-base-solid": "#fdd7f3",
    "--shadow-soft": "0 4px 12px rgba(131, 53, 255, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 18% 0%, rgba(251,181,220,0.85), transparent 52%), radial-gradient(circle at 82% 6%, rgba(225,190,247,0.7), transparent 52%), linear-gradient(168deg, #f3bced 0%, #f5deff 38%, #fff4e8 78%)",
  },
};

/**
 * Lime — vivid fresh green pop. Zingy, optimistic, alive.
 */
export const lime: Theme = {
  name: "LIME",
  vibe: "zingy & alive",
  base: "linear-gradient(135deg, #c3f3ec 0%, #acece9 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#0fb255",
  text: "#1f3a2b",
  textSecondary: "#6f8c7c",
  border: "rgba(31, 58, 43, 0.1)",
  cssVars: {
    "--color-base-solid": "#c3f3ec",
    "--shadow-soft": "0 4px 12px rgba(16, 181, 80, 0.12)",
    "--gradient-bg":
      "radial-gradient(circle at 18% 0%, rgba(162,240,224,0.85), transparent 52%), radial-gradient(circle at 82% 6%, rgba(162,237,244,0.7), transparent 52%), linear-gradient(168deg, #a0efe9 0%, #ccf5f4 38%, #fff4e8 78%)",
  },
};

/**
 * Gold — bright confident gold pop (the GOOD yellow, never vom-mustard).
 */
export const gold: Theme = {
  name: "GOLD",
  vibe: "sunny & confident",
  base: "linear-gradient(135deg, #ffdec2 0%, #fdd2a6 100%)",
  secondary: "rgba(255, 255, 255, 0.65)",
  accent: "#f5a300",
  text: "#3a3016",
  textSecondary: "#8a7b54",
  border: "rgba(58, 48, 22, 0.1)",
  cssVars: {
    "--color-base-solid": "#ffdec2",
    "--shadow-soft": "0 4px 12px rgba(245, 179, 0, 0.14)",
    "--accent-strong": "#a06a00",
    "--gradient-bg":
      "radial-gradient(circle at 18% 0%, rgba(255,195,149,0.85), transparent 52%), radial-gradient(circle at 82% 6%, rgba(250,203,141,0.7), transparent 52%), linear-gradient(168deg, #ffc895 0%, #fee3c5 38%, #fff4e8 78%)",
  },
};

// ===================================================================
// EXPORTED COLLECTION
// ===================================================================

export const proMapperThemes: Theme[] = [
  daybreak,
  bubblegum,
  sky,
  grape,
  lime,
  gold,
];

export const proMapperThemeConfig: ThemeSystemConfig = {
  themes: proMapperThemes,
  defaultTheme: "DAYBREAK",
  storageKey: "promapper-theme",
  randomEnabled: false,
  cssPrefix: "--color",
};
