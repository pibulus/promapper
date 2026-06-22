/**
 * Emojimap — edge helpers.
 *
 * Pure functions for normalizing edge data, resolving node ids, and drawing the
 * gooey curved edge paths. No DOM/closure state — everything takes args.
 */

import type { EdgeData, NodeData } from "./types.ts";

/**
 * Normalize raw edge data into the {source, target, id} shape D3's force sim
 * expects, dropping self-loops (which make the link force jitter forever) and
 * duplicate connections (which stack doubled link forces).
 */
export function mapEdges(edges: EdgeData[] = []): EdgeData[] {
  if (!edges || !Array.isArray(edges)) {
    console.warn("Invalid edges data passed to mapEdges:", edges);
    return [];
  }

  // Track source->target pairs so a duplicate edge can't stack doubled link
  // forces (which pull two nodes unnaturally tight).
  const seenPairs = new Set<string>();

  return edges.map((edge, i) => {
    if (!edge) {
      console.warn("Null or undefined edge in mapEdges at index", i);
      return null;
    }

    const sourceId = edge.sourceTopicId || edge.source_topic_id ||
      (typeof edge.source === "string" ? edge.source : "");
    const targetId = edge.targetTopicId || edge.target_topic_id ||
      (typeof edge.target === "string" ? edge.target : "");

    if (!sourceId || !targetId) {
      console.warn("Edge missing source or target ID:", edge);
      return null;
    }

    // Drop self-loops: a link from a node to itself makes the link force fight
    // forever (distance can never be satisfied), so the sim never settles and
    // the node jitters in place burning CPU/battery. The AI will eventually
    // emit a self-referential edge — guard the render path, not just merge.
    if (sourceId === targetId) {
      return null;
    }

    // Drop duplicate connections (same pair, either direction).
    const pairKey = sourceId < targetId
      ? `${sourceId}|${targetId}`
      : `${targetId}|${sourceId}`;
    if (seenPairs.has(pairKey)) {
      return null;
    }
    seenPairs.add(pairKey);

    return {
      ...edge,
      source: sourceId,
      target: targetId,
      id: edge.id || `${sourceId}-${targetId}-${i}`,
    };
  }).filter(Boolean) as EdgeData[];
}

export function getNodeId(node: string | NodeData | undefined): string {
  if (!node) return "";
  return typeof node === "string" ? node : node.id;
}

export function edgeTouchesNode(
  edge: EdgeData,
  nodeId: string | null | undefined,
) {
  if (!nodeId) return false;
  return getNodeId(edge.source) === nodeId || getNodeId(edge.target) === nodeId;
}

export function nodeTouchesEdge(node: NodeData, edge: EdgeData | undefined) {
  if (!edge) return false;
  return getNodeId(edge.source) === node.id ||
    getNodeId(edge.target) === node.id;
}

/**
 * Build a gently-bowed quadratic-curve path between two node positions. The
 * control point sits at the midpoint, pushed perpendicular to the line by a
 * fraction of its length — so every edge curves the same gentle amount
 * regardless of length, giving the whole map an elastic, "surface-tension"
 * feel instead of rigid wires. This is the core of the gooey look.
 */
export function edgePath(d: any): string {
  const sx = d.source && d.source.x !== undefined ? d.source.x : 0;
  const sy = d.source && d.source.y !== undefined ? d.source.y : 0;
  const tx = d.target && d.target.x !== undefined ? d.target.x : 0;
  const ty = d.target && d.target.y !== undefined ? d.target.y : 0;

  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  // Perpendicular offset = ~14% of length, capped so long edges don't balloon.
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(len * 0.14, 40);
  // Unit perpendicular (rotate the direction vector 90°).
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * bow;
  const cy = my + py * bow;

  return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
}
