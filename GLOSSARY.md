# Glossary

A simple map of the terms and files that make up this mapper.

## Core Ideas

- `AIService` — The clean boundary interface for transcription, topic
  extraction, summaries, and title generation.
- `ConversationFlowResult` — The raw structured data returned by processing
  audio or text.
- `conversationData` — The global Preact signal holding the active project map
  in memory.
- `Topic Graph` — Visual nodes (emojis) and colored connections showing how
  conversation themes relate.
- `Action Item` — A specific task found in the conversation. Can have a person
  assigned, a due date, and completion status.
- `AI Self-Checkoff` — The automatic pass that updates existing action items
  when later conversation mentions work is done.
- `Append Flow` — Folding fresh audio or text into an existing project map to
  grow the shared memory.
- `OpenRouter` — The primary server-side gateway to LLMs (Gemini, Claude,
  Voxtral).

## Key Files

- [README.md](./README.md) — Project setup, overview, and features.
- [CLAUDE.md](./CLAUDE.md) — The dev guide, model architecture, and details.
- [core/README.md](./core/README.md) — Framework-free AI and data transformation
  contracts.
- [core/ai/openrouter.ts](./core/ai/openrouter.ts) — The OpenRouter gateway
  logic.
- [routes/api/process.ts](./routes/api/process.ts) — The endpoint for starting a
  new project map.
- [routes/api/append.ts](./routes/api/append.ts) — The endpoint for appending
  new conversation chunks.

## Project Structure

- `islands/` — Hydrated client-side components (Preact).
- `components/` — Simple presentational cards and static UI.
- `routes/` — Server-side paths, layouts, and API routes.
- `signals/` — Local state triggers and sync logic.
- `utils/` — Small helper scripts.
- `static/` — Pure assets, icons, and styles.
