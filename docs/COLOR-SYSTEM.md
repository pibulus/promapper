# ProMapper Color System — the law

v2, July 20, 2026 (v1 same night; Pablo's veto pass folded in: mono headers,
no stark black, backgrounds join the relationship). Everything below is
enforced by tests (`core/tests/theme_contrast_test.ts`,
`core/tests/random_theme_test.ts`) and implemented across the FOUR sync
points: `static/styles.css` :root, `core/theme/themes.ts`, `routes/_app.tsx`
FOUC map, `core/theme/randomTheme.ts`. Change one → change all. The color
math lives in `core/theme/oklch.ts`.

## Why OKLCH

All generation happens in OKLCH (stored as hex — no runtime dependency on
browser `oklch()` support). Equal L = equal _perceived_ lightness across
hues, which HSL never gave us: HSL's "same lightness" made coral scream and
cobalt sulk. One tier = one L value; hue and chroma move inside it.

Two physical facts drive everything:

1. **The sRGB gamut is lopsided.** At wash lightness (L 0.88) yellow-green
   holds chroma 0.2; blue holds 0.06. So chroma targets are always
   `min(target, ceiling(L,H))` — never a fixed number across hues.
2. **The carnival threshold.** Perceived clash between two hues scales with
   chroma: ≈ 2·C·sin(Δh/2). Below C ~0.05 hue freedom is unlimited (washes
   can wander). Above C ~0.12 — bands, accents — hues must be few and
   related. Three saturated header hues was the July 19 trio; it died.

## THE TRIO (the relationship law)

Every theme — named or rolled — is three ROLES designed together:

