/**
 * Node map — the pure bits of the emoji topic graph.
 *
 * The map has always been verified by hand + Playwright; these pin the
 * invariants that, when they broke before, broke it SILENTLY: self-loops that
 * stop the sim ever settling (battery burn), duplicate edges that stack link
 * forces, and the merge-proximity rule that decides whether a drop merges.
 *
 * NOTE: importing drag.ts pulls in DOM types (SVGGElement), which is why
 * deno.json sets an explicit `lib` — `deno test` otherwise typechecks with
 * Deno-only libs and fails on app code that `deno check` accepts. Keep
 * deno.json comment-free: Fresh reads it with strict JSON.parse, not JSONC.
 */

import { assertEquals } from "./_assert.ts";
import { edgePath, mapEdges } from "../../utils/emojimap/edges.ts";
import { findMergeTarget, MERGE_THRESHOLD } from "../../utils/emojimap/drag.ts";
import type { NodeData } from "../../utils/emojimap/types.ts";

Deno.test("mapEdges drops self-loops — they make the sim jitter forever", () => {
  const edges = mapEdges([
    { source: "frog", target: "frog" },
    { source: "frog", target: "swamp" },
  ]);
  assertEquals(edges.length, 1);
  assertEquals(edges[0].source, "frog");
  assertEquals(edges[0].target, "swamp");
});

Deno.test("mapEdges dedupes a pair in EITHER direction", () => {
  const edges = mapEdges([
    { source: "frog", target: "swamp" },
    { source: "swamp", target: "frog" },
    { source: "frog", target: "swamp" },
  ]);
  assertEquals(edges.length, 1);
});

Deno.test("mapEdges reads the snake_case + camelCase id fields", () => {
  const edges = mapEdges([
    { source: "", target: "", source_topic_id: "a", target_topic_id: "b" },
    { source: "", target: "", sourceTopicId: "c", targetTopicId: "d" },
  ]);
  assertEquals(edges.map((e) => [e.source, e.target]), [["a", "b"], [
    "c",
    "d",
  ]]);
});

Deno.test("mapEdges drops edges with a missing end instead of emitting junk", () => {
  const edges = mapEdges([
    { source: "frog", target: "" },
    // deno-lint-ignore no-explicit-any
    null as any,
    { source: "frog", target: "swamp" },
  ]);
  assertEquals(edges.length, 1);
});

Deno.test("edgePath bows perpendicular and lands on both endpoints", () => {
  const d = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
  const path = edgePath(d);
  // Starts at source, ends at target — a wrong control point still has to
  // honour the endpoints or edges visibly detach from their nodes.
  assertEquals(path.startsWith("M0,0"), true);
  assertEquals(path.endsWith("100,0"), true);
  // Bow is 14% of the 100px length, pushed perpendicular (straight down in y).
  assertEquals(path.includes("Q50,14"), true);
});

Deno.test("edgePath survives a zero-length edge without NaN", () => {
  const path = edgePath({ source: { x: 5, y: 5 }, target: { x: 5, y: 5 } });
  assertEquals(path.includes("NaN"), false);
});

Deno.test("findMergeTarget picks the NEAREST node inside the threshold", () => {
  const dragged: NodeData = { id: "a", label: "a", x: 0, y: 0 };
  const near: NodeData = { id: "near", label: "near", x: 20, y: 0 };
  const alsoInRange: NodeData = { id: "far", label: "far", x: 50, y: 0 };
  assertEquals(
    findMergeTarget(dragged, [dragged, near, alsoInRange])?.id,
    "near",
  );
});

Deno.test("findMergeTarget returns null just outside the threshold", () => {
  const dragged: NodeData = { id: "a", label: "a", x: 0, y: 0 };
  const outside: NodeData = {
    id: "b",
    label: "b",
    x: MERGE_THRESHOLD + 1,
    y: 0,
  };
  assertEquals(findMergeTarget(dragged, [dragged, outside]), null);
  const inside: NodeData = {
    id: "c",
    label: "c",
    x: MERGE_THRESHOLD - 1,
    y: 0,
  };
  assertEquals(findMergeTarget(dragged, [dragged, inside])?.id, "c");
});

Deno.test("findMergeTarget never merges a node into itself", () => {
  const dragged: NodeData = { id: "a", label: "a", x: 0, y: 0 };
  assertEquals(findMergeTarget(dragged, [dragged]), null);
});

Deno.test("findMergeTarget ignores nodes the sim hasn't placed yet", () => {
  const dragged: NodeData = { id: "a", label: "a", x: 0, y: 0 };
  const unplaced: NodeData = { id: "b", label: "b" };
  assertEquals(findMergeTarget(dragged, [dragged, unplaced]), null);
});
