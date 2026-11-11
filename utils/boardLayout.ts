/**
 * Board layout math — the pure half of the modular dashboard (useGridSortable
 * does the pointers, this does the thinking). No DOM, no Preact: everything
 * here is covered by core/tests/board_layout_test.ts.
 *
 * THE SIZE SYSTEM (1 : 2 : 4 — halving all the way):
 * every card is ONE pillar wide (3 pillars desktop / 2 tablet / 1 phone) and
 * spans fixed grid row-units: small = 1, medium = 2, tall = 4. Two smalls
 * make a medium, two mediums make a tall, a tall levels with medium+2 smalls
 * — the GRID does that math natively (grid-auto-rows + dense flow), gaps
 * included, so this module never computes positions or pillars. The node
 * map (canvas) is the one exception: full row, fixed height, not resizable.
 *
 * The dashboard is one flat id order: four core cards + every registered
 * module. The user's saved arrangement reorders that list; switched-off
 * modules keep their slot so re-enabling one puts it back where it lived.
 */

export const CORE_CELL_IDS = [
  "transcript",
  "summary",
  "actions",
  "canvas",
] as const;

export type BoardSize = "small" | "medium" | "tall";

/** Tap the grip: small → medium → tall → small. */
export const NEXT_SIZE: Record<BoardSize, BoardSize> = {
  small: "medium",
  medium: "tall",
  tall: "small",
};

/** One board cell in render order — a core card or a module card. */
export interface CellPlan {
  /** Stable cell id: the core id, or the member ids joined with "+". */
  id: string;
  /** Every id living in this cell — what a drag moves together. */
  members: string[];
  core: boolean;
  /** Row-span size; undefined only for the canvas (the full-row exception). */
  size?: BoardSize;
}

/** Saved order reconciled with today's board: known ids keep their saved
 * order, ids the save has never met join at the end of the rack. */
export function effectiveOrder(
  saved: string[] | null,
  defaults: string[],
): string[] {
  if (!saved) return [...defaults];
  const seen = new Set<string>();
  const known: string[] = [];
  for (const id of saved) {
    if (defaults.includes(id) && !seen.has(id)) {
      known.push(id);
      seen.add(id);
    }
  }
  return [...known, ...defaults.filter((id) => !seen.has(id))];
}

/** Write a reordering of the VISIBLE ids back into the full order without
 * disturbing the hidden ones — a switched-off module keeps its slot. */
export function mergeVisibleOrder(
  fullOrder: string[],
  newVisible: string[],
): string[] {
  const visible = new Set(newVisible);
  let next = 0;
  return fullOrder.map((id) => (visible.has(id) ? newVisible[next++] : id));
}

/** Turn the visible id order into cards. One grouping rule lives here:
 * notes + takes both present share one card (scraps on the front,
 * recordings on the back), anchored where the first of the two sits.
 * Heights and pillar composition are the grid's job, not ours.
 *
 * `sizeOf` resolves a card's size (defaults + user overrides); it may
 * return undefined only for the canvas. */
export function planCells(
  visible: string[],
  sizeOf: (id: string) => BoardSize | undefined,
): CellPlan[] {
  const core = new Set<string>(CORE_CELL_IDS);
  const paired = ["notes", "takes"].every((id) => visible.includes(id));

  const cells: CellPlan[] = [];
  let pairCell: CellPlan | null = null;
  for (const id of visible) {
    if (core.has(id)) {
      cells.push({ id, members: [id], core: true, size: sizeOf(id) });
      continue;
    }
    if (paired && (id === "notes" || id === "takes")) {
      if (pairCell) {
        // Rides the earlier member's card, wherever that card lives.
        pairCell.members.push(id);
        pairCell.id = pairCell.members.join("+");
        continue;
      }
      pairCell = { id, members: [id], core: false, size: sizeOf(id) };
      cells.push(pairCell);
      continue;
    }
    cells.push({ id, members: [id], core: false, size: sizeOf(id) });
  }
  return cells;
}

/** Minimal conversation data shape inspected for content-aware card visibility. */
export interface CardContentSnapshot {
  transcript?: {
    text?: string | null;
    raw_text?: string | null;
    formatted_text?: string | null;
  } | null;
  summary?: string | null;
  actionItems?: readonly unknown[] | null;
  nodes?: readonly unknown[] | null;
  whiteboardScene?: string | null;
  notes?: string | null;
  magpie?: readonly unknown[] | null;
}

