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

| Task                | Default Model                  | Why                                                                                                                                                                                      |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio transcription | `~google/gemini-flash-latest`  | Gemini 3.x has **native diarisation** — "identifies who's talking" is baked into the model, not prompt-driven. 1M context handles hour+ multi-person meetings. Understands voice nuance. |
| Everything else     | `google/gemini-3.1-flash-lite` | May 2026 Gemini 3.x model — $0.25/$1.50 per 1M. Fast, cheap, good structured extraction.                                                                                                 |

Override the transcription model with `OPENROUTER_TRANSCRIPTION_MODEL` (set to
empty to fall back to `OPENROUTER_MODEL` for everything). For a cheaper
transcription alternative (no guaranteed diarisation):
`mistralai/voxtral-small-24b-2507` ($0.10/$0.30 + $100/M audio-seconds, 32K
context).

**Alternative models (set via env vars):**

| Env Var                          | Budget default                        | Quality option                                 |
| -------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `OPENROUTER_MODEL`               | `gemini-3.1-flash-lite` ($0.25/$1.50) | `~google/gemini-flash-latest` ($1.50/$9.00)    |
| `OPENROUTER_TRANSCRIPTION_MODEL` | Voxtral Small (best dedicated audio)  | Voxtral Small + nemotron free option           |
| For structured JSON extraction   | —                                     | `~anthropic/claude-haiku-latest` ($1/$5, 200K) |

**Gemini 3.x is current (as of June 2026):**

- `gemini-3.1-flash-lite` (May 7, 2026) — replaces 2.5 Flash Lite
- `gemini-3.5-flash` (May 19, 2026) — replaces 2.5 Flash
- `~google/gemini-flash-latest` — rolling alias, auto-points to newest Flash
- `~google/gemini-pro-latest` — rolling alias, auto-points to newest Pro
- `~anthropic/claude-haiku-latest` — rolling alias, auto-points to newest Haiku

**Gemini fallback** — set `AI_PROVIDER=gemini` to use Google's API directly with
`gemini-2.5-flash`. No per-task model split (Gemini doesn't route through
OpenRouter).

**Offline path (prototype, not merged)** — Dennis built an offline version that
downloads whisper for transcription and distilbert for action-item extraction.
This lives in a separate branch (`conversation_mapper` lineage). The pattern:

1. Check for local whisper binary / wasm module
2. If offline: transcribe locally, run extraction on text (cloud or local model)
3. If online: use the cloud path above

Whisper.cpp WebAssembly or Python subprocess are viable. TalkType has working
offline whisper as a reference. DistilBERT (2019) is a classifier — for 2026
offline extraction, consider a small local LLM (Llama 3.2 1B, Phi-3-mini)
instead. A new `OfflineAIService` wrapper in `services/ai.ts` would check for
local models before falling through to the cloud. Then fall through to the cloud
path.

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

## Next Session — June 24, 2026 Handoff

### What was built this session

**AI model overhaul:**

- Dropped direct Gemini provider (476 lines deleted). OpenRouter-only now via
  one API key.
- Per-task model selection: transcription uses `~google/gemini-flash-latest`
  (native diarisation, 1M context), topics + summary use
  `~anthropic/claude-haiku-latest` ($1/$5 per 1M for quality), everything else
  uses `gemini-3.1-flash-lite` ($0.25/$1.50 for cost).
- All three use rolling `~` aliases so models auto-update.
- Voxtral Small documented as cheaper transcription alternative (no guaranteed
  diarisation).

**Audit hardening:**

- Replaced 4 native `prompt()`/`confirm()` dialogs with accessible `Modal`
  components (API auth, topic rename, topic delete, display name).
- Cross-tab storage sync: `window.addEventListener("storage")` warns when
  another tab edits the active conversation, offers Reload action.
- A11y: `aria-expanded` on collapsibles, `.sr-only` utility class, keyboard
  shortcuts overlay (`?` key).
- 15 new tests (215 total) for auth modal signals, toast actions, and storage
  detection logic.

**Inline style debt reduction (~43%):**

- Added ~20 reusable CSS classes to `static/styles.css` (.modal-stack,
  .modal-actions, .chat-_, .history-_, .live-_, .share-_, .action-*).
