# ProMapper Color System — the law

Current visible rules: October 2026. The July 2026 generation history remains
below. `static/styles.css` decides which surfaces consume a roll;
`core/theme/randomTheme.ts` generates it; `core/theme/themeEngine.ts` saves it;
and `routes/_app.tsx` restores its variables before paint. Named themes in
`core/theme/themes.ts` are the fallback. Contrast and generator math live in
`core/theme/oklch.ts` and are swept by `core/tests/theme_contrast_test.ts` and
`core/tests/random_theme_test.ts`.

## Current visible contract (October 2026)

The page ground is a place: `.mapper-scene` uses the fixed warm
`--surface-desk`, and the porch has its own fixed dawn and sky. A shuffle
changes the accent, its companion band, plates, and active controls. On the
working board, every module header now wears a **30% wash of `--header-band`
over `--surface-header`**; card paper, carbon borders, stamped module tabs, and
speaker identity colors stay stable. This gives each roll a visible dashboard
footprint without making every card a saturated slab. The generated
`--gradient-bg` currently appears only in `/dev/colors`.

The July ground-journey and full-strength header-band descriptions below record
earlier versions of the app. The rules above describe the current screen.

## Why OKLCH

All generation happens in OKLCH (stored as hex — no runtime dependency on
browser `oklch()` support). Equal L = equal _perceived_ lightness across hues,
which HSL never gave us: HSL's "same lightness" made coral scream and cobalt
sulk. One tier = one L value; hue and chroma move inside it.

Two physical facts drive everything:

1. **The sRGB gamut is lopsided.** At wash lightness (L 0.88) yellow-green holds
   chroma 0.2; blue holds 0.06. So chroma targets are always
   `min(target, ceiling(L,H))` — never a fixed number across hues.
2. **The carnival threshold.** Perceived clash between two hues scales with
   chroma: ≈ 2·C·sin(Δh/2). Below C ~0.05 hue freedom is unlimited (washes can
   wander). Above C ~0.12 — bands, accents — hues must be few and related. Three
   saturated header hues was the July 19 trio; it died.

## Visual roles (October 2026)

Every theme — named or rolled — coordinates three visible roles on the
dashboard:

1. **The DESK & PAPER (Ground)**: A stable, tactile place. `.mapper-scene` sits
   on fixed warm `--surface-desk`, cards use fixed cream paper
   (`--surface-card`, `#fbf1e4`), and outlines use carbon `--line-ink`. The
   generated `--gradient-bg` feeds the theme engine and `/dev/colors`.
2. **The HEADER WASH**: On the working board, every module header wears
   `--module-header-wash` — a restrained **30% wash of `--header-band` over
   `--surface-header`**. The full solved `--header-band` (62% over `#ffefdc`)
   anchors the module rack icon and active station indicators. Headers stay
   MONO; stamped tabs and speaker spots keep their separate identity.
3. **The POP & PLATES**: The accent speaks where action meets ink —
   `--cta-plate` candy buttons (70% over band cream with dark ink), active
   checkboxes, sound dials, and chips.

Relationships live BETWEEN these layers, never inside one of them.

## The tiers (value hierarchy, desk → ink)

| Tier | Layer          | OKLCH / CSS register                                      | Rule                                                 |
| ---- | -------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| T0   | Desk ground    | `--surface-desk` (porch dawn; dev `--gradient-bg`)        | Fixed warm place; scene stays stable across rolls    |
| T1   | Shell & lines  | `--line-ink` / carbon borders                             | Tactile toybrut outlines, never stark black          |
| T2   | Card face      | `#fbf1e4` paper cream (`--surface-card`)                  | Solid stationery, never glass                        |
| T3   | Header wash    | `--module-header-wash` (30% band over `--surface-header`) | **MONO wash across card headers; tabs stay legible** |
| T4   | Chips / washes | accent 4–20% mixes                                        | Tinted accents derived from `--color-accent`         |
| T5   | CTA plates     | `--cta-plate` (accent 70% over band cream)                | Bright candy fill with dark ink, chunky border       |
| T6   | Ink            | `--ink-primary` / `--ink-secondary`                       | High-contrast ink, always passes WCAG AA             |

Saturation is a budget: T5 plates grab attention, T3 header wash anchors the
cards, T0/T2 paper stays quiet and warm, T6 ink stays razor-sharp. Nothing else
shouts.

## The CTA plate law (+Topic, mic/record, Bishop ask, btn--accent)

