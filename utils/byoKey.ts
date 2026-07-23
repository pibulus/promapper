/**
 * The Keys door, client side. The key lives in a cookie (pm_byok) so the
 * browser carries it to every /api call automatically — no per-fetch
 * plumbing, and any future AI route is covered for free. JS-set cookie ≈
 * localStorage exposure; SameSite=Strict keeps it off cross-site requests.
 */

const COOKIE = "pm_byok";
const YEAR_S = 31_536_000;

export function getByoKey(): string | null {
  const match = document.cookie.split("; ").find((c) =>
    c.startsWith(`${COOKIE}=`)
  );
  const value = match?.slice(COOKIE.length + 1);
  return value ? decodeURIComponent(value) : null;
}

export function setByoKey(key: string): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${
    encodeURIComponent(key.trim())
  }; Max-Age=${YEAR_S}; Path=/; SameSite=Strict${secure}`;
}

export function clearByoKey(): void {
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Strict`;
}

export function looksLikeOpenRouterKey(key: string): boolean {
  return /^sk-or-[\x21-\x7e]{8,}$/.test(key.trim());
}
