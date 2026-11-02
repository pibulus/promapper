// SoftStack Passport — one code, one identity, every app.
// Pure helpers only: each runtime supplies HMAC/SHA-256 with its own crypto.

export const CODE_PREFIX = "SS";
export const CODE_NAMESPACE = "softstack-passport-code:";
export const ID_NAMESPACE = "softstack-passport-id:";
export const TOKEN_TIER = "supporter";
export const APPS = ["talktype", "ziplist", "qrbuddy", "promapper"];

const CODE_RE = /^SS-([A-F0-9]{4})-([A-F0-9]{4})-([A-F0-9]{4})$/i;

/** Twelve uppercase hex chars, grouped by four. */
export function formatCode(hex) {
  const clean = String(hex).replace(/[^a-f0-9]/gi, "").toUpperCase();
  if (clean.length < 12) throw new Error("Code needs 12 hex chars");
  return `SS-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

/** Accepts SS-… only. Legacy TT-/ZL- codes are intentionally not normalised. */
export function normalizeCode(value) {
  const match = CODE_RE.exec(String(value ?? "").trim());
  return match ? `SS-${match[1]}-${match[2]}-${match[3]}`.toUpperCase() : "";
}

export function isCode(value) {
  return normalizeCode(value) !== "";
}

export function sameCode(a, b) {
  const left = normalizeCode(a);
  return left !== "" && left === normalizeCode(b);
}

/** `softstack-passport-code:<seed>` is what the HMAC consumes. */
export function codeInput(seed) {
  return `${CODE_NAMESPACE}${String(seed ?? "").trim()}`;
}

/** `softstack-passport-id:<code>` is what the SHA-256 consumes. */
export function idInput(code) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new Error("Not a SoftStack passport code");
  return `${ID_NAMESPACE}${normalized}`;
}

/** App names are stamps on one passport, never a separate identity. */
export function stampsFor(...apps) {
  const wanted = new Set(apps.flat());
  return APPS.filter((app) => wanted.has(app));
}
