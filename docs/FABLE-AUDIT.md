# FABLE AUDIT — 2026-07-05

Branch: `fable-audit-2026-07-05` (from the `meeting-rooms` tip; WIP stash
`fable-audit-safepoint WIP` kept as a safety net — never dropped).

Verification after every commit: `deno task check` ✅ · `deno task test`
**200/200** ✅ · `deno task build` ✅ · curl smoke tests on the hardened
endpoints ✅.

---

## 🚨 Production-breaking / launch-blocking (all FIXED)

1. **Share routes leaked raw Supabase/provider errors to unauthenticated
   callers.** `GET /api/share/:id` is public; a DB failure forwarded PostgREST's
   message (table names, RLS hints) verbatim. Both share routes now return fixed
   strings; detail is server-log only.
2. **`POST /api/share/create` had no body-size cap** — the only JSON route that
   buffered an unbounded body before validation. A multi-hundred-MB POST was an
   easy OOM on Deploy's 128MB budget. Now 413s above 5MB before `req.json()`.
3. **Supabase share-store fetches had no timeout** (the only unguarded outbound
   fetches in the app). A hung Supabase = hung isolate on a user-facing path.
   Both now use `AbortSignal.timeout(10s)`.
4. **SSR state bleed:** `HomeIsland` and `MarkdownMakerDrawer` kept per-UI state
   in **module-level** `signal()`s. Module scope is shared across concurrent SSR
   requests — one visitor's in-flight demo modal / generated markdown could
   render into another visitor's first paint. All moved to `useSignal` inside
   the components.
5. **Malformed 200s corrupted state:** `/api/process` & `/api/append` responses
   were committed to `conversationData` (→ localStorage) before any shape check,
   then crashed on the toast line. New `utils/coerceFlowResult.ts` validates +
   backfills before anything touches the signal; same guard added to the
   shared-conversation loader (missing `conversation` object previously
   white-screened the shared view).
6. **The WIP carried a typecheck breaker** (`audio.playsInline` doesn't exist on
   `HTMLAudioElement`) — the branch wouldn't build as-is. Fixed via the
   `playsinline` attribute (which is what iOS actually reads).

## 🛡 Hardening (fixed)

- **voice-token fail-closed:** with `VOICE_RELAY_URL` unset in production it
  minted dead-end STUN sessions; now 503s on Deploy (local dev unchanged).
- **whiteboard-agent:** non-string `transcript` threw an unhandled TypeError
  (500 with stack in logs); `topics` fields flowed into the AI prompt
  unvalidated; no body cap. All three fixed.
- **process/markdown input guards:** non-string `text`/`prompt` skipped the
  length caps by construction; `speakers` was unbounded. Type-enforced + capped.
- **authSessions revocation sweep** deleted the _entire_ revocation set when it
  hit 1000 (the loop body was unconditional) — recently revoked sids became
  replayable. Now drops only the oldest half.
- **PartyKit room:** the `transcript_chunk` relay embedded the raw
  `Party.Connection` object in the broadcast payload (internals leak; clients
  never read it). Removed; `speakers` sanitized to ≤50 short strings.
- **Share lookup format guard:** junk shareIds now 404 immediately instead of
  costing a Supabase round-trip each (public endpoint).

## 🎙 Voice / live sad paths (fixed)

- **AudioContext leaks in VoicePanel:** aborted/failed joins never closed the
  context; browsers cap ~6 per tab, so repeated failures bricked voice until
  reload. Both early-return paths now clean up; `close()` guarded.
- **Terminal WebRTC failure** left the mic + level-polling running behind a dead
  connection; `connectionState === "failed"` now tears down fully with a toast
  ("disconnected" still waits — it can self-recover).
- **Live-mode mic failures were 100% silent** (`silentMicError: true` with no
  caller-side handler). Now surfaced, and mic errors are differentiated:
  permission denied / no mic / mic busy in another app / server unreachable.