```css
--line-ink: color-mix(in srgb, var(--soft-black) 85%, #fff7ef); /* borders */
--cta-plate: color-mix(in srgb, var(--color-accent) 70%, #ffefdc);
--cta-plate-border: var(--line-ink);
--cta-plate-hover: color-mix(in srgb, var(--color-accent) 80%, #ffefdc);
```

CANDY PLATES (v3): primary buttons are the accent as a BRIGHT candy fill — 70%
over band cream, the header band's louder sibling — with WARM-BLACK ink and a
chunky toybrut border + hard offset shadow in `--line-ink` (the
TalkType-marigold / slideomatic move). The taste history, pinned: 72% accent +
white ink = "garish" (Jul 19); dark plates + white ink = "too dark", twice (Jul
20). Bright fill + dark ink is the pastel-punk classic. Ink-on-candy ≥ 4.5:1 is
test-pinned for every theme and 300 rolls (worst case: deep grape rolls at
4.84). Icon slabs stay COMPACT: 2.25–2.4rem visuals, 44px coarse-pointer tap
targets.

`--accent-fill` still exists for small non-button accent solids (count badges,
toggle knobs, progress). Anything button-shaped takes the plate.

## Named themes (accent + its own sky)

| Theme              | accent                       | ground journey                     |
| ------------------ | ---------------------------- | ---------------------------------- |
| DAYBREAK (default) | `#4a7bc9` cobalt             | sunrise coral→cream (the original) |
| BUBBLEGUM          | `#ff2e88` hot pink           | warm pink→rose (H 20→352)          |
| SKY                | `#0095ff` electric blue      | pool cyan→periwinkle (H 205→232)   |
| GRAPE              | `#8335ff` electric violet ⚡ | pink→lavender dusk (H 345→312)     |
| LIME               | `#0fb255` fresh green        | mint pool (H 180→203)              |
| GOLD               | `#f5a300` amber              | honey sunrise (H 58→74)            |

⚡ GRAPE was retuned July 20 from `#7c3aed` ("fresher or more neon or deeper") →
neon-electric at oklch(0.56 0.27 293). Parked alternates: deeper `#6d0ede`,
Pablo's reference electric `#7659FF` (bluer — rejected here as too close to
DAYBREAK/SKY periwinkle territory).

Ground hexes live in `themes.ts` cssVars (`--gradient-bg`, `--color-base*`)
mirrored in the FOUC map. All grounds share the WARM_BG structure: two radial
corner washes + a 168deg linear journey.

### The airy floor (Aug 20, 2026)

⚠️ **Named themes in `themes.ts` are NEVER SEEN, but they are NOT dead.**
`ThemeSwitcher` auto-rolls a `SHUFFLE` theme on mount, so nobody looks at
DAYBREAK et al., and tuning them changes nothing on screen. But `themes.ts` is
still the CRASH-SAFE DEFAULT: `ThemeSystem`'s constructor resolves
`this.currentTheme = defaultTheme || config.themes[0]` (`themeEngine.ts:46-50`),
and `loadTheme()` falls back to it whenever a saved SHUFFLE payload has a stale
`v`, malformed JSON, or a missing accent (`themeEngine.ts:130-159`). It is the
only thing between a corrupt localStorage entry and an unthemed page, and it is
the direct subject of 5 tests in `theme_contrast_test.ts`. **Do not delete it.**
(Corrected Sept 12 2026 — the previous wording said "effectively DEAD", which
contradicts line 6 of this same doc listing it as a load-bearing sync point.)

These ground knobs still feed the generated `--gradient-bg` and the dev color
lab. They no longer paint the dashboard or porch scene:

| Knob                       | Where                   | Now              |
| -------------------------- | ----------------------- | ---------------- |
| ground family hue/chroma   | `GROUND_VIBES`          | C 0.035–0.085    |
| ground lightness floor     | `generateThemeParts`    | **L 0.90–0.915** |
| **the 3 linear sky stops** | `composeTheme` `bgBase` | all track ground |

Historically, the third row was the one that mattered. `bgBase[1]` used to be
pinned at `L 0.955` on HALF chroma and `bgBase[2]` was the literal `#fff4e8`, so
whatever the dice rolled, the page washed out by 40% down and finished on a warm
cream. All three stops now derive from the ground's own L/C/hue, with lightness
still climbing toward the floor so it reads airy, not toy-solid.

