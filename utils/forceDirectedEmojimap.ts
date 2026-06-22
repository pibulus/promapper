/**
 * Force-Directed Emojimap Visualization
 *
 * D3-based force simulation for topic graphs with emoji nodes
 * Ported from Svelte project_mapper implementation
 */

import * as d3 from "d3";

// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as unknown as number;
  };
}

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

interface NodeData {
  id: string;
  label: string;
  emoji?: string;
  color?: string;
  meta?: { emoji?: string };
  metadata?: { emoji?: string };
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

interface EdgeData {
  id?: string;
  source: string | NodeData;
  target: string | NodeData;
  sourceTopicId?: string;
  targetTopicId?: string;
  source_topic_id?: string;
  target_topic_id?: string;
  color?: string;
}

interface Config {
  width: number;
  height: number;
  backgroundColor: string;
  linkColor: string;
  linkStrokeWidth: number;
  linkOpacity: number;
  nodeColor: string;
  emojiFontSize: string;
  labelFontSize: string;
  labelColor: string;
  linkDistance: number;
  chargeStrength: number;
  collisionRadius: number;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onMouseOverNode?: (event: any, d: NodeData) => void;
  onClickNode?: (event: any, d: NodeData) => void;
  onDoubleClickNode?: (event: any, d: NodeData) => void;
  onRightClickNode?: (event: any, d: NodeData) => void;
  onMouseOverEdge?: (event: any, d: EdgeData) => void;
  onClickEdge?: (event: any, d: EdgeData) => void;
  onDoubleClickEdge?: (event: any, d: EdgeData) => void;
  onRightClickEdge?: (event: any, d: EdgeData) => void;
  onBackgroundClick?: (event: any) => void;
  onRightClickBackground?: (event: any) => void;
  /** Called after a drag ends with the full id->position map for all nodes. */
  onPositionsChange?: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
  /**
   * Called when a dragged node is released within ~45 SVG units of another
   * node. The caller should merge sourceId into targetId.
   */
  onMergeNodes?: (sourceId: string, targetId: string) => void;
}

// ===================================================================
// DEFAULT CONFIGURATION
// ===================================================================

const defaultConfig: Config = {
  width: 600,
  height: 400,
  backgroundColor: "#fff",
  linkColor: "#000",
  linkStrokeWidth: 3,
  linkOpacity: 1,
  nodeColor: "steelblue",
  emojiFontSize: "28px",
  labelFontSize: "14px",
  labelColor: "#333",
  linkDistance: 100,
  chargeStrength: -1500,
  collisionRadius: 50,
  selectedNodeId: null,
  selectedEdgeId: null,
  onMouseOverNode: undefined,
  onClickNode: undefined,
  onDoubleClickNode: undefined,
  onRightClickNode: undefined,
  onMouseOverEdge: undefined,
  onClickEdge: undefined,
  onDoubleClickEdge: undefined,
  onRightClickEdge: undefined,
  onBackgroundClick: undefined,
  onRightClickBackground: (event) => {
    event.preventDefault();
    // Dispatch custom event for external handling
    document.dispatchEvent(
      new CustomEvent("show-background-context-menu", {
        detail: { clientX: event.clientX, clientY: event.clientY },
      }),
    );
  },
  onPositionsChange: undefined,
  onMergeNodes: undefined,
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Creates an SVG element with proper viewBox and styling
 */
function createSvg(node: HTMLElement, config: Config) {
  const svg = d3
    .select(node)
    .append("svg")
    .attr("width", config.width)
    .attr("height", config.height)
    .attr("viewBox", `0 0 ${config.width} ${config.height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("background-color", config.backgroundColor)
    .on("click", (event) => {
      if (event.target === svg.node() && config.onBackgroundClick) {
        config.onBackgroundClick(event);
      }
    })
    .on("contextmenu", (event) => {
      event.preventDefault();
      if (config.onRightClickBackground) {
        config.onRightClickBackground(event);
      }
    });
  return svg;
}

/**
 * Attaches zoom behavior to SVG
 */
function createZoomBehavior(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    // Tighter range than d3's wide-open default: 0.45×–3.5× keeps the map
    // useful — you can pull back to see the whole shape or lean in on a cluster,
    // but never zoom out to specks or into one giant emoji.
    .scaleExtent([0.45, 3.5])
    // Gentler wheel: d3's default (deltaY/-500 for line/pixel deltas) makes one
    // notch lurch ~30%. Softening to /-900 makes desktop wheel-zoom feel smooth
    // and controlled instead of jumpy. Trackpad pinch (ctrlKey) keeps a bit more
    // bite so it still feels responsive.
    .wheelDelta((event) => {
      const base = -event.deltaY *
        (event.deltaMode === 1 ? 0.04 : event.deltaMode ? 1 : 0.0011);
      return event.ctrlKey ? base * 2.2 : base;
    })
    .on("zoom", (event) => {
      g.attr("transform", event.transform.toString());
    });
  svg.call(zoom);
  return zoom;
}

/**
 * Creates separate groups for links and nodes
 */
function createGroups(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  const linkGroup = g.append("g").attr("class", "links");
  const nodeGroup = g.append("g").attr("class", "nodes");
  return { linkGroup, nodeGroup };
}

/**
 * Maps raw edge data into objects suitable for D3 force simulation
 */
function mapEdges(edges: EdgeData[] = []): EdgeData[] {
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

function getNodeId(node: string | NodeData | undefined): string {
  if (!node) return "";
  return typeof node === "string" ? node : node.id;
}

function edgeTouchesNode(edge: EdgeData, nodeId: string | null | undefined) {
  if (!nodeId) return false;
  return getNodeId(edge.source) === nodeId || getNodeId(edge.target) === nodeId;
}

function nodeTouchesEdge(node: NodeData, edge: EdgeData | undefined) {
  if (!edge) return false;
  return getNodeId(edge.source) === node.id ||
    getNodeId(edge.target) === node.id;
}

// Drag-to-merge proximity. SVG units — deliberate, not trigger-happy.
const MERGE_THRESHOLD = 45;

/**
 * Find the nearest other node within merge range of the dragged node, or null.
 * Shared by the live drag preview and the commit-on-release, so "what lights up"
 * and "what actually merges" can never disagree.
 */
function findMergeTarget(d: NodeData, nodes: NodeData[]): NodeData | null {
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
function paintMergePreview(
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
function dragstarted(
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

function dragged(
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

function dragended(
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

/**
 * Creates and configures a node group with drag behavior, emoji, and label
 */
function createNodeGroup(
  selection: d3.Selection<SVGGElement, NodeData, SVGGElement, unknown>,
  config: Config,
  simulation: d3.Simulation<NodeData, undefined>,
  nodes: NodeData[],
  nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  selection
    .attr("class", "node-group")
    .style("cursor", "grab")
    .call(
      d3
        .drag<SVGGElement, NodeData>()
        .on("start", (event, d) => dragstarted(event, d, simulation))
        .on("drag", (event, d) => dragged(event, d, nodes, nodeGroup))
        .on(
          "end",
          (event, d) =>
            dragended(event, d, simulation, nodes, config, nodeGroup),
        ),
    )
    .on("mouseover", (event, d) => {
      if (config.onMouseOverNode) config.onMouseOverNode(event, d);
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      if (config.onClickNode) config.onClickNode(event, d);
    })
    .on("dblclick", (event, d) => {
      if (config.onDoubleClickNode) config.onDoubleClickNode(event, d);
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      if (config.onRightClickNode) config.onRightClickNode(event, d);
    });

  // Inner wrapper holds all the visuals and owns SCALE (bloom-in + hover
  // spring). The outer <g> owns TRANSLATE (the force tick moves it every
  // frame). Splitting these means a scale animation never fights the per-frame
  // position update — they live on different elements.
  const inner = selection
    .append("g")
    .attr("class", "node-inner");

  // A faint theme-accent glow sits furthest back — a quiet hint of color, not a
  // loud halo. Fill/opacity/blur all live in styles.css (.node-pad) so it
  // follows the active theme.
  inner
    .append("circle")
    .attr("class", "node-pad")
    .attr("r", 20);

  // A clean cream disc sits on top of the glow, under the emoji. It gives each
  // emoji its own solid ground so edges don't run visibly through the glyph, and
  // it reads as a tidy chip rather than a fuzzy blob. Sharp (no blur). Styling
  // in .node-disc.
  inner
    .append("circle")
    .attr("class", "node-disc")
    .attr("r", 17);

  // Add emoji — the hero. A soft drop-shadow (CSS) makes it pop off the canvas.
  inner
    .append("text")
    .attr("class", "emoji")
    .text((d) => {
      const emoji = d.emoji || (d.meta && d.meta.emoji) ||
        (d.metadata && d.metadata.emoji);
      return emoji && emoji.trim().length > 0 ? emoji : "❓";
    })
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", config.emojiFontSize);

  // Add label
  inner
    .append("text")
    .attr("class", "label")
    .text((d) => d.label)
    .attr("text-anchor", "middle")
    .attr("y", 28)
    .attr("font-size", config.labelFontSize)
    .attr("fill", config.labelColor);

  return selection;
}

/**
 * Updates D3 elements for nodes and links using data joins
 */
function updateElements({
  nodeGroup,
  linkGroup,
  nodes,
  currentEdges,
  config,
  simulation,
}: {
  nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  linkGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: NodeData[];
  currentEdges: EdgeData[];
  config: Config;
  simulation: d3.Simulation<NodeData, undefined>;
}) {
  // Update links — curved <path> elements, not straight <line>, for the gooey
  // elastic feel. fill:none so only the stroke shows.
  const linkElements = linkGroup
    .selectAll<SVGPathElement, EdgeData>("path")
    .data(currentEdges, (d: any) => d.id)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("fill", "none")
          .attr("stroke", (d: any) => d.color || config.linkColor)
          .attr("stroke-width", config.linkStrokeWidth)
          .attr("stroke-opacity", config.linkOpacity)
          .attr("stroke-linecap", "round")
          .style("cursor", "pointer")
          .style("pointer-events", "stroke")
          .on("mouseover", (event, d) => {
            d3.select(event.currentTarget).classed("is-hovered", true);
            if (config.onMouseOverEdge) config.onMouseOverEdge(event, d);
          })
          .on("mouseout", (event) => {
            d3.select(event.currentTarget).classed("is-hovered", false);
          })
          .on("click", (event, d) => {
            event.stopPropagation();
            if (config.onClickEdge) config.onClickEdge(event, d);
          })
          .on("pointerdown", (event, d) => {
            if (event.pointerType !== "touch") return;
            event.preventDefault();
            event.stopPropagation();
            if (config.onClickEdge) config.onClickEdge(event, d);
          })
          .on("dblclick", (event, d) => {
            if (config.onDoubleClickEdge) config.onDoubleClickEdge(event, d);
          })
          .on("contextmenu", (event, d) => {
            event.preventDefault();
            if (config.onRightClickEdge) config.onRightClickEdge(event, d);
          }),
      (update) => update,
      (exit) => exit.remove(),
    )
    .classed("is-selected", (d) => d.id === config.selectedEdgeId)
    .classed("is-connected", (d) => edgeTouchesNode(d, config.selectedNodeId))
    .attr(
      "stroke-width",
      (d) =>
        d.id === config.selectedEdgeId ||
          edgeTouchesNode(d, config.selectedNodeId)
          ? config.linkStrokeWidth + 2
          : config.linkStrokeWidth,
    )
    .attr(
      "stroke-opacity",
      (d) =>
        d.id === config.selectedEdgeId ||
          edgeTouchesNode(d, config.selectedNodeId)
          ? Math.min(1, config.linkOpacity + 0.35)
          : config.linkOpacity,
    );

  const selectedEdge = currentEdges.find((edge) =>
    edge.id === config.selectedEdgeId
  );

  // Update nodes. Select ONLY top-level node groups by class — a bare
  // selectAll("g") would also match the nested .node-inner wrappers and corrupt
  // the data-join (binding node data to inner groups, stripping their content).
  const nodeElements = nodeGroup
    .selectAll<SVGGElement, NodeData>(".node-group")
    .data(nodes, (d: any) => d.id)
    .join(
      (enter) => {
        const g = enter
          .append("g")
          .call((selection) =>
            createNodeGroup(selection, config, simulation, nodes, nodeGroup)
          )
          // Bloom in: start the node small + transparent with the .is-entering
          // class, then drop the class on the next frame so the CSS spring
          // (.node-inner transition + the springy bezier) eases it up to full
          // size with an overshoot. This is the "living" beat when appended
          // audio drops a new topic onto the map. We let CSS own the tween —
          // d3 and CSS must not both animate the same transform or they fight.
          .classed("is-entering", true);
        // Force a reflow so the browser registers the start state, then release
        // the class on the next frame to trigger the transition.
        requestAnimationFrame(() => {
          g.classed("is-entering", false);
        });
        return g;
      },
      (update) => update,
      // Shrink + fade on the way out instead of vanishing — gentler than a
      // hard remove when a topic is deleted or merged away. CSS owns the tween
      // via .is-leaving; we remove the element after it plays.
      (exit) => {
        exit.classed("is-leaving", true);
        return exit
          .transition()
          .duration(240)
          .remove();
      },
    )
    .classed("is-selected", (d) => d.id === config.selectedNodeId)
    .classed("is-connected", (d) => nodeTouchesEdge(d, selectedEdge));

  applySelection(linkElements, nodeElements, currentEdges, config);

  return { linkElements, nodeElements };
}

/**
 * Re-apply selection/highlight classes + edge stroke emphasis to existing
 * elements. This is the CHEAP path: it touches DOM attributes only and never
 * rebuilds the data-join or restarts the simulation — so a plain
 * tap-to-select can't make the whole graph reheat and reshuffle.
 */
function applySelection(
  linkElements: d3.Selection<SVGPathElement, EdgeData, SVGGElement, unknown>,
  nodeElements: d3.Selection<SVGGElement, NodeData, SVGGElement, unknown>,
  currentEdges: EdgeData[],
  config: Config,
) {
  linkElements
    .classed("is-selected", (d) => d.id === config.selectedEdgeId)
    .classed("is-connected", (d) => edgeTouchesNode(d, config.selectedNodeId))
    .attr(
      "stroke-width",
      (d) =>
        d.id === config.selectedEdgeId ||
          edgeTouchesNode(d, config.selectedNodeId)
          ? config.linkStrokeWidth + 2
          : config.linkStrokeWidth,
    )
    .attr(
      "stroke-opacity",
      (d) =>
        d.id === config.selectedEdgeId ||
          edgeTouchesNode(d, config.selectedNodeId)
          ? Math.min(1, config.linkOpacity + 0.35)
          : config.linkOpacity,
    );

  const selectedEdge = currentEdges.find((edge) =>
    edge.id === config.selectedEdgeId
  );

  nodeElements
    .classed("is-selected", (d) => d.id === config.selectedNodeId)
    .classed("is-connected", (d) => nodeTouchesEdge(d, selectedEdge));
}

/**
 * Build a gently-bowed quadratic-curve path between two node positions. The
 * control point sits at the midpoint, pushed perpendicular to the line by a
 * fraction of its length — so every edge curves the same gentle amount
 * regardless of length, giving the whole map an elastic, "surface-tension"
 * feel instead of rigid wires. This is the core of the gooey look.
 */
function edgePath(d: any): string {
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

/**
 * Tick callback for simulation that updates link and node positions
 */
function ticked({
  linkElements,
  nodeElements,
}: {
  linkElements: d3.Selection<SVGPathElement, EdgeData, SVGGElement, unknown>;
  nodeElements: d3.Selection<SVGGElement, NodeData, SVGGElement, unknown>;
}) {
  linkElements.attr("d", (d) => edgePath(d));

  nodeElements.attr("transform", (d) => {
    if (d && d.x !== undefined && d.y !== undefined) {
      return `translate(${d.x},${d.y})`;
    }
    return "translate(0,0)";
  });
}

/**
 * Adjusts zoom/transform so that all nodes fit into the container
 */
function fitAllIcons(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>,
  node: HTMLElement,
  nodes: NodeData[],
) {
  if (!nodes || nodes.length === 0) return;

  const padding = 50;
  const fillFactor = 0.8;

  const minX = d3.min(nodes, (d) => d.x || 0) || 0;
  const maxX = d3.max(nodes, (d) => d.x || 0) || 0;
  const minY = d3.min(nodes, (d) => d.y || 0) || 0;
  const maxY = d3.max(nodes, (d) => d.y || 0) || 0;

  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;

  const containerWidth = node.offsetWidth;
  const containerHeight = node.offsetHeight;
  if (containerWidth < 1 || containerHeight < 1) return;

  if (boxWidth < 1 && boxHeight < 1) {
    svg
      .attr("width", containerWidth)
      .attr("height", containerHeight)
      .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`);
    return;
  }

  const baseScale = Math.min(
    containerWidth / (boxWidth + 2 * padding),
    containerHeight / (boxHeight + 2 * padding),
  );

  const scale = baseScale * fillFactor;
  const translateX = containerWidth / 2 - scale * ((minX + maxX) / 2);
  const translateY = containerHeight / 2 - scale * ((minY + maxY) / 2);

  svg
    .attr("width", containerWidth)
    .attr("height", containerHeight)
    .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`);

  svg
    .transition()
    .duration(750)
    .call(
      zoom.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale),
    );
}

// ===================================================================
// PUBLIC API
// ===================================================================

export interface EmojimapHandle {
  update: (
    params: {
      nodes?: NodeData[];
      edges?: EdgeData[];
      config?: Partial<Config>;
    },
  ) => void;
  /**
   * Cheap selection-only update — re-highlights without restarting physics.
   * Use this on tap-to-select; use update() only for real data/layout changes.
   */
  setSelection: (
    selection: {
      selectedNodeId?: string | null;
      selectedEdgeId?: string | null;
    },
  ) => void;
  resetVisualization: () => void;
  updateLayout: () => void;
  destroy: () => void;
}

/**
 * Initializes a force-directed emojimap visualization
 *
 * @param node - The container HTML element
 * @param params - Parameters with nodes, edges, and configuration
 * @returns Public API with methods: update, resetVisualization, updateLayout, destroy
 */
export function forceDirectedEmojimap(
  node: HTMLElement,
  params: { nodes?: NodeData[]; edges?: EdgeData[]; config?: Partial<Config> },
): EmojimapHandle {
  // Validate node
  if (!node) {
    console.error("No DOM node provided to forceDirectedEmojimap");
    return {
      update: () => {},
      setSelection: () => {},
      resetVisualization: () => {},
      updateLayout: () => {},
      destroy: () => {},
    };
  }

  let { nodes = [], edges = [], config = {} } = params || {};

  // Ensure nodes and edges are arrays
  if (!Array.isArray(nodes)) {
    console.warn("Nodes is not an array, defaulting to empty array");
    nodes = [];
  }

  if (!Array.isArray(edges)) {
    console.warn("Edges is not an array, defaulting to empty array");
    edges = [];
  }

  // Merge with default config
  const mergedConfig: Config = { ...defaultConfig, ...config };

  // Process edges with error handling
  let currentEdges = mapEdges(edges);
  // Initialize SVG, groups, and zoom behavior
  const svg = createSvg(node, mergedConfig);
  const g = svg.append("g");
  const zoom = createZoomBehavior(svg, g);
  const { linkGroup, nodeGroup } = createGroups(g);

  // Create node map for linking
  const nodeMap = new Map<string, NodeData>();

  // Living-append memory: the last known on-screen position of every node the
  // sim has laid out, kept fresh each tick. On update() we read this to PIN
  // existing nodes in place (so appended topics grow the map instead of
  // teleporting it) and to seed new nodes near their parent rather than dead
  // center. Survives the node-object churn (the island hands update() fresh
  // clones every time), because it's keyed by stable id, not object identity.
  const livePositions = new Map<string, { x: number; y: number }>();
  function rememberPositions() {
    for (const n of nodes) {
      if (n.id && Number.isFinite(n.x) && Number.isFinite(n.y)) {
        livePositions.set(n.id, { x: n.x as number, y: n.y as number });
      }
    }
  }

  // Validate nodes and build node map; seed saved positions when available
  nodes.forEach((n) => {
    if (!n.id) {
      console.warn("Node missing ID, skipping:", n);
      return;
    }
    // Restore persisted layout positions so a reloaded graph keeps its shape
    const savedPos = (n as any).position as
      | { x: number; y: number }
      | undefined;
    if (
      savedPos && Number.isFinite(savedPos.x) && Number.isFinite(savedPos.y)
    ) {
      n.x = savedPos.x;
      n.y = savedPos.y;
    }
    nodeMap.set(n.id, n);
  });

  // Map edges to nodes
  currentEdges = currentEdges
    .map((e) => {
      const source = nodeMap.get(e.source as string);
      const target = nodeMap.get(e.target as string);

      if (!source || !target) {
        console.warn(
          `Edge references missing node: ${
            !source ? "source" : "target"
          } missing`,
          e,
        );
        return null;
      }

      return {
        ...e,
        source,
        target,
      };
    })
    .filter(Boolean) as EdgeData[];

  // Initialize simulation.
  //
  // alphaMin (0.001) + alphaDecay (~0.0228, d3 default made explicit) mean the
  // sim cools to a stop on its own after ~300 ticks and fires "end" — at which
  // point we stop() it so it parks at zero CPU. This is the battery/idle win:
  // a force sim left running spins forever. The drag handlers re-energize via
  // alphaTarget when the user grabs a node, so it wakes on demand.
  //
  // The tick handler only MOVES existing elements (ticked) — the expensive
  // data-join (updateElements) lives in init + update(), not per-frame, so we
  // don't reallocate selections 60×/second.
  const simulation = d3
    .forceSimulation(nodes)
    .alphaMin(0.001)
    .alphaDecay(0.0228)
    // velocityDecay is friction: lower = more glide/goo. 0.35 (vs the 0.4
    // default) lets nodes coast a touch longer into place so motion feels
    // viscous + elastic rather than abruptly damped — the "gooey" in
    // gooey-but-snappy. The snappy comes from the drag alphaTarget bump.
    .velocityDecay(0.35)
    .force(
      "link",
      d3
        .forceLink<NodeData, EdgeData>(currentEdges)
        .id((d) => d.id)
        .distance(mergedConfig.linkDistance)
        // Springier links: a higher strength makes connected nodes pull on each
        // other elastically, so dragging one tugs its neighbors (the "elastic
        // lag" trailing feel).
        .strength(0.6),
    )
    .force("charge", d3.forceManyBody().strength(mergedConfig.chargeStrength))
    .force("x", d3.forceX(mergedConfig.width / 2).strength(0.05))
    .force("y", d3.forceY(mergedConfig.height / 2).strength(0.05))
    .force("collide", d3.forceCollide(mergedConfig.collisionRadius));

  // Build the elements once now that the simulation exists (drag handlers need
  // it). update() rebuilds this join when data changes; tick never does.
  let renderedElements = updateElements({
    nodeGroup,
    linkGroup,
    nodes,
    currentEdges,
    config: mergedConfig,
    simulation,
  });

  // Resize handling with debounced fit
  const debouncedFit = debounce(() => fitAllIcons(svg, zoom, node, nodes), 200);
  const resizeObserver = new ResizeObserver(() => {
    debouncedFit();
  });
  resizeObserver.observe(node);

  simulation
    .on("tick", () => {
      ticked(renderedElements);
      rememberPositions();
    })
    .on("end", () => {
      // The sim has settled. Release the temporary pins we set on existing nodes
      // during an append re-layout, so the next interaction can move them freely.
      // (Drag already self-releases its pin in dragended, so this is a no-op for
      // dragged nodes.) Then park at zero CPU (battery win) and frame the graph.
      rememberPositions();
      for (const n of nodes) {
        n.fx = null;
        n.fy = null;
      }
      simulation.stop();
      fitAllIcons(svg, zoom, node, nodes);
    });

  // Public API
  return {
    update(newParams) {
      if (!newParams) {
        console.warn("[Emojimap] Update called with no parameters");
        return;
      }

      // Validate and set nodes
      if (Array.isArray(newParams.nodes)) {
        nodes = newParams.nodes;
      } else {
        console.warn(
          "[Emojimap] Update called with invalid nodes:",
          newParams.nodes,
        );
      }

      // Validate and set edges
      if (Array.isArray(newParams.edges)) {
        edges = newParams.edges;
      } else {
        console.warn(
          "[Emojimap] Update called with invalid edges:",
          newParams.edges,
        );
      }

      // Update config
      Object.assign(mergedConfig, newParams.config || {});

      if (!nodes.length) {
        console.warn(
          "[Emojimap] Update skipped: no nodes.",
        );
        return;
      }

      // LIVING APPEND — the heart of Phase 3.
      //
      // Existing nodes (ones the sim already laid out, remembered in
      // livePositions) keep their spot and get briefly PINNED (fx/fy) so the new
      // arrivals can't shove them. New nodes don't start at dead-center — they're
      // seeded next to their PARENT (the source of their first edge) plus a little
      // jitter, so an appended topic flies in from where it belongs and the map
      // grows outward instead of teleporting. Pins release on settle (the "end"
      // handler). The result: append feels like the map breathing in a new
      // thought, not rebuilding itself.

      // Map each node id -> a parent id (first edge that connects it), so a new
      // node can be seeded near something already on screen.
      const parentOf = new Map<string, string>();
      for (const e of edges) {
        const s = e.sourceTopicId || e.source_topic_id ||
          (typeof e.source === "string" ? e.source : "");
        const t = e.targetTopicId || e.target_topic_id ||
          (typeof e.target === "string" ? e.target : "");
        if (s && t) {
          if (!parentOf.has(t)) parentOf.set(t, s);
          if (!parentOf.has(s)) parentOf.set(s, t);
        }
      }

      // If we already have a laid-out graph, this is an append/edit → gentle
      // re-energize that grows the map. If not (first render, or after a clear),
      // it's a cold layout → full energy to find a fresh arrangement.
      const hadExistingLayout = livePositions.size > 0;

      const cx = mergedConfig.width / 2;
      const cy = mergedConfig.height / 2;
      // Deterministic jitter (no Math.random — keeps renders reproducible). Spread
      // new siblings around their parent by index.
      let newNodeIndex = 0;
      const jitter = (i: number, radius: number) => {
        const angle = i * 2.399963; // golden angle, nicely spreads points
        return {
          dx: Math.cos(angle) * radius,
          dy: Math.sin(angle) * radius,
        };
      };

      nodes.forEach((n) => {
        if (!n.id) {
          console.warn("[Emojimap] Node missing ID:", n);
          return;
        }

        const remembered = livePositions.get(n.id);
        if (remembered) {
          // Existing node: restore its live position and pin it for this
          // re-energize so appended nodes settle around it, not through it.
          n.x = remembered.x;
          n.y = remembered.y;
          n.fx = remembered.x;
          n.fy = remembered.y;
          return;
        }

        // New node. Prefer a saved layout position (reload case)...
        const savedPos = (n as NodeData & {
          position?: { x: number; y: number };
        }).position;
        if (
          savedPos && Number.isFinite(savedPos.x) && Number.isFinite(savedPos.y)
        ) {
          n.x = savedPos.x;
          n.y = savedPos.y;
          return;
        }

        // ...otherwise seed it next to its parent (if that parent is already
        // placed), so it flies in from context instead of from dead-center.
        const parentId = parentOf.get(n.id);
        const parentPos = parentId ? livePositions.get(parentId) : undefined;
        const { dx, dy } = jitter(newNodeIndex++, 60);
        if (parentPos) {
          n.x = parentPos.x + dx;
          n.y = parentPos.y + dy;
        } else if (n.x == null || n.y == null) {
          // No parent on screen yet — land near center with a little spread so a
          // batch of fresh, unconnected nodes doesn't all stack on one pixel.
          n.x = cx + dx;
          n.y = cy + dy;
        }
      });

      // Create node map for linking
      const newNodeMap = new Map<string, NodeData>();
      nodes.forEach((n) => {
        if (n && n.id) newNodeMap.set(n.id, n);
      });

      // Map and filter edges
      const mappedEdges = mapEdges(edges);

      currentEdges = mappedEdges
        .map((e) => {
          if (!e.source || !e.target) return null;

          const source = newNodeMap.get(e.source as string);
          const target = newNodeMap.get(e.target as string);

          if (!source || !target) {
            console.warn(
              `[Emojimap] Edge references missing node:`,
              !source ? `source (${e.source})` : `target (${e.target})`,
            );
            return null;
          }

          return {
            ...e,
            source,
            target,
          };
        })
        .filter(Boolean) as EdgeData[];

      // Update simulation
      simulation.nodes(nodes);
      const linkForce = simulation.force("link") as d3.ForceLink<
        NodeData,
        EdgeData
      >;
      if (linkForce) {
        linkForce.links(currentEdges);
        // Re-apply link distance so layout-preset changes actually take effect.
        linkForce.distance(mergedConfig.linkDistance);
      }
      // Re-apply charge + collision from config too — otherwise the organic/
      // readable layout toggle changes the icon but not the physics.
      const chargeForce = simulation.force("charge") as
        | d3.ForceManyBody<NodeData>
        | undefined;
      if (chargeForce) chargeForce.strength(mergedConfig.chargeStrength);
      simulation.force(
        "collide",
        d3.forceCollide(mergedConfig.collisionRadius),
      );
      simulation.force("x", d3.forceX(mergedConfig.width / 2).strength(0.05));
      simulation.force("y", d3.forceY(mergedConfig.height / 2).strength(0.05));

      // Rebuild the data-join so new nodes/edges get DOM elements + drag
      // handlers, and removed ones leave. tick() only moves these; it never
      // rebuilds them. Keep the handle fresh so subsequent ticks render the new
      // set.
      renderedElements = updateElements({
        nodeGroup,
        linkGroup,
        nodes,
        currentEdges,
        config: mergedConfig,
        simulation,
      });

      // Gentle re-energize for an append (existing nodes are pinned, so 0.5 is
      // enough to slot the newcomers in without flinging the settled layout);
      // full energy only for a cold first layout.
      simulation.alpha(hadExistingLayout ? 0.5 : 1).restart();
    },

    setSelection(selection) {
      // Update only the selection fields, then repaint highlight classes on the
      // existing elements. No data-join, no alpha restart — the graph stays put.
      mergedConfig.selectedNodeId = selection.selectedNodeId ?? null;
      mergedConfig.selectedEdgeId = selection.selectedEdgeId ?? null;
      applySelection(
        renderedElements.linkElements,
        renderedElements.nodeElements,
        currentEdges,
        mergedConfig,
      );
    },

    resetVisualization() {
      nodes.forEach((n) => {
        n.fx = null;
        n.fy = null;
      });
      simulation.alpha(1).restart();
    },

    updateLayout() {
      fitAllIcons(svg, zoom, node, nodes);
    },

    destroy() {
      simulation.stop();
      svg.remove();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    },
  };
}
