/**
 * Magpie — classification for the shelf of shiny things.
 *
 * Everything collected is a STRING (pointers, not payloads): a URL becomes
 * a link, an image URL becomes a picture, anything else is a text scrap.
 * No uploads, no file storage — the local-first promise stays intact.
 */

export type MagpieKind = "link" | "image" | "text";

export interface MagpieItem {
  id: string;
  kind: MagpieKind;
  value: string;
  addedAt: string;
}

export const MAGPIE_MAX_ITEMS = 100;
export const MAGPIE_MAX_LENGTH = 2000;

const URL_RE = /^https?:\/\/\S+$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i;
const IMAGE_HOSTS = /images\.(unsplash|pexels)\.com/i;

export function classifyMagpie(text: string): MagpieKind {
  const t = text.trim();
  if (!URL_RE.test(t)) return "text";
  return IMAGE_RE.test(t) || IMAGE_HOSTS.test(t) ? "image" : "link";
}

/** A short human handle: hostname for URLs, the words themselves for text. */
export function magpieLabel(value: string, kind: MagpieKind): string {
  if (kind === "text") return value;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.slice(0, 60);
  }
}