/** True when a serialized Excalidraw scene contains at least one non-deleted element. */
export function hasWhiteboardElements(scene?: string | null): boolean {
  if (!scene || !scene.trim()) return false;
  try {
    const parsed = JSON.parse(scene) as {
      elements?: Array<{ isDeleted?: boolean }>;
    };
    return Array.isArray(parsed?.elements) &&
      parsed.elements.some((el) => Boolean(el) && !el.isDeleted);
  } catch {
    return false;
  }
}

/** Whether a core or optional card currently holds meaningful content to display. */
export function hasCardContent(
  id: string,
  data: CardContentSnapshot | null | undefined,
  takesCount = 0,
): boolean {
  if (!data) return false;
  switch (id) {
    case "transcript":
      return Boolean(
        data.transcript?.text?.trim() ||
          data.transcript?.raw_text?.trim() ||
          data.transcript?.formatted_text?.trim(),
      );
    case "summary": {
      const s = data.summary?.trim() ?? "";
      return s.length > 0 && s !== "No summary generated";
    }
    case "actions":
      return (data.actionItems?.length ?? 0) > 0;
    case "canvas":
      return (data.nodes?.length ?? 0) > 0 ||
        hasWhiteboardElements(data.whiteboardScene);
    case "notes":
      return Boolean(data.notes?.trim());
    case "magpie":
      return (data.magpie?.length ?? 0) > 0;
    case "takes":
      return takesCount > 0;
    default:
      return false;
  }
}

export interface ResolveVisibleOptions {
  fullOrder: string[];
  data: CardContentSnapshot | null | undefined;
  takesCount?: number;
  enabledModules: readonly string[];
  dismissedModules?: readonly string[];
  revealedCoreIds?: readonly string[];
  isLive?: boolean;
}

/** Determine which cards appear on the dashboard in user order.
 * - Core cards show when they have content, when revealed for this session,
 *   or (for transcript) during a live room.
 * - Optional modules show when switched on OR when they carry content and
 *   haven't been explicitly dismissed.
 * - Fallback: an all-empty conversation opens Transcript + Notes so the desk
 *   never renders completely blank. */
export function resolveVisibleBoardIds(opts: ResolveVisibleOptions): string[] {
  const {
    fullOrder,
    data,
    takesCount = 0,
    enabledModules,
    dismissedModules = [],
    revealedCoreIds = [],
    isLive = false,
  } = opts;
  const core = new Set<string>(CORE_CELL_IDS);
  const enabled = new Set<string>(enabledModules);
  const dismissed = new Set<string>(dismissedModules);
  const revealed = new Set<string>(revealedCoreIds);

  const visible = fullOrder.filter((id) => {
    if (core.has(id)) {
      if (revealed.has(id)) return true;
      if (isLive && id === "transcript") return true;
      return hasCardContent(id, data, takesCount);
    }
    if (enabled.has(id)) return true;
    if (dismissed.has(id)) return false;
    return hasCardContent(id, data, takesCount);
  });

  if (visible.length === 0) {
    return fullOrder.filter((id) => id === "transcript" || id === "notes");
  }
  return visible;
}

/** Responsive Tailwind column-span classes for a cell inside a contiguous
 * non-canvas run, so 1-card, 2-card, and 4-card rows fill all 6 desktop
 * columns without orphan holes. Must return static class tokens for Tailwind. */
export function colSpanClassForCell(
  cells: readonly CellPlan[],
  index: number,
  customized = false,
): string {
  const target = cells[index];
  if (!target || target.id === "canvas") return "w-full board-cell--canvas";

  let start = index;
  while (start > 0 && cells[start - 1].id !== "canvas") start--;
  let end = index;
  while (end < cells.length - 1 && cells[end + 1].id !== "canvas") end++;
  const runLength = end - start + 1;

  if (runLength === 1) {
    return "min-w-0 md:col-span-4 lg:col-span-6";
  }
  if (runLength === 2 || (runLength === 4 && !customized)) {
    return "min-w-0 md:col-span-2 lg:col-span-3";
  }
  return "min-w-0 md:col-span-2 lg:col-span-2";
}
