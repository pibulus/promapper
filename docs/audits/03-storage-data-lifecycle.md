# Audit pass 03 — storage & the data lifecycle

You are auditing ProMapper, a Deno Fresh + Preact app that turns messy audio and
text into a living project map. Read `CLAUDE.md` at the repo root first.

**Report only. Do not modify any file.**

## Why this subsystem

Everything a user owns lives on their device. Conversations in localStorage,
audio takes in IndexedDB, saved exports in their own store. **There is no server
copy to restore from.** The app's whole positioning — "yours, on your device",
no accounts, no harvesting — means a storage bug is not an inconvenience, it is
permanent loss of the only copy.

Backup and restore is the one path users are explicitly told to trust. A bug
there is the worst bug in the app.

## The owner's goal

_"I don't want to touch this thing again after I release it."_ No deadline. A
latent corruption that bites in six months is worse than an ugly fix today. But
don't invent work.

## Scope

```
core/storage/localStorage.ts      conversations, active id, debounced save, quota
core/storage/backup.ts            serialize / parse, BACKUP_VERSION
core/storage/exportSnapshots.ts   saved markdown exports
core/storage/recordingsDB.ts      IndexedDB takes, eviction, orphan sweep
core/storage/shareService.ts      share links (URL-compressed vs server)
core/storage/dates.ts
signals/conversationStore.ts      the autosave effect, undo, isViewingShared
islands/MobileHistoryMenu.tsx     history, star, backup/import, delete
islands/DashboardIsland.tsx       Pulse card backup, pagehide flush
utils/downloadBackup.ts
```

## The invariants that must hold

1. **A backup round-trips losslessly.** Export → wipe the browser → import must
   return conversations, stars, timestamps AND saved exports. `BACKUP_VERSION`
   exists precisely because an earlier version silently lost every export.
2. **A file stamped with a version actually satisfies that version.** A
   version-2 backup carrying `"snapshots": []` looks complete and is not.
3. **Import neither loses nor duplicates.** Same backup imported twice must not
   double every conversation.
4. **The active conversation id always points at something that exists.**
5. **A failed write is never silent.** Quota exceeded, private mode, a closed
   IndexedDB — the user must find out while they can still act on it.
6. **A debounced save is not lost by navigating away.** Tab close, conversation
   switch, and "new conversation" all interrupt a pending write.
7. **A success return means it's committed.** Not "the transaction was opened".
8. **Eviction never drops something irreplaceable.** A take with no receipt is
   audio the map has never absorbed.

## Hunt these specifically

- **Every writer of every store.** Enumerate them, then ask of each: what
  happens when the write fails? Is the failure surfaced, retried, or swallowed?
- **The debounce.** How long is it, and what cancels it? Does switching
  conversations within the window discard the previous one's pending edit? Does
  `pagehide` / `visibilitychange` flush it — and is that flush gated by anything
  that might be true at the time (e.g. a live session flag)?
- **Two tabs.** Both write the same key. Is there a `storage` listener, and can
  it swap the user into a different conversation than the one they're looking
  at? Can one tab's stale state overwrite another's fresh state?
- **Quota.** What is the actual failure mode at 5MB? Does the app measure usage
  correctly — one key against the whole origin budget is a misleading gauge. Are
  audio blobs in localStorage (they must not be) or IndexedDB?
- **Safari private mode**, where IndexedDB may be unavailable and localStorage
  may throw on write. Trace what the user sees.
- **The backup format itself.** Read `parseBackup` and `serializeBackup` as a
  pair. Can a hand-edited or truncated file crash the import instead of
  degrading? Are optional fields defaulted in a way that lets a caller silently
  omit something important?
- **Default parameters that make omission silent.** A defaulted argument on a
  serializer is how a caller quietly produces an incomplete file.
- **Deletion.** When a conversation is deleted, are its takes, exports, tag
  colours, board order and tombstones cleaned up — or orphaned forever?
- **Share links.** Small conversations are URL-compressed; larger ones go to a
  server store. Does a user get told which they received? Can a link silently be
  local-only and non-portable?

## Already found and fixed — do NOT re-report

- The Pulse card's "Download backup" calling `serializeBackup` with two
  arguments, so `snapshots` defaulted to `[]` while the file was still stamped
  version 2. The default has been removed so omission can't be silent.
- Live meetings never persisted — the pagehide flush was gated by
  `isViewingShared`, which a live session sets for its whole duration. The HOST
  is now exempt; guests deliberately are not.
- Share creation skipping `ensureApiSession`, so an unauthenticated browser got
  a 401 and silently fell back to a local-only link that looked identical.
- Client-only fields (`notes`, `magpie`, `whiteboardScene`, tombstones) being
  dropped by both the append reconcile and remote frames.
- A failed FIRST recording losing its audio entirely.

## Known-deliberate — never report as bugs

- Conversations live in localStorage on purpose (the product's whole promise:
  their disk, zero cost, no accounts). Map count is deliberately never limited.
- Commits go straight to `main`; `deno.lock` disabled; no Deploy build step; the
  app links `styles.build.css`.
- No server-side user data by design. There is nothing to restore from and that
  is the point — which is exactly why local integrity matters this much.

## Rules for findings

- Cite `file:line` and **quote the actual code**. No code, no finding.
- Give a concrete failure scenario, ideally as steps: "save 20 exports → back up
  → clear browser → import → all 20 gone".
- Believe explanatory comments.
- No missing-tests / missing-types / missing-docs findings.
- **When you find a bug, grep for its shape elsewhere.** If one caller of a
  serializer omits an argument, check every caller. If one writer swallows a
  failure, check every writer.

## Output

```
SEVERITY   RED | AMBER | GREEN
TITLE      one compressed line
LOCATION   path/to/file.ts:123
WHAT       the defect, then the failure as concrete steps
EVIDENCE   verbatim quoted code
FIX        the smallest correct change
ELSEWHERE  other places this same shape appears, or "checked, none"
RECOVERY   if this fires, can the user get their data back at all?
```

RED means: data loss, a security hole, a crash on a normal path, or the core
promise breaking. In this subsystem, **anything that loses the only copy of
something a user made is RED**, however narrow the trigger.

Finish by naming the single most dangerous path you found, and what you would
test by hand to confirm it.