- Biggest wins: ActionItemsCard (55→29), MobileHistoryMenu (40→26), ChatSidebar
  (14→2).

**Product features:**

- Keyboard shortcuts cheat sheet (`?` key anywhere).
- History drawer: search by title + date grouping (Today/Yesterday/This
  Week/Older).
- Share polish: copy toast, expiry countdown.
- Bulk actions: "Complete all" + "Clear N done" buttons.
- **Meeting rooms (Phase 1):** host records mic → audio chunks sent every 15s to
  `POST /api/live/chunk` → transcript streams live → PartyKit syncs to viewers.
  Frontend: recording button with timer + live transcript panel in
  `LiveCollabIsland.tsx`.

### What was built this session (June 24, 2026 — Phases 2a, 2b, 2c)

**Voice Relay (2a):**

- `workers/voice-relay/src/index.ts` — Cloudflare Worker issues RealtimeKit
  session tokens
- `routes/api/live/voice-token.ts` — proxy to voice relay Worker
- `islands/VoicePanel.tsx` — WebRTC voice controls (join, mute, speaker
  detection)
- `islands/LiveCollabIsland.tsx` — two-pane grid: voice sidebar + dashboard

**Shared Whiteboard (2b):**

- `islands/SharedWhiteboard.tsx` — Excalidraw embedded in React root,
  PartyKit-synced
- Three-pane grid: voice | dashboard | whiteboard
- `whiteboard-update` message type in party protocol + room

**AI Whiteboard Agent (2c):**

- `core/ai/whiteboardAgent.ts` — scene→line-numbered text, prompt builder,
  operation parser (replace/insert_after/delete), element generator
- `routes/api/live/whiteboard-agent.ts` — server endpoint that calls Claude
  Haiku to edit the whiteboard
- `core/ai/types.ts` — added `chatText()` to AIService interface
- `core/ai/openrouter.ts` — exposed `chatText()` on OpenRouterService
- `islands/LiveCollabIsland.tsx` — "Ask AI to draw" button in whiteboard
  toolbar; sends scene + transcript → agent → applies edits + broadcasts
- `static/styles.css` — `.whiteboard-toolbar` CSS

### Deploy checklist

Voice relay (2a): `VOICE_RELAY_URL`, `VOICE_SHARED_SECRET`, `VOICE_RTC_ENDPOINT`
Whiteboard (2b): `@excalidraw/excalidraw` + `react`/`react-dom` in deno.json
Whiteboard agent (2c): No new env vars — uses existing OpenRouter key

### What's next

**1. Short-append optimisation:**

- On appends where the new transcript is < 30s, skip topic extraction + summary
  generation (just append transcript + check action item status). Saves ~2x on
  repeat analyses.

**2. Pricing tiers (freemium):**

- Free tier: 5 conversations, Flash Lite only, solo, no export.
- $9/mo: unlimited, smart models (Claude for topics/summary, Gemini 3.5 for
  transcription), live meeting rooms, export formats, share links.
- Implementation: add tier gating in `services/requestGuard.ts` or a new
  middleware.

**3. Image/OCR Input (Phase 3):**

- Drag-and-drop images onto whiteboard or topic map.
- tesseract.js extracts text from screenshots/notebook photos.
- Extracted text enters the AI pipeline as if typed.

**4. Offline Mode (Phase 4 — stretch):**

- Moonshine for local transcription (macOS).
- Ollama / llama.cpp for local action item extraction.
- No audio leaves the machine — privacy-first.

### Key files changed this session

