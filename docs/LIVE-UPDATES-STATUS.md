# Live Updates — Status (2026-07-18, branch `fable-live-updates-2026-07-18`)

## What shipped

The debounced live-analysis loop: during a live session the node map, action
items, and summary now update AS the meeting is spoken, not only on explicit
append. Design + full pipeline trace in `docs/LIVE-UPDATES-PLAN.md`.

**New files**

- `core/orchestration/live-analysis-policy.ts` — pure trigger policy: every 3
  chunks OR 90s of waiting text, 30s cooldown, 200-char minimum, 80-char
  end-of-recording flush floor. Mirrors the whiteboard auto-draw guards.
- `routes/api/live/analyze.ts` — text-in analysis endpoint. Chunks are already
  transcribed by `/api/live/chunk`, so this takes accumulated text (no second
  transcription bill), runs full analysis + status self-checkoff, merges like
  `/api/append` (transcript concat, summary update-marker, `mergeAppend*`),
  echoes the existing title (no mid-meeting renames). `roomId` supported for
  the server-push path but unused by the in-app loop.
- `signals/liveAnalysis.ts` — the stateful loop: accumulate chunk text →
  policy check (plus a 5s ticker for the time leg) → `enqueueApiRequest`
  (serialized against explicit appends) → `coerceFlowResult` →
  `reconcileAppendResult` → `conversationData`. liveSync's outbound effect
  broadcasts the update to viewers. Failed rounds put the text back in the
  buffer. Silent by design — the cards updating is the feedback.
- `services/appendParsing.ts` — `parseExisting*` input-hygiene helpers
  extracted from `/api/append` so both routes share one set of caps.

**Changed files**

- `islands/HomeIsland.tsx` — three call sites: `sendChunk()` success →
  `noteLiveChunk()` (host-only by construction — the record button is
  host-gated); `stopRecording()` → fire-and-forget `flushLiveAnalysis()`;
  live-session teardown → `resetLiveAnalysis()`.
- `core/orchestration/conversation-flow.ts` — `processLiveText()` (analysis
  without title generation) + shared `mapAnalysis()` helper so it can't drift
  from `processText()`.
- `core/orchestration/append-merge.ts` — `mergeAppendSummary()` extracted;
  both routes use it. Bonus fix: short/lightweight appends returned an empty
  summary and `/api/append` passed that through, blanking the existing
  summary client-side (server owns summary in reconcile). Now an empty new
  summary leaves the existing one untouched.
- `routes/api/append.ts` — uses the shared parsers + summary merge (net −160
  lines, behavior identical except the blank-summary fix).

## Verification

- `deno test --no-check --allow-env --allow-read core/tests/` — **261 passed**
  (was 245: +13 trigger-policy tests, +3 summary-merge tests).
- `deno task build` — passes; `/api/live/analyze` registered in `fresh.gen.ts`.
- `deno check` on all new/changed files — the only errors are the 4
  pre-existing ones (`toast.ts` ×2, `authSessions.ts`, `localStorage.ts` —
  the known `Timeout` drift, confirmed identical on the unmodified tree).
  Nothing new introduced.
- `deno lint` + `deno fmt` clean on all new files.

## Not yet verified (deploy dependency)

- **Broadcast-to-viewers end to end**: the PartyKit worker is NOT deployed
  (zone full — `docs/FABLE-PARTYKIT-DEEPDIVE.md`). The viewer half rides the
  existing, already-working `conversation_update` channel unchanged, but a
  real two-browser session against a deployed (or `partykit dev`) worker is
  owed once hosting lands.
- **A real spoken meeting** through the loop (mic → chunks → analysis rounds
  → dashboard growth) — needs a live room, same dependency. The trigger
  logic itself is fully unit-tested.
- Standing real-device QA list from July 6/9/10 still applies.

## Tuning knobs

All constants live in `core/orchestration/live-analysis-policy.ts` with
comments. Raise `LIVE_ANALYSIS_COOLDOWN_MS` to cut model spend; lower
`LIVE_ANALYSIS_MAX_WAIT_MS` for snappier updates in slow conversations.
