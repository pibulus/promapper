/**
 * Emojimap — drag + merge.
 *
 * Node drag handlers and the drag-to-merge logic (proximity detection + the live
 * preview). The handlers take simulation/nodes/config as args; no closure state.
 */

import * as d3 from "d3";
import type { Config, NodeData } from "./types.ts";

// Drag-to-merge proximity. SVG units — deliberate, not trigger-happy.
export const MERGE_THRESHOLD = 45;

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
export function dragstarted(
  event: any,
  d: NodeData,
  simulation: d3.Simulation<NodeData, undefined>,
) {
  // Snappy grab: a high alphaTarget floods the sim with energy the instant you
  // touch a node, so neighbors react immediately (no mushy lag before the graph
  // wakes up). The springy links carry that energy outward elastically.
  if (!event.active) simulation.alphaTarget(0.5).restart();
  d.fx = d.x;
  d.fy = d.y;
}

export function dragged(
  event: any,
  d: NodeData,
  nodes: NodeData[],
  nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  d.fx = event.x;
  d.fy = event.y;
  // Live merge preview: light up whatever we'd merge into right now.
  const target = findMergeTarget(d, nodes);
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

  // Did we release on a merge target? (Same check the live preview used, so the
  // commit always matches what was lit up.)
  const mergeTarget = config.onMergeNodes ? findMergeTarget(d, nodes) : null;

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
