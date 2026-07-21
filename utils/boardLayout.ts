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