1. **The GROUND**: a two-hue family journey in the sky (L 0.84–0.90, C at
   the family's gamut-budget), always fading to the cream floor `#fff4e8`
   where components live. The sky CHANGES with the theme.
2. **The BAND**: ONE colour on every card header — the accent at 62% over
   `#ffefdc`. Headers are consistent; they never carry a second hue.
3. **The POP**: the accent family everywhere ink meets colour — CTA plates,
   chips, washes, checkbox fills, the deep companion.

Relationships live BETWEEN these layers, never inside one of them. (This is
the conversation_mapper lesson: its best rolls were one field family + one
chrome colour + one pop.)

## The tiers (value hierarchy, top of app → ink)

| Tier | Layer          | OKLCH register                                           | Rule                                                    |
| ---- | -------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| T0   | Sky ground     | washes L 0.84–0.90, C ≤ 0.10 per-hue clamped → `#fff4e8` | Two-hue family journey, airy, cream floor always        |
| T1   | Shell          | accent 11% over near-white                               | unchanged recipe                                        |
| T2   | Card face      | `#fff7ef` cream, L 0.98                                  | solid, never glass                                      |
| T3   | Header band    | accent 62% over `#ffefdc`                                | **MONO — one colour on every card, no exceptions**      |
| T4   | Chips / washes | accent 4–20% mixes                                       | unchanged recipes, all derive from `--color-accent`     |
| T5   | CTA plates     | `--cta-plate` (below)                                    | hued ink — never stark black, never a saturated slab    |
| T6   | Ink            | L ≈ 0.30, C 0.03, accent hue                             | text is a color — hue-tinted near-black, never grey     |

Saturation is a budget. T3 spends it, T0 whispers it, T4 tints it, T5/T6
are hued ink. Nothing else shouts.

## The CTA plate law (+Topic, mic/record, Bishop ask, btn--accent)

```css
--cta-plate: color-mix(in srgb, var(--accent-fill) 42%, var(--soft-black));
--cta-plate-border: color-mix(in srgb, var(--accent-fill) 28%, var(--soft-black));
--cta-plate-hover: color-mix(in srgb, var(--accent-fill) 50%, var(--soft-black));
```

Primary buttons are the accent mixed DEEP into warm black — hued ink. The
history: 72% accent slabs were "garish" (July 19), 0% stark black was "too
stark always" (July 20), 42% is the solved middle — reads as a plate,
carries the theme. Shadow = `--header-band` peeking (riso misregistration).
White-on-plate ≥ 4.5:1 is test-pinned for every named theme and 300 rolls.

`--accent-fill` still exists for small non-button accent solids (count
badges, toggle knobs, progress). Anything button-shaped takes the plate.

## Named themes (accent + its own sky)

| Theme              | accent                       | ground journey                     |
| ------------------ | ---------------------------- | ---------------------------------- |
| DAYBREAK (default) | `#4a7bc9` cobalt             | sunrise coral→cream (the original) |
| BUBBLEGUM          | `#ff2e88` hot pink           | warm pink→rose (H 20→352)          |
| SKY                | `#0095ff` electric blue      | pool cyan→periwinkle (H 205→232)   |
| GRAPE              | `#8335ff` electric violet ⚡ | pink→lavender dusk (H 345→312)     |
| LIME               | `#0fb255` fresh green        | mint pool (H 180→203)              |
| GOLD               | `#f5a300` amber              | honey sunrise (H 58→74)            |

⚡ GRAPE was retuned July 20 from `#7c3aed` ("fresher or more neon or
deeper") → neon-electric at oklch(0.56 0.27 293). Parked alternates:
deeper `#6d0ede`, Pablo's reference electric `#7659FF` (bluer — rejected
here as too close to DAYBREAK/SKY periwinkle territory).

Ground hexes live in `themes.ts` cssVars (`--gradient-bg`, `--color-base*`)
mirrored in the FOUC map. All grounds share the WARM_BG structure: two
radial corner washes + 168deg linear fading to `#fff4e8` at 78%.

## The shuffle (OKLCH curated pairs)

The dice picks between DESIGNED couples with per-pair accent registers
derived from the beloved anchors (Miami coral oklch(0.71 0.18 23), rebel
purple oklch(0.58 0.15 315), raspberry oklch(0.67 0.18 ~0), DAYBREAK
cobalt):

| Pair          | ground hue arc | accent hue arc | accent L  | accent C  |
| ------------- | -------------- | -------------- | --------- | --------- |
| sunset-cobalt | 38–60          | 246–262        | 0.58–0.63 | 0.13–0.17 |
| coral-orchid  | 30–52          | 306–322        | 0.57–0.63 | 0.17–0.22 |
| dusk-coral    | 318–336        | 27–40          | 0.66–0.71 | 0.16–0.19 |
| lagoon-coral  | 188–210        | 27–40          | 0.66–0.71 | 0.16–0.19 |
| poolside      | 183–205        | 350–366 (wraps)| 0.63–0.68 | 0.17–0.20 |
| dawn-rose     | 42–64          | 350–366        | 0.63–0.68 | 0.17–0.20 |

- Jitter: hue uniform in arc, L ±0.02, C ±0.015 — fresh but family.
- Blues live at 246–262, never 264–275 (the OKLCH blue trap).
- Ground = two-hue journey: washes at bgHue−8 and bgHue+22, plus an accent
  whisper near the bottom; per-pair groundL/groundC (aqua families ride
  L 0.90 — the airy pool feel is a lightness fact).
- `--accent-strong/ink/fill` = same hue, C ≤ 0.15, L walked down until ≥
  4.6:1 on card cream (doubles as AA ink and white-carrier).
- `text` = oklch(0.30 0.035 hue); `textSecondary` = oklch(0.52 0.03 hue).
- Banned accents: green/teal/yellow (OKLCH 60–244), alarm-red (8–27);
  coral rides L ≥ 0.65. Aqua/lagoon lives as GROUND only.
- Contrast swept over 300 seeded rolls: ink/band, white/strong,
  strong/cream, ink/every-bg-layer, white/CTA-plate.

`SHUFFLE_SCHEMA_VERSION = 8` (themeEngine + FOUC script) — older rolls are
discarded on load, falling back to DAYBREAK.

## Standing law (inherited, still binding)

- NO red on ordinary surfaces; destructive = recession + warm rose wash.
- No pure black/white anywhere: ink is `#1e1714` warm black, grounds cream.
- Accent-colored TEXT routes through `--accent-ink` (solved), never raw
  accent on cream (raw pastel accents score ~1.5:1 — decoration only).
- Speaker palette (`speakerColors.ts`) is theme-independent identity.
- ALL CAPS banned; FontAwesome icons only, no emoji in UI.
- Glass/backdrop-filter banned on cards; figures are solid cream.
