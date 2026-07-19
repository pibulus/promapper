# ProMapper Color System Pass — the brief

ultrathink. This is a dedicated, independent color-theory pass on ProMapper
(`~/Projects/active/apps/promapper`, Deno Fresh, run `deno task dev` →
localhost:8003, screenshot with the Playwright MCP browser as you iterate).
The colours and shades have been an ongoing "not there yet" for weeks — your
whole job tonight is to fix that at the SYSTEM level, not spot-patch hexes.

## Pablo's verdict on the current state (July 19)

- The July 19 "faceplate trio" (three rotating header-band hues per theme —
  `--band-hue-b/c` in styles.css/themes.ts/_app.tsx/randomTheme.ts) is
  OVERRULED: "too many header colours, not relative to each other." Headers
  should be **ONE colour — or at most TWO colours that sit close to each
  other** (near-neighbours, not a carnival). Rip the trio out or collapse it;
  your call how, but the multi-hue header rotation dies.
- The **"+ Topic" button and the mic/ask buttons are too garish and the
  colours are wrong** (saturated cobalt slabs floating on cream — they
  currently read as a different, louder species than everything around them).
- The theme SHUFFLE must survive: randomised palettes have to "work
  together" — a system of colour relations that generates cohesion, not a
  lottery of unrelated hues.
- Keep the **airy light** ground (the warm sky→cream wash is loved — don't
  make it heavy). What's wanted on top: "fresh colour palettes… pastel fluro
  fresh, juicy, not too childish or too wafty… not the usual boring garish
  shades of office software… neo-brutalist style shades and dynamics."

## Research phase (do this BEFORE touching code)

Study how these actually handle colour — pull values, ratios, and relation
rules, not vibes:

1. `~/Projects/active/apps/juicy-themes` — Pablo's theme app; it has a whole
   `theme-system/` directory. This is likely the closest statement of the
   palette taste you're aiming for.
2. `~/Projects/active/apps/conversation_mapper` — the ORIGINAL mapper.
   `src/lib/services/ThemeRandomizerService.js` generates harmony-weighted
   OKLCH palettes (harmony weights in `src/lib/config/themeConfig.js`:
   monochromatic/analogous/complementary/triadic/golden…), regenerates a mesh
   gradient per theme, and snaps to the nearest DaisyUI theme. Its randomiser
   is the proof-of-concept for "shuffle that stays related."
3. `~/Projects/active/experiments/slideomatic` — check its palette/theme
   handling.
4. `~/Documents/reference/` — read `BRAND-design-reference.md`,
   `BRAND-visual-philosophy.md`, `VISUAL-design-principles-extracted.md`,
   `CORE-design-philosophy.md` (start at `INDEX.md` if you want the map).
5. In-repo: `core/theme/` (themes.ts, randomTheme.ts, themeEngine.ts),
   `static/styles.css` tokens (`--header-band`, `--accent-*`, `--band-*`),
   `routes/_app.tsx` FOUC map, and the memory files
   `promapper-visual-language` + `promapper-ziplist-design-borrow`.

## Think hard about colour theory before designing

Work in OKLCH (perceptually honest lightness — this is what makes "same
tint level" actually look same). Decide explicit answers to:

- **Value hierarchy**: which lightness/chroma tier does each layer live on?
  (ground wash / shell / card face / header band / chips / CTAs / ink).
  Neo-brutalist dynamics = a calm low-chroma field + warm-black 2px lines +
  a SMALL number of saturated pops with hard shadows — saturation is a
  spending decision, and right now the app overspends (headers × 3 hues +
  cobalt slab buttons all shouting at once).
- **Relation rule for headers**: one hue for all bands, or two
  near-neighbours (e.g. ±15–25° hue, same L/C). Define it as a RULE so the
  shuffle can generate it, then hand-tune the named themes with it.
- **Button temperature**: the +Topic / mic / ask CTAs need to belong to the
  palette — juicy, not garish. Consider: same hue as the accent family but
  tuned chroma/lightness, or the warm-black slab treatment with a coloured
  edge — whatever you choose, derive it from the system.
- **The pastel-fluoro trick**: fresh ≠ washed. High lightness + meaningful
  chroma (the fluoro edge) on small areas; big areas stay near-cream. Study
  how juicy-themes walks that line.

## Hard constraints (law, not taste)

- NO red anywhere on ordinary surfaces; destructive = recession + warm rose
  (see `promapper-visual-language` memory + styles.css comments).
- The warm airy ground/gradient stays light (tune, don't replace with
  heaviness).
- Person-colours on action-item checkboxes and warm-ink map edges keep
  working (they derive from theme vars — verify after changes).
- FOUR sync points must stay in sync or first-paint flashes wrong:
  `static/styles.css` :root, `core/theme/themes.ts`, `routes/_app.tsx` FOUC
  map, `core/theme/randomTheme.ts` (shuffle). If you change the token shape,
  change all four (docs/MODULES.md § Faceplates documents this).
- `deno task check` + `deno task test` (277) green; commit straight to main
  with Pablo's emoji style (`feat: ✨` / `style: 💅` …).

## Deliverables

1. A written palette/relation system (put it in `docs/COLOR-SYSTEM.md`):
   the tiers, the rules, the named-theme palettes, and the shuffle
   generation rules — short enough to be law, concrete enough to code from.
2. Implementation across the four sync points: named themes rebuilt on the
   system, shuffle regenerating within it, header-band rule (one hue or two
   near-neighbours), CTA/mic/+Topic buttons brought into the family.
3. Before/after screenshots at 1440px (default DAYBREAK + 2–3 shuffle
   rolls) sent to Pablo — he holds taste veto; park close calls as options
   with one-line flips rather than deciding silently.
4. Update the `promapper-visual-language` memory with the new system's core
   rules so future sessions style inside it.
