/**
 * Force-Directed Graph - D3 Physics-Based Visualization
 *
 * Refactored to use modular forceDirectedEmojimap
 * Shows topics as emoji nodes with physics simulation and draggable interactions
 *
 * Graph gestures:
 *   click         → select node / edge (detail panel: rename/delete/unlink)
 *   double-click  → focus mode (isolate node + neighbors, dim the rest)
 *   right-click   → delete node (window.confirm)
 *   drag-to-node  → merge when released within ~45 SVG units (live preview)
 *   layout toggle → organic (loose physics) vs readable (spread out)
 */

import { useEffect, useRef } from "preact/hooks";
import { useComputed, useSignal } from "@preact/signals";
import {
  canUndo,
  conversationData,
  undoLastMutation,
} from "@signals/conversationStore.ts";
import {
  EmojimapHandle,
  forceDirectedEmojimap,
} from "../utils/forceDirectedEmojimap.ts";
import {
  deleteEdge,
  deleteTopic,
  mergeTopics,
  persistTopicPositions,
  renameTopic,
} from "@signals/actionItemsStore.ts";
import { MAX_LABEL_LENGTH } from "@core/orchestration/conversation-ops.ts";
import { showUndoToast } from "@utils/toast.ts";
import * as htmlToImage from "html-to-image";
import ContextMenu from "../components/ContextMenu.tsx";

interface ForceDirectedGraphProps {
  loading?: boolean;
}

// Default edge color: warm soft-black at high opacity, never grey. Reads as a
// confident dark line on the cream canvas — connections you can actually see.
const EDGE_INK = "rgba(30, 23, 20, 0.8)";

