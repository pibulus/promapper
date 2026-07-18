# FABLE PARTYKIT DEEP-DIVE — 2026-07-18

Branch: `fable-partykit-deepdive-2026-07-18` (from `main`). Fix commit: `59d4545`.
Verified with live multi-client WebSocket tests against `partykit dev` (scripted,
observed behavior — not just code reading), plus 245/245 tests passing.

---

## ⚡ THE PLAIN ANSWER FIRST

**Live collab is CODE-COMPLETE BUT DORMANT. It is not deployed anywhere.**

Evidence, not vibes:
- `.env` has `PARTYKIT_HOST` / `PUBLIC_PARTYKIT_HOST` = `http://localhost:1999`
  (dev-only) and **no `PARTYKIT_UPDATE_TOKEN` at all**.
- `promapper.pibulus.partykit.dev` does not resolve (ziplist's worker at
  `ziplist.pibulus.partykit.dev` answers fine, so the account + pattern work —
  promapper's worker was simply never `party:deploy`ed).
- The Pi being down is *irrelevant* to this: PartyKit workers live on
  Cloudflare's edge, not the Pi. Even with the Pi back up, collab stays dark
  until the worker is deployed AND the three env vars are set in the app's env.
- The failure is graceful, at least: `/live/<roomId>` without a configured host
  renders the calm "Live rooms are napping" page, and Go Live toasts
  "Live collaboration isn't set up yet."

**To actually light it up:** `npm run party:deploy`, then set
`PUBLIC_PARTYKIT_HOST` + `PARTYKIT_HOST` (the `*.partykit.dev` host) and a
`PARTYKIT_UPDATE_TOKEN` (any strong secret, mirrored in the worker env) in the
app environment. That's the whole gap. **This is the single most
launch-blocking item.**

## 📦 Pre-existing repo state (nothing touched, nothing lost)

- `main`, clean except an uncommitted 13-line addition to `STARRED-REPOS.md` —
  left exactly as found (not committed into this branch).
- `stash@{0}: On meeting-rooms: fable-audit-safepoint WIP` — the July 5 safety
  net (8 files: HomeIsland, VoicePanel, SharedWhiteboard, MobileHistoryMenu,
  LoadingModal, styles.css, settings, emojimap). **Still present, untouched.**
  The previously-flagged "mid-feature uncommitted work" lives there, exactly as
  the July 5 report documented. Nothing was dropped.

## 🗺 Auto-update coverage map — which surfaces sync live to all viewers

| Surface | Syncs live? | Mechanism | Verified how |
|---|---|---|---|
| Topics/nodes + edges | ✅ | Full-snapshot `conversation_update` (peer WS + server-push from `/api/process`+`/api/append`) | Wire test T2–T4 |
| Action items (incl. check-offs) | ✅ | Same snapshot channel; `ai_checked`/`checked_reason` explicitly preserved by the sanitizer | T4: B saw A's check-off live |
| Summary | ✅ | Same snapshot channel | T3 INIT carried it |
| Processed transcript | ✅ | Same snapshot channel | T3 |
| Live transcript chunks | ✅ live-only | `transcript_chunk` relay; **ephemeral** — not persisted in room state | T7: relayed to all |
| Whiteboard (human drawing) | ✅ | Separate throttled `whiteboard_update` channel, scene persisted in room storage | T6 + late-joiner INIT carried the scene |
| **AI whiteboard-agent edits** | ✅ | Client applies the returned elements AND explicitly re-broadcasts (`DashboardIsland.tsx:215`) | Code-traced; same channel observed working in T6 |

The feared seam — "the AI drew something but nobody else saw it" — **does not
exist**. The agent's edit rides the same whiteboard broadcast as human strokes.

Real gaps in coverage (notes, not fixed):
- **Late joiners miss live chunks**: room INIT carries the last *processed*
  snapshot; chunks since the host's last append are gone (clients keep only the
  last 20 anyway). Joiner catches up at the next append.
- A remote `conversation_update` replaces local state wholesale; the local
  `whiteboardScene` persistence field gets dropped from `conversationData`
  (the live board itself is unaffected — separate channel + room storage
  re-serves it; DashboardIsland re-persists on the next stroke). Cosmetic.

## 🥊 Concurrency findings (ranked by user-visible pain)

1. **Full-snapshot last-write-wins on conversation edits — OBSERVED.**
   Two people do X and Y: A adds action item "Call venue" while B renames a
   topic within the same second → whoever lands second silently erases the
   other's change (their snapshot predates it). Wire test T5: A's and B's
   near-simultaneous edits → room held only B's; A's item was gone. The `rev`
   counter is used for reconnect decisions only — the server accepts any
   snapshot unconditionally. Same family as the delete+edit resurrection the
   ZipList audit observed today. **Protocol-level; punch-list, not patched.**
   Realistic mitigation short of CRDTs: per-entity ops for the two surfaces
   people actually co-edit (action-item status, node position) with LWW kept
   for the rest.
2. **Whiteboard full-scene replace — the classic Excalidraw+sync footgun,
   confirmed present.** Simultaneous drawing: your in-flight stroke can be
   clobbered locally when the other person's 200ms-throttled scene lands
   (updateScene replaces *all* elements), and your next broadcast then erases
   theirs for everyone. Element-level merging is a real feature, not a quick
   patch. Fine for "one person draws while others watch," rough for true
   co-drawing. **Noted, not fixed.**
