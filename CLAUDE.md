# ProMapper - Development Guide

## What This App Is

A Deno Fresh app, using Preact and Tailwind, that turns messy audio or written
material into a living project map:

- transcripts with speaker detection
- AI-generated summaries
- action items with assignees and completion status
- emoji topic maps with relationship edges
- markdown exports in multiple formats

It is for people and small teams, not a corporate manager dashboard. Good use
cases include weekly project meetings, research groups, personal voice notes,
court cases, films, interviews, workshops, and any ongoing pile of thoughts that
needs shape without becoming heavy software.

The product promise is:

```text
ongoing conversation -> project memory -> actions, summaries, maps, docs, sharing
```

Copy should be clear, warm, and a little alive. Keep it short, but not clipped
or command-like. Do not overcorrect into cold monosyllables. Do not define the
app by dunking on other tools, subscriptions, managers, or corporate software.
Just say what this thing is and why it is useful. Avoid fake authority,
productivity-coach voice, and strings of imperatives like "Talk. Paste. Append."

The main AI provider is OpenRouter. Gemini remains available as a fallback by
setting `AI_PROVIDER=gemini`.

The killer feature is AI self-checkoff: when a follow-up recording mentions that
work is done, the app can mark matching action items complete, or move them back
to pending if the later context says they are not actually done.

Run locally with `deno task dev` or `deno task start` on `localhost:8003`.
Required local env for the default setup:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
API_AUTH_TOKEN=...
```

## AI Model Architecture

All AI calls go through the `AIService` boundary (`core/ai/types.ts`). The
provider (OpenRouter or Gemini) is selected server-side at startup via env.

**Per-task model selection (OpenRouter only)** — since June 2026, audio
transcription uses a dedicated model by default:

| Task                | Default Model                      | Why                                                                                                                               |
| ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Audio transcription | `mistralai/voxtral-small-24b-2507` | Built for audio, $0.0001/audio-token, native `input_audio` modality — way cheaper than routing through a general multimodal model |
| Everything else     | `google/gemini-2.5-flash-lite`     | Fast, cheap, good structured extraction                                                                                           |

Override the transcription model with `OPENROUTER_TRANSCRIPTION_MODEL` (set to
empty to fall back to `OPENROUTER_MODEL` for everything).

**Gemini fallback** — set `AI_PROVIDER=gemini` to use Google's API directly with
`gemini-2.5-flash`. No per-task model split (Gemini doesn't route through
OpenRouter).

**Offline path (prototype, not merged)** — Dennis built an offline version that
downloads whisper for transcription and distilbert for action-item extraction.
This lives in a separate branch (`conversation_mapper` lineage) and was never
merged into ProMapper. The pattern would be:

1. Check if a local whisper binary / wasm module is available
2. If offline: transcribe locally, then run extraction on the text (which can
   still use a cloud model or a local distilbert)
3. If online: use the cloud path above

Whisper.cpp WebAssembly or a `whisper` Python subprocess are both viable. The
talktype app already has working offline whisper transcription as a reference
implementation. Re-surfacing this would need:

- A local model check in `services/ai.ts` before falling through to the cloud
- A new `OfflineAIService` or a wrapper that pipes whisper output into the
  existing text-analysis path

## Architecture Map

```text
/core/                         # Framework-agnostic AI and data flow
  ai/
    types.ts                    # Provider-neutral AIService and audio types
    prompts.ts                  # Prompt builders
    helpers.ts                  # Shared JSON/speaker parsing
    openrouter.ts               # OpenRouter chat/audio implementation
    gemini.ts                   # Gemini fallback implementation
  orchestration/
    conversation-flow.ts        # Builds ConversationFlowResult
    parallel-analysis.ts        # Topics/actions/status/summary in parallel
  realtime/
    shareProtocol.ts            # Sanitized share-room shape and TTL rules
    shareStore.ts               # Memory/Supabase share-store adapters
  types/                        # Conversation, transcript, node, edge, action item
  storage/                      # Local storage and URL share helpers

/services/                      # Server-side provider/auth/audio helpers
  ai.ts                         # Provider selection and service caching
  audio.ts                      # Provider-specific audio payload creation
  requestGuard.ts               # Auth, origin allow-list, rate limit
  authSessions.ts               # HttpOnly API auth session

/routes/
  index.tsx                     # Main app route
  api/process.ts                # New audio/text conversation
  api/append.ts                 # Append audio to existing conversation
  api/markdown.ts               # Provider-agnostic markdown export
  api/auth.ts                   # API token session
  api/share/create.ts           # Guarded durable share creation
  api/share/[shareId].ts        # Public share lookup by ID
  shared/[shareId].tsx          # Shared conversation view

/islands/                       # Hydrated Preact UI
  HomeIsland.tsx                # Main layout
  UploadIsland.tsx              # Text/audio input
  DashboardIsland.tsx           # Dashboard shell
  AudioRecorder.tsx             # Append recording flow
  ForceDirectedGraph.tsx        # D3 graph renderer
  EmojimapViz.tsx               # Graph overlay wrapper
  MarkdownMakerDrawer.tsx       # Export UI
  MobileHistoryMenu.tsx         # Local conversation history (star/filter/backup)

