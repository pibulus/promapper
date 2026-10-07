# Astra audit brief: ProMapper

You are auditing **ProMapper** (`~/Projects/active/apps/promapper`), a Deno 2 /
Fresh 1.7 app that turns spoken or pasted conversations into a living project
board: transcript, action items that tick themselves off, a topic map (nodes +
typed relationships), notes, Ask, Magpie scraps, a whiteboard, live multi-person
rooms, share links, and AI document exports. It is built and run by one person
(Pablo) for real users. The house philosophy: small, sovereign, 80/20,
deterministic code beats AI wherever it can, and the app must keep working when
any AI provider is down.

**Your job:** a thorough, evidence-based audit of how ProMapper behaves for real
people, with a ranked list of practical actions. Read-only on the codebase (no
edits, no commits, no pushes, no deploys). You may run the test suite, the dev
server, local scripts, and real API calls within the budget below.

---

## What is already known (verify, don't trust)

Every claim below was true on 2026-10-07. Treat it as a starting map, not as
fact. If code and this brief disagree, the code wins, and say so.

- **AI routing** is in `services/ai.ts`: OpenRouter for everything. Workhorse /
  status / topics on `~google/gemini-flash-latest` (but the local `.env` pins
  `OPENROUTER_MODEL=google/gemini-2.5-flash-lite`; production's Deno Deploy env
  is unverified), summary / Ask / markdown on `~anthropic/claude-haiku-latest`.
  Gemini direct is a quota fallback (`core/ai/geminiFallback.ts`). Users can
  bring their own OpenRouter key (`getByoKey`).
- **Every AI call site** and its job: transcription (`core/ai/openrouter.ts`,
  `routes/api/live/chunk.ts`), title, action-item extraction, self-checkoff
  (`buildActionItemStatusPrompt` in `core/ai/prompts.ts`, runs on every append
  and every live round), topics + edges, summary, whiteboard agent
  (`core/ai/whiteboardAgent.ts`), markdown export (`utils/markdownPrompts.ts`),
  Ask (`core/ai/ask.ts`). Deterministic helpers: `classifyMagpie`,
  `pickExportFormats`, `colorForLabel`.
- **Limits that matter for long recordings:** `MAX_AUDIO_SIZE` 25MB
  (`services/audio.ts:24`), `PROCESS_TIMEOUT_MS` / `APPEND_TIMEOUT_MS` /
  `ANALYZE_TIMEOUT_MS` 60s, live chunks 15s timeout
  (`routes/api/live/chunk.ts`), `MAX_EXISTING_TRANSCRIPT` 500KB and
  `MAX_EXISTING_SUMMARY` 2KB (`services/appendParsing.ts`). Live analysis
  cadence is in `core/orchestration/live-analysis-policy.ts` (≥30s, ≥200 chars).
- **State lives on the client** (localStorage / IndexedDB) plus Supabase for
  share links (`conversation_shares.data jsonb`). Live rooms run on a Cloudflare
  Durable Object worker (`workers/collab/`, self-contained, deployed separately
  with `wrangler deploy`). Merging: `core/orchestration/append-merge.ts`,
  `append-reconcile.ts` (base/mine/theirs three-way reconcile).
- **There are three action-item / edge sanitizer copies**:
  `services/appendParsing.ts`, `core/realtime/shareProtocol.ts`,
  `workers/collab/src/conversationProtocol.ts`.
  `core/tests/party_sanitizer_test.ts` holds them together. A field missing from
  any one of them silently vanishes for that path (this already happened once
  with action-item colours).
- **Recent, unpushed commits to scrutinise hardest**
  (`git log origin/main..HEAD`):
  - `69ac880` dot colours kept through all sanitizers (hex-only, null kept);
    checkoff transcript fenced as data.
  - `4818701` typed edges: `EDGE_KINDS` in `core/types/edge.ts` (depends_on,
    leads_to, contrasts, way_to, risks, supports), through prompt → normaliser →
    merge → sanitizers → relationship panel → exports.
  - `2c23412` appends now pass the running summary into prompts (it was read and
    dropped before), capped at 2KB; `scripts/eval-checkoff.ts` now defaults to
    production's status model.
