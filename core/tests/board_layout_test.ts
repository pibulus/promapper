/**
 * Board layout math — order merging + the card planning walk
 * (utils/boardLayout.ts, the pure half of the modular dashboard).
 * Heights/pillars are the grid's job (1:2:4 row units) — planCells only
 * orders cards and collapses the notes+takes pair.
 */

import { assertEquals } from "./_assert.ts";
import {
  type BoardSize,
  colSpanClassForCell,
  effectiveOrder,
  hasCardContent,
  mergeVisibleOrder,
  NEXT_SIZE,
  planCells,
  resolveVisibleBoardIds,
} from "../../utils/boardLayout.ts";

const MODULE_SIZES: Record<string, BoardSize> = {
  notes: "small",
  ask: "small",
  takes: "medium",
  sound: "small",
};

/** Mirrors the island's sizeOf: canvas exempt, core defaults medium. */
const sizeOf = (id: string): BoardSize | undefined => {
  if (id === "canvas") return undefined;
  if (["transcript", "summary", "actions"].includes(id)) return "medium";
  return MODULE_SIZES[id];
};

/** Compact view of a cell plan for assertions. */
const shape = (visible: string[]) =>
  planCells(visible, sizeOf).map((c) => ({
    id: c.id,
    members: c.members,
    core: c.core,
    size: c.size,
  }));

const DEFAULTS = [
  "transcript",
  "summary",
  "actions",
  "canvas",
  "notes",
  "ask",
  "takes",
  "sound",
];

Deno.test("effectiveOrder: no save → the designed order", () => {
  assertEquals(effectiveOrder(null, DEFAULTS), DEFAULTS);
});

Deno.test("effectiveOrder: saved order wins, retired and duplicate ids drop, new ids join at the end", () => {
  const saved = ["canvas", "ghost-of-old-module", "transcript", "transcript"];
  assertEquals(effectiveOrder(saved, DEFAULTS), [
    "canvas",
    "transcript",
    "summary",
    "actions",
    "notes",
    "ask",
    "takes",
    "sound",
  ]);
});

Deno.test("mergeVisibleOrder: hidden ids keep their slot", () => {
  const full = ["a", "b", "hidden", "c"];
  assertEquals(mergeVisibleOrder(full, ["c", "a", "b"]), [
    "c",
    "a",
    "hidden",
    "b",
  ]);
});

Deno.test("drag round-trip: a card reorder writes back through mergeVisibleOrder", () => {
  // notes is switched off; the user drags summary behind canvas
  const full = ["transcript", "summary", "notes", "canvas"];
  const dragged = ["summary", "canvas", "transcript"];
  assertEquals(mergeVisibleOrder(full, dragged), [
    "summary",
    "canvas",
    "notes",
    "transcript",
  ]);
});

Deno.test("planCells: core cards and modules become flat cards in order", () => {
  assertEquals(shape(["transcript", "canvas", "sound"]), [
    { id: "transcript", members: ["transcript"], core: true, size: "medium" },
    { id: "canvas", members: ["canvas"], core: true, size: undefined },
    { id: "sound", members: ["sound"], core: false, size: "small" },
  ]);
});

Deno.test("planCells: notes+takes share one card, anchored at the first of the two", () => {
  assertEquals(shape(["takes", "ask", "notes"]), [
    {
      id: "takes+notes",
      members: ["takes", "notes"],
      core: false,
      size: "medium",
    },
    { id: "ask", members: ["ask"], core: false, size: "small" },
  ]);
});

Deno.test("planCells: the later pair member joins its anchor across a core card", () => {
  assertEquals(shape(["notes", "canvas", "takes", "ask"]), [
    {
      id: "notes+takes",
      members: ["notes", "takes"],
      core: false,
      size: "small",
    },
    { id: "canvas", members: ["canvas"], core: true, size: undefined },
    { id: "ask", members: ["ask"], core: false, size: "small" },
  ]);
});

Deno.test("planCells: solo notes (takes off) renders as its own card", () => {
  assertEquals(shape(["notes"]), [
    { id: "notes", members: ["notes"], core: false, size: "small" },
  ]);
});

