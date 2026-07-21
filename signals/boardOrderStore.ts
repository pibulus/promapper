/**
 * Board arrangement — the user's order AND per-card sizes for the dashboard.
 *
 * Order: null = never customized — the board renders its designed layout
 * (registry order on desktop, the actions-first hierarchy on mobile). The
 * first drag writes an explicit order which then applies at every
 * breakpoint. Sizes: an override map on top of each card's default
 * (small | medium | tall — the 1:2:4 row system in utils/boardLayout.ts);
 * tap a card's grip to cycle. The rack modal's reset clears both.
 */

import { signal } from "@preact/signals";
import { isViewingShared } from "@signals/conversationStore.ts";
import type { BoardSize } from "@utils/boardLayout.ts";

const ORDER_KEY = "promapper-board-order";
const SIZES_KEY = "promapper-board-sizes";

function loadOrder(): string[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null");
    return Array.isArray(parsed) &&
        parsed.every((x): x is string => typeof x === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function loadSizes(): Record<string, BoardSize> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(SIZES_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const sizes: Record<string, BoardSize> = {};
    for (const [id, size] of Object.entries(parsed)) {
      if (size === "small" || size === "medium" || size === "tall") {
        sizes[id] = size;
      }
    }
    return sizes;
  } catch {
    return {};
  }
}

export const boardOrder = signal<string[] | null>(loadOrder());
export const boardSizes = signal<Record<string, BoardSize>>(loadSizes());

export function setBoardOrder(ids: string[]): void {
  boardOrder.value = ids;
  // Shared views promise "changes aren't saved": the drag still works for
  // the session, but never writes over the visitor's own board.
  if (isViewingShared.value) return;
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {
    // Storage full/blocked — the arrangement still holds for this session.
  }
}

export function setCardSize(id: string, size: BoardSize): void {
  boardSizes.value = { ...boardSizes.value, [id]: size };
  if (isViewingShared.value) return; // same promise as setBoardOrder
  try {
    localStorage.setItem(SIZES_KEY, JSON.stringify(boardSizes.value));
  } catch {
    // Storage full/blocked — the size still holds for this session.
  }
}

/** True once the user has arranged or resized anything. */
export function boardCustomized(): boolean {
  return boardOrder.value !== null ||
    Object.keys(boardSizes.value).length > 0;
}

/** Back to the designed board: order and sizes both. */
export function resetBoard(): void {
  boardOrder.value = null;
  boardSizes.value = {};
  try {
    localStorage.removeItem(ORDER_KEY);
    localStorage.removeItem(SIZES_KEY);
  } catch {
    // Nothing stored is exactly the state we wanted anyway.
  }
}
