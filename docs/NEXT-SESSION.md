# NEXT-SESSION — Pablo's design brief (July 9, 2026, ~04:30)

Read this + `docs/HORIZON.md` + `docs/NEXT-STEPS.md` + CLAUDE.md "July 9"
section. Branch `fable-audit-2026-07-05`, all committed through `02d5a27`, gates
green (`deno fmt/lint/check/test` — 232 tests). Dev:
`DENO_ENV=development deno task dev` (8003); demo convo lives in the Playwright
browser profile, or hit ✨DEMO. Verify EVERY visual change with Playwright
screenshots (desktop 1280 + mobile 390), and check a few dice rolls per change.
Be smart and exploratory — this doc is context, not a cage. Commit in small
rounds like tonight.

## 1. THE COLORS ARE WRONG (top priority — Pablo's words)

The theme shuffler (core/theme/randomTheme.ts) currently rolls saturated
mid-lightness accents from hue 210–345. Pablo: "garish, dark, business,
depressing." The target: **airy pastel, whimsical, fresh, lush — a space, not an
office product.**

- Go STUDY the beloved colors first: `~/Documents/reference/INDEX.md` → BRAND-*
  docs; and the donor apps' CSS: `~/Projects/active/apps/conversation_mapper`
  (its bg gradients were "confident peach→coral / pink→lavender" per the
  visual-language memory) and `~/Projects/active/apps/project_mapper`.
- The shuffle must ALSO re-tint the app background gradient. `WARM_BG` in
  core/theme/themes.ts is a shared constant (peach wash) — generate a
  hue-shifted version per roll (keep it warm/light; think peach→coral,
  pink→lavender, mint→sky families).
- Pastel accents break the current contrast scheme (white-on-accent dies).
  Rework: accents can be pastel for SURFACES (bands, washes, bg) with a DERIVED
  deeper companion for text-bearing elements (--accent-strong already exists for
  exactly this — maybe derive it harder, e.g. mix 55%, or generate a second deep
  tone per roll). Update core/tests/random_theme_test.ts to the new scheme —
  keep the 300-roll seeded contrast sweep as the guard, it caught real failures
  tonight.
- Show, don't guess: roll ~6 themes, screenshot each, judge against "lush fresh
  airy space." The visual-language memory's process rule: Pablo has the taste —
  when in doubt, present side-by-sides.

## 2. FONT: revert to sans for text, headers as before

Tonight's "one font" call (JetBrains Mono everywhere) is overruled for body
text. Wanted: a tasteful SANS-SERIF for text/prose/summary, headers back to how
they were BEFORE commit 56e0448 (they were the sans uppercase style), mono can
stay for machine-text (transcript/tasks) — check with a screenshot whether mono
tasks still feel right against sans prose, use judgment. The change is in
static/styles.css: `--font-family` (line ~71, currently JetBrains) + the Google
Fonts @import on line 1. Inter was the previous sans; feel free to propose
better (readability first).

## 3. Smaller strikes

- **Footer "a bit wack"**: rework `.app-footer` + its HomeIsland markup. Keep
  the dials idea (dice/sound/shortcuts) but present better. Look at talktype's
  footer again for polish cues.
- **Kill the done-divider**: the `── ✓1 🧹 ──` row between pending and done
  items (ActionItemsCard "Done divider") — remove it entirely. Done items
  already fade hard; decide where "clear done" lives instead (Overview back
  already has it — maybe that's enough).
- **Tooltips must layer above everything**: [data-tip]::before/::after
  (styles.css ~line 742) get clipped/covered — header and footer create stacking
  contexts (backdrop-filter!), so z-index inside them can't beat sibling cards.
  Likely fix: raise the header/footer element z-index, not the tooltip's. Verify
  on card headers too.

## 4. Context for the exploratory soul

- Tonight's arc: four-zone audit → live drill (3 launch bugs) → compression
  rounds → speaker colors → theme shuffle + footer + one-font. Read the commit
  log from `27be89f` to `02d5a27` — messages are detailed.
- Known parked items: NEXT-STEPS §0 taste calls, §6 donor shelf
  (all-action-items page, summary regenerate...), HORIZON.md offline stages (Pi
  = home cloud thesis; whisperX for diarization).
- gh-stars sweep results are in HORIZON.md; nothing else stood out beyond what's
  listed (audioMotion-analyzer waveform juice is the fun one).
- Real-device iPhone QA still virgin territory (NEXT-STEPS §1).
- Memories to respect: promapper-visual-language (NO red; show options, don't
  invent taste), promapper-test-data-voice (no corporate cosplay),
  promapper-signals-alias-gotcha (@signals/ imports only).
- The shuffle persistence + FOUC path handles custom themes (themeEngine.ts
  SHUFFLE branches + routes/_app.tsx inline script) — background-gradient
  changes must flow through BOTH (applyTheme cssVars and the saved vars map), or
  first-paint will flash the old wash.
