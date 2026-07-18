# Costs, limits, and the self-checkoff — design thinking (2026-07-18)

A sit-down think, grounded in the actual code (`core/ai/prompts.ts` checkoff
prompt, `core/ai/helpers.ts` parser, `services/requestGuard.ts`) and live
OpenRouter prices checked the same day. Two topics, one underlying question:
what does a careless user cost, and does the magic still work?

## 1. The self-checkoff

**State**: pending items + NEW transcript text → flash-lite → JSON status flips
with reasons. Parsing is defensive (unknown ids dropped, bad JSON → empty
array). Merge stamps `ai_checked` + `checked_reason`; ✨ chip + undo exist.
Plumbing: solid. Model knob: `OPENROUTER_STATUS_MODEL` (default = general
flash-lite — deliberate, it runs every append + every 30s live round).

**The real risk is error asymmetry, and the prompt doesn't know it.**

- Missed checkoff → user taps it themselves. Cheap.
- FALSE checkoff → a real task hides in the done drawer. The worst failure the
  app can have. The live loop rolls these dice every 30s against ambiguous
  chatter ("we talked about the pig thing" ≠ it's done).
- The current prompt is neutral ("determine if any have been completed") — a
  cheap model with a neutral prompt is an eager matcher.

**Plan (in order):**

1. **Precision-biased prompt rewrite (free, biggest lever).** Flip a status only
   when the words say the work HAPPENED (past tense, "done", "fixed", "sent it")
   — never because it was discussed, planned, or intended. When unsure, return
   []. Also: only flip completed→pending when the words clearly say it turned
   out NOT done.
2. **Checkoff eval script** (`scripts/` or a deno task): ~12–20 fixture
   utterances in the app's weird-human voice with expected flips, run against
   the live API (~1¢/run). Decides flash-lite vs Haiku with evidence. Front-load
   the pain; flip the knob only if the data says so.
3. Model stays flash-lite until (2) says otherwise. Haiku on checkoff would be
   ~18¢/meeting-hour vs ~4¢ — affordable, but only pay it for proven quality.

## 2. Costs per unit (live-checked prices, 2026-07-18)

| Thing                                                                                                     | Cost                         |
| --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Meeting-hour, all-in (transcription ~115K audio tokens on flash-latest + live-analysis rounds + checkoff) | ~25–35¢                      |
| One append (5 min voice note, full analysis)                                                              | ~3–5¢                        |
| One Bishop question (Haiku, ~20K context)                                                                 | ~2¢                          |
| One export (Haiku)                                                                                        | ~1–2¢                        |
| Heavy $9 subscriber (20 meeting-hrs/mo)                                                                   | ~$5 worst case, $1–2 typical |

Margin works without cleverness. The unit that bounds everything is **audio
minutes** — meter those, the rest follows.

## 3. Free tier: limit QUANTITY, never quality

Pushback on the earlier "free = flash-lite only" sketch: the demo IS the funnel,
the quality delta costs fractions of a cent, and a degraded first impression is
the most expensive thing on this page. Instead:

- Free: ~5 saved conversations, ~10 min audio/day, no live rooms, full model
  quality, self-checkoff INCLUDED (it's the hook). Export: fine to allow a taste
  (a few total) — it's pennies.
- $9/mo: everything, with a fair-use ceiling (~20 audio-hrs/mo) documented but
  not aggressively enforced.

## 4. Enforcement without an accounts system

Three layers, simplest-first — "can't scale IS the feature" helps here:

1. **OpenRouter provisioned-key spend cap (ZERO code).** A monthly $ ceiling on
   the key itself. No bug, abuser, or runaway loop can exceed it. The single
   highest-value item on this page. Pablo action: create the capped key in the
   OpenRouter console, keys-sync it.
2. **Make the existing guard honest.** The 60/min in-memory limiter WORKS on a
   long-lived process (Pi deploy, like the fleet) — the "broken on Deno Deploy"
   caveat only bites there. Add a second DAILY per-IP ledger (same Map pattern,
   24h window, ~200 AI calls/day) so patient scrapers can't ride under the burst
   limit forever.
3. **License key instead of accounts.** Gumroad/LemonSqueezy-style key, pasted
   once, localStorage, validated server-side on the expensive routes
   (`/api/live/*`; audio minutes past the free allowance). Free limits keyed on
   device-id + IP — resettable by a determined nerd, and that's acceptable:
   layers 1–2 bound the damage.

## Next moves (when ready to build)

- [x] Checkoff prompt rewrite + eval fixture script — DONE 2026-07-18.
      **Verdict: precision-prompted flash-lite went 14/14 clean (zero false
      positives); Haiku 13/14 (its one miss a harmless pending→pending no-op).
      The knob stays on flash-lite, by evidence.** Re-run any time:
      `deno task eval:checkoff`. Bonus: the eval exposed a real parser bug
      (fenced JSON + trailing explanation prose lost ALL results down every JSON
      path) — fixed in cleanJsonResponse, plus a merge guard so no-op flips
      can't stamp phantom ai_checked sparkles.
- [x] Daily per-IP ledger — DONE 2026-07-18. `API_DAILY_LIMIT` (default 1000
      calls/day — one meeting-hour is ~300, so honest use never touches it; 0
      disables). Pure core in `services/windowBudget.ts`.
- [ ] OpenRouter spend-capped key (Pablo, console, 5 minutes)
- [x] Audio budget meter — DONE 2026-07-18, wired into /api/process,
      /api/append, /api/live/chunk. Metered in BYTES (exact, no codec guessing —
      ~12KB/s opus, 10 min ≈ 7MB). `AUDIO_BYTES_PER_DAY` ships 0 (DISABLED) —
      flipping the free tier on at launch is one env var. Keyed per IP today;
      add the device-id half when the license-key work lands.
- [ ] License-key check for /api/live/* (pairs with the PartyKit deploy)
