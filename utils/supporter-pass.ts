// Client-side Passport token storage and parsing for ProMapper.
//
// New passes are HS256 JWTs from services/supporterPass.ts and carry the SS-
// code plus the shared name/phrase. Legacy promapper-pass-v1 tokens still read
// here; the next redeem upgrades them in place.

const STORAGE_KEY = "pm_supporter_pass";
const PENDING_CHECKOUT_KEY = "pm_pending_checkout";
const LEGACY_PREFIX = "promapper-pass-v1";

export type ClientSupporterTier = "supporter" | "guild" | "lifetime";

export interface ParsedPass {
  tier: ClientSupporterTier;
  exp: number; // seconds
  code?: string;
  name?: string;
  phrase?: string;
}

export interface StoredPassport {
  code: string;
  name: string;
  phrase: string;
}

function decodeBase64Url(value: string): string | null {
  try {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    return atob(base64);
  } catch {
    return null;
  }
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parsePass(pass: string): ParsedPass | null {
  const trimmed = pass.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;

  let json: Record<string, unknown> | null = null;
  if (trimmed.startsWith(`${LEGACY_PREFIX}.`)) {
    json = parseJson(decodeBase64Url(parts[1]));
  } else {
    // JWT: header.payload.signature. Only the payload matters client-side;
    // the server is the signature judge.
    json = parseJson(decodeBase64Url(parts[1]));
  }
  if (!json) return null;

  const rawTier = json.plan ?? json.tier;
  if (
    rawTier !== "supporter" &&
    rawTier !== "guild" &&
    rawTier !== "lifetime"
  ) {
    return null;
  }
  if (!Number.isFinite(json.exp)) return null;

  return {
    tier: rawTier as ClientSupporterTier,
    exp: Number(json.exp),
    ...(typeof json.code === "string" ? { code: json.code } : {}),
    ...(typeof json.name === "string" ? { name: json.name } : {}),
    ...(typeof json.phrase === "string" ? { phrase: json.phrase } : {}),
  };
}

/** Back-compat name; the pass now carries more than expiry. */
export function parseExpiry(pass: string): ParsedPass | null {
  return parsePass(pass);
}

/**
 * Get stored Passport token, or null if missing or expired.
 */
export function getSupporterPass(): string | null {
  if (typeof localStorage === "undefined") return null;
  const pass = localStorage.getItem(STORAGE_KEY);
  if (!pass) return null;

  const parsed = parsePass(pass);
  if (!parsed || parsed.exp < Math.floor(Date.now() / 1000)) {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "pm_supporter_pass=; path=/; max-age=0";
    return null;
  }

  return pass;
}

/** The identity carried by the current token, if it has one. */
export function getStoredPassport(): StoredPassport | null {
  const pass = getSupporterPass();
  if (!pass) return null;
  const parsed = parsePass(pass);
  if (!parsed?.code || !parsed.name || !parsed.phrase) return null;
  return { code: parsed.code, name: parsed.name, phrase: parsed.phrase };
}

/**
 * Store a Passport token and sync with the cookie for server auth.
 */
export function setSupporterPass(pass: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const trimmed = pass.trim();
  const parsed = parsePass(trimmed);
  if (!parsed) return false;

  localStorage.setItem(STORAGE_KEY, trimmed);
  const maxAge = Math.max(0, parsed.exp - Math.floor(Date.now() / 1000));
  document.cookie = `pm_supporter_pass=${
    encodeURIComponent(trimmed)
  }; path=/; max-age=${maxAge}; SameSite=Lax`;
  return true;
}

/**
 * Remove stored pass.
 */
export function clearSupporterPass() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = "pm_supporter_pass=; path=/; max-age=0";
}

/**
 * Get pass expiry Date object.
 */
export function supporterPassExpiry(): Date | null {
  const pass = getSupporterPass();
  if (!pass) return null;
  const parsed = parsePass(pass);
  return parsed ? new Date(parsed.exp * 1000) : null;
}

/**
 * Get the commercial plan ("supporter" | "guild" | "lifetime") or null.
 */
export function supporterPassTier(): ClientSupporterTier | null {
  const pass = getSupporterPass();
  if (!pass) return null;
  const parsed = parsePass(pass);
  return parsed ? parsed.tier : null;
}

export function setPendingCheckout(checkoutId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PENDING_CHECKOUT_KEY, checkoutId);
}

export function getPendingCheckout(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(PENDING_CHECKOUT_KEY);
}

export function clearPendingCheckout() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PENDING_CHECKOUT_KEY);
}
