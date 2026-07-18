# Live Updates — Plan (2026-07-18, branch `fable-live-updates-2026-07-18`)

Goal: the node map + action items + summary update AS the meeting is spoken, not
only on explicit append. This doc is the pipeline trace + the design, written
before coding.

## What the live pipeline actually does today (traced)

1. **Recording** — `islands/HomeIsland.tsx`. Host-only (the record button
   renders behind `session.isHost` — one room, one mic). `useRecorder` +
   silence-aware chunking (AudioContext RMS; flush on silence or `MAX_CHUNK_MS`)
   → `sendChunk()` POSTs the blob to `/api/live/chunk`.
2. **Chunk transcription** — `routes/api/live/chunk.ts`. Transcribes JUST that
   chunk (15s timeout, no analysis) and returns `{text, speakers}`.
3. **Chunk fan-out** — back in `sendChunk()`: the text lands in the
   `liveTranscript` signal (side panel, last 20 chunks) and goes to the room via
   `sendTranscriptChunk()` (`transcript_chunk` message). Viewers receive it in
   `startLiveSync`'s `onTranscriptChunk`, append to their own panel, and poke
   `globalThis.__onTranscriptChunk`.
4. **Auto-draw precedent** — `islands/DashboardIsland.tsx` registers
   `__onTranscriptChunk`: every `AUTO_DRAW_EVERY = 3` chunks, cooldown
   `AUTO_DRAW_COOLDOWN_MS = 30_000`, skip if <200 new transcript chars → silent
   whiteboard draw. This is the exact trigger shape to mirror.
5. **Analysis** — `routes/api/append.ts` only. Full pipeline (`processAudio` →
   `analyzeText`), `SHORT_APPEND_THRESHOLD` skips topics/summary under 500
   chars, then `mergeAppendActionItems/Nodes/Edges`
   - summary update-marker merge, then `pushResultToRoom(roomId)`.

### Two load-bearing discoveries

- **Live chunk text never reaches `conversationData`.** It lives in the
  `liveTranscript` panel and the room relay, then evaporates. Nothing merges it
  into the conversation's transcript. (Side effect: the auto-draw "min 200 new
  chars" guard reads `conversationData.transcript`, which doesn't grow during a
  live session — so auto-draw effectively re-arms only after explicit appends.
  The new loop keeps its own accumulator instead.)
- **`AudioRecorder` deliberately does NOT send `roomId` to `/api/append`**
  (audit Finding 3): the initiator applies the result locally
  (`coerceFlowResult` → `reconcileAppendResult` → `conversationData.value =`)
  and the liveSync outbound effect broadcasts ONE `conversation_update` to the
  room. Sending roomId too would double-write (server push + client sync) and
  open a clobber window. The live-analysis loop follows the same pattern.

## Design

### New pieces

1. **`core/orchestration/live-analysis-policy.ts`** — pure, framework-free
   trigger policy (the auto-draw guards, testable):
   - `LIVE_ANALYSIS_EVERY = 3` chunks (mirror `AUTO_DRAW_EVERY`)
   - `LIVE_ANALYSIS_COOLDOWN_MS = 30_000` (mirror `AUTO_DRAW_COOLDOWN_MS`)
   - `LIVE_ANALYSIS_MIN_NEW_CHARS = 200` (mirror the auto-draw skip)
   - `LIVE_ANALYSIS_MAX_WAIT_MS = 90_000` — the "OR M seconds" leg: if enough
     text has been waiting this long (slow talkers, chunk counter never hits N),
     run anyway.
   - `shouldRunLiveAnalysis(state, now)` — the whole decision in one pure
     function. Unit-tested in `core/tests/live_analysis_policy_test.ts`.

2. **`routes/api/live/analyze.ts`** — text-in analysis endpoint. The chunks are
   ALREADY transcribed, so re-sending audio would pay for transcription twice;
   this endpoint takes accumulated text. JSON body:
   `{ conversationId, newText, speakers?, existingTranscript?,
   existingActionItems?, existingNodes?, existingEdges?, existingSummary?,
   existingTitle?, roomId? }`.
   Same guard, caps, and merge steps as `/api/append` (transcript concat,
   summary update-marker, `mergeAppend*`), minus transcription and minus title
   generation (a live loop must not rename the conversation every 30s —
   `existingTitle` is echoed back). `roomId` supported for parity (server push
   via `pushResultToRoom`) but the in-app loop omits it per Finding 3 above.

3. **`processLiveText()`** in `core/orchestration/conversation-flow.ts` —
   `analyzeText` + result mapping, no title call. The node/edge/action mapping
   is extracted into a shared helper so `processText` and `processLiveText`
   can't drift.

4. **`services/appendParsing.ts`** — the `parseExisting*`/sanitize helpers move
   out of `routes/api/append.ts` so both routes share one set of input-hygiene
   caps (no copy-paste divergence).

5. **`signals/liveAnalysis.ts`** — the client loop. Module state: `pendingText`,
   `pendingSpeakers`, `chunkCount`, `lastRunAt`, `oldestPendingAt`, `inFlight`,
   plus a 5s ticker for the time leg.
   - `noteLiveChunk(text, speakers)` — accumulate, then consult the policy.
   - `flushLiveAnalysis()` — end-of-recording tail run (low floor, skips
     cooldown — stopping is intentional).
   - `resetLiveAnalysis()` — session teardown.
   - A run: splice the pending buffer (restored on failure), snapshot
     `conversationData` as base, `enqueueApiRequest` (serializes against
     explicit appends — no race), POST `/api/live/analyze`, `coerceFlowResult` →
     `reconcileAppendResult(base, current, result)` →
     `conversationData.value =`. liveSync broadcasts to viewers. Silent — the
     dashboard updating IS the feedback; errors log to console and the text goes
     back in the buffer for the next round.

### Wiring (`islands/HomeIsland.tsx`, 3 call sites)

- `sendChunk()` success → `noteLiveChunk(text, speakers)`. Host-only for free
  (the button is host-gated), and it's the same moment `sendTranscriptChunk`
  fires.
- `stopRecording()` → `void flushLiveAnalysis()` (fire-and-forget; don't delay
  the stop UX on a model round-trip).
- Live-session effect teardown → `resetLiveAnalysis()`.

### Why the host runs it (not the server, not viewers)

The host is the only one with the chunk stream AND the authoritative
`conversationData` + liveSync outbound channel. Server-side triggering would
need the room to own conversation state it currently only relays. Viewers
triggering would mean N copies of every analysis.

### Cost shape

Worst case one analysis per 30s of continuous talk; silence produces no chunks →
no runs; sub-200-char rounds are skipped; the 90s leg only fires when there's
real accumulated text. Status self-checkoff rides along (`analyzeText` gets
`existingActionItems`).

### Deploy dependency

PartyKit worker is NOT deployed (zone full — `docs/FABLE-PARTYKIT-DEEPDIVE.md`),
so broadcast-to-viewers can't be live-tested end to end. Everything here is
exercised locally via `partykit dev` semantics + unit tests on the policy and
merge logic; the viewer-side path reuses the already-working
`conversation_update` channel unchanged.
