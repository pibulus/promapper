/**
 * Avatar — deterministic cute face from a seed (DiceBear "thumbs").
 *
 * Offline SVG, no network (no CSP concerns). The same seed always yields the
 * same face, so a user looks identical to everyone in a live room. Returns a
 * data-URI that drops straight into <img src>. Browser-only (DiceBear is a
 * client dep); returns "" if generation fails.
 */

import { createAvatar } from "@dicebear/core";
import { thumbs } from "@dicebear/collection";

const cache = new Map<string, string>();

/** Build a cute "thumbs" avatar data-URI for a stable seed (e.g. a user id). */
export function buildAvatar(seed: string): string {
  const key = seed || "promapper";
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const uri = createAvatar(thumbs, {
      seed: key,
      radius: 50,
      scale: 92,
      backgroundType: ["solid"],
      backgroundColor: ["transparent"],
    }).toDataUri();
    cache.set(key, uri);
    return uri;
  } catch (error) {
    console.warn("Avatar generation failed:", error);
    return "";
  }
}
