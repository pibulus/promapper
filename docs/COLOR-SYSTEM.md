# ProMapper Color System — the law

July 20, 2026. Replaces the faceplate trio + HSL shuffle. Everything below is
enforced by tests (`core/tests/theme_contrast_test.ts`,
`core/tests/random_theme_test.ts`) and implemented across the FOUR sync points:
`static/styles.css` :root, `core/theme/themes.ts`, `routes/_app.tsx` FOUC map,
`core/theme/randomTheme.ts`. Change one → change all. The color math lives in
`core/theme/oklch.ts`.

## Why OKLCH

All generation happens in OKLCH (stored as hex — no runtime dependency on
browser `oklch()` support). Equal L = equal _perceived_ lightness across hues,
which HSL never gave us: HSL's "same lightness" made coral scream and cobalt
sulk. One tier = one L value; hue and chroma move inside it.

Two physical facts drive everything:

1. **The sRGB gamut is lopsided.** At wash lightness (L 0.88) yellow-green holds
   chroma 0.2; blue holds 0.06. Fluoro-at-high-L is physically a
   yellow/green/pink phenomenon; blues must drop to L 0.6–0.7 to get loud. So
   chroma targets are always `min(target, ceiling(L,H))` — never a fixed number
   across hues.
2. **The carnival threshold.** Perceived clash between two hues scales with
   chroma: ≈ 2·C·sin(Δh/2). Below C 0.05 hue freedom is unlimited (washes can
   wander). Above C ~0.12 — bands, accents — you get at most TWO hues, and they
   must be neighbours. Three saturated hues 180° apart was the July 19 trio; it
   dies here.

## The tiers (value hierarchy, top of app → ink)

| Tier | Layer            | OKLCH register                                                         | Rule                                                                                         |
| ---- | ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T0   | Sky ground       | washes L 0.84–0.90, C ≤ 0.10 (per-hue clamped) → cream floor `#fff4e8` | The airy part. Colored at the top, ALWAYS fades to cream where components live.              |
| T1   | Shell            | accent 11% over near-white                                             | unchanged recipe                                                                             |
| T2   | Card face        | `#fff7ef` cream, L 0.98                                                | solid, never glass                                                                           |
| T3   | **Header bands** | accent 62% over `#ffefdc`                                              | **ONE hue per theme — plus at most ONE near-neighbour at Δh ≤ 18°, same L/C.** See band law. |
| T4   | Chips / washes   | accent 4–20% mixes                                                     | unchanged recipes, all derive from `--color-accent`                                          |
| T5   | **CTA plates**   | `--soft-black` slab + white label + accent-band hard offset shadow     | See CTA law. Saturated accent FILLS on buttons are dead.                                     |
| T6   | Ink              | L ≈ 0.30, C 0.03, accent hue                                           | text is a color — hue-tinted near-black, never grey                                          |

Saturation is a budget. T3 is where the theme SPENDS it. T0 whispers it, T4
tints it, T5 and T6 are ink. Nothing else shouts.

## The band law (headers)

- `--header-band` = accent × 62% over `#ffefdc` — the proven, AA-tested recipe.
  Untouched.
- Every theme carries exactly ONE supporting hue: `--band-hue-b`, defined as the
  accent hue rotated **16° in OKLCH at the same L and C** (gamut-clamped). Grid
  cells alternate a/b (`nth-child(2n)`), so the rack still reads as a row of
  instruments — but tuned to the same key, not a carnival.
- **Rotation direction is chosen, not random**: away from the banned arcs
  (alarm-red 8–24°, mustard 85–100°), toward the romantic side of each hue.
  Named themes store the hand-picked result; the shuffle stores a direction per
  curated pair.
- `--band-hue-c` is dead. Do not re-add a third band hue.
- Mono flip (one line): delete the `.dashboard-grid > :nth-child(2n)` override
  in styles.css and every band is the accent.

## The CTA law (+Topic, mic/record, Bishop ask, btn--accent)

Primary action buttons are **ink plates**: `--soft-black` fill, white label, 2px
`--soft-black` border, and a hard offset shadow in the theme's band color — the
riso misregistration: black plate printed slightly off-register over the accent
plate. Hover lifts and grows the shadow (existing motion).

Why: the loved Record slab was already this. Saturated cobalt slabs read as a
louder species than their card; on coral shuffle rolls they read alarm-red. The
border/plate carries the contrast, the accent peeks as joy. White-on-ink passes
AA everywhere by construction, on every roll, forever.

`--accent-fill` still exists for small non-button accent solids (count badges,
toggle knobs, progress). Anything button-shaped takes the plate.

## Named themes

