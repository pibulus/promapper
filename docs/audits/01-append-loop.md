# Audit pass 01 — the append loop

You are auditing ProMapper, a Deno Fresh + Preact app that turns messy audio and
text into a living project map. Read `CLAUDE.md` at the repo root first.

**Report only. Do not modify any file.**

## Why this subsystem

The append loop is the product's whole promise: the map stays true as new
material arrives. Action items check themselves off when a later take says the
work happened. Merged topics stay merged. New material folds in without
trampling edits the user made while it was processing.

It is also where the bugs are. A three-round audit on 2026-07-26 found **four
RED bugs in this path alone**, including one where the loop was entirely dead
and silent about it.

## The owner's goal

_"I don't want to touch this thing again after I release it. I want it so solid
that it'll just sort of tell."_ There is no deadline and no race. Durability and
correctness beat speed. But do **not** invent work — speculative hardening of
things that cannot actually break is bloat he'd also have to maintain.

## Scope

```
islands/AudioRecorder.tsx          the recording dock, the append trigger
islands/useRecorder.ts             MediaRecorder lifecycle, rotation
islands/UploadIsland.tsx           the FIRST process (no conversation yet)
routes/api/process.ts              first-material pipeline
routes/api/append.ts               append pipeline + transcript merge
core/orchestration/append-reconcile.ts   the three-way merge
core/orchestration/append-merge.ts
core/orchestration/append-receipt.ts
core/orchestration/conversation-flow.ts
core/orchestration/parallel-analysis.ts
core/orchestration/conversation-ops.ts
signals/conversationStore.ts       the signal, autosave, undo
signals/actionItemsStore.ts
utils/coerceFlowResult.ts
utils/requestQueue.ts
core/storage/recordingsDB.ts       takes in IndexedDB
```

## The invariants that must hold

Check each one directly. These are the contract; a violation is a finding.

1. **Audio survives a failed pipeline.** Every take is persisted before the AI
   runs. A failure must leave recoverable audio and a way back to it.
2. **A take that failed to map keeps no receipt** — the "N takes not mapped yet"
   nudge is the recovery path, and a receipt permanently disqualifies a take
   from it.
3. **An in-flight user edit is never clobbered.** BASE is the request-time
   snapshot, MINE is the current signal, THEIRS is the server result. Reconcile
   must preserve MINE's edits over THEIRS' regeneration.
4. **A result only lands on the conversation it came from.** The round trip is
   5–65s and the user can switch conversations or close it during that window.
5. **The result must not lose fields the server never saw.** THEIRS is built by
   the server flow and has never heard of `notes`, `magpie`, `whiteboardScene`,
   `deletedTopicLabels`, `deletedActionDescriptions`. Spreading it drops them.
6. **Rosters and memory GROW, they don't get replaced.** Speakers, node
   `aliases` (merge memory) and tombstones (delete memory) each accumulate. A
   take that only heard one voice must not evict the others.
7. **Reconcile is pure, deterministic and idempotent.** Same inputs, same bytes,
   every time — live collab replays it.
8. **A new baseline invalidates a pending undo.** After an append lands, an undo
   armed before it would roll back past the whole mapping.

## Hunt these specifically

- **Guards that block their own caller.** Trace every re-entry flag to who sets
  it and when. If a guard tests a signal that a caller in the same chain has
  already raised, the guarded function never runs — silently.
- **Identity matching in the merge.** Are action items and nodes matched by
  stable id, or by array index or description string? Index or fuzzy matching
  under concurrent edits is data loss. Prove which it is.
- **Stale BASE.** What happens if BASE is no longer an ancestor of MINE? What if
  ids collide between them?
- **Receipt stamping.** Can a receipt land on a different take than the one the
  audio came from — after a retry, a second recording, or a conversation switch?
- **Two tabs, same conversation.** Both autosave to the same key. Who wins, and
  does the loser know?
- **IndexedDB.** Does `saveRecording` report success before the transaction
  actually commits? What happens in Safari private mode? Is eviction able to
  drop a take that hasn't been mapped yet?
- **Anything that survives a conversation switch when it shouldn't.** Component
  state, refs, module-level signals, in-flight closures. The component is
  rendered without a `key`, so a prop change does not reset it.
- **Silent degrade.** An empty result, a swallowed error, a success toast on a
  partial outcome.

## Already found and fixed — do NOT re-report

- The append re-entry guard testing `useRecorder`'s `isProcessing`, which its
  own caller sets before awaiting `onStop`. The loop was dead; now it has its
  own ref.
- Client-only fields (`notes`, `magpie`, `whiteboardScene`) dropped by
  reconcile's spread of THEIRS.
- An append landing on whatever conversation was open when it returned — now
  id-guarded before the reconcile.
- The speaker roster replaced with the newest take's speakers instead of unioned
  (MINE-first, for index/colour stability).
- `clearUndo()` never being called after an append or live-analysis round.
- The retry chip carrying a previous conversation's blob across a History switch
  (the id guard does not catch this — at retry time both ids match).
- A failed FIRST process losing its audio; now latched for "Try that again".
- Failed AI _calls_ returning empty without signalling `onParseError`, so only
  failed _parses_ warned the user.

## Known-deliberate — never report as bugs

- Commits go straight to `main`; `deno.lock` is disabled; there is no Deploy
  build step (esbuild OOMs with 31 islands) and Tailwind is precompiled to
  `static/styles.build.css`. The app links `styles.build.css`, not `styles.css`.
- Action items intentionally have no assignee dropdown, no date picker, no
  overdue logic, no sort modes, no "mine only" filter. Deleted on purpose.
- `party/` and `workers/collab/` duplicate sanitizers from `core/realtime/` on
  purpose — the bundlers can't read Deno's import map.
- FontAwesome icons only, no emoji garnish, no ALL CAPS.

## Rules for findings

- Cite `file:line` and **quote the actual code**. No code, no finding.
- Give a concrete failure scenario: specific inputs or user actions → the wrong
  outcome. "This could be racy" is not a finding.
- If a comment explains why the code is that way, believe it.
- Do not report missing tests, missing types, or missing docs.
- Prefer few high-confidence findings over many speculative ones.
- **When you find a bug, grep for its shape elsewhere before you write it up.**
  Three of this repo's REDs were bugs fixed earlier the same day, still alive on
  a sibling path. Report the family, not the instance.

## Output

For each finding:

```
SEVERITY   RED | AMBER | GREEN
TITLE      one compressed line
LOCATION   path/to/file.ts:123
WHAT       the defect, then the concrete failure: inputs/state → wrong outcome
EVIDENCE   verbatim quoted code
FIX        the smallest correct change. Root over symptom, but no gold-plating.
ELSEWHERE  other places this same shape appears, or "checked, none"
```

RED is reserved for: data loss, a security hole, a crash on a normal path, or
the core promise breaking. Everything else is AMBER or GREEN.

Finish with the honest bit: **what you could not check, and what you'd want to
run in a real browser to be sure.**