/components/                    # Shared presentational cards
/signals/                       # Global Preact signal store
/utils/                         # Client utilities
/static/                        # CSS and static assets
```

## Data Flow

1. User submits text/audio in `UploadIsland`.
2. Client calls `POST /api/process`.
3. The route gets a provider-neutral service from `services/ai.ts`.
4. Text goes straight to `processText()`.
5. Audio is converted by `services/audio.ts`:
   - OpenRouter: inline base64 `input_audio`
   - Gemini: uploaded file URI or inline fallback
6. `conversation-flow.ts` calls `parallel-analysis.ts`.
7. Topic extraction, action item extraction, status checks, and summary run in
   parallel where possible.
8. Title generation runs from the transcript/text.
9. Client stores `ConversationFlowResult` in the global `conversationData`
   signal and auto-saves to local storage.

Append flow is the same pipeline through `POST /api/append`, then it merges the
new transcript, summary update, topic/action results, and status updates into
the existing conversation.

## Key Patterns

- `AIService` is the boundary. Provider-specific code stays in
  `core/ai/openrouter.ts`, `core/ai/gemini.ts`, `services/ai.ts`, and
  `services/audio.ts`.
- API keys stay server-side. Islands call server routes only.
- `conversationData` in `signals/conversationStore.ts` is the main app state.
  Null-check it before nested access.
- Fresh hydrates only files in `islands/`. Keep presentational UI in
  `components/` unless it needs state/effects/browser APIs.
- `fresh.gen.ts` is generated. Do not edit it manually.
- Shared conversations use URL-compressed payloads for small conversations and
  `/api/share` for larger ones. `/api/share` uses Supabase when `SUPABASE_URL` +
  `SUPABASE_ANON_KEY` are configured, otherwise memory store for local
  development.
- Apply `supabase/migrations/20260610000000_conversation_shares.sql` before
  enabling Supabase-backed shares.
- `.env` is ignored. Do not commit real provider keys.

## Current Verification Baseline

- `deno task check` passes
- `deno task test` passes
- `deno task build` passes
- OpenRouter text, markdown export, and a generated audio smoke test have worked
  locally with `google/gemini-2.5-flash-lite`

## Canonical Status

ProMapper is the canonical version of the conversation/project mapper saga
(`conversation_mapper`, `conversation_mapper_fresh`, `project_mapper` are parts
donors, not maintained). A 10-step consolidation ported the best of each: the
smarter AI brain (quality topic prompt + cross-provider normalization), AI
resilience (retry on both providers, title fallback), a clean theme engine
(`core/theme/`), graph upgrades (drag-to-merge, position persistence, layout
toggle, in-graph edit), conversation starring, backup/import, and growth
registries. See `core/README.md` for ownership boundaries.

## Growth Pattern

Adding a tool should be drop-a-file + register-a-line:

- Visualizations: add a component + one entry in `islands/vizRegistry.ts`.
- Export formats: add one `{id,label,prompt}` entry in
  `utils/markdownPrompts.ts`.
- Conversation mutations: add a pure transform in
  `core/orchestration/conversation-ops.ts` + a thin action in
  `signals/actionItemsStore.ts`.

## Open Issues

1. **Inline style debt**: Many islands/components still use hardcoded `px` and
   inline style values instead of the token system in `static/styles.css`.
2. **Real-device audio QA**: OpenRouter audio works with generated AIFF and text
   flows locally, but browser-recorded `audio/webm` should be verified on real
   desktop and iPhone. Interactive graph gestures (drag-to-merge, rename/delete)
   and the history star/backup flow also want real-device QA.
3. **Filtered action-item sharing (queued)**: share one assignee's subset with
   filter metadata (from the `action-items-filtered-sharing` branch).

## Live Collaboration (PartyKit)

Built and working locally (`./node_modules/.bin/partykit dev`). Open a
conversation, hit "Go Live" → `/live/<roomId>`; anyone with the link views +
edits in real time, AI results push to the room, plus presence, chat, named
avatars, and join/leave toasts. Room id is the secret (no passwords); rooms
expire 24h after last activity.

- Worker: `party/conversationRoom.ts` + `party/conversationProtocol.ts`.
  RELATIVE IMPORTS ONLY — the PartyKit bundler ignores Deno `@core/` aliases, so
  the protocol's sanitizers mirror `core/realtime/shareProtocol.ts` on purpose.
  `partykit.json` registers it under the `conversation` party name. `deno check`
  excludes `party/` (it imports `partykit/server`, an npm-only type).
- Client: `signals/partyService.ts` (PartySocket), `signals/liveSync.ts`
  (loopback-guarded two-way sync — `applyRemoteConversation` sets a guard so the
  outbound effect doesn't echo), `signals/presenceStore.ts` +
  `signals/partyConnectionStore.ts`. Route `routes/live/[roomId].tsx` +
  `islands/LiveCollabIsland.tsx` + `islands/ChatSidebar.tsx`.
- Server-push: `services/partyUpdates.ts`; `/api/process` + `/api/append` POST
  results to the room when a `roomId` is passed. `/api/live/create` seeds a
  room.
- **To deploy (manual):** `npm run party:deploy` (needs a PartyKit/Cloudflare
  account), then set `PUBLIC_PARTYKIT_HOST` (and `PARTYKIT_HOST` +
  `PARTYKIT_UPDATE_TOKEN`) in the app env. Unset = collab silently disabled
  (single-player unaffected).

## When Adding Features

1. Provider-agnostic AI contracts go in `core/ai/types.ts`.
2. Provider-specific implementation goes in `core/ai/openrouter.ts` or
   `core/ai/gemini.ts`.
3. Server env/provider wiring goes in `services/ai.ts` and `services/audio.ts`.
4. Orchestration belongs in `core/orchestration/`.
5. Interactive UI goes in `islands/`.
6. Presentational UI goes in `components/`.
7. Update `signals/conversationStore.ts` when result shape changes.
8. Add or update focused tests in `core/tests/` for core behavior.
