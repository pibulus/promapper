/**
 * Force-Directed Emojimap Visualization
 *
 * D3-based force simulation for topic graphs with emoji nodes.
 *
 * This file is the ORCHESTRATOR: it owns the closure state (the live nodes,
 * edges, simulation, svg, and position memory) and exposes the public handle.
 * The stateless pieces live in ./emojimap/:
 *   - types.ts   data shapes + default config
 *   - edges.ts   edge normalization + the gooey curve math
 *   - drag.ts    node drag handlers + drag-to-merge
 *   - render.ts  svg/zoom setup, data-joins, tick, selection, fit-to-view
 */

import * as d3 from "d3";
import {
  type Config,
  defaultConfig,
  type EdgeData,
  type NodeData,
} from "./emojimap/types.ts";
import { mapEdges } from "./emojimap/edges.ts";
import { getNodeId } from "./emojimap/edges.ts";
import {
  applySelection,
  createGroups,
  createSvg,
  createZoomBehavior,
  debounce,
  fitAllIcons,
  ticked,
  updateElements,
} from "./emojimap/render.ts";

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
  /**
   * Focus mode: pass a node id to isolate it + its direct neighbors (dim
   * everything else and zoom to fit the subset). Pass null to clear focus and
   * zoom back out to the whole map.
   */
  setFocus: (focusedNodeId: string | null) => void;
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
      setFocus: () => {},
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

  // Focus mode (set via setFocus). While active, settle re-frames the focused
  // neighborhood instead of the whole map — a drag mid-focus used to zoom back
  // out to everything while the dim classes stayed on (a confusing half-state).
  let focusedId: string | null = null;
  function focusSubset(): NodeData[] {
    if (!focusedId) return nodes;
    const set = new Set<string>([focusedId]);
    for (const e of currentEdges) {
      const s = getNodeId(e.source);
      const t = getNodeId(e.target);
      if (s === focusedId) set.add(t);
      if (t === focusedId) set.add(s);
    }
    return nodes.filter((n) => set.has(n.id));
  }

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

  // Resize handling with debounced fit. Height-only wobbles under ~120px are
  // ignored: iOS shows/hides its URL bar while you scroll, which resizes the
  // vh-sized canvas and would otherwise refit — stomping a pinch-zoom mid-read.
  const debouncedFit = debounce(() => fitAllIcons(svg, zoom, node, nodes), 200);
  let lastObservedW = 0;
  let lastObservedH = 0;
  const resizeObserver = new ResizeObserver(() => {
    const rect = node.getBoundingClientRect();
    const widthChanged = Math.abs(rect.width - lastObservedW) > 1;
    const heightDelta = Math.abs(rect.height - lastObservedH);
    if (!widthChanged && heightDelta < 120) return;
    lastObservedW = rect.width;
    lastObservedH = rect.height;
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
      // Re-frame the camera only for sim runs the user didn't hand-start: cold
      // layouts, appends, re-tidy. After a drag, the user placed a node and the
      // camera is where they want it — a refit here read as a full-map reload.
      if (!mergedConfig.dragSettling) {
        fitAllIcons(svg, zoom, node, focusSubset());
      }
      mergedConfig.dragSettling = false;
      // Persist the settled layout — before this, positions only saved on drag
      // end, so a never-dragged map re-scattered on every reload. (The island
      // diffs structure before calling update(), so this write can't loop.)
      if (mergedConfig.onPositionsChange) {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of nodes) {
          if (n.id && Number.isFinite(n.x) && Number.isFinite(n.y)) {
            positions[n.id] = { x: n.x as number, y: n.y as number };
          }
        }
        mergedConfig.onPositionsChange(positions);
      }
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

      // Prune remembered positions for nodes that no longer exist (delete/
      // merge) so the map can't grow without bound across a long session.
      const liveIds = new Set(nodes.map((n) => n.id));
      for (const id of [...livePositions.keys()]) {
        if (!liveIds.has(id)) livePositions.delete(id);
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
      // full energy only for a cold first layout. This run is machine-made, so
      // its settle SHOULD re-frame the camera (clear any leftover drag mark).
      mergedConfig.dragSettling = false;
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

    setFocus(focusedNodeId) {
      const { nodeElements, linkElements } = renderedElements;
      focusedId = focusedNodeId;

      if (!focusedNodeId) {
        // Clear focus: undim everything, zoom back out to the whole map.
        nodeElements.classed("is-dimmed", false);
        linkElements.classed("is-dimmed", false);
        fitAllIcons(svg, zoom, node, nodes);
        return;
      }

      // The focus set = the node + every node one edge away from it. Dim
      // everything outside it; keep edges that link two in-set nodes bright.
      const inFocus = focusSubset();
      const focusSet = new Set(inFocus.map((n) => n.id));
      nodeElements.classed("is-dimmed", (n) => !focusSet.has(n.id));
      linkElements.classed(
        "is-dimmed",
        (e) =>
          !(focusSet.has(getNodeId(e.source)) &&
            focusSet.has(getNodeId(e.target))),
      );

      // Zoom to fit just the focus subset.
      fitAllIcons(svg, zoom, node, inFocus);
    },

    resetVisualization() {
      nodes.forEach((n) => {
        n.fx = null;
        n.fy = null;
      });
      // Explicit re-tidy: the user asked for a fresh layout, so the settle
      // should frame it.
      mergedConfig.dragSettling = false;
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
