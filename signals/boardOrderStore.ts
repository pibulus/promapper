/**
 * Board order — the user's arrangement of the dashboard cards.
 *
 * null = never customized: the board renders its designed layout (registry
 * order on desktop, the actions-first hierarchy on mobile). The first drag
 * writes an explicit order which then applies at every breakpoint. The rack
 * modal offers a reset that hands arranging back to the design.
 */

import { signal } from "@preact/signals";

const KEY = "promapper-board-order";

function load(): string[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return Array.isArray(parsed) &&
        parsed.every((x): x is string => typeof x === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export const boardOrder = signal<string[] | null>(load());

export function setBoardOrder(ids: string[]): void {
  boardOrder.value = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage full/blocked — the arrangement still holds for this session.
  }
}

export function resetBoardOrder(): void {
  boardOrder.value = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored is exactly the state we wanted anyway.
  }
}