Deno.test("NEXT_SIZE cycles small → medium → tall → small", () => {
  assertEquals(NEXT_SIZE.small, "medium");
  assertEquals(NEXT_SIZE.medium, "tall");
  assertEquals(NEXT_SIZE.tall, "small");
});

Deno.test("hasCardContent: detects populated vs empty core and optional cards", () => {
  const empty = {
    transcript: { text: "   " },
    summary: "No summary generated",
    actionItems: [],
    nodes: [],
    whiteboardScene: '{"elements":[{"id":"1","isDeleted":true}]}',
    notes: "  ",
    magpie: [],
  };
  assertEquals(hasCardContent("transcript", empty), false);
  assertEquals(hasCardContent("summary", empty), false);
  assertEquals(hasCardContent("actions", empty), false);
  assertEquals(hasCardContent("canvas", empty), false);
  assertEquals(hasCardContent("notes", empty), false);
  assertEquals(hasCardContent("magpie", empty), false);
  assertEquals(hasCardContent("takes", empty, 0), false);

  const rich = {
    transcript: { text: "Sheriff: Morning." },
    summary: "A brief update.",
    actionItems: [{ id: "a1" }],
    nodes: [],
    whiteboardScene: '{"elements":[{"id":"1","isDeleted":false}]}',
    notes: "Check the fence",
    magpie: [{ id: "m1" }],
  };
  assertEquals(hasCardContent("transcript", rich), true);
  assertEquals(hasCardContent("summary", rich), true);
  assertEquals(hasCardContent("actions", rich), true);
  assertEquals(hasCardContent("canvas", rich), true);
  assertEquals(hasCardContent("notes", rich), true);
  assertEquals(hasCardContent("magpie", rich), true);
  assertEquals(hasCardContent("takes", rich, 2), true);
});

Deno.test("resolveVisibleBoardIds: default dashboard shows only cards with content", () => {
  const partial = {
    transcript: { text: "We talked through the sprint." },
    summary: "Sprint recap.",
    actionItems: [],
    nodes: [{ id: "n1" }],
    notes: "Pinned note",
    magpie: [],
  };
  assertEquals(
    resolveVisibleBoardIds({
      fullOrder: DEFAULTS,
      data: partial,
      enabledModules: [],
    }),
    ["transcript", "summary", "canvas", "notes"],
  );
});

Deno.test("resolveVisibleBoardIds: dismissed content module hides, revealed empty core shows, blank falls back", () => {
  const partial = {
    transcript: { text: "Hello" },
    summary: "",
    actionItems: [],
    nodes: [],
    notes: "Keep me unless dismissed",
  };
  assertEquals(
    resolveVisibleBoardIds({
      fullOrder: DEFAULTS,
      data: partial,
      enabledModules: ["ask"],
      dismissedModules: ["notes"],
      revealedCoreIds: ["actions"],
    }),
    ["transcript", "actions", "ask"],
  );

  assertEquals(
    resolveVisibleBoardIds({
      fullOrder: DEFAULTS,
      data: {},
      enabledModules: [],
    }),
    ["transcript", "notes"],
  );
});

Deno.test("colSpanClassForCell: adapts 1-card, 2-card, and 3-card runs cleanly", () => {
  const oneAndOne = planCells(["transcript", "canvas", "notes"], sizeOf);
  assertEquals(
    colSpanClassForCell(oneAndOne, 0),
    "min-w-0 md:col-span-4 lg:col-span-6",
  );
  assertEquals(colSpanClassForCell(oneAndOne, 1), "w-full board-cell--canvas");
  assertEquals(
    colSpanClassForCell(oneAndOne, 2),
    "min-w-0 md:col-span-4 lg:col-span-6",
  );

  const twoAndThree = planCells(
    ["transcript", "summary", "canvas", "notes", "ask", "sound"],
    sizeOf,
  );
  assertEquals(
    colSpanClassForCell(twoAndThree, 0),
    "min-w-0 md:col-span-2 lg:col-span-3",
  );
  assertEquals(
    colSpanClassForCell(twoAndThree, 1),
    "min-w-0 md:col-span-2 lg:col-span-3",
  );
  assertEquals(
    colSpanClassForCell(twoAndThree, 3),
    "min-w-0 md:col-span-2 lg:col-span-2",
  );
});
