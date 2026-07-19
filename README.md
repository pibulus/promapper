# 🧠 ProMapper

> Turn messy conversations into living project maps.

**ProMapper** is a friendly, local-first way to capture the shape of something
while it is still unfolding. A voice note, a weekly check-in, a research
session, a film scene, a court case, a messy written rant—it instantly maps into
a transcript, a summary, action items, an interactive topic map, and exportable
markdown docs.

The useful part is that a project map can keep growing. Add more audio or text
later and ProMapper folds the new material into the same project memory.

## 📸 A look around

|                                       The front door                                        |                                  The living dashboard                                   |
| :-----------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: |
| ![Front page — talk it out, paste a rant, or drop a recording](static/promo/front-page.png) | ![Dashboard — transcript, summary, action items, topic map](static/promo/dashboard.png) |

|                              The module rack                               |                           In a pocket                           |
| :------------------------------------------------------------------------: | :-------------------------------------------------------------: |
| ![Modules — Notes, Bishop, Radio, Tones, Canvas](static/promo/modules.png) | ![Mobile — the same board, one column](static/promo/mobile.png) |

Every roll of the dice re-tints the whole app from curated color pairs — your
screenshots may be wearing a different sky.

## ✨ Key Features

### 🎤 Capture → Shape

- **Record or upload** audio files
- **Automatic transcription** that tidies the talk and names the speakers
- **Reads the conversation** and pulls out topics, action items, and a summary,
  all at once
- **Real-time visualizer** during recording sessions

### 🤖 Self-Checkoff (The Magic Feature)

User says: _"I finished writing that report"_ → the "Write report" action item
quietly marks itself ✓ Complete. New audio or text gets read against the open
action items, and their status updates to match what was said.

### 🕸️ Interactive Topic Graph (EmojimapViz)

- **Non-chronological visualization** of conversation themes
- **Emoji-based nodes** with colored relationship edges
- **Force-directed layout** for organic topic clustering, helping participants
  circle back to interrupted thoughts

### 🎙️ Collaborative Meeting Rooms (Live Mode)

- **Multiplayer sync**: Real-time cursor presence, chat rooms, and named avatars
  (e.g. _"Glitch Koala"_) powered by PartyKit.
- **Shared Whiteboard**: Collaborative sketchpad using Excalidraw — people and
  the board's own helper hand can draw diagrams side-by-side.
- **WebRTC Voice Relay**: Zero-latency P2P voice chat with active speaker
  highlights, powered by Cloudflare RealtimeKit SFU.

### 📤 Markdown Exports

Turn the same project map into different useful documents:

- Blog posts & Technical documentation
- Meeting summaries & FAQ sections
- Person-by-person action lists
- Diarised transcripts
- Haiku poems (why not?)

### 🎨 Soft Neo-Toybrut UI

- **Mesh gradient backgrounds** (animated SVG)
- **Tactile Sound FX**: Clientside synthesized Web Audio cues (chimes, ticks,
  whooshes) for interface actions
- **Theme-aware styling**: Sleek, pastel palettes (Bubblegum, Sky, Grape, Lime,
  Gold)
- **Draggable cards** for customizable dashboard layouts
- **Fully responsive** mobile views with CSS momentum scroll-snapping

## 🚀 Quick Start

### Prerequisites

