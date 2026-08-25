// Client-side supporter pass storage and expiry validation for ProMapper.

const STORAGE_KEY = "pm_supporter_pass";
const PENDING_CHECKOUT_KEY = "pm_pending_checkout";

export interface ParsedPass {
  tier: "supporter" | "lifetime";
  exp: number; // seconds
}

export function parseExpiry(pass: string): ParsedPass | null {
  try {
    const parts = pass.split(".");
    if (parts.length !== 3 || parts[0] !== "promapper-pass-v1") {
      return null;
    }
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const json = JSON.parse(atob(base64));
    if (
      (json.tier === "supporter" || json.tier === "lifetime") &&
      Number.isFinite(json.exp)
    ) {
      return { tier: json.tier, exp: json.exp };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get stored supporter pass, or null if missing or expired.
 */
export function getSupporterPass(): string | null {
  if (typeof localStorage === "undefined") return null;
  const pass = localStorage.getItem(STORAGE_KEY);
  if (!pass) return null;

  const parsed = parseExpiry(pass);
  if (!parsed || parsed.exp < Math.floor(Date.now() / 1000)) {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "pm_supporter_pass=; path=/; max-age=0";
    return null;
  }

  return pass;
}

/**
 * Store a supporter pass and sync with cookie for server auth.
 */
export function setSupporterPass(pass: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const trimmed = pass.trim();
  const parsed = parseExpiry(trimmed);
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
  const parsed = parseExpiry(pass);
  return parsed ? new Date(parsed.exp * 1000) : null;
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
