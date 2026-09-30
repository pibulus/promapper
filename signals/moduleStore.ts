/**
 * Module store — which optional dashboard modules the user has switched on.
 *
 * Modules ship OFF by default; the rack (ModuleRack island) toggles them.
 * Render order starts at registry order (the designed board); dragging
 * cards writes an explicit arrangement to @signals/boardOrderStore, and a
 * switched-off module remembers its slot for when it comes back.
 */

import { signal } from "@preact/signals";

const KEY = "promapper-modules";

/** The starter row-2 set (Sept 29 2026 — Pablo: a fresh board, or a fresh
 * conversation, should open with Notes/Ask/Collect already on, smallest
 * height, not a blank rack). */
const DEFAULT_MODULES = ["notes", "ask", "magpie"];

/** Retired ids → their successors. radio/tones merged into sound
 * (July 19); canvas left the rack to become the node map's flip side;
 * bishop was renamed ask (July 23 — drawer labels, not characters). */
const MIGRATIONS: Record<string, string | null> = {
  radio: "sound",
  tones: "sound",
  canvas: null,
  bishop: "ask",
};

function load(): string[] {
  if (typeof localStorage === "undefined") return [...DEFAULT_MODULES];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [...DEFAULT_MODULES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_MODULES];
    const ids = parsed
      .filter((x): x is string => typeof x === "string")
      .map((id) => MIGRATIONS[id] === undefined ? id : MIGRATIONS[id])
      .filter((id): id is string => id !== null);
    return [...new Set(ids)];
  } catch {
    return [...DEFAULT_MODULES];
  }
}

export const enabledModules = signal<string[]>(load());

export function isModuleEnabled(id: string): boolean {
  return enabledModules.value.includes(id);
}

export function toggleModule(id: string): void {
  enabledModules.value = isModuleEnabled(id)
    ? enabledModules.value.filter((x) => x !== id)
    : [...enabledModules.value, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(enabledModules.value));
  } catch {
    // Storage full/blocked — the toggle still works for this session.
  }
}

/** Back to the starter set — called when a new conversation/take replaces
 * the current one, so it opens with the default row rather than an empty
 * rack or the previous conversation's toggles. */
export function resetModules(): void {
  enabledModules.value = [...DEFAULT_MODULES];
  try {
    localStorage.setItem(KEY, JSON.stringify(enabledModules.value));
  } catch {
    // Storage full/blocked — the reset still works for this session.
  }
}
