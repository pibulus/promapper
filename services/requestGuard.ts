import { getCookies } from "$std/http/cookie.ts";
import { validateSession } from "@services/authSessions.ts";
import {
  type BudgetEntry,
  consumeWindowBudget,
} from "@services/windowBudget.ts";

/**
 * Lightweight request guard: origin allow-list + in-memory rate limiting.
 * Not perfect security, but shuts down most casual abuse / open-proxy use.
 *
 * IMPORTANT: The rateMap is a module-scoped Map — on Deno Deploy, each
 * request runs in an ephemeral isolate with its own empty Map, so per-IP
 * rate limits are NOT enforced. This works correctly only in long-lived
 * single-isolate environments (local dev, Docker). For production rate
 * limiting on Deno Deploy, move to Cloudflare Workers KV or a Durable
 * Object with shared state.
 */

const allowedOrigins =
  (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:8003")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("API_RATE_WINDOW_MS") ?? "60000",
);
const RATE_LIMIT_MAX = Number(Deno.env.get("API_RATE_LIMIT") ?? "60");

const rateMap = new Map<string, { count: number; windowStart: number }>();

// ─── Daily budgets — the slow-abuse backstop ───
// The 60/min burst limit alone lets a patient scraper ride 59/min forever;
// these cap the DAY. Generous by design: one live meeting-hour is roughly
// 300 calls (chunks + analysis rounds), so 1000/day never touches honest
// use. Audio is metered in BYTES — exact, no codec guessing (~12KB/s opus
// means 10 minutes ≈ 7MB). AUDIO_BYTES_PER_DAY stays 0 (disabled) until
// tiers launch. Same in-memory caveat as the burst limit: works on a
// long-lived process (the Pi), not on per-request isolates.
const DAILY_WINDOW_MS = 86_400_000;
const API_DAILY_LIMIT = Number(Deno.env.get("API_DAILY_LIMIT") ?? "1000");
const AUDIO_BYTES_PER_DAY = Number(
  Deno.env.get("AUDIO_BYTES_PER_DAY") ?? "0",
);
// Global circuit-breaker: per-IP daily budgets multiply across a botnet's
// IPs, so ONE absolute ceiling caps the worst possible day on the house
// key. 20k calls ≈ 60+ live meeting-hours — far above honest indie use.
// Counts only house-key requests: BYO-key traffic isn't on the bill.
const API_GLOBAL_DAILY_LIMIT = Number(
  Deno.env.get("API_GLOBAL_DAILY_LIMIT") ?? "20000",
);
const dailyCallMap = new Map<string, BudgetEntry>();
const audioByteMap = new Map<string, BudgetEntry>();
const globalCallMap = new Map<string, BudgetEntry>();
const authToken = Deno.env.get("API_AUTH_TOKEN")?.trim() ?? null;
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
 */
export function shouldBlockUnconfiguredAuth(
  hasToken: boolean,
  deployed: boolean,
): boolean {
  return !hasToken && deployed;
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
const byoVerifyCache = new Map<string, { ok: boolean; expires: number }>();

async function verifyByoKey(key: string): Promise<Response | null> {
  const now = Date.now();
  const cached = byoVerifyCache.get(key);
  if (cached && cached.expires > now) {
    return cached.ok ? null : byoRefusedResponse();
  }
  try {
    const base = Deno.env.get("OPENROUTER_BASE_URL") ??
      "https://openrouter.ai/api/v1";
    const res = await fetch(`${base}/key`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    await res.body?.cancel();
    const ok = res.status !== 401 && res.status !== 403;
    for (const [k, v] of byoVerifyCache) {
      if (v.expires <= now) byoVerifyCache.delete(k);
    }
    byoVerifyCache.set(key, { ok, expires: now + BYO_VERIFY_TTL_MS });
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

  const dailyBlock = enforceDailyLimit(req);
  if (dailyBlock) return dailyBlock;

  const globalBlock = enforceGlobalLimit();
  if (globalBlock) return globalBlock;

  return null;
}

function enforceGlobalLimit(): Response | null {
  if (API_GLOBAL_DAILY_LIMIT <= 0) return null;
  const ok = consumeWindowBudget(
    globalCallMap,
    "global",
    1,
    API_GLOBAL_DAILY_LIMIT,
    DAILY_WINDOW_MS,
    Date.now(),
  );
  if (ok) return null;
  return jsonResponse(
    { error: "The workshop is unusually busy today — back tomorrow." },
    429,
  );
}

function enforceDailyLimit(req: Request): Response | null {
  if (API_DAILY_LIMIT <= 0) return null;
  const ok = consumeWindowBudget(
    dailyCallMap,
    getClientToken(req),
    1,
    API_DAILY_LIMIT,
    DAILY_WINDOW_MS,
    Date.now(),
  );
  if (ok) return null;
  return jsonResponse(
    { error: "That's a lot for one day — things reset tomorrow." },
    429,
  );
}

/**
 * Audio budget for the recording routes (/api/process, /api/append,
 * /api/live/chunk). Call AFTER size validation with the actual blob bytes.
 * Disabled until AUDIO_BYTES_PER_DAY is set — flipping tiers on is config,
 * not code.
 */
export function guardAudioBudget(
  req: Request,
  bytes: number,
): Response | null {
  if (AUDIO_BYTES_PER_DAY <= 0) return null;
  if (getByoKey(req)) return null; // their key, their audio bill
  const ok = consumeWindowBudget(
    audioByteMap,
    getClientToken(req),
    bytes,
    AUDIO_BYTES_PER_DAY,
    DAILY_WINDOW_MS,
    Date.now(),
  );
  if (ok) return null;
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
  if (RATE_LIMIT_MAX <= 0 || RATE_LIMIT_WINDOW_MS <= 0) {
    return null;
  }

  const key = getClientToken(req);
  const now = Date.now();

  // Opportunistic sweep: a stale entry for ANY key (not just this one) is
  // already semantically count-0, so dropping it changes no live client's rate
  // decision — it only stops the map growing without bound as IPs rotate.
  for (const [k, e] of rateMap) {
    if (now - e.windowStart > RATE_LIMIT_WINDOW_MS) rateMap.delete(k);
  }

  const entry = rateMap.get(key) ?? { count: 0, windowStart: now };

  entry.count += 1;
  rateMap.set(key, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    return jsonResponse(
      {
        error: "Too many requests. Slow down a little.",
        retry_after_ms: RATE_LIMIT_WINDOW_MS - (now - entry.windowStart),
      },
      429,
    );
  }

  return null;
}

async function enforceAuth(req: Request): Promise<Response | null> {
  if (!authToken) {
    if (shouldBlockUnconfiguredAuth(Boolean(authToken), isDeployed)) {
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function getClientToken(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return (
    req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-real-ip") ??
      "unknown"
  );
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