- `workers/voice-relay/src/index.ts` — NEW: Cloudflare Worker for voice relay
- `workers/voice-relay/wrangler.toml` — NEW: Worker deploy config
- `workers/voice-relay/package.json` — NEW: Worker npm manifest
- `routes/api/live/voice-token.ts` — NEW: proxy to voice relay Worker
- `islands/VoicePanel.tsx` — NEW: WebRTC voice controls
- `islands/SharedWhiteboard.tsx` — NEW: Excalidraw whiteboard
- `core/ai/whiteboardAgent.ts` — NEW: AI scene editor (prompt + ops)
- `routes/api/live/whiteboard-agent.ts` — NEW: AI whiteboard endpoint
- `core/ai/types.ts` — added `chatText()` to AIService
- `core/ai/openrouter.ts` — exposed `chatText()` on OpenRouterService
- `islands/LiveCollabIsland.tsx` — three-pane grid, recording, AI draw button
- `party/conversationProtocol.ts` — `whiteboard_update` message type
- `party/conversationRoom.ts` — whiteboard relay handler
- `signals/partyService.ts` — `sendWhiteboardUpdate()` + callback
- `deno.json` — `@excalidraw/excalidraw`, `react`, `react-dom`, exclude
  `workers/`
- `static/styles.css` — ~300 lines of voice panel, live layout, whiteboard CSS
- `fresh.gen.ts` — auto-registered new route + islands
- `CLAUDE.md` — updated handoff

## Meeting Rooms — Phase 2 (branch: `meeting-rooms`)

### Vision

ProMapper meeting room = voice chat + shared whiteboard + live AI mapping. One
person opens a room, everyone joins via link. They talk. The AI maps the
conversation AND draws diagrams on a shared canvas. Everyone watches the project
memory form in real-time.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ProMapper Meeting Room (browser tab)                     │
│                                                           │
│  ┌──────────────────┐  ┌───────┐  ┌────────────────────┐ │
│  │ Voice Chat       │  │ Topic │  │ Shared Whiteboard   │ │
│  │ (RealtimeKit)    │  │ Map   │  │ (Excalidraw)        │ │
│  │                  │  │       │  │                     │ │
│  │ 🎙️ Pablo ⚫      │  │ 🕸️    │  │  ┌──┐    ┌──┐      │ │
│  │ 🎙️ Sarah        │  │ nodes │  │  │DB│←──→│API│      │ │
│  │ 🎙️ Dennis       │  │ edges │  │  └──┘    └──┘      │ │
│  │                  │  │       │  │  Both AI + human    │ │
│  │ [Mute] [Record]  │  │       │  │                    │ │
│  └──────────────────┘  └───────┘  └────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Actions ☐ Deploy  ☐ Review  │  Transcript streaming │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Technology Decisions

**Whiteboard: Excalidraw (not drawio).**

- `@excalidraw/excalidraw` — npm package, embed as Preact component
- Scene is a JSON array of elements — trivial to sync via PartyKit
- Built-in `isCollaborating` mode, `onChange` fires on every edit
- `excalidrawAPI.updateScene()` for programmatic AI edits
- `customData` field on each element for ProMapper metadata
- Hand-drawn aesthetic matches pastel-punk vibe
- autopreso already uses it — borrow the edit model pattern

**Voice Relay: fork free4chat (not direct RealtimeKit).**

- `workers/voice-relay/` — Cloudflare Worker, ~200 LOC after stripping Next.js
- Issues RealtimeKit session tokens, manages room lifecycle via KV
- P2P audio: WebRTC data channels, no audio passes through the server
- MIT license, 1.1k stars, battle-tested
- Cloudflare free tier: 10GB WebRTC/month ≈ 100+ meeting-hours free

**AI Whiteboard Agent: adapt autopreso's edit model.**

- Line-numbered text view of Excalidraw scene
- Agent emits `replace`, `insert_after`, `delete` operations
- Apply to canvas via `excalidrawAPI.updateScene()`
- Same AI pipeline as current (OpenRouter → Claude Haiku for reasoning)

**OCR: tesseract.js (client-side).**

- 38k stars, 100+ languages, runs in browser
- No server needed — WASM download ~10MB
- Good enough for notes, screenshots, whiteboard photos

**Offline STT: whisper.cpp (later phase).**

- Cross-platform, mature, multiple model sizes
- TalkType already has working integration
- Moonshine is a nicer macOS option (borrow from autopreso)

### Reference Projects

**autopreso** (MIT, 384★) — realtime speech → Excalidraw whiteboard. Key
patterns to borrow:

- Whiteboard edit model: line-numbered text view →
  `replace`/`insert_after`/`delete` operations (LLM never sees raw Excalidraw
  JSON)
