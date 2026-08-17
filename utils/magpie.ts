/**
 * Magpie — classification for the shelf of shiny things.
 *
 * What is TYPED into the shelf is always a string (pointers, not payloads):
 * a URL becomes a link, an image URL becomes a picture, anything else is a
 * text scrap.
 *
 * What is DROPPED on the shelf is a file, and it is still a pointer here:
 * kind "file" carries an id into the local Blob store
 * (core/storage/magpieFilesDB.ts), never bytes. Nothing is uploaded anywhere
 * — the local-first promise is intact; the shelf just got a drawer.
 */

export type MagpieKind = "link" | "image" | "text" | "file";

export interface MagpieItem {
  id: string;
  kind: MagpieKind;
  value: string;
  addedAt: string;
  /** file only — kept on the item so the shelf draws without hitting IDB. */
  name?: string;
  size?: number;
  mime?: string;
}

/** Human file size: "820 KB", "2.4 MB". Bytes are for machines. */
export function magpieFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The Font Awesome glyph for a dropped file, by mime. */
export function magpieFileIcon(mime = ""): string {
  if (mime.startsWith("image/")) return "fa-image";
  if (mime.startsWith("audio/")) return "fa-music";
  if (mime.startsWith("video/")) return "fa-film";
  if (mime === "application/pdf") return "fa-file-pdf";
  if (mime.includes("zip") || mime.includes("compressed")) {
    return "fa-file-zipper";
  }
  if (mime.startsWith("text/") || mime.includes("json")) return "fa-file-lines";
  return "fa-paperclip";
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
  if (kind === "text" || kind === "file") return value;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.slice(0, 60);
  }
}
