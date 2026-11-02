// ProMapper's Passport token: the fourth SoftStack stamp.
//
// New passes are HS256 JWTs signed with SOFTSTACK_PASSPORT_SECRET, carrying
// `stamps: ["promapper"]`, an SS- code and the shared identity. The commercial
// plan (Solo / Guild / Lifetime) stays in the `tier` claim, so the existing
// quota guards keep working without pretending a plan is a bundle of apps.
//
// Old `promapper-pass-v1.<payload>.<sig>` tokens still verify with
// PROMAPPER_LICENSE_SECRET and are upgraded in place on the next redeem/load.

import {
  codeInput,
  formatCode,
  generateMemberIdentity,
  idInput,
  stampsFor,
} from "../utils/softstack-passport/index.js";

const LEGACY_PREFIX = "promapper-pass-v1";
const DEFAULT_EXPIRY_DAYS = 365;

export type SupporterTier = "supporter" | "guild" | "lifetime";

export interface PassportDetails {
  code: string;
  name: string;
  phrase: string;
}

export interface SupporterPayload {
  tier: SupporterTier;
  plan?: SupporterTier;
  exp: number;
  checkoutId?: string;
  email?: string;
  code?: string;
  name?: string;
  phrase?: string;
  stamps?: string[];
  sub?: string;
  v?: number;
  iat: number;
}

export interface MintedPassport extends PassportDetails {
  token: string;
  exp: number;
  tier: SupporterTier;
}

export interface RedeemResult {
  valid: boolean;
  license: string | null;
  exp: number | null;
  passport?: PassportDetails;
}

export interface SignOptions {
  checkoutId?: string;
  email?: string;
  durationDays?: number;
  /** Override the signing secret (tests). */
  secret?: string;
  tier?: SupporterTier;
  /** Explicit passport seed; defaults to checkoutId/email/random. */
  seed?: string;
  /** Exact expiry for legacy in-place upgrades. */
  exp?: number;
}

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

