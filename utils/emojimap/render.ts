/**
 * Emojimap — SVG setup, rendering, and layout.
 *
 * Everything that touches the DOM: SVG/zoom/group creation, the node + edge
 * data-joins, per-tick position updates, selection repaint, and fit-to-view.
 * All functions take their state as args (config/nodes/simulation/selections),
 * so the orchestrator in forceDirectedEmojimap.ts owns the closure state.
 */

import * as d3 from "d3";
import type { Config, EdgeData, NodeData } from "./types.ts";
import { dragended, dragged, dragstarted } from "./drag.ts";
import { edgePath, edgeTouchesNode, nodeTouchesEdge } from "./edges.ts";

/** Simple debounce. */
export function debounce<T extends (...args: any[]) => any>(
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

/** Create the root SVG with background-click / context-menu wiring. */
export function createSvg(node: HTMLElement, config: Config) {
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
 * Attach zoom behavior to the SVG. Tighter scale range + gentler wheel than
 * d3's defaults so desktop zoom feels controlled, not jumpy.
 */
export function createZoomBehavior(
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

/** Create separate <g> groups for links and nodes (links behind nodes). */
export function createGroups(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  const linkGroup = g.append("g").attr("class", "links");
  const nodeGroup = g.append("g").attr("class", "nodes");
  return { linkGroup, nodeGroup };
}

/**
 * Creates and configures a node group with drag behavior, emoji, and label.
 */
export function createNodeGroup(
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
 * Updates D3 elements for nodes and links using data joins.
 */
export function updateElements({
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
export function applySelection(
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
 * Tick callback: redraw edge curves + move node groups to their live positions.
 */
export function ticked({
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
 * Adjust zoom/transform so the given nodes fit into the container. Pass the
 * whole node set to frame everything, or a subset (e.g. a focus cluster).
 */
export function fitAllIcons(
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