- Two-mode session: `staging` (seed elements) → `live` (AI owns canvas)
- Turn queue: debounced transcript chunks, filler filtering, one-turn-at-a-time
- Agent providers: OpenAI / Codex / Ollama through `@ai-sdk/openai` adapter
- Moonshine: local macOS STT via optional sidecar binary

**free4chat** (MIT, 1.1k★) — WebRTC voice rooms via Cloudflare RealtimeKit. Key
patterns to borrow:

- RealtimeKit Worker: issues auth tokens, manages room lifecycle via KV
- P2P audio: WebRTC data channels, no audio passes through the server
- Room expiry: auto-close after 2h, 30-day KV TTL

**drawio** (6.2k★) — JavaScript diagramming library. Alternative whiteboard
engine to Excalidraw. More diagram types, mature, embeddable.

**moonshine** (8.5k★) — local speech-to-text. The offline transcription path for
sensitive meetings. macOS arm64/x64 binaries available.

### Implementation Plan

**Phase 2a: Voice Relay**

- Fork free4chat's RealtimeKit Worker → `workers/voice-relay/`
- Strip Next.js UI, keep ~200 LOC core (auth tokens, room lifecycle)
- Deploy to Cloudflare Workers (free tier: 10GB WebRTC/month)
- Create `islands/VoicePanel.tsx` — mute/unmute, who's speaking, leave
- Add to `LiveCollabIsland` as the left pane

**Phase 2b: Shared Whiteboard (manual)**

- Embed Excalidraw as `islands/SharedWhiteboard.tsx`
- Sync scene via PartyKit (already built)
- Humans draw manually — click, drag, type
- Toolbar: pen, rectangle, arrow, text, eraser, colors
- Share whiteboard state in room snapshot

**Phase 2c: AI Whiteboard Agent**

- Borrow autopreso's whiteboard edit model:
  - Format scene as line-numbered text
  - Agent emits `replace`/`insert_after`/`delete` operations
  - Apply to canvas via Excalidraw/drawio API
- Trigger: when new topic nodes appear OR user says "draw this"
- Prompt: "You are building a diagram alongside a conversation..."

**Phase 3: Image/OCR Input**

- Drag-and-drop images onto whiteboard or topic map
- tesseract.js extracts text from screenshots/notebook photos
- Extracted text enters the AI pipeline as if typed

**Phase 4: Offline Mode (stretch)**

- Moonshine for local transcription (macOS)
- Ollama / llama.cpp for local action item extraction
- No audio leaves the machine — privacy-first
- Fall through to cloud if local models unavailable

### Pricing Integration

- **Free tier**: solo only, no meeting rooms, no whiteboard, Flash Lite only
- **$9/mo**: meeting rooms, voice relay, shared whiteboard, smart models, export
  formats, share links

### Technical Sketches

**Voice Relay Worker** (`workers/voice-relay/src/index.ts`):

```ts
// Cloudflare Worker — issues RealtimeKit tokens, manages room lifecycle.
// Forked from free4chat, stripped of Next.js. ~150 LOC.

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const roomId = url.pathname.split("/").pop()!;

    // POST /rooms/:id/join — return WebRTC config
    if (req.method === "POST") {
      const exists = await env.KV.get(`room:${roomId}`);
      if (!exists) return new Response("Room not found", { status: 404 });

      const sessionToken = await env.REALTIME_KIT.createSession({
        roomId,
        ttl: 7200, // 2 hours
      });

      return Response.json({
        sessionId: crypto.randomUUID(),
        iceServers: env.TURN_CONFIG,
        sessionToken,
      });
    }

    // GET /rooms/:id — create room
    await env.KV.put(`room:${roomId}`, "active", {
      expirationTtl: 2592000, // 30 days
    });
    return Response.json({ roomId });
  },
};
```

**Voice Panel** (`islands/VoicePanel.tsx`):

