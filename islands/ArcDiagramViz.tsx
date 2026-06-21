/**
 * Arc Diagram Visualization - Vertical Arc Layout
 *
 * Shows topics as nodes along a vertical center line
 * with arcs representing relationships between topics
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import * as d3 from "d3";
import { conversationData } from "@signals/conversationStore.ts";

export default function ArcDiagramViz() {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenPortalRef = useRef<HTMLDivElement | null>(null);
  const isFullscreen = useSignal(false);
  const width = useSignal(0);
  const height = useSignal(0);

  // Toggle fullscreen
  function toggleFullscreen() {
    if (isFullscreen.value) {
      // Remove fullscreen
      if (fullscreenPortalRef.current?.parentNode) {
        fullscreenPortalRef.current.parentNode.removeChild(
          fullscreenPortalRef.current,
        );
      }
      fullscreenPortalRef.current = null;
      isFullscreen.value = false;

      // Force update the normal view
      setTimeout(() => {
        updateDimensions();
      }, 50);
    } else {
      // Create fullscreen
      isFullscreen.value = true;
      createFullscreenPortal();
    }
  }

  // Create fullscreen portal
  function createFullscreenPortal() {
    // Create portal element
    const portal = document.createElement("div");
    portal.className = "fullscreen-arc-viz-portal";
    portal.style.position = "fixed";
    portal.style.top = "0";
    portal.style.left = "0";
    portal.style.width = "100%";
    portal.style.height = "100%";
    portal.style.zIndex = "9999";
    portal.style.display = "flex";
    portal.style.alignItems = "center";
    portal.style.justifyContent = "center";
    portal.style.backgroundColor = "rgba(0, 0, 0, 0.9)";

    // Create modal container
    const modalContainer = document.createElement("div");
    modalContainer.className =
      "bg-white rounded-lg border-4 border-purple-400 shadow-brutal";
    modalContainer.style.width = "90%";
    modalContainer.style.height = "85%";
    modalContainer.style.padding = "1.5rem";

    // Create header
    const header = document.createElement("div");
    header.className = "flex justify-between items-center mb-4";

    const title = document.createElement("h2");
    title.className = "text-2xl font-bold text-purple-600";
    title.textContent = "Arc Diagram Visualization";

    const closeButton = document.createElement("button");
    closeButton.className =
      "bg-red-500 text-white font-bold px-4 py-2 rounded border-2 border-red-700 hover:bg-red-600";
    closeButton.textContent = "✕ Close";
    closeButton.onclick = toggleFullscreen;

    header.appendChild(title);
    header.appendChild(closeButton);

    // Create container for visualization
    const container = document.createElement("div");
    container.className = "bg-purple-50 rounded-lg";
    container.style.width = "100%";
    container.style.height = "calc(100% - 4rem)";
    fullscreenContainerRef.current = container;

    // Assemble
    modalContainer.appendChild(header);
    modalContainer.appendChild(container);
    portal.appendChild(modalContainer);

    // Click outside to close
    portal.addEventListener("click", (e) => {
      if (e.target === portal) {
        toggleFullscreen();
      }
    });

    // Escape key to close
    const escListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        toggleFullscreen();
      }
    };
    portal.tabIndex = 0;
    portal.addEventListener("keydown", escListener);

    // Add to document
    document.body.appendChild(portal);
    fullscreenPortalRef.current = portal;

    // Render visualization
    setTimeout(() => {
      updateDimensions();
    }, 50);
  }

  // Update dimensions
  function updateDimensions() {
    const container = isFullscreen.value
      ? fullscreenContainerRef.current
      : svgContainerRef.current;

    if (!container) return;

    const rect = container.getBoundingClientRect();
    width.value = rect.width;

    // Square aspect ratio in normal mode, full height in fullscreen
    if (isFullscreen.value) {
      height.value = rect.height;
    } else {
      height.value = rect.width;
    }

    updateVisualization(container);
  }

  // Update visualization
  function updateVisualization(container?: HTMLDivElement | null) {
    const targetContainer = container ||
      (isFullscreen.value
        ? fullscreenContainerRef.current
        : svgContainerRef.current);

    if (!targetContainer || !width.value || !height.value) return;

    const data = conversationData.value;
    if (!data || !data.nodes.length) return;

    const nodes = data.nodes;
    const edges = data.edges;

    // Clear existing SVG
    d3.select(targetContainer).select("svg").remove();

    const svg = d3
      .select(targetContainer)
      .append("svg")
      .attr("width", width.value)
      .attr("height", height.value)
      .attr("viewBox", `0 0 ${width.value} ${height.value}`);

    // Calculate max nodes to show
    const maxNodesToShow = Math.min(
      nodes.length,
      Math.floor(height.value / 30),
    );
    const nodesToShow = nodes.slice(0, maxNodesToShow);

    // Y scale for vertical positioning
    const padding = height.value * 0.15;
    const yScale = d3
      .scalePoint()
      .domain(nodesToShow.map((_, i) => i.toString()))
      .range([padding, height.value - padding]);

    // Color scale
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Build node index map
    const nodeIndex = new Map();
    nodesToShow.forEach((node, i) => {
      nodeIndex.set(node.id, i);
    });

    // Filter edges to visible nodes only
    const visibleEdges = edges.filter(
      (edge) =>
        nodeIndex.has(edge.source_topic_id) &&
        nodeIndex.has(edge.target_topic_id),
    );

    // Background for text area
    svg
      .append("rect")
      .attr("x", width.value * 0.6)
      .attr("y", 0)
      .attr("width", width.value * 0.4)
      .attr("height", height.value)
      .attr("fill", "rgba(0,0,0,0.05)")
      .attr("rx", 5);

    // Draw arcs
    const linkGroup = svg.append("g").attr("class", "links");

    visibleEdges.forEach((edge) => {
      const sourceIndex = nodeIndex.get(edge.source_topic_id);
      const targetIndex = nodeIndex.get(edge.target_topic_id);

      if (sourceIndex === undefined || targetIndex === undefined) return;

      const y1 = yScale(sourceIndex.toString()) || 0;
      const y2 = yScale(targetIndex.toString()) || 0;

      // Skip self-references
      if (y1 === y2) return;

      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const r = (bottom - top) / 2;

      linkGroup
        .append("path")
        .attr(
          "d",
          `M ${width.value / 2},${top} A ${r},${r} 0 0,${y1 < y2 ? 1 : 0} ${
            width.value / 2
          },${bottom}`,
        )
        .attr("fill", "none")
        .attr("stroke", edge.color || colorScale(sourceIndex % 10))
        .attr("stroke-width", 2)
        .attr("opacity", 0.7)
        .attr("class", "transition-opacity hover:opacity-100")
        .append("title")
        .text(
          `${nodes[sourceIndex].label} → ${nodes[targetIndex].label}`,
        );
    });

    // Draw nodes
    const nodeGroup = svg.append("g").attr("class", "nodes");

    nodeGroup
      .selectAll("circle")
      .data(nodesToShow)
      .enter()
      .append("circle")
      .attr("cx", width.value / 2)
      .attr("cy", (_, i) => yScale(i.toString()) || 0)
      .attr("r", 8)
      .attr("fill", (d) => d.color || colorScale(nodesToShow.indexOf(d) % 10))
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .attr("class", "cursor-pointer transition-all hover:r-12")
      .append("title")
      .text((d) => `${d.emoji} ${d.label}`);

    // Add text labels
    nodeGroup
      .selectAll("text")
      .data(nodesToShow)
      .enter()
      .append("text")
      .attr("x", width.value / 2 + 15)
      .attr("y", (_, i) => (yScale(i.toString()) || 0) + 4)
      .attr("fill", "#374151")
      .attr("class", "text-sm")
      .text((d) => {
        const label = `${d.emoji} ${d.label}`;
        return label.length > 25 ? label.substring(0, 25) + "..." : label;
      });

    // Add count label
    svg
      .append("text")
      .attr("x", width.value - 10)
      .attr("y", 20)
      .attr("text-anchor", "end")
      .attr("class", "text-xs opacity-70 fill-gray-600")
      .text(`${maxNodesToShow} of ${nodes.length} topics shown`);
  }

  // Setup effects
  useEffect(() => {
    // Resize observer
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (svgContainerRef.current) {
      resizeObserver.observe(svgContainerRef.current);
    }

    // Escape key handler
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen.value) {
        toggleFullscreen();
      }
    };
    globalThis.addEventListener("keydown", handleKeydown);

    // Initial render
    updateDimensions();

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      globalThis.removeEventListener("keydown", handleKeydown);

      // Remove fullscreen portal
      if (fullscreenPortalRef.current?.parentNode) {
        fullscreenPortalRef.current.parentNode.removeChild(
          fullscreenPortalRef.current,
        );
      }
    };
  }, []);

  // Watch for data changes
  useEffect(() => {
    if (conversationData.value) {
      updateVisualization();
    }
  }, [conversationData.value]);

  // Check if we have data
  const hasData = (conversationData.value?.nodes?.length ?? 0) > 0;

  if (!hasData) {
    return (
      <div class="flex h-full items-center justify-center text-gray-500">
        <p>No topic data available</p>
      </div>
    );
  }

  return (
    <div class="relative flex h-full w-full flex-col">
      <div
        ref={svgContainerRef}
        class="mx-auto aspect-square w-full flex-1 overflow-hidden rounded-lg border-2 border-purple-200 bg-purple-50"
      />

      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        class="absolute bottom-4 right-4 bg-purple-500 text-white font-bold px-3 py-2 rounded-full border-2 border-purple-700 hover:bg-purple-600 shadow-lg"
        title="Toggle fullscreen view"
      >
        🔍
      </button>
    </div>
  );
}
