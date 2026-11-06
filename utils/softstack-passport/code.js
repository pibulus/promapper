// SoftStack Passport — the 4-word passphrase is the root credential; the SS-
// code is the derived, public handle across TalkType, ZipList, QRBuddy, and ProMapper.
// Pure helpers only: each runtime supplies HMAC/SHA-256/PBKDF2 with its own crypto.

export const CODE_PREFIX = "SS";
export const PHRASE_NAMESPACE = "softstack-passport-phrase:";
export const CODE_NAMESPACE = "softstack-passport-code:";
export const ID_NAMESPACE = "softstack-passport-id:";
export const KDF_NAMESPACE = "softstack-passport-kdf:";
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

/** `softstack-passport-phrase:<seed>` feeds deterministic seed → 4-word phrase derivation. */
export function phraseInput(seed) {
  return `${PHRASE_NAMESPACE}${String(seed ?? "").trim()}`;
}

/**
 * `softstack-passport-code:<phrase>` is what the one-way HMAC consumes.
 * Given a phrase, any app holding SOFTSTACK_PASSPORT_SECRET derives the same
 * SS-XXXX-XXXX-XXXX handle; given the handle, the phrase cannot be recovered.
 */
export function codeInput(phraseOrSeed) {
  return `${CODE_NAMESPACE}${String(phraseOrSeed ?? "").trim()}`;
}

/** `softstack-passport-id:<code>` is what the SHA-256 consumes. */
export function idInput(code) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new Error("Not a SoftStack passport code");
  return `${ID_NAMESPACE}${normalized}`;
}

/** `softstack-passport-kdf:<phrase>` domain-separates PBKDF2/scrypt passkey indexing. */
export function kdfInput(phrase) {
  return `${KDF_NAMESPACE}${String(phrase ?? "").trim().toLowerCase()}`;
}

/** App names are stamps on one passport, never a separate identity. */
export function stampsFor(...apps) {
  const wanted = new Set(apps.flat());
  return APPS.filter((app) => wanted.has(app));
}
