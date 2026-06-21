# Glossary

Short reference for the main terms and files in this repo.

## Core Terms

- `AIService`: Provider-neutral interface for transcription, extraction,
  summary, title, and markdown generation.
- `ConversationFlowResult`: The structured result returned by
  `processText()`/`processAudio()`.
- `conversationData`: The global Preact signal that holds the active
  conversation in the UI.
- `topic graph`: Emoji nodes plus colored edges that visualize conversation
  themes and relationships.
- `action item`: A task extracted from the conversation, optionally with
  assignee, due date, and status.
- `AI self-checkoff`: The follow-up pass that marks existing action items
  completed or pending based on later context.
- `append flow`: The path used when new audio is added to an existing
  conversation.
- `OpenRouter`: The primary AI provider in this repo.
- `Gemini`: The fallback provider and the source of the original multimodal
  upload flow.

## Important Files

- [README.md](./README.md): Product overview, setup, and user-facing docs.
- [CLAUDE.md](./CLAUDE.md): Current dev guide and architecture map.
- [core/README.md](./core/README.md): Core AI flow and exports.
- [core/ai/types.ts](./core/ai/types.ts): Provider-neutral AI contract.
- [core/ai/openrouter.ts](./core/ai/openrouter.ts): OpenRouter implementation.
- [core/ai/gemini.ts](./core/ai/gemini.ts): Gemini fallback implementation.
- [services/ai.ts](./services/ai.ts): Provider selection and caching.
- [services/audio.ts](./services/audio.ts): Audio upload / inline part
  conversion.
- [routes/api/process.ts](./routes/api/process.ts): New conversation endpoint.
- [routes/api/append.ts](./routes/api/append.ts): Append audio endpoint.
- [routes/api/markdown.ts](./routes/api/markdown.ts): Provider-agnostic markdown
  export endpoint.

## UI Layout

- `islands/`: interactive Preact components
- `components/`: shared presentational pieces
- `routes/`: Fresh pages and API routes
- `signals/`: app state and persistence
- `utils/`: client-side utilities
- `static/`: CSS and static assets

## Provider Notes

- OpenRouter is the default provider.
- Gemini can be enabled by setting `AI_PROVIDER=gemini`.
- `.env` is ignored and should hold local keys only.
