# HORIZON — the big picture (July 9, 2026)

What ProMapper is when it's finished: **the loop is the product.** You talk, the
map grows, you do things, you talk again. Everything below serves that loop —
capture that never loses words, intelligence that explains itself, and a home
for the whole thing that isn't someone else's cloud.

## The offline story, in honest stages

"Whisper can't do lists" is the right frame: transcription and understanding are
different problems with different offline answers.

**Stage 0 — offline-first capture (SHIPPED, commit with this doc).** Takes
persist to IndexedDB BEFORE any AI runs — that's been true since the recording
dock era. New: a take that never got mapped (no receipt — recorded in a dead
spot, API down, tab closed) now glows in the takes panel with a map-this-take
wand, and a consent-ful action toast offers "Map now" on load and when
connectivity returns. Never auto-spends an AI call. The promise this completes:
_you can always talk; the map catches up when it can._

**Stage 1 — offline transcription (the talktype port).** talktype has this
WORKING and inventoried (see below): transformers.js v4 + whisper-tiny.en q4
(~96MB), Cache API storage, explicit opt-in, never auto-downloads. Port points:
self-host the ort WASM same-origin (Fresh equivalent of their sync script), wrap
inference in a Web Worker (talktype runs it on the main thread — fine for
dictation, tab-freezing for meetings), and accept speakerless transcripts (tiny
has no diarization). Output feeds the existing text-append path.
Topics/tasks/summary queue for reconnect via Stage 0's rescue flow — offline you
get words, online they become a map.

**Stage 2 — the home cloud (the most Pablo answer).** The Pi 5 at pibulus.local
changes the question. "Offline" for a laptop can mean "on my LAN":
faster-whisper (24k★, starred) or WAAS (2k★, starred, queue+GUI) on the Pi does
fast transcription, **whisperX (22.9k★, starred) adds real speaker diarization**
— the one thing browser-side whisper can't do and the thing ProMapper's whole
pipeline shapes around. Ollama on the Pi covers extraction (lists!) with zero
per-token cost. Internet down, house up: full pipeline. That's "can't scale IS
the feature" as architecture — an `OLLAMA/LAN_AI_URL` provider in services/ai.ts
behind the existing AIService seam.

**Stage 2b — browser-local extraction (fallback research).**
WebLLM/transformers.js small models (Llama 3.2 1B / Qwen 0.6B) can do
action-item extraction on WebGPU desktops (~700MB download). Real, but the Pi
path beats it on every axis for Pablo's actual life. Park unless the Pi path
stalls.

## From the stars (gh-stars sweep, July 9)

- **m-bain/whisperX** — offline diarization. The missing piece; Pi-side.
- **SYSTRAN/faster-whisper** — the Pi transcription engine.
- **schibsted/WAAS** — whisper-as-a-service with queueing; deploy pattern.
- **sindresorhus/awesome-whisper** — the index when choices come up.
- **moonshine-ai/moonshine** — already in the Phase 4 plan (macOS STT).
- **PaddleOCR (85k★)** — server-grade OCR for Phase 3 image/doc appends
  (tesseract.js stays the in-browser option).
- **hvianna/audioMotion-analyzer** — live waveform juice for the header mic
  while recording (tiny, delightful; the "visual feedback" question again).
- **khmyznikov/pwa-install (+ ios-pwa-wrap)** — make ProMapper installable; a
  PWA manifest + service worker is also the prerequisite for Stage 1's offline
  shell. These two stars are the "make local-first tangible" pair.

## Whiteboard — how it actually works (verified live July 9)

`islands/SharedWhiteboard.tsx` mounts Excalidraw (React 18 in a Preact app,
dynamically imported with a process-shim + CJS interop fix — it never rendered
before that fix). Live-session only, full-width under the dashboard. Every
stroke → `handleSceneChange` (DashboardIsland) → throttled 200ms PartyKit
broadcast + 2s-debounced persistence into `conversationData.whiteboardScene`.
The room stores the scene and serves it in INIT, so late joiners and reloads see
the drawing. The AI can draw too: `core/ai/whiteboardAgent.ts` turns the scene
into line-numbered text, Claude Haiku (via OpenRouter) emits
replace/insert/delete ops, applied via `excalidrawAPI.updateScene` and broadcast
— triggered manually (pencil) or every ~3rd transcript chunk with a 30s
cooldown.

## Vibes ledger (what the product feels like when it's right)

Talk without ceremony. See the map breathe when you come back. Nothing begs —
words stay out of the way, color carries identity, the dice makes the vibe
yours. Everything on your device (footer says so, storage proves it). The Pi
makes even the intelligence yours. No accounts, no feed, no metrics — a tool
with a soul that does ONE thing: turns talk into shape.
