# ProMapper Voice Graft — overnight brief

ultrathink. You are running OVERNIGHT and AUTONOMOUS on ProMapper
(`~/Projects/active/apps/promapper`, Deno Fresh, `deno task dev` →
localhost:8003). Mission: replace the broken voice relay with the
free4chat/RealtimeKit architecture and get voice rooms WORKING, verified
end-to-end locally. Do not stop to ask questions — make the call, document it,
keep moving. Commit to main in reviewable chunks (Pablo's emoji style),
`git pull --rebase` before every commit (another instance may also be working
tonight).

## Read first (in this order)

1. `docs/FREE4CHAT-STUDY.md` — the study that produced this plan. Core verdict:
   our current worker talks to the RAW Calls SFU and is structurally incomplete
   (SDP proxy discards the session id; no track publish/pull) — it connects and
   hears silence. The fix: RealtimeKit (meetings + participant tokens + official
   SDK that does all media).
2. The reference implementation:
   `~/Projects/active/experiments/star-raid/free4chat/app/src/pages/api/token.ts`
   (the entire backend) and `app/src/hooks/useChatRoom.ts` (the entire client).
   Port the shape, not the Next.js scaffolding.
3. Our files being replaced/rewired: `workers/voice-relay/src/index.ts`,
   `islands/VoicePanel.tsx`, `routes/api/live/voice-token.ts`,
   `services/requestGuard.ts` (existing guard patterns), CLAUDE.md (Live
   Collaboration + Meeting Rooms sections).

## You have real credentials — use them

`~/.config/api_keys` (sourced in the shell) has `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID`. FIRST ACT: probe what the token can do —

- `GET https://api.cloudflare.com/client/v4/accounts/{id}/tokens/verify` then
  try listing/creating a RealtimeKit app. NOTE: the product was Dyte →
  "RealtimeKit"; endpoint shapes may have drifted from free4chat's
  (`/accounts/{id}/realtime/kit/{app}/meetings`). Verify the CURRENT API surface
  via context7 / Cloudflare docs / web search before assuming.
- If the token CAN manage Realtime: create the app + an `audio_only_room` preset
  via API, store ids/secrets via `wrangler secret put` (wrangler authenticates
  non-interactively with CLOUDFLARE_API_TOKEN env), create the KV namespace, and
  `wrangler deploy` the rewritten worker. The worker is new + isolated —
  deploying it is in scope. (PartyKit deploy is NOT — it needs Pablo's login;
  use `./node_modules/.bin/partykit dev` locally.)
- If the token CANNOT (403s): don't fight it. Build everything against a MOCK
  mode (see below), leave the real-app creation as a 5-minute morning checklist
  with the exact curl commands ready to paste.
- NEVER commit a secret or token to the repo. Runtime env goes in `.env`
  (gitignored) / wrangler secrets. Say WHICH env vars you set, never values.

## The build

1. **Worker rewrite** (`workers/voice-relay/`): port free4chat's token.ts
   (~150-200 LOC). Keyed by ProMapper live-room id (`cm_…` shape — validate
   `^[A-Za-z0-9_-]{3,64}$`), link-is-the-secret carries over. Keep our
   shared-secret gate for room creation, add their KV rate limit (20/min/IP).
   Room lifecycle: 2h logical age / KV TTL, expired → 410 + PATCH meeting
   INACTIVE. Response: `{authToken, expiresAt, roomType}`. Add a `MOCK_RTK=1`
   env mode that fabricates tokens/meeting-ids so the whole app flow runs with
   zero Cloudflare (this is also what CI/local dev uses forever).
2. **`routes/api/live/voice-token.ts`**: stays the thin guarded proxy; adjust to
   the new response shape.
3. **`islands/VoicePanel.tsx` rewrite** around the framework-agnostic
   `@cloudflare/realtimekit` core SDK (the react package is hooks over it —
   we're Preact, use the core). Get the real SDK API from context7/npm docs; do
   NOT guess method names. Keep our UI language (mute slab, speaking indicators,
   join/leave, toasts). Speaking detection: SDK audio levels or our analyser on
   SDK-provided MediaStreams. Delete every line of raw RTCPeerConnection code.
   Borrow free4chat's expiry UX: countdown + 10-minute warning (our toast
   system).
4. **Env plumbing**: `VOICE_RELAY_URL` etc. in `.env`; unset = voice silently
   disabled (existing behavior — keep it graceful, "napping" not errors).
5. **Docs**: update CLAUDE.md's voice sections + FREE4CHAT-STUDY.md status line;
   write `docs/VOICE-STATUS.md` with what works, what's mocked, the morning
   checklist, and every decision you made alone.

## Verification (the overnight bar)

- `deno task check` + `deno task test` green (277+; add tests for the worker's
  room-lifecycle/rate-limit logic where testable, and for any new parsing).
- Worker wire-test: run it with `wrangler dev` (miniflare KV) and hit it with
  real fetches — create/join/expiry/rate-limit/bad-input paths, both MOCK and
  (if creds allow) real mode.
- **End-to-end voice, real mode** (only if the token let you create the app):
  launch TWO Playwright browser contexts with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` against
  localhost:8003 + `partykit dev`, join the same room from both, and assert on
  the SDK's participant/track/audio-level state from each side (two participants
  visible, remote audio track present + non-silent). Screenshot the voice panel
  states. That is the "it actually works" bar — code-complete-but-dormant is the
  failure mode this project keeps falling into; don't add another layer of it.
- End-to-end MOCK mode regardless: join flow, UI states, expiry countdown,
  graceful-unconfigured path.

## Scope fences

- Do NOT touch theme/color tokens, `core/theme/`, or `static/styles.css` color
  values — a separate color-system pass owns those (`docs/COLOR-PASS-BRIEF.md`).
  New VoicePanel styles: structural CSS only, existing vars.
- Do NOT deploy PartyKit or touch the fleet key system (`~/.config/fleet/`).
  Cloudflare Worker deploy + RTK app creation only.
- Do NOT touch `.env` beyond adding the voice vars; never print secret values
  into logs, commits, or docs.
- If real-mode audio verification fails after honest attempts, say so plainly in
  VOICE-STATUS.md with the failing evidence — a true "mock verified, real
  blocked on X" beats a hopeful "should work".