3. **`transcript_chunk` has no server-side host gate — OBSERVED.** Any viewer
   in the room can inject fake transcript lines that render on every peer's
   live panel (T7: viewer B's forged chunk relayed to all). The one-mic rule is
   UI-only, and `liveSessionStore.ts` says so honestly ("server-side
   enforcement is a later protocol step"). Acceptable under link-is-the-secret
   trust, but do that protocol step before promoting collab publicly:
   tag the creator's connection at room-seed time and drop chunks from anyone
   else.
4. **Concurrent appends race (server, documented in code).** `/api/append` is
   stateless; two simultaneous appends both merge from the same base and the
   second push wins the room. Already flagged in `append.ts` comments with a
   client-side conflict-detector suggestion. Rare in the one-host recording
   model. Punch-list.
5. **Ghost presence on unclean disconnects — FIXED (`59d4545`).** Runtime-forced
   closes (oversized frame kill, socket error) skip `onClose`, so no presence
   rebroadcast happened: observed a dropped peer haunting the roster 3s+ (it
   self-healed only at the next join/leave). Added `onError` mirroring
   `onClose`. Post-fix observation: ghost clears in <1s. (Fully unplugged-cable
   drops still depend on Cloudflare noticing the dead TCP connection —
   a heartbeat would be the complete cure; not worth it today.)
6. **Room TTL ignored live recording — FIXED (`59d4545`).** Chat, renames,
   edits and whiteboard strokes extended the 24h room TTL; transcript chunks —
   the realest activity a meeting has — didn't. A listen-only meeting (host
   records, nobody edits/chats) never bumped `lastActiveAt`. Now valid chunks
   touch the TTL (verified: valid chunk extends, malformed doesn't).
7. **Oversized-message behavior is safe — OBSERVED.** The runtime kills frames
   >1MiB with 1009 before the app's own 4009 check can fire; either way only
   the sender disconnects and the room stays healthy for everyone else (T8).
   Numbers note: the server-side sanitizer caps a room snapshot near ~550KB,
   but the *client* sends unsanitized — a conversation whose serialized form
   exceeds ~1MiB (≈17h of transcript) would trip the cap on every outbound
   update and reconnect-loop. Far-off edge; punch-list footnote.

## 🔌 Reconnect & failure modes

- **Reconnect is genuinely well-built.** PartySocket auto-reconnects → server
  sends a fresh full INIT (no delta trust, no stale-whiteboard risk — scene
  rides the INIT). The rev-counter logic in `liveSync.ts` then does the right
  thing three ways: room unmoved → your unsent local edits flush ("Reconnected —
  your changes synced"); room moved on → adopt remote, honest toast; flappy
  double-INIT → protected against rolling back a just-flushed edit (a real bug
  they already found live and guarded). The socket-instance guard in
  `partyService.ts` prevents a dying socket's close event from muting the new
  one. This layer needs nothing.
- **Room expiry mid-session**: calm toast, back to solo, no infinite retry
  (expired rooms close with 4005 and the client stops trying). ✅
- **No-red-failstates rule: HOLDS.** Toast "error" is muted rose `#c4607a`,
  warnings amber `#d4a01a`; unconfigured-collab page is the friendly "Live
  rooms are napping." Nothing alarming found on any live-collab path.
- **Security model, stated plainly**: the room id is the secret —
  `cm_` + UUIDv4 (unguessable), no auth on join, GET returns the full snapshot
  to anyone holding the id. Server-push requires the Bearer token in prod
  (localhost open for dev, 403 otherwise). Fine for its trust level; just know
  a leaked link = full read/write until the room expires 24h after last
  activity.

## 🔧 Fixed vs punch-list

**Fixed on this branch (`59d4545`):**
- `onError` presence rebroadcast (ghost-presence cure for error-path drops)
- `transcript_chunk` TTL touch (valid chunks only)

**Verification, honestly reported:** three scripted live wire tests (13-assert
main suite, ghost-presence before/after, TTL before/after) all green;
`deno test --no-check` **245/245**. `deno task check` currently fails **on main
too** — pre-existing Deno-upgrade type drift (`Timeout` vs `number`,
`Uint8Array` generics) in 5 files this branch doesn't touch, plus 2 unformatted
pre-existing files; `party/` is excluded from deno check so the fixed file
isn't affected either way. Worth a 20-minute cleanup pass some session.

**Punch-list for Pablo (ranked):**
1. **🚨 Deploy the worker** — `npm run party:deploy` + 3 env vars, or none of
   this exists for users. Everything else on this list is invisible until then.
2. Server-side host gate for `transcript_chunk` (stop viewer transcript
   injection) — small protocol step, do before promoting collab.
3. Per-entity ops for action-item status + node positions (kill the worst LWW
   stings people will actually hit in a meeting); keep snapshot-LWW elsewhere.
4. Whiteboard element-level merge (only if true co-drawing becomes a headline
   feature; skip if it's host-draws-others-watch).
5. Append conflict detector client-side (append.ts's own suggestion).
6. Deno type-drift + fmt cleanup so `deno task check` is green again.

---

## 5-LINE SUMMARY

1. Live collab is code-complete but **not deployed** — localhost env, no
   worker on Cloudflare, no update token; `party:deploy` + 3 env vars is the
   entire gap (Pi down is unrelated — workers live on Cloudflare).
2. Every surface syncs to all viewers — transcript, summary, action items,
   whiteboard, AND AI-agent drawings (the feared AI-edit-invisible seam
   doesn't exist); late joiners only miss unprocessed live chunks.
3. Confirmed LWW races by observation: near-simultaneous edits erase each
   other (conversation + whiteboard) and any viewer can inject transcript
   chunks — all protocol-level, punch-listed with a pragmatic per-entity-ops
   path, not patched.
4. Fixed + live-verified on the branch (`59d4545`): ghost presence after
   unclean disconnects and live-recording rooms never extending their TTL;
   wire tests green, 245/245 tests, no-red-failstates rule holds fleet-proud.
5. July 5 stash and dirty STARRED-REPOS.md found intact and untouched;
   reconnect/resync layer is genuinely excellent and needs nothing.
