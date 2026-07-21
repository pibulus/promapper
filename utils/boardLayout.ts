/**
 * Board layout math — the pure half of drag-to-rearrange (useGridSortable
 * does the pointers, this does the thinking). No DOM, no Preact: everything
 * here is covered by core/tests/board_layout_test.ts.
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

export type BoardSize = "small" | "standard" | "wide";

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

/** One board cell in render order — a core card or a module cell. */
export interface CellPlan {
  /** Stable cell id: the core id, or the member ids joined with "+". */
  id: string;
  /** Every id living in this cell — what a drag moves together. */
  members: string[];
  core: boolean;
  size?: BoardSize;
  /** Module cells only: cards inside the cell (top→bottom), each slot one
   * module — or the notes+takes pair sharing a card. */
  slots?: string[][];
}

/** Turn the visible id order into cells. The grouping walk, in user order:
 *  - notes + takes both present → they share one small card (scraps on the
 *    front, recordings on the back), anchored where the first of the two sits
 *  - consecutive small cards stack two-up in one pillar — consecutive ON THE
 *    BOARD: a core card between two smalls breaks the run, so dragging a
 *    module far away never teleports its old neighbours after it
 *
 * `sizeOf` returns a module's size, or undefined for core cards.
 */
export function planCells(
  visible: string[],
  sizeOf: (id: string) => BoardSize | undefined,
): CellPlan[] {
  const paired = ["notes", "takes"].every((id) =>
    visible.includes(id) && sizeOf(id) !== undefined
  );

  const cells: CellPlan[] = [];
  // The most recent module cell with no core card since — stack target.
  let runTail: CellPlan | null = null;
  // The card holding the first-seen pair member; the later one joins it.
  let pairCard: string[] | null = null;

  const finishCell = (cell: CellPlan) => {
    cell.members = cell.slots!.flat();
    cell.id = cell.members.join("+");
  };

  for (const id of visible) {
    const size = sizeOf(id);
    if (size === undefined) {
      cells.push({ id, members: [id], core: true });
      runTail = null;
      continue;
    }

    if (paired && (id === "notes" || id === "takes")) {
      if (pairCard) {
        // Rides the earlier member's card, wherever that card lives.
        pairCard.push(id);
        for (const cell of cells) {
          if (!cell.core && cell.slots!.includes(pairCard)) finishCell(cell);
        }
        continue;
      }
      pairCard = [id];
      // falls through as a small card holding the pair
    }

    const card = pairCard && pairCard[0] === id ? pairCard : [id];
    const cardSize: BoardSize = card === pairCard ? "small" : size;
    if (
      cardSize === "small" && runTail?.size === "small" &&
      runTail.slots!.length === 1
    ) {
      runTail.slots!.push(card);
      finishCell(runTail);
    } else {
      const cell: CellPlan = {
        id,
        members: [id],
        core: false,
        size: cardSize,
        slots: [card],
      };
      finishCell(cell);
      cells.push(cell);
      runTail = cell;
    }
  }
  return cells;
}
