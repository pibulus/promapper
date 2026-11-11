/**
 * Module store — which optional dashboard modules the user has switched on.
 *
 * Modules ship OFF by default; the rack (ModuleRack island) toggles them.
 * Render order starts at registry order (the designed board); dragging
 * cards writes an explicit arrangement to @signals/boardOrderStore, and a
 * switched-off module remembers its slot for when it comes back.
 */

import { signal } from "@preact/signals";

const KEY = "promapper-modules-v2";

/** Modules start tucked on the Board Shelf by default so a board only shows
 * components that actually carry content (Notes/Magpie/Takes auto-surface when
 * non-empty; any card is 1 click away on the bottom shelf). */
const DEFAULT_MODULES: string[] = [];

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

/** Session-scoped explicit dismissals so hiding a content-bearing module
 * (e.g. Notes or Magpie with items) tucks it onto the shelf until re-added. */
export const dismissedModules = signal<string[]>([]);

export function isModuleEnabled(id: string): boolean {
  return enabledModules.value.includes(id);
}

function persistModules(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage full/blocked — the toggle still works for this session.
  }
}

export function showModule(id: string): void {
  dismissedModules.value = dismissedModules.value.filter((x) => x !== id);
  if (!isModuleEnabled(id)) {
    enabledModules.value = [...enabledModules.value, id];
    persistModules(enabledModules.value);
  }
}

export function hideModule(id: string): void {
  if (!dismissedModules.value.includes(id)) {
    dismissedModules.value = [...dismissedModules.value, id];
  }
  if (isModuleEnabled(id)) {
    enabledModules.value = enabledModules.value.filter((x) => x !== id);
    persistModules(enabledModules.value);
  }
}

export function toggleModule(id: string): void {
  if (isModuleEnabled(id)) {
    hideModule(id);
  } else {
    showModule(id);
  }
}

/** Back to the starter set — called when a new conversation/take replaces
 * the current one, so it opens with the default row rather than an empty
 * rack or the previous conversation's toggles. */
export function resetModules(): void {
  dismissedModules.value = [];
  enabledModules.value = [...DEFAULT_MODULES];
  persistModules(enabledModules.value);
}
