import { getCookies } from "$std/http/cookie.ts";
import { validateSession } from "@services/authSessions.ts";
import {
  consumeByteBudget,
  consumeCallBudgets,
} from "@services/durableBudget.ts";

/**
 * Request guard: auth + origin allow-list + rate limiting + spend budgets.
 *
 * TWO KINDS OF LIMIT LIVE HERE, and the difference is deliberate.
 *
 * The DAILY and GLOBAL budgets are the money brake, and they are DURABLE —
 * backed by Deno KV in durableBudget.ts, so they hold across isolates. These
 * are the ones that decide whether a bad day can cost real money.
 *
 * The 60/min BURST limiter below is still a module-scoped Map, and on Deno
 * Deploy that means per-isolate. Kept in memory on purpose: it sits on the
 * latency-critical path of every request, its job is blunting a hot loop
 * rather than capping spend, and even per-isolate it does that. The spend
 * ceiling underneath it is durable, so the weak link is no longer the one
 * holding the wallet. Move it to KV only if burst abuse turns out to matter
 * on its own — it costs a KV write per request to do so.
 */

const allowedOrigins =
  (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:8003")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

// Limits are read PER CALL, not captured at module load. Env never changes
// under a running deploy, so this costs nothing in production — but it means a
// test can configure a limit without the whole module's config being decided by
// whichever test file happened to import it first.
const numEnv = (name: string, fallback: number): number => {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const rateLimitWindowMs = () => numEnv("API_RATE_WINDOW_MS", 60_000);
const rateLimitMax = () => numEnv("API_RATE_LIMIT", 60);

const rateMap = new Map<string, { count: number; windowStart: number }>();

// ─── Daily budgets — the slow-abuse backstop ───
// The 60/min burst limit alone lets a patient scraper ride 59/min forever;
// these cap the DAY. Generous by design: one live meeting-hour is roughly
// 300 calls (chunks + analysis rounds), so 1000/day never touches honest
// use. Audio is metered in BYTES — exact, no codec guessing (~12KB/s opus
// means 10 minutes ≈ 7MB). AUDIO_BYTES_PER_DAY stays 0 (disabled) until
// tiers launch.
//
// These are now KV-backed (durableBudget.ts), so unlike the burst limiter
// above they hold across Deno Deploy's per-request isolates. The window is a
// UTC calendar day rather than a rolling 24h — see durableBudget.ts.
const apiDailyLimit = () => numEnv("API_DAILY_LIMIT", 1000);
const audioBytesPerDay = () => numEnv("AUDIO_BYTES_PER_DAY", 0);
// Global circuit-breaker: per-IP daily budgets multiply across a botnet's
// IPs, so ONE absolute ceiling caps the worst possible day on the house
// key. 20k calls ≈ 60+ live meeting-hours — far above honest indie use.
// Counts only house-key requests: BYO-key traffic isn't on the bill.
const apiGlobalDailyLimit = () => numEnv("API_GLOBAL_DAILY_LIMIT", 20000);
// Lazy for the same reason the limits are — see numEnv above.
const getAuthToken = (): string | null =>
  Deno.env.get("API_AUTH_TOKEN")?.trim() || null;
const isDeclaredPublic = (): boolean =>
  (Deno.env.get("API_PUBLIC") ?? "").trim().toLowerCase() === "true";
const SESSION_COOKIE_NAME = "cm_session";

// Deno Deploy always sets DENO_DEPLOYMENT_ID in production; it's absent locally.
const isDeployed = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

// Warn on first deploy if ALLOWED_ORIGINS is still the default — without this,
// every request from a non-localhost origin is blocked with 403.
if (isDeployed && Deno.env.get("ALLOWED_ORIGINS") == null) {
  console.warn(
    "[requestGuard] ALLOWED_ORIGINS is not set in production — all cross-origin requests will be blocked. Set it to your deployed domain.",
  );
}

/**
 * Pure policy for the "no auth token configured" case. Open locally (the
 * intended dev flow), but FAIL CLOSED when deployed — a deployer who forgets to
 * set API_AUTH_TOKEN must not silently ship every /api/* route (and the AI bill)
 * open to the internet. Returns true if the request must be BLOCKED.
 *
 * API_PUBLIC=true is the deliberate way out: promapper.app is meant to be a
 * door anyone can walk through, and the house key pays. The flag exists so
 * "public" is something a deployer SAYS, never something they forget — an
 * absent token still bricks, a declared-public deploy serves. The money rails
 * (burst, per-client daily, global ceiling) are what hold the bill down here.
 */
export function shouldBlockUnconfiguredAuth(
  hasToken: boolean,
  deployed: boolean,
  declaredPublic = false,
): boolean {
  return !hasToken && deployed && !declaredPublic;
}

/**
 * BYO OpenRouter key ("the Keys door"): read from the x-openrouter-key
 * header or the pm_byok cookie the client sets. When present, AI costs are
 * the user's, so the house-bill budgets (daily, audio, global) step aside —
 * the burst rate limit stays for everyone. Never logged, never stored.
 */
export function getByoKey(req: Request): string | null {
  const raw = req.headers.get("x-openrouter-key") ??
    getCookies(req.headers)["pm_byok"] ?? null;
  if (!raw) return null;
  const key = raw.trim();
  // Sanity only — a wrong key fails at OpenRouter with the user's name on
  // it. Falling back to the house key would silently move costs to us.
  if (key.length < 8 || key.length > 256 || !/^[\x21-\x7e]+$/.test(key)) {
    return null;
  }
  return key;
}

// First sighting of a BYO key costs one free metadata call to OpenRouter;
// after that it's a cache hit. Fail OPEN on network trouble — the real AI
// call will speak for itself; only an explicit 401/403 blocks.
const BYO_VERIFY_TTL_MS = 3_600_000;
// Keyed by SHA-256 of the key, not the key itself — a heap inspection must
// never surface a live OpenRouter key verbatim. Capped so a botnet cycling
// plausible-shaped garbage can't grow it without bound inside the TTL hour.
const BYO_VERIFY_CACHE_MAX = 1000;
const byoVerifyCache = new Map<string, { ok: boolean; expires: number }>();

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(buf),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

async function verifyByoKey(key: string): Promise<Response | null> {
  const now = Date.now();
  const cacheKey = await sha256Hex(key);
  const cached = byoVerifyCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.ok ? null : byoRefusedResponse();
  }
  try {
    const base = Deno.env.get("OPENROUTER_BASE_URL") ??
      "https://openrouter.ai/api/v1";
    const res = await fetch(`${base}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      // A slow OpenRouter must not stack open connections or stretch the
      // fail-open window (cryptkeeper audit) — 5s then fail open once.
      signal: AbortSignal.timeout(5000),
    });
    await res.body?.cancel();
    const ok = res.status !== 401 && res.status !== 403;
    for (const [k, v] of byoVerifyCache) {
      if (v.expires <= now) byoVerifyCache.delete(k);
    }
    // Insertion-ordered Map: evicting the first key drops the oldest entry.
    if (byoVerifyCache.size >= BYO_VERIFY_CACHE_MAX) {
      const oldest = byoVerifyCache.keys().next().value;
      if (oldest !== undefined) byoVerifyCache.delete(oldest);
    }
    byoVerifyCache.set(cacheKey, { ok, expires: now + BYO_VERIFY_TTL_MS });
    return ok ? null : byoRefusedResponse();
  } catch {
    return null;
  }
}

function byoRefusedResponse(): Response {
  return jsonResponse(
    { error: "OpenRouter refused that key — check it under the key icon." },
    401,
  );
}

export async function guardRequest(req: Request): Promise<Response | null> {
  const authBlock = await enforceAuth(req);
  if (authBlock) return authBlock;

  const originBlock = enforceOrigin(req);
  if (originBlock) return originBlock;

  const rateBlock = enforceRateLimit(req);
  if (rateBlock) return rateBlock;

  // Their key, their costs — no bill rails. But verify the key once: without
  // this, a wrong key 401s inside every AI stage, graceful degradation
  // swallows it all, and the user gets a hollow map that looks broken.
  const byoKey = getByoKey(req);
  if (byoKey) return await verifyByoKey(byoKey);

  return await enforceDailyBudgets(req);
}

/**
 * The per-client daily budget and the global daily ceiling, charged together in
 * one KV commit. Previously two separate in-memory checks and two Maps.
 */
async function enforceDailyBudgets(req: Request): Promise<Response | null> {
  const verdict = await consumeCallBudgets(
    getClientToken(req),
    apiDailyLimit(),
    apiGlobalDailyLimit(),
    Date.now(),
  );

  if (verdict.ok) return null;

  return verdict.blew === "global"
    ? jsonResponse(
      { error: "The workshop is unusually busy today — back tomorrow." },
      429,
    )
    : jsonResponse(
      { error: "That's a lot for one day — things reset tomorrow." },
      429,
    );
}

/**
 * Audio budget for the recording routes (/api/process, /api/append,
 * /api/live/chunk). Call AFTER size validation with the actual blob bytes.
 * Disabled until AUDIO_BYTES_PER_DAY is set — flipping tiers on is config,
 * not code.
 *
 * `housePaysAudio` is the BYO escape hatch's own escape hatch. A BYO key buys
 * out the OpenRouter bill and nothing else, so it may only waive a budget that
 * covers OpenRouter work. /api/live/chunk transcribes through DEEPGRAM when a
 * house key is configured — the user's key never touches it — so a blanket
 * waiver there would have let BYO users spend the house's Deepgram without
 * limit the day tiers switch on. Pass true wherever the house's own provider
 * does the work.
 */
export async function guardAudioBudget(
  req: Request,
  bytes: number,
  housePaysAudio = false,
): Promise<Response | null> {
  const byteLimit = audioBytesPerDay();
  if (byteLimit <= 0) return null;
  // Their key, their audio bill — but only when their key is what pays.
  if (!housePaysAudio && getByoKey(req)) return null;

  const verdict = await consumeByteBudget(
    getClientToken(req),
    bytes,
    byteLimit,
    Date.now(),
  );
  if (verdict.ok) return null;

  return jsonResponse(
    { error: "Today's recording allowance is used up — it refills tomorrow." },
    429,
  );
}

/**
 * Guard for intentionally PUBLIC endpoints (e.g. share lookup): rate-limit only,
 * NO auth or origin check, so anyone with the link can still read the share —
 * but a single known shareId can't be hammered without bound.
 */
export function guardPublicRequest(req: Request): Response | null {
  return enforceRateLimit(req);
}

function enforceOrigin(req: Request): Response | null {
  if (allowedOrigins.length === 0) {
    return null;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    // Server-side or same-origin fetches may omit the header.
    return null;
  }

  if (allowedOrigins.includes(origin)) {
    return null;
  }

  return jsonResponse(
    { error: "Origin not allowed" },
    403,
  );
}

function enforceRateLimit(req: Request): Response | null {
  const max = rateLimitMax();
  const windowMs = rateLimitWindowMs();
  if (max <= 0 || windowMs <= 0) {
    return null;
  }

  const key = getClientToken(req);
  const now = Date.now();

  // Opportunistic sweep: a stale entry for ANY key (not just this one) is
  // already semantically count-0, so dropping it changes no live client's rate
  // decision — it only stops the map growing without bound as IPs rotate.
  for (const [k, e] of rateMap) {
    if (now - e.windowStart > windowMs) rateMap.delete(k);
  }

  const entry = rateMap.get(key) ?? { count: 0, windowStart: now };

  entry.count += 1;
  rateMap.set(key, entry);

  if (entry.count > max) {
    return jsonResponse(
      {
        error: "Too many requests. Slow down a little.",
        retry_after_ms: windowMs - (now - entry.windowStart),
      },
      429,
    );
  }

  return null;
}

async function enforceAuth(req: Request): Promise<Response | null> {
  const authToken = getAuthToken();
  if (!authToken) {
    if (
      shouldBlockUnconfiguredAuth(
        Boolean(authToken),
        isDeployed,
        isDeclaredPublic(),
      )
    ) {
      return jsonResponse(
        { error: "Service unavailable: server auth is not configured." },
        503,
      );
    }
    return null;
  }

  const cookies = getCookies(req.headers);
  if (await validateSession(cookies[SESSION_COOKIE_NAME])) {
    return null;
  }

  const rawHeader = req.headers.get("authorization") ??
    req.headers.get("x-api-token");

  if (!rawHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const token = rawHeader.startsWith("Bearer ")
    ? rawHeader.slice(7).trim()
    : rawHeader.trim();

  if (!token || !timingSafeEqual(token, authToken)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return null;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** The rate-limit bucket key for a request. Exported for its guard test. */
export function getClientToken(req: Request) {
  // Edge-set headers FIRST. `cf-connecting-ip` and `x-real-ip` are written by
  // the proxy itself and a client cannot forge them through it; the FIRST
  // entry of `x-forwarded-for` is whatever the caller sent, because proxies
  // APPEND. Trusting that first entry meant anyone could mint a brand-new
  // rate-limit bucket per request just by varying the header — bypassing the
  // 60/min burst, the daily cap, and the login brute-force guard with it.
  const edge = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip");
  if (edge) return edge.trim() || "unknown";

  // Then the LAST x-forwarded-for entry — the one the nearest proxy appended,
  // and therefore the only one the caller couldn't write. Correct for every
  // topology this app actually runs in: with ONE hop (Deno Deploy) the last
  // entry is what the platform added, and with TWO (Cloudflare in front) the
  // check above already won on cf-connecting-ip. Deno's own remoteAddr is no
  // help here — behind a hosted edge it's the proxy's address, which would
  // collapse every user into a single bucket.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    return hops[hops.length - 1] || "unknown";
  }

  return "unknown";
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