`core/tests/random_theme_test.ts` guards this as a LAW, not a constant: the
floor must lift off the sky, stay under L 0.985, keep chroma ≥ 0.008, and stay
within 30° of the ground hue. (It previously asserted the literal `#fff4e8` —
i.e. the dimness was load-bearing in a test. Don't pin hexes in that file.)

## The shuffle (OKLCH curated pairs) — ⚠️ SUPERSEDED July 26, 2026

**The dice no longer deals from this table.** It rolls the NEON OFFICE generator
(see below); `CURATED_PAIRS` survives as /dev/colors lab presets only. This
section is kept as the record of what was hand-approved and why it had to change
— the census that killed it is in the NEON OFFICE section.

Historically, the dice picked between DESIGNED couples with per-pair registers
derived from the beloved anchors (Miami coral oklch(0.71 0.18 23), rebel purple
oklch(0.58 0.15 315), raspberry oklch(0.67 0.18 ~0), DAYBREAK cobalt):

| Pair             | ground hue arc | accent hue arc  | accent L  | accent C  |
| ---------------- | -------------- | --------------- | --------- | --------- |
| sunset-cobalt    | 38–60          | 246–262         | 0.58–0.63 | 0.13–0.17 |
| coral-orchid     | 30–52          | 306–322         | 0.57–0.63 | 0.17–0.22 |
| dusk-coral       | 318–336        | 27–40           | 0.66–0.71 | 0.16–0.19 |
| lagoon-coral     | 188–210        | 27–40           | 0.66–0.71 | 0.16–0.19 |
| poolside         | 183–205        | 350–366 (wraps) | 0.63–0.68 | 0.17–0.20 |
| dawn-rose        | 42–64          | 350–366         | 0.63–0.68 | 0.17–0.20 |
| vaporwave ⚡     | 292–314        | 346–360         | 0.66–0.70 | 0.21–0.24 |
| neon-office ⚡   | 196–218        | 288–300         | 0.56–0.61 | 0.24–0.27 |
| watermelon ⚡    | 162–180        | 352–368         | 0.64–0.69 | 0.19–0.22 |
| sunset-neon ⚡   | 55–75          | 330–344         | 0.62–0.66 | 0.22–0.25 |
| gum-blueberry ⚡ | 268–288        | 350–366         | 0.66–0.71 | 0.16–0.19 |

⚡ THE DARING PAIRS ("dare to be fresh and bold sometimes", July 20): same trio
law, chroma pushed to the fluoro ceiling — vaporwave is riso fluoro pink on a
lavender dusk, neon-office is electric violet over cool pool-paper. Two of eight
pairs → five of eleven after the July 20 inspo drop (watermelon = mint-dew rind
× pink flesh; sunset-neon = the hexbloop amber × magenta glow; gum-blueberry =
periwinkle-indigo sky × gum pink). Bold sometimes — just under half of rolls —
never a loosening of the cohesion rules.

- Jitter: hue uniform in arc, L ±0.02, C ±0.015 — fresh but family.
- Blues live at 246–262, never 264–275 (the OKLCH blue trap).
- Ground = two-hue journey: washes at bgHue−8 and bgHue+22, plus an accent
  whisper near the bottom; per-pair groundL/groundC (aqua families ride L 0.90 —
  the airy pool feel is a lightness fact).
- `--accent-strong/ink/fill` = same hue, C ≤ 0.15, L walked down until ≥ 4.6:1
  on card cream (doubles as AA ink and white-carrier).
- `text` = oklch(0.30 0.03 groundHue); `textSecondary` = oklch(0.52 0.025
  groundHue) — the ink belongs to the PAPER, not the accent.
- Contrast swept over 300 seeded rolls: ink/band, white/strong, strong/cream,
  ink/every-bg-layer, white/CTA-plate.

`SHUFFLE_SCHEMA_VERSION = 14` (themeEngine + FOUC script) — older rolls are
discarded on load, falling back to DAYBREAK.

## NEON OFFICE — the generator (July 26, 2026, supersedes the curated deck)

Pablo's brief: _"broader, fresher, more colours, more risk… opinionated neutral
office neon fresh."_ The curated deck couldn't deliver it, and the census said
why: **8 of the 11 pairs landed in the purple→pink arc, and cobalt — the default
theme's own accent — held a single slot.** Two accents were outright duplicates
(`#f2694c` twice, `#e45590` twice), so the real variety was ~6 colours. An
unprimed second opinion, given only the hue arcs, independently named the hole:
_"accent hue ranges missing entirely: 40–246."_ A 206° gap.

The cause was structural, not a taste slip. **A fixed accent register plus a
banned-hue list can only ever deal from the corner of the wheel that's left.**

Three sources, one recipe:

- **GROUND is always PAPER** — chroma 0.016–0.036, lifted from the Flexoki base
  ramp (`~/Documents/reference/BRAND-flexoki-palette.md`, measured at C 0.015
  h95). The room never competes with the accent. This is the "neutral office".
- **ACCENTS come from HARMONY MATH** off a base hue anywhere on the wheel —
  conversation_mapper's `ThemeRandomizerService` scheme, restored. Weighted:
  split-complementary 4, golden 4, triadic 3, double-split 3, complementary 2,
  tetradic 2, wildcard 2, analogous 1.
- **NEON comes from the gamut ceiling** — each accent rides `maxChroma()` for
  its own hue at its own **peak-vividness lightness** (`peakLightness`). This is
  the key correction: in OKLCH the chroma ceiling peaks at a different L per hue
  (yellow-green ~0.85, blue ~0.47), so one shared L register keeps hues at equal
  perceived weight but **costs them their vividness** — which is exactly what
  turned lime into khaki and left cobalt sulking.

**Two rulings deliberately reopened** (Pablo, July 26, knowingly):

1. **Green-family accents are legal again.** The old "hospital pink and green"
   veto was green _on pink/sunrise grounds_; on paper it is a different
   proposition — and `LIME #00af82` was always a named theme accent anyway.
2. **Two companion hues ride along** as `--accent-2` / `--accent-3`. The intent
   was to bring them into nodes and module chrome, but today they have no CSS
   consumers; completion confetti reads them. Speaker colors are separate
   identity colors. **Header bands stay MONO** — the duo/trio ruling survives
   intact; companions never become a second band.

**Band and plate are SOLVED, not fixed.** `solveBand()` walks the mix until the
result hits a target OKLCH lightness (band 0.755, plate 0.733 — measured as the
mean of the six hand-approved named themes, which range 0.692–0.840). The fixed
62%/70% recipes were tuned for mid-lightness accents and washed a peak-vividness
mint out to L 0.86, above every approved theme. The partner is chosen, not
assumed: cream can only lighten, so an accent already lighter than the target
darkens toward its own `--accent-strong` instead — hue kept, weight corrected.

Guards: `core/tests/random_theme_test.ts` now asserts the wheel is **covered**
(≥11 of 12 30° buckets over 300 rolls) rather than confined to arcs, that every
accent rides ≥85% of its hue's ceiling, that the ground stays paper, and that
band/plate hold their target weight.

## The lab (/dev/colors)

Dev-only tuning bench (`routes/dev/colors.tsx` + `islands/ColorLabIsland.tsx`,
needs `DENO_ENV=development`): OKLCH sliders for accent × ground drive the same
`composeTheme()` derivation the dice uses, persistence goes through the real
theme engine, and the live preview reloads through the actual FOUC path. "Copy
as pair" emits a CURATED_PAIRS entry — tune, copy, paste, done.

Since July 26 `CURATED_PAIRS` are **lab presets only** — the dice deals from the
NEON OFFICE generator, not from that list. The pairs survive as hand-approved
starting points to tune from.

The lab's iframe currently opens `/` (the static-ground porch), so the ground
sliders do not preview a changing live page surface. Its band and plate swatches
now read the solved values from `composeTheme()`.

## Standing law (inherited, still binding)

- NO red on ordinary surfaces; destructive = recession + warm rose wash.
- **Paper standard**: card interiors are `#fbf1e4` — mildly creamy, never
  white-ish (July 20; the agreed cross-app off-white).
- **Borders are `--line-ink`** (soft-black 85% over cream — warm sepia), and
  header ink leans dark: `--header-band-ink` = text 65% into soft-black (plain
  theme text read smoky/fading on the band).
- **NEVER absolute white or absolute black** — on any surface, any ink, any app
  (July 20 decree). White ink is `--surface-white-warm` (#fffef7); dark is
  `--soft-black` (#1e1714). The contrast guards assert against the warm
  near-white, not #ffffff.
- Accent-colored TEXT routes through `--accent-ink` (solved), never raw accent
  on cream (raw pastel accents score ~1.5:1 — decoration only).
- Speaker palette (`speakerColors.ts`) is theme-independent identity.
- ALL CAPS banned; FontAwesome icons only, no emoji in UI.
- Glass/backdrop-filter banned on cards; figures are solid cream.
