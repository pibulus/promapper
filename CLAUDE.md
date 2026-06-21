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
  ConversationList.tsx          # Local conversation history

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
3. **Live collaboration (queued)**: PartyKit collab is NOT yet ported (it was
   step 11 of the plan, intentionally deferred). When tackled: build the worker
   on ziplist's room structure + project_mapper's server-push, with the
   chat-sidebar and named-presence UX mined from the `conversation_mapper`
   `live-collab-action-items` / `dev` branches. PartyKit's bundler does NOT
   honor Deno import aliases — the worker + protocol file must use relative
   imports.
4. **Filtered action-item sharing (queued)**: share one assignee's subset with
   filter metadata (from the `action-items-filtered-sharing` branch).

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