```tsx
// Left pane in meeting room — WebRTC voice controls.
// Handles: join/leave, mute/unmute, speaker indicators.

interface VoicePanelProps {
  roomId: string;
}

export default function VoicePanel({ roomId }: VoicePanelProps) {
  const peers = useSignal<Peer[]>([]);
  const isMuted = useSignal(false);
  const isConnecting = useSignal(true);

  useEffect(() => {
    // 1. Fetch session token from Worker
    // 2. Join RealtimeKit room
    // 3. Track remote audio + data channels
    const room = new RealtimeKit.Room(roomId, sessionToken);
    room.on("participantJoined", (p) => peers.value = [...peers.value, p]);
    room.on(
      "participantLeft",
      (id) => peers.value = peers.value.filter((p) => p.id !== id),
    );
    room.on("trackSubscribed", (track) => {
      // Route remote audio to speaker
      const audioEl = new Audio();
      audioEl.srcObject = new MediaStream([track]);
      audioEl.play();
    });
    room.join();
  }, []);

  return (
    <div class="voice-panel">
      <button onClick={toggleMute}>{isMuted ? "🔇" : "🎤"}</button>
      {peers.value.map((p) => (
        <div class={p.isSpeaking ? "speaking" : ""}>{p.name}</div>
      ))}
      <button onClick={leave}>Leave</button>
    </div>
  );
}
```

**Shared Whiteboard** (`islands/SharedWhiteboard.tsx`):

```tsx
// Excalidraw embedded as a Preact island. Syncs via PartyKit.
// Both humans and AI can edit the scene.

export default function SharedWhiteboard({ roomId }: { roomId: string }) {
  const excalidrawRef = useRef(null);
  const [api, setApi] = useState(null);

  // Human edit → broadcast to room
  function onChange(elements, appState) {
    partyService.send({ type: "whiteboard-update", elements, appState });
  }

  // Remote edit → apply to canvas
  useEffect(() => {
    partyService.on("whiteboard-update", ({ elements, appState }) => {
      api?.updateScene({ elements, appState, commitToHistory: false });
    });
  }, [api]);

  return (
    <Excalidraw
      ref={excalidrawRef}
      initialData={{ elements: [], appState: { theme: "light" } }}
      excalidrawAPI={(a) => setApi(a)}
      onChange={onChange}
      isCollaborating={true}
      UIOptions={{
        canvasActions: { export: false, loadScene: false },
      }}
      theme="light"
    />
  );
}
```

**AI Whiteboard Agent** (inspired by autopreso):

```
Data flow:
  Transcript chunk (final) → format scene as line-numbered text
  → build prompt: "You are building a diagram alongside this conversation:
     Transcript: {chunk}
     Current scene: {line-numbered-text}
     Available operations: replace(line, newContent), insert_after(line, text),
     delete(line)"
  → send to Claude Haiku (via OpenRouter)
  → parse response for replace/insert_after/delete operations
  → apply to scene via excalidrawAPI.updateScene()
  → PartyKit broadcasts updated scene to all viewers
```

**Data Flow (complete)**:

```
Browser mic → getUserMedia (24kHz mono)
  ↓
RealtimeKit → P2P audio → other participants hear
  ↓
MediaRecorder → 15s chunks → POST /api/live/chunk
  ↓
Gemini 3.5 Flash → transcription (native diarisation)
  ↓
Claude Haiku → topic extraction + action items + summary
  ↓
PartyKit → broadcast to all viewers
  ↓
Excalidraw onChange → PartyKit → broadcast whiteboard edits
  ↓
(Phase 2c) AI agent → whiteboard tool calls → Excalidraw updateScene
```

### Files to Create (Phase 2a)

```
workers/voice-relay/
  src/index.ts          # Cloudflare Worker
  wrangler.toml          # Deploy config
  package.json

islands/
  VoicePanel.tsx         # WebRTC voice controls (NEW)
  SharedWhiteboard.tsx   # Excalidraw island (Phase 2b, NEW)

routes/api/live/
  chunk.ts              # Already created (Phase 1)
  voice-token.ts        # Proxy to Worker for auth tokens (NEW)
```

### Files to Modify (Phase 2a)

```
islands/LiveCollabIsland.tsx
  → Add VoicePanel as left pane
  → Add SharedWhiteboard (Phase 2b)
  → Layout: voice | dashboard | whiteboard (responsive grid)

signals/partyService.ts
  → Add whiteboard-update message type

party/conversationRoom.ts
  → Handle whiteboard sync messages
```
