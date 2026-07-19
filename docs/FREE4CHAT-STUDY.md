# free4chat Study Session — 2026-07-19

Study of `~/Projects/active/experiments/star-raid/free4chat` (i365dev/free4chat,
MIT, 1.1k★) against ProMapper's existing voice relay. Verdict up front:

**Our voice relay is built on the wrong Cloudflare product and is structurally
incomplete — it would connect and hear silence. free4chat proves the fix is a
~150-line worker rewrite + swapping raw WebRTC for the RealtimeKit SDK.**

## The two Cloudflare products (this is the whole confusion)

|                   | Raw Realtime SFU ("Calls API")                                                                                            | RealtimeKit (former Dyte)                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Endpoint          | `rtc.live.cloudflare.com/v1/apps/:appId/…`                                                                                | `api.cloudflare.com/…/realtime/kit/:appId/…`                             |
| Model             | Sessions + explicit track publish/pull, you renegotiate SDP per track and build your own signaling for who-has-what-track | Meetings + participants + presets; SDK does all media                    |
| Client            | Hand-rolled `RTCPeerConnection`                                                                                           | `@cloudflare/realtimekit` SDK (react wrapper optional)                   |
| What you get free | Nothing — audio only after you wire everything                                                                            | join/leave, tracks, mute, reconnect, audio levels, **chat**, screenshare |

**ProMapper today** (`workers/voice-relay/`, `islands/VoicePanel.tsx`): talks to
the raw SFU. One offer → `sessions/new` → answer, then hopes `pc.ontrack` fires.
Why it can't work:

1. Publishing local audio requires `POST /sessions/:id/tracks/new` — our `/sdp`
   proxy **discards the SFU session id** (returns only the answer SDP), so track
   calls are impossible through the current worker.
2. Remote audio must be explicitly **pulled** per participant (their session id
   - track name, learned via your own signaling, e.g. PartyKit) with an SDP
     renegotiation each time. None of that exists.
3. The July 9 security hardening (session tokens, SDP proxy) was good work on an
   unworkable base.

**free4chat** went through Go+coturn → Elixir+Membrane → RealtimeKit, three
rewrites, and landed on: the media plane is a rental, stop self-hosting it.
Their surviving backend is ONE route.

## What free4chat's architecture actually is

- `app/src/pages/api/token.ts` (~300 lines, the entire backend):
  - Origin allow-list + KV rate limit (20/min/IP) + optional Turnstile.
  - Room name → RealtimeKit meeting id, cached in KV (`room:` key, 4h KV TTL, 2h
    logical age; expired rooms PATCH the meeting INACTIVE and 410).
  - Mints a **participant token** via `POST …/meetings/:id/participants` with a
    `preset_name` (e.g. `audio_only_room`) — that token is all the browser ever
    holds.
- `app/src/hooks/useChatRoom.ts` (one hook, the entire client):
  `useRealtimeKitClient()` → `initMeeting({authToken})` → `meeting.join()`.
  Participants/mute/audio streams/reconnect/chat all come off SDK events. Expiry
  countdown + 10-min warning + visibility-change resync are the only hand-rolled
  parts.
- Luna bot: `api/bot.ts` + `do/BotSession.ts` — a Durable Object with rolling
  message history (capped, in DO storage) → OpenAI call → reply into meeting
  chat as `__bot:` messages. ~270 lines total.

## The graft plan for ProMapper

Sequencing (unchanged from the deep-dive): **`npm run party:deploy` + 3 env vars
first** — voice on an undeployed collab layer is talking to yourself. Then, one
focused session:

1. **Rewrite `workers/voice-relay/src/index.ts`** as a port of token.ts (~150
   LOC): keep our roomId-keyed shape (`cm_…` live room ids as the room key —
   link-is-the-secret carries over), keep the shared-secret gate on room
   creation, add their KV rate limit. Secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`,
   `RTK_APP_ID` (wrangler secrets). Response: `{authToken, expiresAt}`.
2. **Create the RealtimeKit app** in the CF dashboard + an `audio_only_room`
   preset (one-time dashboard task — Pablo).
3. **Rewrite `islands/VoicePanel.tsx`** around `@cloudflare/realtimekit`
   (framework-agnostic core — no react/compat needed; the react package is just
   hooks over it). Keep our UI (mute slab, speaking rings, join/leave). Speaking
   detection: SDK audio levels, or keep our analyser fed by SDK-provided
   `MediaStream`s. Delete the RTCPeerConnection code.
4. **`routes/api/live/voice-token.ts`** stays the thin proxy it already is;
   adjust to the new response shape.
5. **2h room expiry UX**: borrow their countdown + 10-minute warning verbatim
   (maps cleanly to our toast system).

What we do NOT need from free4chat: Turnstile (our requestGuard + link secrecy
covers it for now), screenshare presets (later), their chat (PartyKit chat
already exists), Next/OpenNext scaffolding.

## The scribe (Luna → ProMapper)

The sleeper find dissolves on inspection — **ProMapper already built its scribe,
better**: transcript chunks → `/api/live/chunk` → live-analysis loop →
map/actions/summary pushed to the room; Bishop answers questions over the
conversation. Luna's only novel trick is _living in the voice-room chat_. If we
ever want @bishop summoned from meeting chat, the pattern is: PartyKit chat
message → existing `/api/ask` → reply into chat. No Durable Object needed — the
PartyKit room already is one.

## Cost/sovereignty note

Media plane is rented from Cloudflare (RealtimeKit free tier ≈ 10GB/mo ≈ 100+
meeting-hours). The three-rewrite graveyard in free4chat's own history is the
strongest available evidence that renting is correct at personal scale. P2P
purity is not worth two more rewrites.