export default function ForceDirectedGraph(
  { loading = false }: ForceDirectedGraphProps,
) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const emojimapHandleRef = useRef<EmojimapHandle | null>(null);

  const isFullscreen = useSignal(false);
  const selectedNodeId = useSignal<string | null>(null);
  const selectedEdgeId = useSignal<string | null>(null);
  // Focus mode: when set, the graph isolates this node + its neighbors.
  const focusedNodeId = useSignal<string | null>(null);
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
      persistTopicPositions(positions);
    }, 400) as unknown as number;
  }

  // Get topics and edges from store.
  //
  // CLONE the nodes before they ever reach D3. D3's force sim writes x/y/vx/vy/
  // fx/fy directly onto the objects it's given — if those were the store's own
  // node objects, that transient physics state would leak into autosave, share
  // payloads, and live-sync (a node could even be saved permanently pinned via
  // a stray fx/fy). Cloning keeps the store pristine. We seed x/y from any saved
  // `position` so a reload (or any later update) restores the hand-laid layout
  // instead of re-scattering from center.
  const topics = useComputed(() =>
    (conversationData.value?.nodes || []).map((n) => ({
      ...n,
      x: n.position?.x,
      y: n.position?.y,
    }))
  );
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

    // Map edges to correct format. Default to a warm dark ink (never grey —
    // Pablo's call), so connections read as confident lines, not washed-out
    // cobwebs. A specific edge can still override via rel.color.
    const edges = relationships.value.map((rel, index) => ({
      id: getRelationshipId(rel, index),
      source: rel.source_topic_id,
      target: rel.target_topic_id,
      color: rel.color || EDGE_INK,
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
        // Thinner + darker than before (was 3.5/grey). A slim warm-dark line.
        linkStrokeWidth: 2.5,
        linkOpacity: 0.7,
        onClickNode: (_event: MouseEvent, node: { id: string }) => {
          selectedNodeId.value = node.id;
          selectedEdgeId.value = null;
        },
        onDoubleClickNode: (_event: MouseEvent, node: { id: string }) => {
          // Focus mode: dbl-click isolates this node + neighbors; dbl-click the
          // already-focused node to zoom back out.
          focusedNodeId.value = focusedNodeId.value === node.id
            ? null
            : node.id;
        },
        onRightClickNode: (event: MouseEvent, node: { id: string }) => {
          event.preventDefault();
          confirmDeleteTopic(node.id);
        },
        onClickEdge: (_event: MouseEvent, edge: { id?: string }) => {
          selectedEdgeId.value = edge.id || null;
          selectedNodeId.value = null;
        },
        onBackgroundClick: () => {
          selectedNodeId.value = null;
          selectedEdgeId.value = null;
          // Clicking empty space also exits focus mode.
          focusedNodeId.value = null;
        },
        onRightClickBackground: (event: MouseEvent) => {
          event.preventDefault();
          contextMenuX.value = event.clientX;
          contextMenuY.value = event.clientY;
          contextMenuVisible.value = true;
        },
        onMergeNodes: (sourceId: string, targetId: string) => {
          // Grab labels before the merge removes the source node.
          const nodes = conversationData.value?.nodes ?? [];
          const sourceLabel = nodes.find((n) => n.id === sourceId)?.label ??
            "topic";
          const targetLabel = nodes.find((n) => n.id === targetId)?.label ??
            "topic";
          mergeTopics(sourceId, targetId);
          // Select the surviving topic so its detail panel (with Rename) is
          // right there — merge = "these are the same thing," and the kept
          // label often wants a quick tidy-up after folding two into one.
          selectedNodeId.value = targetId;
          selectedEdgeId.value = null;
          if (canUndo()) {
            showUndoToast(
              `Merged "${sourceLabel}" into "${targetLabel}"`,
              undoLastMutation,
            );
          }
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
    const label = newNodeLabel.value.trim().slice(0, MAX_LABEL_LENGTH);
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

  // Shared rename/delete so the gesture shortcuts (dbl-click / right-click) and
  // the detail-panel buttons run the exact same path.
  function promptRenameTopic(id: string) {
    const current = conversationData.value?.nodes.find((n) => n.id === id);
    const newLabel = window.prompt("Rename topic:", current?.label ?? id);
    if (newLabel && newLabel.trim()) renameTopic(id, newLabel);
  }

  function confirmDeleteTopic(id: string) {
    const current = conversationData.value?.nodes.find((n) => n.id === id);
    const label = current?.label ?? id;
    if (!window.confirm(`Delete topic "${label}"?`)) return;
    deleteTopic(id);
    if (selectedNodeId.value === id) selectedNodeId.value = null;
    if (canUndo()) showUndoToast(`Deleted "${label}"`, undoLastMutation);
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
        color: rel.color || EDGE_INK,
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
  ]);

  // Selection is a CHEAP highlight repaint — never a physics restart. Keeping it
  // out of the update() effect above means a plain tap-to-select no longer
  // reheats and reshuffles the whole graph (the most common gesture).
  useEffect(() => {
    emojimapHandleRef.current?.setSelection({
      selectedNodeId: selectedNodeId.value,
      selectedEdgeId: selectedEdgeId.value,
    });
  }, [selectedNodeId.value, selectedEdgeId.value]);

  // Focus mode: dim the rest + zoom to the focused node's neighborhood (or zoom
  // back out when cleared). Escape exits, like a lightweight "back".
  useEffect(() => {
    emojimapHandleRef.current?.setFocus(focusedNodeId.value);
    if (!focusedNodeId.value) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") focusedNodeId.value = null;
    };
    globalThis.addEventListener("keydown", onEsc);
    return () => globalThis.removeEventListener("keydown", onEsc);
  }, [focusedNodeId.value]);

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
        <div class="empty-state-icon">🌱</div>
        <div class="empty-state-text">
          Nothing on the map yet — say or paste a few thoughts and the topics
          start showing up here.
        </div>
      </div>
    );
  }

  // Context menu items
  const contextMenuItems = [
    {
      label: "Reset Positions",
      icon: "fa-arrows-rotate",
      onClick: resetVisualization,
    },
    {
      label: "Fit to View",
      icon: "fa-expand",
      onClick: fitToView,
    },
    {
      label: "Export as PNG",
      icon: "fa-camera",
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
              ? "Flying solo for now — it'll link up as the conversation grows."
              : `Connected to ${connectedEdges.length} other topic${
                connectedEdges.length === 1 ? "" : "s"
              } so far.`}
          </p>
        </div>
        <div class="topic-node-detail__actions">
          <button
            type="button"
            class="topic-node-action"
            onClick={() => promptRenameTopic(selectedNode.id)}
          >
            <i class="fa fa-pen" aria-hidden="true"></i>
            <span>Rename</span>
          </button>
          <button
            type="button"
            class="topic-node-action topic-node-action--recede"
            onClick={() => confirmDeleteTopic(selectedNode.id)}
          >
            <i class="fa fa-trash-can" aria-hidden="true"></i>
            <span>Delete</span>
          </button>
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
        {edgeSource && edgeTarget && (
          <div class="topic-node-detail__actions">
            <button
              type="button"
              class="topic-node-action topic-node-action--recede"
              onClick={() => {
                const srcLabel = edgeSource.label || "topic";
                const tgtLabel = edgeTarget.label || "topic";
                deleteEdge(edgeSource.id, edgeTarget.id);
                selectedEdgeId.value = null;
                if (canUndo()) {
                  showUndoToast(
                    `Unlinked "${srcLabel}" and "${tgtLabel}"`,
                    undoLastMutation,
                  );
                }
              }}
            >
              <i class="fa fa-link-slash" aria-hidden="true"></i>
              <span>Remove connection</span>
            </button>
          </div>
        )}
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
                // 16 not 4 — maxLength counts UTF-16 units, and a single ZWJ
                // emoji (👨‍👩‍👧‍👦, flags) is up to ~11 units. 4 truncated them into
                // mojibake. The renderer keeps just the first glyph anyway.
                maxLength={16}
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
                maxLength={MAX_LABEL_LENGTH}
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

      {/* Control buttons — FontAwesome (no emoji in chrome), chunky on-brand */}
      <div class="topic-map-ctrls">
        <button
          type="button"
          class="topic-map-ctrl"
          onClick={toggleLayout}
          title={layoutMode.value === "organic"
            ? "Switch to readable layout"
            : "Switch to organic layout"}
          aria-label="Toggle layout"
        >
          <i
            class={layoutMode.value === "organic"
              ? "fa fa-shuffle"
              : "fa fa-bars-staggered"}
            aria-hidden="true"
          >
          </i>
        </button>

        <button
          type="button"
          class="topic-map-ctrl"
          onClick={exportAsPng}
          title="Export as PNG"
          aria-label="Export as PNG"
        >
          <i class="fa fa-camera" aria-hidden="true"></i>
        </button>

        <button
          type="button"
          class="topic-map-ctrl"
          onClick={resetVisualization}
          title="Reset node positions"
          aria-label="Reset node positions"
        >
          <i class="fa fa-arrows-rotate" aria-hidden="true"></i>
        </button>

        <button
          type="button"
          class="topic-map-ctrl"
          onClick={fitToView}
          title="Fit all nodes to view"
          aria-label="Fit all nodes to view"
        >
          <i class="fa fa-expand" aria-hidden="true"></i>
        </button>

        <button
          type="button"
          class="topic-map-ctrl"
          onClick={toggleFullscreen}
          title="Toggle fullscreen view"
          aria-label="Toggle fullscreen view"
        >
          <i
            class="fa fa-up-right-and-down-left-from-center"
            aria-hidden="true"
          >
          </i>
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
                aria-label="Export as PNG"
              >
                <i class="fa fa-camera" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                onClick={resetVisualization}
                title="Reset node positions"
                aria-label="Reset node positions"
              >
                <i class="fa fa-arrows-rotate" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                onClick={fitToView}
                title="Fit all nodes to view"
                aria-label="Fit all nodes to view"
              >
                <i class="fa fa-expand" aria-hidden="true"></i>
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