Six, unchanged accents (identity anchors), each with its computed neighbour:

| Theme              | accent                                 | band-hue-b (Δ16°, direction)                     |
| ------------------ | -------------------------------------- | ------------------------------------------------ |
| DAYBREAK (default) | `#4a7bc9` cobalt, oklch(0.59 0.13 259) | `#6773c9` periwinkle (+16, toward violet)        |
| BUBBLEGUM          | `#ff2e88`                              | `#f239b2` orchid-ward (−16; +16 is red — banned) |
| SKY                | `#0095ff`                              | `#5e8aff` periwinkle (+16)                       |
| GRAPE              | `#7c3aed`                              | `#9928d8` orchid-ward (+16)                      |
| LIME               | `#0fb255`                              | `#00af82` sea-ward (+16; −16 is chartreuse mud)  |
| GOLD               | `#f5a300`                              | `#ff9a46` apricot (−16; +16 is mustard — banned) |

Ground = the shared WARM_BG sunrise wash for all named themes (unchanged).

## The shuffle (OKLCH curated pairs)

The dice picks between DESIGNED couples — same six pair identities as before,
now defined in OKLCH with **per-pair accent targets** derived from the beloved
anchors (Miami coral oklch(0.71 0.18 23), rebel purple oklch(0.58 0.15 315),
raspberry oklch(0.67 0.18 1), DAYBREAK cobalt):

| Pair          | ground hue arc | accent hue arc | accent L  | accent C  | band-b dir |
| ------------- | -------------- | -------------- | --------- | --------- | ---------- |
| sunset-cobalt | 40–58          | 245–262        | 0.58–0.63 | 0.13–0.16 | +16        |
| coral-orchid  | 35–52          | 300–318        | 0.56–0.62 | 0.15–0.19 | +16        |
| dusk-coral    | 305–325        | 25–38          | 0.66–0.71 | 0.16–0.19 | +16        |
| lagoon-coral  | 190–210        | 25–38          | 0.66–0.71 | 0.16–0.19 | +16        |
| poolside      | 185–205        | 350–360        | 0.63–0.68 | 0.17–0.20 | −16        |
| dawn-rose     | 42–58          | 348–360        | 0.63–0.68 | 0.17–0.20 | −16        |

Jitter: hue uniform in arc, L ±0.02, C ±0.015 — every roll is fresh, every roll
is family. Blues live at hue 245–262, never 264–275 (the OKLCH blue trap:
chroma-clipping near the blue primary drags perceived hue purple).

Derived per roll, all in OKLCH, all gamut-clamped:

- `accent` = oklch(pairL±j, pairC±j, hue in arc)
- `--band-hue-b` = same L/C, hue ± 16° per pair direction
- `--accent-strong/ink/fill` = same hue, C capped 0.15, L walked down until
  contrast ≥ 4.6:1 vs card cream (so it doubles as AA ink on cream AND carries
  white text)
- `text` = oklch(0.30, 0.035, accent hue); `textSecondary` = oklch(0.52, 0.03,
  accent hue)
- ground washes = L 0.84–0.90, C target 0.08–0.10 clamped to the hue's ceiling,
  hues groundHue−8 / +10 / accent whisper; linear base fades to `#fff4e8`. Same
  three-radial + linear structure as WARM_BG.
- band/wash recipes downstream: the SAME static color-mix recipes as named
  themes. No per-roll special cases.

Contrast is guaranteed by construction + swept by 300-roll seeded tests: ink on
band ≥ 4.5, white on strong ≥ 4.5, strong on cream ≥ 4.5, ink on every bg layer
≥ 5.5, band-a↔band-b Δh ≤ 18°.

`SHUFFLE_SCHEMA_VERSION = 7` (themeEngine + FOUC script) — old rolls are
discarded on load, falling back to DAYBREAK.

## Standing law (inherited, still binding)

- NO red on ordinary surfaces; destructive = recession + warm rose wash. Accent
  arcs stop at hue 25+ (coral, not alarm).
- No green/teal ACCENTS in the shuffle (grounds may be lagoon/aqua). Named LIME
  stays — it's a chosen theme, not a roll.
- No pure black/white anywhere: ink is `#1e1714` warm black, grounds are cream.
- Accent-colored TEXT routes through `--accent-ink` (solved), never raw accent
  on cream (raw pastel accents score ~1.5:1 — decoration only).
- Speaker palette (`speakerColors.ts`) is theme-independent identity — never
  theme-derived, never touched by rolls.
- ALL CAPS banned; FontAwesome icons only, no emoji in UI.
- Glass/backdrop-filter banned on cards; figures are solid cream.
