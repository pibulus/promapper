/**
 * Stateless JWT sessions for API auth.
 *
 * Replaces the old in-memory Map (which was per-isolate on Deno Deploy — auth
 * broke under any auto-scaling). Signed with HMAC-SHA256 using API_AUTH_TOKEN
 * as the key. The JWT is stored in an HttpOnly cookie; revocation is handled
 * by deleting the cookie (no server-side state). TTL is baked into the exp
 * claim so an isolate can validate without any shared storage.
 */

const SESSION_TTL_MS = Number(
  Deno.env.get("API_SESSION_TTL_MS") ?? `${4 * 60 * 60 * 1000}`,
);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const token = (Deno.env.get("API_AUTH_TOKEN") ?? "").trim();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice(0, (4 - (str.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** In-memory set of explicitly revoked session IDs (client deleted cookie but
 *  JWT hasn't expired yet). Tiny in practice — most logouts delete the cookie
 *  and the browser stops sending the JWT. This only catches JWT replay. */
const revoked = new Set<string>();

export async function createSession(): Promise<string> {
  const key = await getKey();
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        sid: crypto.randomUUID(),
        iat: now,
        exp: now + Math.floor(SESSION_TTL_MS / 1000),
      }),
    ),
  );

  const signature = base64url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${header}.${payload}`),
      ),
    ),
  );

  return `${header}.${payload}.${signature}`;
}

export async function validateSession(
  id: string | undefined | null,
): Promise<boolean> {
  if (!id) return false;

  try {
    const parts = id.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, sigB64] = parts;

    // Verify signature
    const key = await getKey();
    const signed = encoder.encode(`${headerB64}.${payloadB64}`);
    const sig = base64urlDecode(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sig, signed);
    if (!valid) return false;

    // Check expiry
    const payloadBytes = base64urlDecode(payloadB64);
    const payload = JSON.parse(decoder.decode(payloadBytes));
    const now = Math.floor(Date.now() / 1000);

    if (typeof payload.exp !== "number" || payload.exp < now) return false;

    // Check revocation (rare — only if logout raced with JWT replay)
    if (
      typeof payload.sid === "string" &&
      revoked.has(payload.sid)
    ) {
      return false;
    }

    // Cap the revocation set: drop the OLDEST half (Set iterates in insertion
    // order) instead of flushing everything — recently revoked sids stay
    // blocked. Best-effort by design; the set is per-isolate anyway.
    if (revoked.size > 1000) {
      let toDrop = revoked.size - 500;
      for (const sid of revoked) {
        if (toDrop-- <= 0) break;
        revoked.delete(sid);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function deleteSession(id: string | undefined | null): void {
  // Stateless JWT — deleting the cookie is the real revocation.
  // We add the session ID to a small in-memory revocation set to
  // block immediate JWT replay (e.g., stolen cookie from same isolate).
  // This set is per-isolate (same limitation as before), but the window
  // is tiny — the cookie delete + browser stop sending covers 99.9% of cases.
  if (!id) return;
  try {
    const parts = id.split(".");
    if (parts.length !== 3) return;
    const payloadBytes = base64urlDecode(parts[1]);
    const payload = JSON.parse(decoder.decode(payloadBytes));
    if (typeof payload.sid === "string") {
      revoked.add(payload.sid);
    }
  } catch {
    // Can't parse the JWT — nothing to revoke.
  }
}
