// Supporter pass cryptographic signing, verification, and master code redemption.
//
// Zero-auth architecture: The pass is an HMAC-SHA256 signed token.
// The server verifies the token signature without database lookups.
// Format: promapper-pass-v1.<base64UrlPayload>.<base64UrlSignature>

const TOKEN_PREFIX = "promapper-pass-v1";
const DEFAULT_EXPIRY_DAYS = 365;

// Master codes live ONLY in env. Five of them sat in plaintext in this public
// repo from Aug 26 to Sept 25 2026 (git history keeps them forever), so the
// licence secret was rotated to kill every pass minted from them — never
// reuse one here.
function getMasterCodes(): string[] {
  return (Deno.env.get("SUPPORTER_UNLOCK_CODES") ||
    Deno.env.get("PROMAPPER_UNLOCK_CODES") || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export interface SupporterPayload {
  tier: "supporter" | "lifetime";
  exp: number; // Unix timestamp in seconds
  checkoutId?: string;
  email?: string;
  code?: string;
  iat: number;
}

export function getSupporterSecret(): string {
  const secret = Deno.env.get("PROMAPPER_LICENSE_SECRET")?.trim() ||
    Deno.env.get("SUPPORTER_LICENSE_SECRET")?.trim();
  if (secret) return secret;
  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    throw new Error(
      "PROMAPPER_LICENSE_SECRET or SUPPORTER_LICENSE_SECRET must be configured in production",
    );
  }
  return "promapper-dev-secret-change-in-production-2026";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Mint an HMAC-signed supporter pass token.
 */
export async function signSupporterPass(
  options: {
    checkoutId?: string;
    email?: string;
    durationDays?: number;
    secret?: string;
    tier?: "supporter" | "lifetime";
  } = {},
): Promise<string> {
  const secret = options.secret ?? getSupporterSecret();
  const now = Math.floor(Date.now() / 1000);
  const durationDays = options.durationDays ?? DEFAULT_EXPIRY_DAYS;
  const exp = now + durationDays * 24 * 60 * 60;

  const payload: SupporterPayload = {
    tier: options.tier ?? "supporter",
    exp,
    iat: now,
    ...(options.checkoutId ? { checkoutId: options.checkoutId } : {}),
    ...(options.email ? { email: options.email } : {}),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payloadJson));
  const dataToSign = `${TOKEN_PREFIX}.${payloadB64}`;

  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(dataToSign),
  );

  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${dataToSign}.${sigB64}`;
}

/**
 * Verify a supporter pass token or master code.
 * Returns the decoded payload if valid and unexpired, otherwise null.
 */
export async function verifySupporterPass(
  token: string | null | undefined,
  secret?: string,
): Promise<SupporterPayload | null> {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  // 1. Check Master Codes (never expire)
  const upper = trimmed.toUpperCase();
  if (getMasterCodes().includes(upper)) {
    return {
      tier: "lifetime",
      exp: Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 60 * 60, // 100 years
      code: upper,
      iat: Math.floor(Date.now() / 1000),
    };
  }

  // 2. Parse token: promapper-pass-v1.<payload>.<sig>
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return null;
  }

  const payloadBytes = base64UrlDecode(parts[1]);
  const sigBytes = base64UrlDecode(parts[2]);
  if (!payloadBytes || !sigBytes) return null;

  // 3. Cryptographically verify signature
  const sec = secret ?? getSupporterSecret();
  const key = await getHmacKey(sec);
  const dataToVerify = `${parts[0]}.${parts[1]}`;

  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as unknown as BufferSource,
    new TextEncoder().encode(dataToVerify),
  );

  if (!isValid) return null;

  // 4. Validate JSON payload and expiration
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as SupporterPayload;
    if (payload.tier !== "supporter" && payload.tier !== "lifetime") {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp < now) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Redeem any valid code (master code or existing token) and return standard pass.
 */
export async function redeemSupporterCode(
  code: string,
): Promise<{ valid: boolean; license: string | null; exp: number | null }> {
  const verified = await verifySupporterPass(code);
  if (!verified) {
    return { valid: false, license: null, exp: null };
  }

  // If it was a master code, mint a clean signed token for storage
  if (verified.code) {
    const token = await signSupporterPass({
      tier: "lifetime",
      durationDays: 36500, // 100 years
    });
    return { valid: true, license: token, exp: verified.exp };
  }

  return { valid: true, license: code.trim(), exp: verified.exp };
}
