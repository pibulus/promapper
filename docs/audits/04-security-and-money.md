# Audit pass 04 — security & the money layer

You are auditing ProMapper, a Deno Fresh + Preact app that turns messy audio and
text into a living project map. Read `CLAUDE.md` at the repo root first.

**Report only. Do not modify any file.**

## Why this subsystem

Two things can go wrong here and both land on a real person. Someone else's
**conversation** leaking — into a log, a share link, a peer's browser. Or
someone else's **bill**: every AI call spends the owner's OpenRouter, Deepgram
and Cloudflare money, and the pricing model is a flat $12/year with no meters.
An unbounded abuse path isn't an abstraction; it's his card.

This is an indie app with no server-side user accounts. The guards are
lightweight by design. The question is not "is this enterprise-grade" — it is
"can a bored person with curl cost him money or read someone's meeting".

## The owner's goal

_"I don't want to touch this thing again after I release it."_ No deadline. But
do **not** invent work — a threat model of "a determined attacker with the
user's device" is out of scope, and speculative hardening is bloat he'd have to
maintain.

## Scope

```
services/requestGuard.ts      origin allow-list, rate limits, budgets, BYO keys
services/authSessions.ts      the HttpOnly session
services/durableBudget.ts     the daily/global budget primitive, KV-backed
routes/api/*.ts               EVERY route — check each one is guarded
routes/api/live/*.ts
routes/api/share/*.ts
routes/api/auth.ts
core/realtime/shareProtocol.ts    what leaves the machine in a share
core/realtime/shareStore.ts
core/storage/shareService.ts
core/ai/openrouter.ts         provider calls, error paths, logging
core/ai/helpers.ts            parse failures and what they log
services/ai.ts services/audio.ts services/deepgram.ts
workers/voice-relay/src/index.ts
workers/collab/src/index.ts   room auth, the update token
```

## The invariants that must hold

1. **No secret ever reaches a log, a client, or an error message.** Not the
   house API key, not a user's BYO key, not a session token, not a licence code.
2. **No conversation content reaches a server log.** AI responses ARE the
   conversation. Parse-failure dumps are the classic leak.
3. **Every `/api/*` route is guarded**, or is deliberately public and safe to
   be. Enumerate them and check each — don't assume.
4. **Untrusted input is escaped at every render.** AI output is untrusted. Peer
   input in a live room is untrusted. The conversation title is both.
5. **A rate-limit bucket key cannot be chosen by the caller.** If it can, every
   limit is decoration.
6. **Secrets are compared in constant time.**
7. **A BYO key waives only the costs it actually covers.** If a route still
   spends the house's Deepgram or Cloudflare money, a BYO key must not open it.
8. **Failing closed where it matters.** A deployer who forgets to set the auth
   token must not silently ship every route open.

## Hunt these specifically

- **Walk every route.** For each: is it guarded, does it validate its body size
  and shape, what does it log on failure, and what does it return in an error
  message?
- **Every `console.error` / `console.warn` / `console.log` on a path that can
  carry model output or user content.** Is it truncated?
- **Every place a string reaches the DOM.** `innerHTML`,
  `dangerouslySetInnerHTML`, SVG injection, a URL built by concatenation,
  `document.write`. AI-generated and peer-supplied strings are the dangerous
  ones. The app has escaping helpers — find the paths that skip them.
- **The rate-limit key.** Read how the client identity is derived. Headers a
  caller can set are not identity. Note also the standing caveat in
  `requestGuard.ts`: the maps are module-scoped, so on per-request isolates the
  limits don't apply at all — check whether the deploy target makes them real.
- **The budgets.** Burst, daily, global. Can any be bypassed by rotating a
  header, a cookie, or a conversation id? Is the global circuit-breaker actually
  reachable?
- **BYO key handling.** How is it transported, validated, cached and NOT stored?
  Is it hashed before it becomes a cache key? Can it appear in a log or ride on
  a request that doesn't need it?
- **Share links.** What exactly leaves the machine? Compare the share sanitizer
  against `ConversationData` field by field — is anything private included that
  the user wouldn't expect (notes, magpie, raw transcript)? Can a share id be
  guessed or enumerated? Do TTLs actually expire?
- **The collab worker.** How is the update token checked? Can a stranger with a
  room id push state into a room, or read one?
- **The voice relay.** Token issuance, room lifecycle, and whether the shared
  secret is compared safely.
- **Auth session lifecycle.** Expiry, rotation, what happens when it lapses
  mid-flow, and whether the login path is brute-forceable.

## Already found and fixed — do NOT re-report

- The conversation title injected raw into `innerHTML` in the node map's PNG
  export (XSS; the title is AI-generated _and_ peer-supplied in live rooms).
- An untruncated parse-failure log in `core/ai/helpers.ts` that echoed the whole
  model response — i.e. the conversation — into the server log.
- `x-forwarded-for`'s FIRST entry used as the rate-limit key. Proxies append, so
  that entry is caller-supplied: anyone could mint a fresh bucket per request.
  Edge-set headers now win; the XFF fallback reads the last hop. **The number of
  trusted hops is an open question marked in a `ponytail:` comment — if you know
  the deploy topology, check that assumption.**
- Share creation skipping `ensureApiSession`, silently degrading to a local-only
  link.
- The live collab worker passing `statusUpdates` through unsanitized.
- Failed AI calls returning empty results with no warning to the user.

## Known-deliberate — never report as bugs

- Room id is the secret; there are no passwords and no accounts, by design.
- No server-side user data at all. Conversations live on the user's device.
- Rate limiting is in-memory and lightweight on purpose — the goal is stopping
  casual abuse and open-proxy use, not defeating a determined adversary.
- `AUDIO_BYTES_PER_DAY` is built but disabled (`0`) until tiers launch.
- Free tier gets everything cheap to serve; the limits that exist are meant to
  be met as a warm sentence, never a visible meter.
- `party/` and `workers/collab/` duplicate `core/realtime/` sanitizers on
  purpose — the bundlers can't read Deno's import map.
- Commits go straight to `main`; `deno.lock` disabled; no Deploy build step.

## Rules for findings

- Cite `file:line` and **quote the actual code**. No code, no finding.
- State the attack or the failure concretely: what someone does, and what they
  get. "This is unvalidated" is not a finding; "posting X yields Y" is.
- Distinguish **"costs him money"** from **"leaks someone's data"** from
  **"annoying"** — and say which.
- Believe explanatory comments; several deliberate trade-offs are documented in
  place.
- No missing-tests / missing-types / missing-docs findings.
- **When you find a bug, grep for its shape elsewhere.** One unescaped render
  usually means another; one unguarded route usually means another.

## Output

```
SEVERITY   RED | AMBER | GREEN
TITLE      one compressed line
LOCATION   path/to/file.ts:123
WHAT       the concrete attack or failure, and what it yields
IMPACT     money | data | availability | annoyance
EVIDENCE   verbatim quoted code
FIX        the smallest correct change
ELSEWHERE  other places this same shape appears, or "checked, none"
```

RED means: a secret or someone's conversation escapes, or an unbounded spend
path exists. Be honest about reachability — a hole that needs the user's own
unlocked device is not RED.

Finish with the one thing you would fix first if only one thing could be fixed,
and why.
