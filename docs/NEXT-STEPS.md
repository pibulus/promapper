# NEXT STEPS — handoff for the follow-up session (any model)

Branch: `fable-audit-2026-07-05`. State: `deno task check` ✅ · `deno task test`
224/224 ✅ · `deno task build` ✅. Read `docs/FABLE-AUDIT.md` + the "July 6" and
"July 9" sections of `CLAUDE.md` for what shipped. Stash
`fable-audit-safepoint WIP` still exists as a safety net — never drop it.

## 0. July 9 polish pass — what changed + what it adds to QA

Four zones were reworked (see the four July-9 commits for detail): export drawer
(smart suggestions, mismatch sentinel, token skin, fixed invisible backdrop),
action items (local-only draft rows, undo-toast instead of confirm modals,
unified bulk ops, contrast fixes), node map (structure-diff guard — store
changes no longer reheat the sim or yank the camera; edges always warm ink),
live/share (voice relay no longer leaks the app secret — new /sdp proxy; chat
FAB restored; room rev counter for honest reconnect-flush; whiteboard persists
in room storage; expired rooms exit cleanly).

New QA this adds:

- **Voice relay Worker changed** (`workers/voice-relay/`): the SDP exchange now
  proxies through the Worker (`POST /voice/rooms/:id/sdp`, session-token auth).
  UNTESTED against real Cloudflare Realtime — needs a deploy + two browsers. The
  Calls API payload shape (`sessionDescription` in/out of `/sessions/new`)
  should be verified against current CF docs at deploy time.
- **Reconnect flush**: retest the two-tab scenario in §2 — the decision is now
  rev-based (server acks your writes), the toast wording is unchanged.
- **Chat**: in a live room, FAB bottom-right → panel; unread badge increments
  only while closed; Enter sends; own message echoes back into the log.
- **Whiteboard**: draw, reload the host tab → board should come back via INIT.
- **Export drawer**: suggested formats (wand mark) lead the picker; a format
  that doesn't fit shows a hint instead of a fake export; failed generation
  keeps the previous output; backdrop click closes.
- **Mobile order regression fixed for real this time**: topic viz had order:0
  and sat ABOVE action items in the stack (July 6 note claimed otherwise).
  Re-verify on a real phone: Action Items first, map after, transcript last.

Taste calls parked for Pablo (each is a 1-line change, all currently OFF):

1. Node-pad glows use the theme accent for every node; the nodemap memory says
   they should use each topic's own vivid color. Show both, let him point.
2. The ✨ AI-chip uses a literal emoji in chrome (NO-EMOJI law says FontAwesome
   only) — it was shipped deliberately July 6; needs a ruling, not a revert.
3. Export drawer on mobile is a full-width right-slide; the history drawer is a
   bottom sheet. Converting to a bottom sheet = consistency, but it's a feel
   decision.
4. Per-item date chip shows "None" when an item has an assignee but no due date
   — functional (tap to set) but reads as noise. Hide-until-hover is an option.

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
