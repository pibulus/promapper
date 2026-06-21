# ProMapper Core

Framework-agnostic AI orchestration for turning conversation text or audio into
structured data.

## Responsibilities

- Build transcripts from audio inputs.
- Extract action items and assignees.
- Detect action item status changes from follow-up context.
- Extract emoji topic nodes and relationship edges.
- Generate summaries, titles, and markdown exports.

Provider-specific SDK details stay behind the `AIService` interface.

## Ownership Boundaries

ProMapper is layered so each directory has one job. A future editor (human or
LLM) can reason about a change by knowing which layer it belongs in. The rule of
thumb: imports point _downward_ (UI → state → core), never upward.

| Layer         | May import                         | Must NOT import                          | Runs where       |
| ------------- | ---------------------------------- | ---------------------------------------- | ---------------- |
| `core/`       | other `core/`, std types           | Preact, Fresh, browser APIs, `services/` | anywhere (pure)  |
| `services/`   | `core/`, Deno/server APIs          | Preact, `islands/`, `components/`        | server only      |
| `signals/`    | `core/` types, `@preact/signals`   | `services/`, server-only APIs            | browser state    |
| `islands/`    | `signals/`, `components/`, `core/` | `services/` directly (call routes)       | hydration roots  |
| `components/` | `core/` types, `signals/` (read)   | `islands/` (no upward imports)           | pure render      |
| `routes/`     | anything (entry points)            | —                                        | server + hydrate |

Notes:

- `core/` is the framework-agnostic brain. It has zero Preact/Fresh/browser
  imports so it stays portable and unit-testable. All AI provider specifics hide
  behind the `AIService` interface in `core/ai/types.ts`.
- `services/` is server-only (env vars, provider keys, audio upload). Islands
  never import it; they call API routes, which keeps keys off the client.
- `islands/` are the only hydration roots. A presentational file that needs
  state or browser APIs should still live in `components/` when it is always
  rendered _inside_ an island (Preact hydrates the whole island subtree).
- `components/` must never import from `islands/`. If a component reaches up
  into an island, either the island leaf should become a component, or the
  component is actually an island.

## Structure

```text
/core/
├── ai/
│   ├── types.ts                # Provider-neutral AIService and audio types
│   ├── prompts.ts              # Prompt builders
│   ├── helpers.ts              # Shared JSON/speaker parsing helpers
│   ├── openrouter.ts           # OpenRouter chat/audio implementation
│   └── gemini.ts               # Gemini fallback implementation
├── types/
│   ├── action-item.ts
│   ├── conversation.ts
│   ├── conversation-data.ts
│   ├── edge.ts
│   ├── node.ts
│   ├── transcript.ts
│   └── index.ts
├── orchestration/
│   ├── conversation-flow.ts    # Main Audio/Text -> Data flow
│   ├── parallel-analysis.ts    # Parallel topics/actions/status/summary
│   └── append-merge.ts         # Merge appended results + AI self-checkoff
├── realtime/
│   ├── shareProtocol.ts        # Sanitized share-room contract
│   └── shareStore.ts           # Memory/Supabase share-store adapters
└── index.ts                    # Public exports
```

## Provider Setup

OpenRouter is the primary provider:

```typescript
import { createOpenRouterService } from "./core";

const aiService = createOpenRouterService({
  apiKey: openRouterApiKey,
  model: "google/gemini-2.5-flash-lite",
});
```

Gemini can still be used directly:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createGeminiService } from "./core";

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
const aiService = createGeminiService(model);
```

The Fresh server normally uses `services/ai.ts` to select and cache the service
from environment variables.

## Processing Text

```typescript
import { processText } from "./core";

const result = await processText(
  aiService,
  text,
  conversationId,
  speakers,
  existingActionItems,
  existingNodes,
);
```

## Processing Audio

Server routes should create a provider-specific `AudioPart` first. In this app,
that is handled by `services/audio.ts`.

```typescript
import { processAudio } from "./core";
import { uploadAudioFile } from "../services/audio.ts";

const { part: audioPart, fileName } = await uploadAudioFile(file);

try {
  const result = await processAudio(
    aiService,
    audioPart,
    conversationId,
    existingActionItems,
    existingNodes,
  );
} finally {
  await deleteUploadedFile(fileName);
}
```

## Result Shape

`processText()` and `processAudio()` return a `ConversationFlowResult` with:

- `conversation`
- `transcript`
- `nodes`
- `edges`
- `actionItems`
- `summary`
- `statusUpdates`

Topic nodes include `label`, `emoji`, and `color`; edges include source/target
topic IDs and color.

## Flow

```text
Text or provider-specific audio part
    ↓
Transcription, if audio
    ↓
Parallel analysis
    ├── Topic/Node extraction
    ├── Action item extraction
    ├── Existing action status checks
    └── Summary generation
    ↓
Title generation
    ↓
ConversationFlowResult
```

## Markdown Export

Markdown export prompts live in `utils/markdownPrompts.ts` and are served by the
`/api/markdown` route via `utils/markdownService.ts`.
`aiService.generateMarkdown` runs the chosen prompt against the active provider.
(A future export-format registry will consolidate these — see the main
`CLAUDE.md` plan.)

## Test Coverage

Core tests live in `core/tests/` and cover:

- prompt builders
- Gemini response parsing and failure paths
- OpenRouter request formatting
- text/audio orchestration
- parallel analysis behavior

Run them with:

```bash
deno task test
```
