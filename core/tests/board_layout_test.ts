/**
 * Board layout math — order merging + the card planning walk
 * (utils/boardLayout.ts, the pure half of the modular dashboard).
 * Heights/pillars are the grid's job (1:2:4 row units) — planCells only
 * orders cards and collapses the notes+takes pair.
 */

import { assertEquals } from "./_assert.ts";
import {
  type BoardSize,
  effectiveOrder,
  mergeVisibleOrder,
  NEXT_SIZE,
  planCells,
} from "../../utils/boardLayout.ts";

const MODULE_SIZES: Record<string, BoardSize> = {
  notes: "small",
  bishop: "small",
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
  "bishop",
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
    "bishop",
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
  assertEquals(shape(["takes", "bishop", "notes"]), [
    {
      id: "takes+notes",
      members: ["takes", "notes"],
      core: false,
      size: "medium",
    },
    { id: "bishop", members: ["bishop"], core: false, size: "small" },
  ]);
});

Deno.test("planCells: the later pair member joins its anchor across a core card", () => {
  assertEquals(shape(["notes", "canvas", "takes", "bishop"]), [
    {
      id: "notes+takes",
      members: ["notes", "takes"],
      core: false,
      size: "small",
    },
    { id: "canvas", members: ["canvas"], core: true, size: undefined },
    { id: "bishop", members: ["bishop"], core: false, size: "small" },
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