export function getLegacySecret(): string {
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

/**
 * One Passport secret for the whole fleet. A deployment without it can still
 * verify its own old passes, but new tokens are not cross-app; say so loudly.
 */
export function getPassportSecret(): string {
  const secret = Deno.env.get("SOFTSTACK_PASSPORT_SECRET")?.trim();
  if (secret && secret.length >= 16) return secret;
  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    console.warn(
      "[SupporterPass] SOFTSTACK_PASSPORT_SECRET is missing; falling back to " +
        "PROMAPPER_LICENSE_SECRET. New passes will not verify in the other apps.",
    );
  }
  return getLegacySecret();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToBytes(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(value),
    ),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function signJwt(
  payload: Omit<SupporterPayload, "iat" | "exp"> & {
    iat: number;
    exp: number;
  },
  secret: string,
): Promise<string> {
  const signingInput = `${
    textToBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  }.${textToBase64Url(JSON.stringify(payload))}`;
  const key = await getHmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

async function verifyJwt(
  token: string,
  secret: string,
): Promise<SupporterPayload | null> {
  const [encodedHeader, encodedBody, signature] = token.split(".");
  if (!encodedHeader || !encodedBody || !signature) return null;
  const head = base64UrlToBytes(encodedHeader);
  const body = base64UrlToBytes(encodedBody);
  const sig = base64UrlToBytes(signature);
  if (!head || !body || !sig) return null;
  const key = await getHmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig as unknown as BufferSource,
    new TextEncoder().encode(`${encodedHeader}.${encodedBody}`),
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(body),
    ) as SupporterPayload;
    if (
      payload.tier !== "supporter" &&
      payload.tier !== "guild" &&
      payload.tier !== "lifetime"
    ) {
      return null;
    }
    if (!Number.isFinite(payload.exp) || payload.exp < nowSeconds()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Seed → SS code + the shared name/phrase. */
export async function passportForSeed(
  seed: string,
  secret: string,
  codeHint?: string,
): Promise<PassportDetails> {
  const digest = await hmacHex(codeInput(seed), secret);
  const code = codeHint || formatCode(digest.slice(0, 12));
  const hash = await sha256Hex(idInput(code));
  const identity = generateMemberIdentity(hash, code);
  return { code, name: identity.name, phrase: identity.phrase };
}

/**
 * Mint a new Passport token. Returns the token and the identity it carries so
 * checkout/KV/email can all use the same values.
 */
export async function mintSupporterPassport(
  options: SignOptions = {},
): Promise<MintedPassport> {
  const secret = options.secret ?? getPassportSecret();
  const seed = options.seed ?? options.checkoutId ?? options.email ??
    crypto.randomUUID();
  const tier = options.tier ?? "supporter";
  const passport = await passportForSeed(seed, secret);
  const iat = nowSeconds();
  const exp = options.exp ??
    iat + (options.durationDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60;

  const token = await signJwt(
    {
      tier,
      plan: tier,
      exp,
      iat,
      v: 2,
      stamps: stampsFor("promapper"),
      sub: passport.code,
      code: passport.code,
      name: passport.name,
      phrase: passport.phrase,
      ...(options.checkoutId ? { checkoutId: options.checkoutId } : {}),
      ...(options.email ? { email: options.email } : {}),
    },
    secret,
  );

  return { token, exp, tier, ...passport };
}

/** Back-compat helper: the checkout only needs the token string. */
export async function signSupporterPass(
  options: SignOptions = {},
): Promise<string> {
  return (await mintSupporterPassport(options)).token;
}

/** Old prefix, kept for verifying holders and for migration fixtures. */
export async function signLegacySupporterPass(
  options: SignOptions = {},
): Promise<string> {
  const secret = options.secret ?? getLegacySecret();
  const iat = nowSeconds();
  const exp = options.exp ??
    iat + (options.durationDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60;
  const payload: Record<string, unknown> = {
    tier: options.tier ?? "supporter",
    exp,
    iat,
    ...(options.checkoutId ? { checkoutId: options.checkoutId } : {}),
    ...(options.email ? { email: options.email } : {}),
  };
  const payloadB64 = textToBase64Url(JSON.stringify(payload));
  const dataToSign = `${LEGACY_PREFIX}.${payloadB64}`;
  const key = await getHmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataToSign)),
  );
  return `${dataToSign}.${bytesToBase64Url(signature)}`;
}

/**
 * Verify a new Passport JWT, a legacy promapper pass, or an env master code.
 * Returns the decoded payload if valid and unexpired, otherwise null.
 */
export async function verifySupporterPass(
  token: string | null | undefined,
  secret?: string,
): Promise<SupporterPayload | null> {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  // 1. Master codes (never expire)
  const upper = trimmed.toUpperCase();
  if (getMasterCodes().includes(upper)) {
    return {
      tier: "lifetime",
      plan: "lifetime",
      exp: nowSeconds() + 100 * 365 * 24 * 60 * 60,
      code: upper,
      stamps: stampsFor("promapper"),
      iat: nowSeconds(),
    };
  }

  // 2. Legacy promapper-pass-v1 tokens
  if (trimmed.startsWith(`${LEGACY_PREFIX}.`)) {
    const parts = trimmed.split(".");
    if (parts.length !== 3) return null;
    const payloadBytes = base64UrlToBytes(parts[1]);
    const sigBytes = base64UrlToBytes(parts[2]);
    if (!payloadBytes || !sigBytes) return null;
    const sec = secret ?? getLegacySecret();
    const key = await getHmacKey(sec);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    try {
      const payload = JSON.parse(
        new TextDecoder().decode(payloadBytes),
      ) as SupporterPayload;
      if (
        payload.tier !== "supporter" &&
        payload.tier !== "guild" &&
        payload.tier !== "lifetime"
      ) {
        return null;
      }
      if (!Number.isFinite(payload.exp) || payload.exp < nowSeconds()) {
        return null;
      }
      return {
        ...payload,
        plan: payload.tier,
        stamps: stampsFor("promapper"),
      };
    } catch {
      return null;
    }
  }

  // 3. New Passport JWT
  const payload = await verifyJwt(trimmed, secret ?? getPassportSecret());
  if (!payload) return null;
  // Each app checks its own stamp. A TalkType token is not a ProMapper pass.
  if (!Array.isArray(payload.stamps) || !payload.stamps.includes("promapper")) {
    return null;
  }
  return payload;
}

/** Seed a legacy holder keeps across the upgrade. */
function legacySeed(token: string, payload: SupporterPayload): string {
  return payload.checkoutId || payload.code || token.split(".").pop() || token;
}

/**
 * Redeem any valid code/token and return a current Passport JWT. Legacy tokens
 * are upgraded in place without extending their expiry.
 */
export async function redeemSupporterCode(
  code: string,
): Promise<RedeemResult> {
  const trimmed = code.trim();
  const verified = await verifySupporterPass(trimmed);

  if (!verified) {
    return { valid: false, license: null, exp: null };
  }

  // Master code → a lifetime Passport, seeded by the code itself.
  if (verified.code && getMasterCodes().includes(verified.code.toUpperCase())) {
    const minted = await mintSupporterPassport({
      seed: `master:${verified.code.toUpperCase()}`,
      tier: "lifetime",
      durationDays: 36500,
    });
    return {
      valid: true,
      license: minted.token,
      exp: minted.exp,
      passport: {
        code: minted.code,
        name: minted.name,
        phrase: minted.phrase,
      },
    };
  }

  // Current JWT already carries its identity: nothing to rewrite.
  if (
    verified.v === 2 && verified.code && verified.name && verified.phrase &&
    !trimmed.startsWith(`${LEGACY_PREFIX}.`)
  ) {
    return {
      valid: true,
      license: trimmed,
      exp: verified.exp,
      passport: {
        code: verified.code,
        name: verified.name,
        phrase: verified.phrase,
      },
    };
  }

  // Legacy token → upgrade in place, keeping the original expiry.
  const minted = await mintSupporterPassport({
    seed: legacySeed(trimmed, verified),
    tier: verified.tier,
    exp: verified.exp,
    checkoutId: verified.checkoutId,
    email: verified.email,
  });
  return {
    valid: true,
    license: minted.token,
    exp: minted.exp,
    passport: { code: minted.code, name: minted.name, phrase: minted.phrase },
  };
}
