import { getCookies } from "$std/http/cookie.ts";
import { validateSession } from "@services/authSessions.ts";

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

export async function guardRequest(req: Request): Promise<Response | null> {
  const authBlock = await enforceAuth(req);
  if (authBlock) return authBlock;

  const originBlock = enforceOrigin(req);
  if (originBlock) return originBlock;

  const rateBlock = enforceRateLimit(req);
  if (rateBlock) return rateBlock;

  return null;
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