- **Silence-analyser death = transcript death:** chunks only flushed from the
  silence monitor; if analyser setup threw, nothing flushed until Stop. Setup is
  now try/caught with a timed-flush fallback (degraded but alive).
- **`/live/:roomId` with no PartyKit host configured** rendered a normal-looking
  homepage that silently wasn't live. Now an honest explainer page.
- **Offline auth ping** surfaced as "Couldn't access microphone"; the 45s
  request timeout surfaced as "The operation was aborted". Both are humane now.

## 🧹 Dead code & docs (fixed)

- Deleted 6 zero-reference components (NumberTicker, LoadingIndicator, Tooltip,
  ShimmerButton, BorderBeam, Icon) + 3 orphaned deps (`@floating-ui/dom`,
  `lucide-preact`, `@google/generative-ai`). All recoverable from git history.
- Stripped 25 debug `console.log`s from production paths (error/warn kept).
- Deduped `localDateISO` (two identical copies) into `core/storage/dates.ts`.
- CLAUDE.md no longer claims a Gemini fallback / `AI_PROVIDER` switch /
  `core/ai/gemini.ts` (deleted in June); env example updated to the real vars;
  noted that `LiveCollabIsland`/`ChatSidebar` were absorbed into `HomeIsland`.
  core/README stale GoogleGenerativeAI snippet removed.
- A11y: delete-confirm modal got `role="dialog"`, `aria-modal`, Escape close,
  backdrop-click close, focus lands on Cancel.

## ⚠️ Deliberately left open (ranked by launch impact)

1. **Rate limiting is a no-op on Deno Deploy.** The per-IP limiter is a
   module-scoped Map; each isolate starts empty, so in production nothing is
   actually throttled — including the public share endpoint and every AI route.
   Auth is the only real gate, so a leaked `API_AUTH_TOKEN` means uncapped AI
   spend. Real fix needs shared state (Deno KV) and deserves its own focused
   session + cost thinking. The code comment in `services/requestGuard.ts`
   already documents this honestly.
2. **No reconnect-flush for live edits.** Edits made while the PartySocket is
   down are silently dropped (send helpers return `false`, callers ignore it).
   Fine for viewing, lossy for editing during a blip. A single-slot "pending
   snapshot flushed on reconnect" in `liveSync.ts` would cover it — touches the
   loopback-guard logic, which is subtle enough that I didn't want to
   destabilize it in an audit pass.
3. **VoicePanel peer identity is keyed by `track.id`** and display names are
   matched by join order — multi-track peers or out-of-order joins mislabel
   people. Cosmetic-ish, but a real protocol fix (IDs in signaling) is Phase-2
   work.
4. **`UploadIsland` still has its own inline recorder** (predates the
   `useRecorder` hook that HomeIsland/AudioRecorder share) plus a shadowed
   `formatTime`. Highest-value dedupe left, but it rewires the core happy path —
   wants real-device QA in the same sitting, not a drive-by.
5. **Focus trapping** in drawers/modals (Tab can still walk out of them).
   Escape/backdrop/focus-landing are in; a proper trap is a small shared utility
   worth doing once for all overlays.
6. **SharedWhiteboard loopback guard** is a `setTimeout(0)` heuristic (the WIP
   improved it and documents the race); a version-counter protocol would be
   robust but touches the party protocol.

## Commits on this branch

- `31470d7` fix: 📱 mobile/iOS hardening (WIP carried from meeting-rooms)
- `5cafdb8` chore: 🧹 settings.local.json permission additions
- `f60a042` fix: 🛡️ server hardening — share error leaks, body caps, fetch
  timeouts, input guards
- `e0fc785` fix: 🐛 client correctness — SSR signal bleed, response-shape
  guards, voice/mic sad paths
- `4022560` chore: 🧹 dead code sweep — 6 unused components, 3 orphaned deps,
  debug logs, dedupe
- (this commit) docs: CLAUDE.md accuracy + this report
