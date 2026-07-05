# NEXT STEPS — handoff for the follow-up session (any model)

Branch: `fable-audit-2026-07-05` (12 commits on top of `meeting-rooms`). State:
`deno task check` ✅ · `deno task test` 213/213 ✅ · `deno task build` ✅. Read
`docs/FABLE-AUDIT.md` + the "July 6" section of `CLAUDE.md` for what shipped.
Stash `fable-audit-safepoint WIP` still exists as a safety net — never drop it.

Rules for the executor: work on THIS branch, run
`deno fmt && deno task check
&& deno task test` after every change, never touch
`fresh.gen.ts`, no red in the UI (pastel-punk: accent pink =
`var(--color-accent)`), never deploy.

## 1. Real-device QA (highest priority — no code until findings)

Run `deno task dev` (localhost:8003), test on a real iPhone + desktop Chrome:

- Recording dock: record a take, stop, watch the receipt toast; open the takes
  sheet; play back; reload the page → takes must still be there (IndexedDB).
- Safari specifically: IDB persistence, `blob.type` on recorded audio, dock
  safe-area position above the home indicator.
- Delete a take → undo toast restores it.
- Demo (✨DEMO button): cookie item shows the "✨ AI checked this off" chip; tap
  reveals the reason line.
- Mobile 375px: Action Items card is FIRST in the stack, transcript last;
  desktop 3-col order unchanged; the dock must not cover the last card (main
  gets pb-36 when a conversation is open).
- Fix only what breaks; keep fixes minimal and in the existing style.

## 2. Live/share flow QA (needs `./node_modules/.bin/partykit dev` + app env

`PUBLIC_PARTYKIT_HOST=localhost:1999`)

- Go Live → Share button → popover should show BOTH "Live room link" and the
  snapshot link. Open the live link in a second browser → real-time sync.
- Open the snapshot link → shared page shows the "join in real time" banner →
  clicking it lands in the room.
- Overview card back (flip the Action Items card): per-person 🔗 button → copies
  a link; open it → "Showing X's items" badge + only their items.
- Reconnect flush: with two tabs in a room, kill the partykit dev server, edit
  an item in tab A, restart the server → tab A should toast either "your changes
  synced" (room unchanged) or "synced the room's latest".

## 3. Known small gaps (safe, well-scoped fixes)

a. `islands/AudioRecorder.tsx`: the retry button re-appends the last blob but
the take row already exists — verify retry doesn't create a receipt on the WRONG
take if the user recorded another take in between (guard: compare
`lastTakeIdRef` before stamping; skip stamping if ids drifted). b. Take naming:
`Take ${takes.value.length + 1}` can duplicate names after deletes. Cheap fix:
derive N from the highest existing "Take N" + 1. c. `.recording-dock__sheet` on
very short landscape phones: cap with `max-height: min(55vh, 26rem)` is in —
verify it scrolls, not clips. d. The dock shows for EMPTY conversations too
(conversation with no takes) — that's intended (it's the "talk again"
affordance). Don't "fix".

## 4. Deferred by design (do NOT attempt without Pablo)

- Deno KV rate limiter (top item in FABLE-AUDIT.md "left open").
- UploadIsland → useRecorder migration (core happy-path rewire).
- Focus-trap utility for drawers/modals.
- VoicePanel peer identity protocol fix.
- Whiteboard version-counter sync protocol.

## 5. Nice-to-haves if QA is clean (in delight order)

- Node-map first-render scale-in pop (nodes already have a springy bezier).
- Scroll-fade hint on the mobile header action cluster.
- Swipe-to-delete on history items (undo toast already exists as safety net).