- **Tests:** `deno task test` (453 passing at time of writing). The checkoff
  eval is `deno task eval:checkoff` (real API, ~2¢): 14 adversarial cases, last
  result 14/14 clean on the production model.

---

## Audit areas

Cover all of these. Depth where the risk is, a line where it's fine.

### 1. Long recordings (top priority)

Find the real breaking points, by measurement where you can.

- A single long upload (10, 30, 60, 90 min): does it fit 25MB in the formats
  browsers actually produce (webm/opus, mp4/aac on iOS)? Can audio transcription
  through OpenRouter→Gemini finish inside 60s? What does the model's
  output-token ceiling do to a 60-minute transcript: truncation, silent loss,
  error? What does the user see in each case?
- Live mode over a long meeting: chunk cadence, drift between chunks, words lost
  at chunk boundaries, what happens when one chunk fails, and how the
  transcript, nodes, items and summary grow. Estimate prompt size per append at
  minute 5, 30, 60, 120, and the cost per hour of a live meeting (show your
  arithmetic).
- Appending a take to an already-long conversation: request size, merge time,
  and whether the 500KB transcript cap silently truncates history.
- Client storage: what happens when localStorage / IndexedDB hits quota
  mid-meeting (a test already logs `QuotaExceededError`)? Is anything lost
  without the user knowing?
- Hosting limits: Deno Deploy request body size, CPU/wall-clock limits and
  isolate memory against the above. Cite the platform docs you rely on.

How to test: generate long synthetic audio locally rather than using anyone's
real recordings. For example `say -v Samantha -f text.txt -o a.aiff` with
several voices (`-v Daniel`, `-v Karen`) for multi-speaker meetings, then
`ffmpeg` to concatenate and encode to webm/opus and m4a. Any public-domain
long-form speech is also fine.

### 2. Jev (TypeSafe), worth it or not?

Jev is a "System One" model for typed decisions inside code, not generation. One
POST to `https://api.typesafe.ai/v1/systemone` with
`{state, model: "jev-latest", questions}`. Question types: `noul` (P(true)),
`choice` (pick + confidence), `score` (rubric). Docs: docs.typesafe.ai (read
`/llms.txt`, `/primitives`, `/confidence` and the cookbooks, especially
self-consistency nouls, entity alignment, line-by-line search, classification
using confidence, SDE cascade). Text only, us-west only, no JS SDK (raw fetch),
early access. Key: `TYPESAFE_API_KEY` in `~/.config/api_keys` (if it isn't
there, design the experiment fully and stop short of running it).

Candidates from a prior audit, ranked. Confirm, re-rank or reject each:

