/**
 * Force-Directed Graph - D3 Physics-Based Visualization
 *
 * Refactored to use modular forceDirectedEmojimap
 * Shows topics as emoji nodes with physics simulation and draggable interactions
 *
 * Graph gestures:
 *   click         → select node / edge (shows detail panel)
 *   double-click  → rename node (window.prompt)
 *   right-click   → delete node (window.confirm)
 *   drag-to-node  → merge when released within ~45 SVG units
 *   layout toggle → organic (loose physics) vs readable (spread out)
 */

import { useEffect, useRef } from "preact/hooks";
import { useComputed, useSignal } from "@preact/signals";
import { conversationData } from "@signals/conversationStore.ts";
import {
  EmojimapHandle,
  forceDirectedEmojimap,
} from "../utils/forceDirectedEmojimap.ts";
import {
  deleteTopic,
  mergeTopics,
  persistTopicPositions,
  renameTopic,
} from "../core/orchestration/conversation-ops.ts";
import * as htmlToImage from "html-to-image";
import ContextMenu from "../components/ContextMenu.tsx";

interface ForceDirectedGraphProps {
  loading?: boolean;
}

export default function ForceDirectedGraph(
  { loading = false }: ForceDirectedGraphProps,
) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const emojimapHandleRef = useRef<EmojimapHandle | null>(null);

  const isFullscreen = useSignal(false);
  const selectedNodeId = useSignal<string | null>(null);
  const selectedEdgeId = useSignal<string | null>(null);
  const showAddNode = useSignal(false);
  const newNodeLabel = useSignal("");
  const newNodeEmoji = useSignal("");

  // Context menu state
  const contextMenuVisible = useSignal(false);
  const contextMenuX = useSignal(0);
  const contextMenuY = useSignal(0);

  // Simulation parameters
  const linkDistance = useSignal(100);
  const chargeStrength = useSignal(-850);
  const collisionRadius = useSignal(70);

  // Layout toggle: "organic" = current physics defaults, "readable" = spread
  // Organic: loose clustering. Readable: stronger repulsion + longer links.
  const layoutMode = useSignal<"organic" | "readable">("organic");

  // ===================================================================
  // FORCE LAYOUT PRESETS
  // ===================================================================

  const LAYOUT_PRESETS = {
    organic: { linkDistance: 100, chargeStrength: -850, collisionRadius: 70 },
    readable: { linkDistance: 180, chargeStrength: -1800, collisionRadius: 90 },
  };

  function applyLayoutPreset(mode: "organic" | "readable") {
    const preset = LAYOUT_PRESETS[mode];
    linkDistance.value = preset.linkDistance;
    chargeStrength.value = preset.chargeStrength;
    collisionRadius.value = preset.collisionRadius;
    layoutMode.value = mode;
  }

  function toggleLayout() {
    applyLayoutPreset(layoutMode.value === "organic" ? "readable" : "organic");
  }

  // Debounced position persistence — 400 ms so dragging doesn't thrash autosave
  let _positionDebounceTimer: number | undefined;
  function handlePositionsChange(
    positions: Record<string, { x: number; y: number }>,
  ) {
    clearTimeout(_positionDebounceTimer);
    _positionDebounceTimer = setTimeout(() => {
      if (!conversationData.value) return;
      conversationData.value = persistTopicPositions(
        conversationData.value,
        positions,
      );
    }, 400) as unknown as number;
  }

  // Get topics and edges from store
  const topics = useComputed(() => conversationData.value?.nodes || []);
  const relationships = useComputed(() => conversationData.value?.edges || []);

  function getRelationshipId(
    rel: { id?: string; source_topic_id: string; target_topic_id: string },
    index: number,
  ) {
    return rel.id || `${rel.source_topic_id}-${rel.target_topic_id}-${index}`;
  }

  // ===================================================================
  // FULLSCREEN MANAGEMENT
  // ===================================================================

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
  }

  // ===================================================================
  // VISUALIZATION MANAGEMENT
  // ===================================================================

  function initializeVisualization() {
    const container = isFullscreen.value
      ? fullscreenContainerRef.current
      : svgContainerRef.current;
    if (!container || topics.value.length === 0) return;

    // Destroy existing visualization
    if (emojimapHandleRef.current) {
      emojimapHandleRef.current.destroy();
    }

    const rect = container.getBoundingClientRect();
    const width = rect.width || container.offsetWidth ||
      Math.min(900, window.innerWidth - 32);
    const height = rect.height || container.offsetHeight ||
      Math.min(800, window.innerHeight * 0.6);

    // Map edges to correct format
    const edges = relationships.value.map((rel, index) => ({
      id: getRelationshipId(rel, index),
      source: rel.source_topic_id,
      target: rel.target_topic_id,
      color: rel.color || "#999",
    }));

    // Initialize emojimap
    emojimapHandleRef.current = forceDirectedEmojimap(container, {
      nodes: topics.value,
      edges,
      config: {
        width,
        height,
        backgroundColor: "rgba(255,255,255,0.65)",
        linkDistance: linkDistance.value,
        chargeStrength: chargeStrength.value,
        collisionRadius: collisionRadius.value,
        linkStrokeWidth: 3,
        linkOpacity: 0.58,
        onClickNode: (_event: MouseEvent, node: { id: string }) => {
          selectedNodeId.value = node.id;
          selectedEdgeId.value = null;
        },
        onDoubleClickNode: (
          _event: MouseEvent,
          node: { id: string; label?: string },
        ) => {
          if (!conversationData.value) return;
          const current = conversationData.value.nodes.find((n) =>
            n.id === node.id
          );
          const newLabel = window.prompt(
            "Rename topic:",
            current?.label ?? node.id,
          );
          if (newLabel && newLabel.trim()) {
            conversationData.value = renameTopic(
              conversationData.value,
              node.id,
              newLabel,
            );
          }
        },
        onRightClickNode: (
          event: MouseEvent,
          node: { id: string; label?: string },
        ) => {
          event.preventDefault();
          if (!conversationData.value) return;
          const current = conversationData.value.nodes.find((n) =>
            n.id === node.id
          );
          const label = current?.label ?? node.id;
          if (window.confirm(`Delete topic "${label}"?`)) {
            conversationData.value = deleteTopic(
              conversationData.value,
              node.id,
            );
            if (selectedNodeId.value === node.id) selectedNodeId.value = null;
          }
        },
        onClickEdge: (_event: MouseEvent, edge: { id?: string }) => {
          selectedEdgeId.value = edge.id || null;
          selectedNodeId.value = null;
        },
        onBackgroundClick: () => {
          selectedNodeId.value = null;
          selectedEdgeId.value = null;
        },
        onRightClickBackground: (event: MouseEvent) => {
          event.preventDefault();
          contextMenuX.value = event.clientX;
          contextMenuY.value = event.clientY;
          contextMenuVisible.value = true;
        },
        onMergeNodes: (sourceId: string, targetId: string) => {
          if (!conversationData.value) return;
          conversationData.value = mergeTopics(
            conversationData.value,
            sourceId,
            targetId,
          );
          // Clear selection if the merged-away node was selected
          if (selectedNodeId.value === sourceId) selectedNodeId.value = null;
        },
        onPositionsChange: handlePositionsChange,
      },
    });
  }

  function resetVisualization() {
    if (emojimapHandleRef.current) {
      emojimapHandleRef.current.resetVisualization();
    }
  }

  function fitToView() {
    if (emojimapHandleRef.current) {
      emojimapHandleRef.current.updateLayout();
    }
  }

  async function exportAsPng() {
    const container = isFullscreen.value
      ? fullscreenContainerRef.current
      : svgContainerRef.current;
    if (!container) return;

    try {
      // Create header overlay
      const header = document.createElement("div");
      header.style.position = "absolute";
      header.style.top = "20px";
      header.style.left = "20px";
      header.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
      header.style.padding = "8px 20px";
      header.style.borderRadius = "12px";
      header.style.fontSize = "18px";
      header.style.fontWeight = "bold";
      header.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";

      const title = conversationData.value?.conversation.title ||
        "Conversation Map";
      const timestamp = new Date().toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      header.innerHTML =
        `<div>${title}</div><div style="font-size: 12px; font-weight: normal; color: #666;">${timestamp}</div>`;
      container.appendChild(header);

      // Hide control buttons during export
      const buttons = container.querySelectorAll("button");
      buttons.forEach((btn) => (btn.style.display = "none"));

      // Generate PNG
      const dataUrl = await htmlToImage.toPng(container, {
        backgroundColor: "#ffffff",
      });

      // Restore UI
      buttons.forEach((btn) => (btn.style.display = ""));
      container.removeChild(header);

      // Download
      const link = document.createElement("a");
      link.href = dataUrl;
      const filename = `${title.replace(/\s+/g, "_")}_${
        timestamp.replace(/[\s,:]+/g, "_")
      }.png`;
      link.download = filename;
      link.click();
    } catch (error) {
      console.error("Error exporting as PNG:", error);
      alert("Failed to export PNG. Please try again.");
    }
  }

  function addManualNode() {
    const label = newNodeLabel.value.trim();
    if (!label || !conversationData.value) return;

    const emoji = newNodeEmoji.value.trim() || "✨";
    const id = `manual_${crypto.randomUUID()}`;
    const nextNode = {
      id,
      label,
      emoji,
      color: "#E8839C",
    };

    conversationData.value = {
      ...conversationData.value,
      nodes: [...conversationData.value.nodes, nextNode],
    };
    selectedNodeId.value = id;
    newNodeLabel.value = "";
    newNodeEmoji.value = "";
    showAddNode.value = false;
  }

  // ===================================================================
  // LIFECYCLE
  // ===================================================================

  // Initialize on mount
  useEffect(() => {
    if (topics.value.length > 0 && svgContainerRef.current) {
      initializeVisualization();
    }

    return () => {
      if (emojimapHandleRef.current) {
        emojimapHandleRef.current.destroy();
      }
    };
  }, []);

  // Update when data or params change
  useEffect(() => {
    if (topics.value.length > 0 && emojimapHandleRef.current) {
      const edges = relationships.value.map((rel, index) => ({
        id: getRelationshipId(rel, index),
        source: rel.source_topic_id,
        target: rel.target_topic_id,
        color: rel.color || "#999",
      }));

      emojimapHandleRef.current.update({
        nodes: topics.value,
        edges,
        config: {
          linkDistance: linkDistance.value,
          chargeStrength: chargeStrength.value,
          collisionRadius: collisionRadius.value,
          selectedNodeId: selectedNodeId.value,
          selectedEdgeId: selectedEdgeId.value,
        },
      });
    }
  }, [
    topics.value,
    relationships.value,
    linkDistance.value,
    chargeStrength.value,
    collisionRadius.value,
    selectedNodeId.value,
    selectedEdgeId.value,
  ]);

  useEffect(() => {
    if (topics.value.length === 0) return;

    const timeoutId = setTimeout(() => initializeVisualization(), 50);

    if (!isFullscreen.value) {
      return () => clearTimeout(timeoutId);
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        isFullscreen.value = false;
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isFullscreen.value]);

  // ===================================================================
  // RENDER
  // ===================================================================

  if (loading) {
    return (
      <div class="flex h-full items-center justify-center">
        <div class="loading loading-spinner text-primary"></div>
      </div>
    );
  }

  if (topics.value.length === 0) {
    return (
      <div class="empty-state" style="min-height: 400px;">
        <div class="empty-state-icon">🕸️</div>
        <div class="empty-state-text">No topics yet</div>
      </div>
    );
  }

  // Context menu items
  const contextMenuItems = [
    {
      label: "Reset Positions",
      icon: "🔄",
      onClick: resetVisualization,
    },
    {
      label: "Fit to View",
      icon: "📐",
      onClick: fitToView,
    },
    {
      label: "Export as PNG",
      icon: "📸",
      onClick: exportAsPng,
    },
  ];

  const selectedNode = selectedNodeId.value
    ? topics.value.find((node) => node.id === selectedNodeId.value)
    : null;
  const connectedEdges = selectedNode
    ? relationships.value.filter((edge) =>
      edge.source_topic_id === selectedNode.id ||
      edge.target_topic_id === selectedNode.id
    )
    : [];
  const connectedTopics = selectedNode
    ? connectedEdges
      .map((edge) =>
        edge.source_topic_id === selectedNode.id
          ? edge.target_topic_id
          : edge.source_topic_id
      )
      .map((id) => topics.value.find((node) => node.id === id))
      .filter(Boolean)
    : [];
  const selectedEdge = selectedEdgeId.value
    ? relationships.value.find((edge, index) =>
      getRelationshipId(edge, index) === selectedEdgeId.value
    )
    : null;
  const edgeSource = selectedEdge
    ? topics.value.find((node) => node.id === selectedEdge.source_topic_id)
    : null;
  const edgeTarget = selectedEdge
    ? topics.value.find((node) => node.id === selectedEdge.target_topic_id)
    : null;
  function renderNodeDetail() {
    if (!selectedNode) return null;
    return (
      <aside class="topic-node-detail" aria-live="polite">
        <button
          type="button"
          class="topic-node-detail__close"
          onClick={() => selectedNodeId.value = null}
          aria-label="Close topic details"
        >
          ×
        </button>
        <div class="topic-node-detail__emoji">
          {selectedNode.emoji || "✨"}
        </div>
        <div>
          <h4>{selectedNode.label}</h4>
          <p>
            {connectedEdges.length === 0
              ? "Standalone topic. It can still be useful as a marker."
              : `${connectedEdges.length} connection${
                connectedEdges.length === 1 ? "" : "s"
              } in this conversation.`}
          </p>
        </div>
        {connectedTopics.length > 0 && (
          <div class="topic-node-detail__links">
            {connectedTopics.map((topic: any) => (
              <button
                type="button"
                key={topic.id}
                onClick={() => selectedNodeId.value = topic.id}
              >
                <span>{topic.emoji || "•"}</span>
                <span>{topic.label}</span>
              </button>
            ))}
          </div>
        )}
      </aside>
    );
  }

  function renderEdgeDetail() {
    if (!selectedEdge) return null;
    return (
      <aside class="topic-node-detail topic-edge-detail" aria-live="polite">
        <button
          type="button"
          class="topic-node-detail__close"
          onClick={() => {
            selectedEdgeId.value = null;
          }}
          aria-label="Close relationship details"
        >
          ×
        </button>
        <div class="topic-node-detail__emoji">
          ↔
        </div>
        <div>
          <h4>Relationship</h4>
          <p>
            {(edgeSource || edgeTarget)
              ? `${edgeSource?.emoji || "•"} ${
                edgeSource?.label || "Topic"
              } connects to ${edgeTarget?.emoji || "•"} ${
                edgeTarget?.label || "Topic"
              }.`
              : "This line links two topics the AI saw as connected in the conversation."}
          </p>
        </div>
        <div class="topic-node-detail__links">
          {[edgeSource, edgeTarget].filter(Boolean).map((topic: any) => (
            <button
              type="button"
              key={topic.id}
              onClick={() => {
                selectedNodeId.value = topic.id;
                selectedEdgeId.value = null;
              }}
            >
              <span>{topic.emoji || "•"}</span>
              <span>{topic.label}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <div class="relative flex h-full w-full flex-col">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="topic-map-stats" aria-label="Topic map stats">
          <span>{topics.value.length} topics</span>
          <span>{relationships.value.length} links</span>
        </div>
        <button
          type="button"
          class="topic-map-add-button"
          onClick={() => showAddNode.value = true}
        >
          <span aria-hidden="true">＋</span>
          <span>Add topic</span>
        </button>
      </div>

      <div
        ref={svgContainerRef}
        class="topic-map-canvas mx-auto w-full flex-1 overflow-hidden rounded-lg border border-gray-300 bg-gray-100"
        style="min-height: 400px; height: 100%;"
      />

      {renderNodeDetail()}
      {renderEdgeDetail()}

      {showAddNode.value && (
        <div class="topic-node-modal-backdrop">
          <div class="topic-node-modal" role="dialog" aria-modal="true">
            <div class="topic-node-modal__header">
              <h4>Add topic</h4>
              <button
                type="button"
                onClick={() => showAddNode.value = false}
                aria-label="Close add topic"
              >
                ×
              </button>
            </div>
            <label>
              <span>Emoji</span>
              <input
                value={newNodeEmoji.value}
                onInput={(event) =>
                  newNodeEmoji.value = (event.target as HTMLInputElement).value}
                placeholder="✨"
                maxLength={4}
              />
            </label>
            <label>
              <span>Topic</span>
              <input
                value={newNodeLabel.value}
                onInput={(event) =>
                  newNodeLabel.value = (event.target as HTMLInputElement).value}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addManualNode();
                }}
                placeholder="New thread"
                autoFocus
              />
            </label>
            <div class="topic-node-modal__actions">
              <button
                type="button"
                onClick={() => showAddNode.value = false}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addManualNode}
                disabled={!newNodeLabel.value.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control buttons */}
      <div class="absolute bottom-4 right-4 flex gap-2">
        {/* Layout toggle button */}
        <button
          class="bg-white bg-opacity-70 hover:bg-opacity-100 shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-sm font-bold cursor-pointer"
          onClick={toggleLayout}
          title={layoutMode.value === "organic"
            ? "Switch to readable layout"
            : "Switch to organic layout"}
        >
          {layoutMode.value === "organic" ? "🔀" : "📊"}
        </button>

        {/* PNG Export button */}
        <button
          class="bg-white bg-opacity-70 hover:bg-opacity-100 shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer"
          onClick={exportAsPng}
          title="Export as PNG"
        >
          📸
        </button>

        {/* Reset button */}
        <button
          class="bg-white bg-opacity-70 hover:bg-opacity-100 shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer"
          onClick={resetVisualization}
          title="Reset node positions"
        >
          🔄
        </button>

        {/* Fit to view button */}
        <button
          class="bg-white bg-opacity-70 hover:bg-opacity-100 shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer"
          onClick={fitToView}
          title="Fit all nodes to view"
        >
          📐
        </button>

        {/* Fullscreen button */}
        <button
          class="bg-white bg-opacity-70 hover:bg-opacity-100 shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer"
          onClick={toggleFullscreen}
          title="Toggle fullscreen view"
        >
          ⛶
        </button>
      </div>

      {/* Context menu */}
      <ContextMenu
        visible={contextMenuVisible.value}
        x={contextMenuX.value}
        y={contextMenuY.value}
        items={contextMenuItems}
        onClose={() => contextMenuVisible.value = false}
      />

      {isFullscreen.value && (
        <div class="topic-map-fullscreen" role="dialog" aria-modal="true">
          <div class="topic-map-fullscreen__panel">
            <div class="topic-map-fullscreen__header">
              <div>
                <h3>Topic Map</h3>
                <p>Drag nodes, click topics or lines, scroll to zoom.</p>
              </div>
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Close fullscreen map"
              >
                ×
              </button>
            </div>
            <div
              ref={fullscreenContainerRef}
              class="topic-map-canvas topic-map-fullscreen__canvas"
            />
            <div class="topic-map-fullscreen__controls">
              <button
                type="button"
                onClick={exportAsPng}
                title="Export as PNG"
              >
                📸
              </button>
              <button
                type="button"
                onClick={resetVisualization}
                title="Reset node positions"
              >
                🔄
              </button>
              <button
                type="button"
                onClick={fitToView}
                title="Fit all nodes to view"
              >
                📐
              </button>
            </div>
            {renderNodeDetail()}
            {renderEdgeDetail()}
          </div>
        </div>
      )}
    </div>
  );
}
