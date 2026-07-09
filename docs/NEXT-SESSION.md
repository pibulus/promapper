# NEXT-SESSION — state after the pastel-shuffle session (July 9, 2026, evening)

Branch `fable-audit-2026-07-05`, all committed through `a8afbd5`, gates green
(`deno fmt/lint/check/test` — 242 tests). Dev:
`DENO_ENV=development deno task dev` (8003); demo convo lives in the Playwright
browser profile, or hit ✨DEMO.

## What shipped tonight (three commits, live-tuned with Pablo)

1. **`350bbf6` pastel shuffle** — the July 9 morning brief's #1 + #2, plus
   Pablo's live feedback baked in:
   - Accents are sorbet pastels (S68–92, L78–86, hue 40–340 — no red/mud).
     Contrast lives in a per-roll deep companion solved against cream:
     `--accent-strong` / `--accent-ink` (text/borders) / `--accent-fill`
     (white-ink solids). Named themes resolve the indirections to the raw accent
     — pixel-identical to before.
   - Background re-tints per roll but ONLY inside warm families (blush coral /
     peach / apricot butter / petal pink), picking the family FARTHEST from the
     accent hue — bands play against the space (sky→peach, pink→butter,
     mint→petal). Pastelized accent glow bottom corner; never pigment-mix
     complementary pastels (grey).
   - ONE font: Plus Jakarta Sans everywhere (`--font-mono` aliases it; one line
     to flip back). Card headers 600/0.07em/13px — cozy caps.
2. **`54bc233` summary + footer + drawer + tooltips** — paragraphizer breaks
   wall-of-text summaries into 2-sentence beats (honorific-safe, structured
   summaries pass through; `utils/summaryFormat.ts` + 5 tests); footer is a
   hairline sign-off (dock padding moved off `<main>`); history drawer ✕/☆/🗑️ →
   FontAwesome; done-divider gone (bulk clear = Overview back); tooltips escape
   stacking traps (footer context removed, card-header tips right-anchored,
   `:has()` card lift).
3. **`a8afbd5` history in the header** — landing page's floating History pill
   (collided with footer dials) replaced by a header-icon-btn in the landing
   header.

## For the next session

- **Pablo's eyeball pass**: roll the dice a bunch — kill any family pairing that
  reads yucky (WARM_FAMILIES + the pairing rule live in
  core/theme/randomTheme.ts, trivially tunable). Judge gold-hue strongs (deep
  amber can lean olive) and the summary lead-paragraph treatment.
- **Real-device iPhone QA still virgin** (NEXT-STEPS §1 — dock, IDB persistence,
  safe-area). The recording dock did NOT render in headless Playwright
  (dockInDom: false even with a conversation open) — possibly just missing
  MediaRecorder in headless; verify on a real device first.
- NEXT-STEPS §0 taste calls still parked (node glow colors, ✨ chip ruling,
  export drawer bottom-sheet, "None" date chip).
- History drawer's topic/item count chips are raw blue/green — pre-existing
  palette-law violation, untouched tonight; candidate for an accent-tint pass.
- HORIZON.md offline stages unchanged.