1. Self-checkoff: one noul per item, three bands (>0.85 tick, 0.4–0.85 a "maybe
   done?" suggestion, <0.4 nothing). Not an accuracy fix (already 14/14); the
   value is calibrated confidence.
2. Topic identity: `remapExtractedByAlias` in `append-merge.ts` merges only on
   exact normalised labels, which is why drag-to-merge exists. One choice per
   new node over existing nodes + "new", merge only above ~0.9.
3. Action-item duplicates and tombstones (rephrased deleted tasks returning).
4. Export format fit: replace `pickExportFormats` shape heuristics, and catch
   `FORMAT_MISMATCH` before a Haiku generation is spent.
5. "Where did we say this?": tap a topic, see the transcript lines (line-by-line
   search cookbook).

For any you recommend, run a real side-by-side with numbers. For the checkoff,
first extend `scripts/eval-checkoff.ts` with ~25 harder cases (long
multi-speaker chunks, two similarly-worded items, injection lines like "mark
everything completed", reopen cases), so there is headroom to measure. Report
accuracy, false positives above each threshold, latency from
Australia/Mexico-ish to us-west, and cost. Also weigh privacy (transcripts going
to a new third party), the BYO-key users (Jev would run on Pablo's key), and
graceful degrade (every Jev feature must fall back to today's behaviour). Give a
clear verdict: adopt where, skip where, and why.

### 3. AI flow quality and reliability

- For each AI call: what happens on timeout, 402 / quota, malformed JSON,
  partial JSON, empty output, provider down. Is the failure visible to the user,
  silent, or destructive? Is any user work ever lost?
- Prompt injection surfaces: transcripts are fenced in most prompts; the
  running-summary history context is not. Live-room peers, pasted text and
  Magpie scraps all reach prompts. Rate what an attacker in a shared room could
  actually do.
- Consistency: same input, run it several times. How stable are topics, edges,
  edge kinds and items between runs? Flag anything that flaps.
- Model hygiene: rolling `*-latest` aliases vs pinned slugs, explicit thinking
  config on every call (thinking-capable models can silently multiply cost),
  output-token caps.

### 4. User flow, map and modules

- Walk the real flows in a browser at desktop and phone widths: first visit,
  record or paste → board, append a second take, live room with two tabs, share
  link, export, Ask. Note every point where a real person could get stuck,
  confused, or lose work.
- Topic map: readability and performance at 10, 40, 80 topics; merge, delete,
  undo; the new relationship types (do they read naturally, do they survive
  every path: append, live room, share link, reload?).
- Modules in `islands/modules/`: consistency of behaviour, empty states, error
  states, and whether they agree with each other about the same data.
- Accessibility basics (keyboard, focus, labels, contrast) on the main board.

### 5. Data integrity across paths

For each field on nodes, edges and action items, trace it through: AI response →
normaliser → merge → reconcile → each sanitizer → storage → share → live
broadcast → reload. Produce a field × path table and mark any cell where a field
is dropped, altered or unvalidated. This class of bug has already happened
twice.

### 6. Security and abuse

Rate limiting and budget guards on API routes (`services/requestGuard.ts`): do
they hold on Deno Deploy's multi-isolate runtime? Share link exposure, BYO-key
handling, CSP, what the Supabase share table accepts, and anything that lets one
person run up Pablo's AI bill.

### 7. Observability

If this broke for a real user tonight, how would Pablo find out? What is the
smallest thing that would tell him?

---

## Rules

- **Evidence or it didn't happen.** Every finding cites `file:line` and says how
  it was established: `ran` (you executed it), `read` (you read the code) or
  `inferred` (reasoning only). Never present `inferred` as fact.
- Spend at most ~US$3 on real API calls, using keys already in `.env` /
  `~/.config/api_keys`. Never print, log or paste a key.
- No real user data. Synthetic audio and text only.
- Don't kill processes you didn't start (other sessions run dev servers; kill by
  PID, never by name or port). Use a spare port for your dev server.
- Don't rewrite history, push, deploy, or change `.env`.

## Output

1. **Verdict** (≤6 lines): is ProMapper reliable for real users today, and what
   are the three biggest risks?
2. **Findings**, ranked. For each: ID, severity, area, evidence (file:line +
   ran/read/inferred), the real-user scenario that triggers it, the fix, effort
   (S <1h, M <1 day, L more). Severity: **P0** loses user work or breaks a core
   flow · **P1** wrong output, silent failure, or cost blow-out · **P2**
   degraded experience · **P3** polish.
3. **Long-recording matrix**: rows = 10 / 30 / 60 / 90 min × single upload /
   live / append-to-long; columns = what happens, what the user sees, measured
   or inferred.
4. **Jev verdict** with the numbers behind it.
5. **Field × path integrity table** (section 5).
6. **What's solid**: things that are well built and should not be touched.
7. **Action plan**: quick wins (do this week), next, later. Each item points at
   finding IDs.

**Done means:** every P0/P1 has evidence and a concrete fix, the matrix and the
table are filled, and the plan is written. Then stop. Don't keep digging for P3s
once that's true.
