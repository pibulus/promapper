/**
 * Module store — which optional dashboard modules the user has switched on.
 *
 * Modules ship OFF by default; the rack (ModuleRack island) toggles them.
 * The board stays ARRANGED: render order is always registry order, never
 * user-dragged — turning a module on slots it into its designed place.
 */

import { signal } from "@preact/signals";

const KEY = "promapper-modules";

/** Retired ids → their successors. radio/tones merged into sound
 * (July 19); canvas left the rack to become the node map's flip side. */
const MIGRATIONS: Record<string, string | null> = {
  radio: "sound",
  tones: "sound",
  canvas: null,
};

function load(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const ids = parsed
      .filter((x): x is string => typeof x === "string")
      .map((id) => MIGRATIONS[id] === undefined ? id : MIGRATIONS[id])
      .filter((id): id is string => id !== null);
    return [...new Set(ids)];
  } catch {
    return [];
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
