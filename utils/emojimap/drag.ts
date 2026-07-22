/**
 * Emojimap — drag + merge.
 *
 * Node drag handlers and the drag-to-merge logic (proximity detection + the live
 * preview). The handlers take simulation/nodes/config as args; no closure state.
 */

import * as d3 from "d3";
import type { Config, NodeData } from "./types.ts";

// Drag-to-merge proximity. SVG units — center-to-center. The node discs are
// r=20, so two nodes visually overlapping have centers ~40px apart; 60 gives a
// forgiving "drop it roughly on top" target while the collision force keeps you
// from merging neighbours you didn't mean to.
export const MERGE_THRESHOLD = 60;

// A drag must move at least this far (SVG units) before it can trigger a merge.
// Below this it's a click/double-click, not a drag — this is what stops a
// double-click from randomly merging a node into a settled neighbour.
const MIN_DRAG_TO_MERGE = 12;

// While a node is in hand, collision shrinks to this soft floor (24+24=48 <
// MERGE_THRESHOLD) and the carried node stops repelling its neighbours, so you
// can actually carry it ONTO a target. Restored on release. Without this,
// collide(70)+charge held the target ~105 units off a deliberate slow drag —
// only a fast flick could ever outrun the physics and land a merge.
const DRAG_COLLIDE_RADIUS = 24;

/**
 * Find the nearest other node within merge range of the dragged node, or null.
 * Shared by the live drag preview and the commit-on-release, so "what lights up"
 * and "what actually merges" can never disagree.
 */
export function findMergeTarget(
  d: NodeData,
  nodes: NodeData[],
): NodeData | null {
  if (d.x === undefined || d.y === undefined) return null;
  let nearest: NodeData | null = null;
  let min = Infinity;
  for (const other of nodes) {
    if (other.id === d.id) continue;
    if (other.x === undefined || other.y === undefined) continue;
    const dist = Math.hypot(d.x - other.x, d.y - other.y);
    if (dist < min) {
      min = dist;
      nearest = other;
    }
  }
  return nearest && min < MERGE_THRESHOLD ? nearest : null;
}

/**
 * Paint the live merge preview: the dragged node gets .is-merging and the
 * in-range target gets .is-merge-target, so the user SEES a merge coming and can
 * pull away to cancel. Cleared when out of range or on release.
 */
export function paintMergePreview(
  nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  draggedId: string,
  targetId: string | null,
) {
  nodeGroup
    .selectAll<SVGGElement, NodeData>(".node-group")
    .classed("is-merging", (n) => targetId !== null && n.id === draggedId)
    .classed("is-merge-target", (n) => n.id === targetId);
}

/**
 * Drag event handlers
 */
/** Did this drag actually move, or was it really just a click/double-click? */
function isRealDrag(d: NodeData): boolean {
  if (!d._dragStart || d.x === undefined || d.y === undefined) return false;
  return Math.hypot(d.x - d._dragStart.x, d.y - d._dragStart.y) >=
    MIN_DRAG_TO_MERGE;
}

export function dragstarted(
  event: any,
  d: NodeData,
  simulation: d3.Simulation<NodeData, undefined>,
  config: Config,
) {
  // Remember where the grab started so dragended can tell a real drag from a
  // click (a click moves ~0px and must NOT merge).
  d._dragStart = { x: d.x ?? event.x, y: d.y ?? event.y };
  // Snappy grab: a high alphaTarget floods the sim with energy the instant you
  // touch a node, so neighbors react immediately (no mushy lag before the graph
  // wakes up). The springy links carry that energy outward elastically.
  if (!event.active) simulation.alphaTarget(0.5).restart();
  d.fx = d.x;
  d.fy = d.y;
  // Let the merge gesture through: soften collision and stop THIS node's
  // charge from shoving its target away while it's pinned to the cursor.
  const collide = simulation.force("collide") as
    | d3.ForceCollide<NodeData>
    | undefined;
  collide?.radius(DRAG_COLLIDE_RADIUS);
  const charge = simulation.force("charge") as
    | d3.ForceManyBody<NodeData>
    | undefined;
  charge?.strength((n) => n.id === d.id ? 0 : config.chargeStrength);
}

export function dragged(
  event: any,
  d: NodeData,
  nodes: NodeData[],
  nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  d.fx = event.x;
  d.fy = event.y;
  // Live merge preview — but only once this is a REAL drag, so a tiny jitter
  // during a click/double-click doesn't flash a merge hint.
  const target = isRealDrag(d) ? findMergeTarget(d, nodes) : null;
  paintMergePreview(nodeGroup, d.id, target ? target.id : null);
}

export function dragended(
  event: any,
  d: NodeData,
  simulation: d3.Simulation<NodeData, undefined>,
  nodes: NodeData[],
  config: Config,
  nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;

  // Restore the drag-softened physics (see dragstarted). Forces only apply on
  // the next tick, so this can't move anything before the merge check below.
  const collide = simulation.force("collide") as
    | d3.ForceCollide<NodeData>
    | undefined;
  collide?.radius(config.collisionRadius);
  const charge = simulation.force("charge") as
    | d3.ForceManyBody<NodeData>
    | undefined;
  charge?.strength(config.chargeStrength);

  // Only a REAL drag (the node actually moved) can merge — otherwise a click or
  // double-click on a node that happens to sit near a neighbour would silently
  // merge it. Released on a target after a real drag → merge.
  const mergeTarget = config.onMergeNodes && isRealDrag(d)
    ? findMergeTarget(d, nodes)
    : null;
  d._dragStart = undefined;

  // Clear the preview highlight regardless of outcome.
  paintMergePreview(nodeGroup, d.id, null);

  // Persist all node positions after a drag ends
  if (config.onPositionsChange) {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) {
      if (n.id && Number.isFinite(n.x) && Number.isFinite(n.y)) {
        positions[n.id] = { x: n.x as number, y: n.y as number };
      }
    }
    config.onPositionsChange(positions);
  }

  // Released in range → merge.
  if (mergeTarget && config.onMergeNodes) {
    config.onMergeNodes(d.id, mergeTarget.id);
  }
}
