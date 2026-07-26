# Audit pass 02 — live collaboration

You are auditing ProMapper, a Deno Fresh + Preact app that turns messy audio and
text into a living project map. Read `CLAUDE.md` at the repo root first.

**Report only. Do not modify any file.**

## Why this subsystem

One person opens a room, everyone joins by link, they talk, and the map grows
for the whole room in real time. It is the hardest part of the app to test by
hand — it needs two browsers, a live worker, and a microphone — which is exactly
why bugs survive here. A three-round audit on 2026-07-26 found **six RED bugs**
in this path.

It also carries a structural hazard: **three hand-synced copies of the same
sanitizer**, because neither the Cloudflare nor the PartyKit bundler can read
Deno's import map. That constraint is real. The danger is the copies drifting.

## The owner's goal

_"I don't want to touch this thing again after I release it."_ No deadline, no
race. Durability over speed — but don't invent work.

## Scope

```
signals/liveSync.ts               inbound/outbound sync, the loopback guard
signals/liveAnalysis.ts           the background analysis loop + its buffer
signals/liveSessionStore.ts       session identity, isHost
signals/partyService.ts           the socket
signals/partyConnectionStore.ts
signals/presenceStore.ts          who's in the room
signals/conversationStore.ts      applyRemoteConversation, autosave, undo
islands/HomeIsland.tsx            live recording, chunk flush, silence monitor
islands/DashboardIsland.tsx       pagehide flush, whiteboard scene writes
islands/ShareButton.tsx           room creation
routes/api/live/*.ts              create, chunk, analyze, voice-token
routes/live/[roomId].tsx
services/partyUpdates.ts          server → room push
services/collabHost.ts            WHICH worker is live — read this first
workers/collab/src/index.ts       the LIVE Durable Object worker
workers/collab/src/conversationProtocol.ts   the LIVE sanitizer
party/conversationProtocol.ts     the DEAD PartyKit copy
core/realtime/shareProtocol.ts    the canonical shape
```

## Read this before anything else

`services/collabHost.ts` documents that PartyKit's shared zone permanently hit
Cloudflare's 10,000-custom-domains limit, so **PartyKit deploys can never
succeed again**. Live collab runs on plain Durable Objects in `workers/collab/`.

`party/` is a documented dead end. Historically it was also where every fix
landed — merge memory, delete memory, the ghost-presence fix — and the test
suite imported it too, so the suite stayed green while the live worker drifted
for six days. There is now a behaviour-diff guard in
`core/tests/party_sanitizer_test.ts`. **Verify that guard actually still
compares the live worker**, and check whether any NEW divergence has appeared.

## The invariants that must hold

1. **The room never destroys what it doesn't know about.** The sanitizer emits
   `{conversation, transcript, nodes, edges, actionItems, statusUpdates,
   summary}`
   and nothing else. Every other field on `ConversationData` is client-only and
   must survive an inbound frame.
2. **The host's own INIT is an inbound frame.** Anything that breaks on remote
   data breaks on the host's very first frame, before a guest exists.
3. **No echo storms.** An inbound update must not trigger an outbound one. The
   loopback guard must be airtight in both directions — and must not swallow a
   legitimate _local_ edit.
4. **Sanitizer copies agree on behaviour.** Formatting may differ; output must
   not. `aliases` (merge memory) and `statusUpdates` are the two that drifted.
5. **A round that outlives its conversation is discarded, not applied.** The
   analysis round trip runs up to 65s.
6. **Leaving a room leaves nothing behind.** Buffers, presence, tickers,
   sockets, identity, the analysis text buffer.
7. **Untrusted input stays untrusted.** Peers control the conversation title,
   node labels, action descriptions. AI output is untrusted too.
8. **A meeting is not lost by closing the tab.** Persisting is right for the
   HOST; a guest should not silently acquire a copy of someone else's room.

## Hunt these specifically

- **Reconnection.** Backoff and its cap. Can a flappy tab clobber a room that
  moved on? Does the rev/arbitration machinery actually get to vote before the
  local snapshot is flushed?
- **Two people, one item, same moment.** What actually happens? Last-write-wins
  is acceptable if it's _deliberate_; silent loss of one edit is not.
- **Presence.** Is identity stable across a reconnect, or minted fresh? A
  dropped tab that leaves a ghost, or a flappy one that duplicates itself.
- **Room expiry mid-session** (24h after last activity). What does the client do
  when the room it's talking to is gone?
- **Chunk ordering and loss.** Responses applied in completion order scramble a
  transcript. Audio removed from the buffer before a request is unrecoverable if
  the request fails.
- **The MediaRecorder container problem.** MediaRecorder writes the container
  header (WebM EBML/Segment, MP4 ftyp/moov) into its FIRST `dataavailable` blob
  only. Slicing chunks out of a running recording produces fragments no decoder
  accepts. Verify the current rotation approach still holds this property —
  **and if you can run a browser, prove it** with a synthetic `AudioContext` →
  `MediaStreamDestination` → `MediaRecorder` and `decodeAudioData` on each
  flush. That measurement found the bug and then validated the fix; it takes
  about ten minutes and beats any argument.
- **The whiteboard.** Scene writes are debounced; the tab can close
  mid-debounce.
- **Anything gated on `isViewingShared`.** It is set for a whole live session,
  so it silently disables anything it guards for the entire meeting.

## Already found and fixed — do NOT re-report

- Live chunk audio spliced out of the buffer before the fetch and never
  restored; no in-flight latch; responses applied in completion order; the
  silence flush not latching `lastSpeechRef` (a request roughly twice a second
  in a quiet room); the Stop button disabled during every upload.
- Headerless fragments after the first flush — fixed by rotating the recorder.
- `/api/live/create` receiving a double-nested envelope, so the room seeded
  itself with transcript only and the host's INIT wiped their own map.
- The live worker stripping node `aliases` and passing `statusUpdates`
  unsanitized; the tests pointing at `party/`.
- `applyRemoteConversation` erasing all five client-only fields.
- A live-analysis round landing on whatever conversation was open on return.
- Live meetings never persisted (host now exempt from the pagehide guard).
- XSS via the conversation title in the node map's PNG export.

## Known-deliberate — never report as bugs

- The three sanitizer copies exist because the bundlers can't read Deno's import
  map. The duplication is deliberate; only _drift_ is a bug.
- `deno check` excludes `party/` (it imports an npm-only type).
- Room id is the secret — there are no passwords by design.
- Commits go straight to `main`; `deno.lock` disabled; no Deploy build step.

## Rules for findings

- Cite `file:line` and **quote the actual code**. No code, no finding.
- Give a concrete failure scenario: who does what, in what order → wrong result.
- Believe explanatory comments.
- No missing-tests / missing-types / missing-docs findings.
- **When you find a bug, grep for its shape elsewhere.** Three of this repo's
  REDs were bugs fixed earlier the same day on a sibling path — most often "the
  append path got the fix, the live path didn't". Check both, always.

## Output

```
SEVERITY   RED | AMBER | GREEN
TITLE      one compressed line
LOCATION   path/to/file.ts:123
WHAT       the defect, then the concrete failure: who does what → wrong outcome
EVIDENCE   verbatim quoted code
FIX        the smallest correct change
ELSEWHERE  other places this same shape appears, or "checked, none"
```

RED means: data loss, a security hole, a crash on a normal path, or the core
promise breaking.

Finish with **what you could not check without two live browsers**, stated
plainly — that gap is the whole reason this subsystem needs auditing on paper.
