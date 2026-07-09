# NEXT-SESSION — after the color-contract marathon (July 9, 2026, late)

Branch `fable-audit-2026-07-05`, committed through `2dc898a`, gates green (243
tests, check + build pass). Dev: `DENO_ENV=development deno task dev` (8003).
Read the promapper-visual-language memory FIRST — it now carries the definitive
color contract, live-tuned through five rounds of Pablo feedback.

## Where the design system landed (commits 350bbf6 → 2dc898a)

- **"Pastel backgrounds with punk accents"** (Pablo's BRAND doc, now law):
  saturated light grounds (S80–100 L79–87), saturated MID-TONE accents (S68–92
  L54–64). The dice picks between 7 CURATED_PAIRS in core/theme/randomTheme.ts —
  designed couples only, no random hue math. Banned: mint/green accents (teal
  ok), yellow, baby pink, butter grounds.
- One recipe set: 55% header hats, solved deep companions
  (--accent-ink/--accent-fill/--accent-strong), same statics for named themes +
  rolls. SHUFFLE_SCHEMA_VERSION=4 kills stale saved rolls.
- Inter everywhere; ALL CAPS banned app-wide; summary paragraphizer; chip-only
  tooltips (::after = touch boxes; NO blanket 44px mobile rule); footer =
  full-bleed sticky chrome; mobile header two-row lockup; mobile action items
  compacted (28px checkbox, no drag handle, 2-line wrap).

## For the next session

- **Pablo's pair audit**: roll the dice a lot; kill/tune any CURATED_PAIRS entry
  that misses (each is 1 line). Candidates to consider adding: peach × raspberry
  (the miner's "Peach Cream × Raspberry" — historic default vibe).
- The named themes (BUBBLEGUM/SKY/GRAPE/LIME/GOLD) predate the pair system —
  LIME + GOLD accents likely violate the new taste law; consider re-curating the
  named list to match the pairs (FOUC map must mirror).
- Tooltips on in-scroll-area controls (item corner buttons) still native title=
  on purpose (chips would clip in overflow) — fine unless Pablo says otherwise.
- Real-device iPhone QA still virgin (NEXT-STEPS §1) + dock never renders in
  headless Playwright (likely MediaRecorder missing).
- Playwright note: if screenshots hang "waiting for fonts" with rAF frozen, the
  browser compositor is wedged — browser_close + reopen fixes it.
- Tone-mining workflow results (60 exact hexes from donor apps) are in the
  wf_060f9840-718 journal if more pairs are wanted.
