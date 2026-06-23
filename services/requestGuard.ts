import { getCookies } from "$std/http/cookie.ts";
import { validateSession } from "@services/authSessions.ts";

/**
 * Lightweight request guard: origin allow-list + in-memory rate limiting.
 * Not perfect security, but shuts down most casual abuse / open-proxy use.
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

export function guardRequest(req: Request): Response | null {
  const authBlock = enforceAuth(req);
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

function enforceAuth(req: Request): Response | null {
  if (!authToken) {
    return null;
  }

  const cookies = getCookies(req.headers);
  if (validateSession(cookies[SESSION_COOKIE_NAME])) {
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

  if (!token || token !== authToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return null;
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
