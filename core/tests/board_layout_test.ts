/**
 * Board layout math — order merging + the module grouping walk
 * (utils/boardLayout.ts, the pure half of drag-to-rearrange).
 */

import { assertEquals } from "./_assert.ts";
import {
  type BoardSize,
  effectiveOrder,
  mergeVisibleOrder,
  planCells,
} from "../../utils/boardLayout.ts";

/** Registry stand-in: core ids return undefined, like the real sizeOf. */
const SIZES: Record<string, BoardSize> = {
  notes: "small",
  bishop: "small",
  takes: "standard",
  sound: "small",
  a: "small",
  b: "small",
  c: "small",
};
const sizeOf = (id: string) => SIZES[id];

/** Compact view of a cell plan for assertions. */
const shape = (visible: string[]) =>
  planCells(visible, sizeOf).map((c) =>
    c.core ? c.id : { id: c.id, size: c.size, slots: c.slots }
  );

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

Deno.test("drag round-trip: a cell reorder writes back through mergeVisibleOrder", () => {
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

Deno.test("planCells: consecutive smalls stack two-up; a standard breaks the run", () => {
  assertEquals(shape(["bishop", "sound", "takes"]), [
    { id: "bishop+sound", size: "small", slots: [["bishop"], ["sound"]] },
    { id: "takes", size: "standard", slots: [["takes"]] },
  ]);
});

Deno.test("planCells: a pillar holds two — a third small starts a new one", () => {
  assertEquals(shape(["a", "b", "c"]), [
    { id: "a+b", size: "small", slots: [["a"], ["b"]] },
    { id: "c", size: "small", slots: [["c"]] },
  ]);
});

Deno.test("planCells: a core card between two smalls breaks the pillar", () => {
  // sound dragged in front of the summary card must NOT pull bishop with it
  assertEquals(shape(["sound", "summary", "bishop"]), [
    { id: "sound", size: "small", slots: [["sound"]] },
    "summary",
    { id: "bishop", size: "small", slots: [["bishop"]] },
  ]);
});

Deno.test("planCells: notes+takes share one card, anchored at the first of the two", () => {
  // takes anchors the pair (it comes first); the pair card is small, so it
  // stacks with bishop in one pillar
  assertEquals(shape(["takes", "bishop", "notes"]), [
    {
      id: "takes+notes+bishop",
      size: "small",
      slots: [["takes", "notes"], ["bishop"]],
    },
  ]);
});

Deno.test("planCells: the later pair member joins its anchor across a core card", () => {
  // notes sits before the canvas, takes after — takes still rides notes'
  // card (the pair is board-wide), and bishop stacks with sound instead
  assertEquals(shape(["notes", "canvas", "takes", "bishop", "sound"]), [
    { id: "notes+takes", size: "small", slots: [["notes", "takes"]] },
    "canvas",
    { id: "bishop+sound", size: "small", slots: [["bishop"], ["sound"]] },
  ]);
});

Deno.test("planCells: solo notes (takes off) renders as its own card", () => {
  assertEquals(shape(["notes"]), [
    { id: "notes", size: "small", slots: [["notes"]] },
  ]);
});