- **Deno** (v1.40+):
  [Install Deno](https://deno.land/manual/getting_started/installation)
- **OpenRouter API Key**: [Get API key](https://openrouter.ai/keys)
  - Gemini can still be used as a fallback provider.

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/pibulus/promapper.git
   cd promapper
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your provider API key:
   ```bash
   AI_PROVIDER=openrouter
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENROUTER_MODEL=google/gemini-2.5-flash-lite
   API_AUTH_TOKEN=choose_a_secret_value

   # Optional: harden server routes & sessions
   ALLOWED_ORIGINS=http://localhost:8003
   API_RATE_LIMIT=60
   API_RATE_WINDOW_MS=60000
   API_SESSION_TTL_MS=14400000
   API_COOKIE_SECURE=false

   # Optional Gemini fallback
   # AI_PROVIDER=gemini
   # GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Start the development server**
   ```bash
   deno task start
   ```

   The app will be available at `http://localhost:8003`

4. **First API call**

   When you trigger any feature that reads the conversation from the UI, the
   browser will prompt you for the `API_AUTH_TOKEN`. Paste the same value you
   set in `.env`—it’s only used to open a short-lived HttpOnly session cookie,
   so it’s never stored in LocalStorage and you’ll be prompted again when the
   session expires.

   Whenever you stop a clip that’s at least 30 seconds long, we automatically
   save a `.webm` backup in your Downloads folder so you can re-upload if
   anything goes wrong.

### First Use

1. **Record** a conversation or **upload** an audio file
2. Give it a moment to read the conversation (usually 10-30 seconds)
3. **Explore** the dashboard:
   - 📝 Transcript with speakers
   - 📊 A summary drawn from the talk
   - ✅ Action items with assignees
   - 🕸️ Topic relationship graph
4. **Export** to different formats using the drawer
5. **Share** conversations with shareable links

## 📚 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Development guide for future coding sessions
- **[core/README.md](./core/README.md)** - Framework-agnostic reading-engine
  documentation
- **[GLOSSARY.md](./GLOSSARY.md)** - Terms and file map for the codebase

## 🏗️ Architecture

```
/core/                  # Framework-agnostic reading engine
  ├── ai/              # Provider wrappers & prompts
  ├── orchestration/   # Parallel processing flows
  ├── realtime/        # Share-room protocol and storage adapters
  ├── types/           # TypeScript type definitions
  ├── storage/         # localStorage & share services
  └── export/          # Format transformers

/islands/              # Interactive Preact components (Fresh)
/components/           # Shared UI components
/routes/               # Fresh routes & API endpoints
/signals/              # Global state (Preact signals)
/utils/                # Utility functions
/services/             # Server-side API/auth/audio helpers
```

The core reading engine (`/core/`) is extracted into pure TypeScript and can be
used in **any framework** (React, Vue, Svelte, etc.). Fresh is just the current
UI implementation.

## 🛠️ Development

### Available Commands

```bash
deno task start      # Start dev server (port 8003)
deno task build      # Build for production
deno task preview    # Preview production build
deno task check      # Run linting and type checking
```

### Tech Stack

- **Framework**: [Fresh](https://fresh.deno.dev/) (Deno + Preact)
- **Reading engine**: OpenRouter primary, Google Gemini fallback
- **Visualization**: [D3.js](https://d3js.org/) (force-directed graphs)
- **State**: [Preact Signals](https://preactjs.com/guide/v10/signals/)
- **Storage**: LocalStorage, URL shares, optional Supabase share store
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)

## 🎯 Good Fits

- **Weekly projects**: keep actions, summaries, and decisions moving over time
- **Research groups**: turn ongoing conversations into shared context
- **Personal notes**: get a rant, idea, or plan into a shape you can use
- **Scenes and cases**: map who said what, what matters, and what connects
- **Shared work**: send a project map instead of a pile of notes

## 🔐 Privacy

- All processing happens through the provider you configure
- Conversations stored locally in browser (localStorage)
- Small share links use compressed URL data
- Larger share links use `/api/share` with Supabase when configured, or an
  in-process memory store during local development
- No analytics or tracking

## 📝 License

MIT License - see [LICENSE](./LICENSE) file for details

## 🤝 Contributing

[Add contributing guidelines if you want contributions]

## 🙏 Acknowledgments

Built with:

- [Fresh](https://fresh.deno.dev/) - The next-gen web framework
- [OpenRouter](https://openrouter.ai/) - OpenAI-compatible AI gateway
- [Google Gemini](https://ai.google.dev/) - Optional multimodal fallback
- [D3.js](https://d3js.org/) - Data visualization

---

**Made with ☕ and lots of conversations**
