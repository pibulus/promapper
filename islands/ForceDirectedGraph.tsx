/**
 * Force-Directed Graph - D3 Physics-Based Visualization
 *
 * Refactored to use modular forceDirectedEmojimap
 * Shows topics as emoji nodes with physics simulation and draggable interactions
 *
 * Graph gestures:
 *   click         → select node / edge (inspector: focus / inline rename / remove / unlink)
 *   double-click  → focus mode (isolate node + neighbors, dim the rest)
 *   right-click   → contextual menu (node actions on a node, canvas actions on empty space)
 *   drag-to-node  → merge when released within MERGE_THRESHOLD (live preview)
 *   layout toggle → organic (loose physics) vs readable (spread out)
 */

import { useEffect, useRef } from "preact/hooks";
import { useComputed, useSignal } from "@preact/signals";
import {
  canUndo,
  conversationData,
  isViewingShared,
  undoLastMutation,
} from "@signals/conversationStore.ts";
import {
  EmojimapHandle,
  forceDirectedEmojimap,
} from "../utils/forceDirectedEmojimap.ts";
import {
  addTopic,
  deleteEdge,
  deleteTopic,
  mergeTopics,
  persistTopicPositions,
  renameTopic,
} from "@signals/actionItemsStore.ts";
import { MAX_LABEL_LENGTH } from "@core/orchestration/conversation-ops.ts";
import { edgePhrase } from "@core/types/edge.ts";
import { showToast, showUndoToast } from "@utils/toast.ts";
import * as htmlToImage from "html-to-image";
import BodyPortal from "../components/BodyPortal.tsx";
import ContextMenu from "../components/ContextMenu.tsx";
import Modal from "../components/Modal.tsx";

interface ForceDirectedGraphProps {
  loading?: boolean;
}

// Default edge color: warm sepia-black (--ink-carbon), never grey or pure #000.
const EDGE_INK = "#1e1714";

export default function ForceDirectedGraph(
  { loading = false }: ForceDirectedGraphProps,
) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const positionDebounceTimerRef = useRef<number | undefined>(undefined);
  const emojimapHandleRef = useRef<EmojimapHandle | null>(null);

  const isFullscreen = useSignal(false);
  const selectedNodeId = useSignal<string | null>(null);
  const selectedEdgeId = useSignal<string | null>(null);
  // Focus mode: when set, the graph isolates this node + its neighbors.
  const focusedNodeId = useSignal<string | null>(null);
  const showAddNode = useSignal(false);
  const newNodeLabel = useSignal("");
  const newNodeEmoji = useSignal("");

  // Context menu state (contextual: node actions when right-clicking a node,
  // canvas actions when right-clicking the paper plane)
  const contextMenuVisible = useSignal(false);
  const contextMenuX = useSignal(0);
  const contextMenuY = useSignal(0);
  const contextMenuNodeId = useSignal<string | null>(null);

  // Inline rename state inside the node inspector card (no modal jump)
  const isRenamingInline = useSignal(false);
  const inlineRenameValue = useSignal("");

  // Simulation parameters
  const linkDistance = useSignal(105);
  const chargeStrength = useSignal(-880);
  const collisionRadius = useSignal(72);

  // Layout toggle: "organic" = cozy physics defaults, "readable" = spread out
  const layoutMode = useSignal<"organic" | "readable">("organic");

  // ===================================================================
  // FORCE LAYOUT PRESETS
  // ===================================================================

  const LAYOUT_PRESETS = {
    organic: { linkDistance: 105, chargeStrength: -880, collisionRadius: 72 },
    readable: { linkDistance: 180, chargeStrength: -1800, collisionRadius: 92 },
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
  function handlePositionsChange(
    positions: Record<string, { x: number; y: number }>,
  ) {
    clearTimeout(positionDebounceTimerRef.current);
    positionDebounceTimerRef.current = setTimeout(() => {
      persistTopicPositions(positions);
    }, 400) as unknown as number;
  }

  // CLONE the nodes before they ever reach D3 so transient physics fields
  // (x/y/vx/vy/fx/fy) never leak into autosave or live-sync payloads.
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
  // FULLSCREEN & HEADER ACTION BRIDGE
  // ===================================================================

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
  }

  useEffect(() => {
    const onExport = () => {
      exportAsPng();
    };
    const onFullscreen = () => {
      toggleFullscreen();
    };
    globalThis.addEventListener("promapper:map-export-png", onExport);
    globalThis.addEventListener("promapper:map-fullscreen", onFullscreen);
    return () => {
      globalThis.removeEventListener("promapper:map-export-png", onExport);
      globalThis.removeEventListener("promapper:map-fullscreen", onFullscreen);
    };
  }, []);

  // ===================================================================
  // VISUALIZATION MANAGEMENT
  // ===================================================================

  function initializeVisualization() {
    const container = isFullscreen.value
      ? fullscreenContainerRef.current
      : svgContainerRef.current;
    if (!container || topics.value.length === 0) return;

    let seedPositions: Record<string, { x: number; y: number }> | undefined;
    if (emojimapHandleRef.current) {
      seedPositions = emojimapHandleRef.current.getPositions();
      emojimapHandleRef.current.destroy();
    }

    const rect = container.getBoundingClientRect();
    const width = rect.width || container.offsetWidth ||
      Math.min(900, window.innerWidth - 32);
    const height = rect.height || container.offsetHeight ||
      Math.min(800, window.innerHeight * 0.6);

    const edges = relationships.value.map((rel, index) => ({
      id: getRelationshipId(rel, index),
      source: rel.source_topic_id,
      target: rel.target_topic_id,
      color: EDGE_INK,
    }));

    lastGraphSigRef.current = computeGraphSig();

    emojimapHandleRef.current = forceDirectedEmojimap(container, {
      nodes: topics.value,
      edges,
      seedPositions,
      config: {
        width,
        height,
        backgroundColor: "transparent",
        linkDistance: linkDistance.value,
        chargeStrength: chargeStrength.value,
        collisionRadius: collisionRadius.value,
        linkStrokeWidth: 2.5,
        linkOpacity: 1,
        onClickNode: (_event: MouseEvent, node: { id: string }) => {
          selectedNodeId.value = node.id;
          selectedEdgeId.value = null;
        },
        onDoubleClickNode: (_event: MouseEvent, node: { id: string }) => {
          focusedNodeId.value = focusedNodeId.value === node.id
            ? null
            : node.id;
        },
        onRightClickNode: (event: MouseEvent, node: { id: string }) => {
          event.preventDefault();
          selectedNodeId.value = node.id;
          selectedEdgeId.value = null;
          contextMenuNodeId.value = node.id;
          contextMenuX.value = event.clientX;
          contextMenuY.value = event.clientY;
          contextMenuVisible.value = true;
        },
        onClickEdge: (_event: MouseEvent, edge: { id?: string }) => {
          selectedEdgeId.value = edge.id || null;
          selectedNodeId.value = null;
        },
        onBackgroundClick: () => {
          selectedNodeId.value = null;
          selectedEdgeId.value = null;
          focusedNodeId.value = null;
        },
        onRightClickBackground: (event: MouseEvent) => {
          event.preventDefault();
          contextMenuNodeId.value = null;
          contextMenuX.value = event.clientX;
          contextMenuY.value = event.clientY;
          contextMenuVisible.value = true;
        },
        onMergeNodes: (sourceId: string, targetId: string) => {
          if (isViewingShared.value) return;
          const nodes = conversationData.value?.nodes ?? [];
          const sourceLabel = nodes.find((n) => n.id === sourceId)?.label ??
            "topic";
          const targetLabel = nodes.find((n) => n.id === targetId)?.label ??
            "topic";
          mergeTopics(sourceId, targetId);
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

    let header: HTMLDivElement | null = null;
    let buttons: NodeListOf<HTMLButtonElement> | null = null;
    try {
      header = document.createElement("div");
      header.style.position = "absolute";
      header.style.top = "20px";
      header.style.left = "20px";
      header.style.backgroundColor = "rgba(255, 254, 247, 0.94)";
      header.style.padding = "8px 18px";
      header.style.borderRadius = "12px";
      header.style.border = "2px solid rgba(30, 23, 20, 0.85)";
      header.style.fontSize = "17px";
      header.style.fontWeight = "700";
      header.style.color = "#1e1714";
      header.style.boxShadow = "3px 3px 0 rgba(30, 23, 20, 0.85)";

      const title = conversationData.value?.conversation.title ||
        "Conversation Map";
      const timestamp = new Date().toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      const titleEl = document.createElement("div");
      titleEl.textContent = title;
      const stampEl = document.createElement("div");
      stampEl.style.cssText =
        "font-size:12px;font-weight:500;color:#62564e;margin-top:2px;";
      stampEl.textContent = timestamp;
      header.append(titleEl, stampEl);
      container.appendChild(header);

      buttons = container.querySelectorAll("button");
      buttons.forEach((btn) => (btn.style.display = "none"));

      const dataUrl = await htmlToImage.toPng(container, {
        backgroundColor: "#fffef7",
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      const filename = `${title.replace(/\s+/g, "_")}_${
        timestamp.replace(/[\s,:]+/g, "_")
      }.png`;
      link.download = filename;
      link.click();
    } catch (error) {
      console.error("Error exporting as PNG:", error);
      showToast("Failed to save PNG. Try again in a moment.", "error");
    } finally {
      buttons?.forEach((btn) => (btn.style.display = ""));
      if (header?.parentNode === container) container.removeChild(header);
    }
  }

  function addManualNode() {
    const id = addTopic({
      label: newNodeLabel.value,
      emoji: newNodeEmoji.value,
    });
    if (!id) return;
    selectedNodeId.value = id;
    newNodeLabel.value = "";
    newNodeEmoji.value = "";
    showAddNode.value = false;
  }

  function startInlineRename(id: string) {
    if (isViewingShared.value) return;
    const current = conversationData.value?.nodes.find((n) => n.id === id);
    if (!current) return;
    selectedNodeId.value = id;
    selectedEdgeId.value = null;
    inlineRenameValue.value = current.label ?? "";
    isRenamingInline.value = true;
  }

  function commitInlineRename() {
    const id = selectedNodeId.value;
    if (!id) {
      isRenamingInline.value = false;
      return;
    }
    const val = inlineRenameValue.value.trim();
    const current = conversationData.value?.nodes.find((n) => n.id === id);
    if (val && val !== current?.label) {
      renameTopic(id, val);
    }
    isRenamingInline.value = false;
  }

  function removeTopicWithUndo(id: string) {
    if (isViewingShared.value) return;
    const current = conversationData.value?.nodes.find((n) => n.id === id);
    const label = current?.label ?? "topic";
    deleteTopic(id);
    if (selectedNodeId.value === id) selectedNodeId.value = null;
    if (focusedNodeId.value === id) focusedNodeId.value = null;
    isRenamingInline.value = false;
    if (canUndo()) {
      showUndoToast(
        `Removed "${label}"`,
        undoLastMutation,
      );
    }
  }

  // ===================================================================
  // LIFECYCLE
  // ===================================================================

  useEffect(() => {
    return () => {
      clearTimeout(positionDebounceTimerRef.current);
      if (emojimapHandleRef.current) {
        emojimapHandleRef.current.destroy();
      }
    };
  }, []);

  function computeGraphSig(): string {
    return JSON.stringify([
      topics.value.map((t) => [t.id, t.label, t.emoji, t.color]),
      relationships.value.map((r) => [
        r.id,
        r.source_topic_id,
        r.target_topic_id,
      ]),
      linkDistance.value,
      chargeStrength.value,
      collisionRadius.value,
    ]);
  }
  const lastGraphSigRef = useRef<string>("");

  useEffect(() => {
    if (topics.value.length > 0 && emojimapHandleRef.current) {
      const sig = computeGraphSig();
      if (sig === lastGraphSigRef.current) return;
      lastGraphSigRef.current = sig;

      const edges = relationships.value.map((rel, index) => ({
        id: getRelationshipId(rel, index),
        source: rel.source_topic_id,
        target: rel.target_topic_id,
        color: EDGE_INK,
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

  // Selection is a CHEAP highlight repaint — never a physics restart.
  useEffect(() => {
    isRenamingInline.value = false;
    emojimapHandleRef.current?.setSelection({
      selectedNodeId: selectedNodeId.value,
      selectedEdgeId: selectedEdgeId.value,
    });
  }, [selectedNodeId.value, selectedEdgeId.value]);

  // Focus mode: dim the rest + zoom to the focused node's neighborhood.
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
    const NODES = [
      { cx: 26, cy: 62, r: 7 },
      { cx: 50, cy: 30, r: 9 },
      { cx: 74, cy: 58, r: 6 },
      { cx: 40, cy: 88, r: 5 },
      { cx: 88, cy: 88, r: 6 },
    ];
    const EDGES = [[0, 1], [1, 2], [0, 3], [2, 4]];

    return (
      <div
        class="flex h-full items-center justify-center"
        aria-hidden="true"
        style="opacity: 0.6;"
      >
        <svg
          class="board-skeleton__constellation"
          viewBox="0 0 114 114"
          preserveAspectRatio="xMidYMid meet"
        >
          {EDGES.map(([a, b], i) => (
            <line
              key={`e${i}`}
              x1={NODES[a].cx}
              y1={NODES[a].cy}
              x2={NODES[b].cx}
              y2={NODES[b].cy}
              class="board-skeleton__edge"
              style={`--i:${i}`}
            />
          ))}
          {NODES.map((n, i) => (
            <circle
              key={`n${i}`}
              cx={n.cx}
              cy={n.cy}
              r={n.r}
              class="board-skeleton__node"
              style={`--i:${i}`}
            />
          ))}
        </svg>
      </div>
    );
  }

  if (topics.value.length === 0) {
    return (
      <div class="empty-state" style="min-height: 400px;">
        <div class="empty-state-icon">🌱</div>
        <div class="empty-state-text">
          No topics mapped yet. Add or record a few thoughts to grow the map.
        </div>
      </div>
    );
  }

  // Contextual right-click menu items (node-specific vs canvas-level)
  const ctxNodeId = contextMenuNodeId.value;
  const contextMenuItems = ctxNodeId
    ? [
      {
        label: focusedNodeId.value === ctxNodeId
          ? "Show all topics"
          : "Focus neighborhood",
        icon: "fa-compass",
        onClick: () => {
          focusedNodeId.value = focusedNodeId.value === ctxNodeId
            ? null
            : ctxNodeId;
        },
      },
      ...(!isViewingShared.value
        ? [
          {
            label: "Rename topic",
            icon: "fa-pen",
            onClick: () => startInlineRename(ctxNodeId),
          },
          {
            label: "Remove topic",
            icon: "fa-trash-can",
            onClick: () => removeTopicWithUndo(ctxNodeId),
          },
        ]
        : []),
    ]
    : [
      ...(!isViewingShared.value
        ? [
          {
            label: "Add topic",
            icon: "fa-plus",
            onClick: () => {
              showAddNode.value = true;
            },
          },
        ]
        : []),
      {
        label: "Fit map in view",
        icon: "fa-expand",
        onClick: fitToView,
      },
      {
        label: "Re-tidy layout",
        icon: "fa-wand-magic-sparkles",
        onClick: resetVisualization,
      },
      {
        label: "Save map as PNG",
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
    const isFocused = focusedNodeId.value === selectedNode.id;

    return (
      <aside class="topic-node-detail" aria-live="polite">
        <button
          type="button"
          class="topic-node-detail__close"
          onClick={() => {
            selectedNodeId.value = null;
            isRenamingInline.value = false;
          }}
          aria-label="Close topic details"
        >
          <i class="fa fa-xmark" aria-hidden="true"></i>
        </button>
        <div class="topic-node-detail__emoji">
          {selectedNode.emoji || "✨"}
        </div>
        <div class="min-w-0">
          {isRenamingInline.value && !isViewingShared.value
            ? (
              <div class="topic-node-rename-row">
                <input
                  type="text"
                  class="topic-node-rename-input"
                  value={inlineRenameValue.value}
                  onInput={(e) =>
                    inlineRenameValue.value =
                      (e.target as HTMLInputElement).value}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitInlineRename();
                    if (e.key === "Escape") isRenamingInline.value = false;
                  }}
                  maxLength={MAX_LABEL_LENGTH}
                  aria-label="Topic name"
                  autoFocus
                />
                <div class="topic-node-rename-btns">
                  <button
                    type="button"
                    class="topic-node-rename-btn is-save"
                    onClick={commitInlineRename}
                    disabled={!inlineRenameValue.value.trim()}
                    aria-label="Save topic name"
                  >
                    <i class="fa fa-check" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="topic-node-rename-btn"
                    onClick={() => {
                      isRenamingInline.value = false;
                    }}
                    aria-label="Cancel rename"
                  >
                    <i class="fa fa-xmark" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            )
            : (
              <h4
                class={!isViewingShared.value ? "is-editable" : ""}
                onClick={() => {
                  if (!isViewingShared.value) {
                    startInlineRename(selectedNode.id);
                  }
                }}
                title={!isViewingShared.value ? "Click to rename" : undefined}
              >
                {selectedNode.label}
              </h4>
            )}
          <p>
            {connectedEdges.length === 0
              ? "Standalone thread so far."
              : `Linked to ${connectedEdges.length} ${
                connectedEdges.length === 1 ? "topic" : "topics"
              }.`}
          </p>
          {!!selectedNode.aliases?.length && (
            <p class="topic-node-detail__aliases">
              Merged: {selectedNode.aliases.join(", ")}
            </p>
          )}
        </div>
        <div class="topic-node-detail__actions">
          <button
            type="button"
            class={`topic-node-action ${isFocused ? "is-active" : ""}`}
            onClick={() => {
              focusedNodeId.value = isFocused ? null : selectedNode.id;
            }}
          >
            <i class="fa fa-compass" aria-hidden="true"></i>
            <span>{isFocused ? "Unfocus" : "Focus"}</span>
          </button>
          {!isViewingShared.value && (
            <>
              <button
                type="button"
                class="topic-node-action"
                onClick={() => startInlineRename(selectedNode.id)}
              >
                <i class="fa fa-pen" aria-hidden="true"></i>
                <span>Rename</span>
              </button>
              <button
                type="button"
                class="topic-node-action topic-node-action--recede"
                onClick={() => removeTopicWithUndo(selectedNode.id)}
              >
                <i class="fa fa-trash-can" aria-hidden="true"></i>
                <span>Remove</span>
              </button>
            </>
          )}
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
          <i class="fa fa-xmark" aria-hidden="true"></i>
        </button>
        <div class="topic-node-detail__emoji">
          ↔
        </div>
        <div class="min-w-0">
          <h4>Connection</h4>
          <p>
            {(edgeSource || edgeTarget)
              ? `${edgeSource?.emoji || "•"} ${edgeSource?.label || "Topic"} ${
                edgePhrase(selectedEdge.kind)
              } ${edgeTarget?.emoji || "•"} ${edgeTarget?.label || "Topic"}.`
              : "Links two related topics from the conversation."}
          </p>
        </div>
        {edgeSource && edgeTarget && !isViewingShared.value && (
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
              <span>Unlink topics</span>
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

  // Spatial canvas dock — Save PNG & Fullscreen live cleanly in the card header
  // (and fullscreen header), leaving only direct spatial actions on the canvas.
  function renderControls() {
    return (
      <div class="topic-map-ctrls">
        {!isViewingShared.value && (
          <button
            type="button"
            class="topic-map-ctrl topic-map-ctrl--add"
            onClick={() => showAddNode.value = true}
            aria-label="Add topic"
          >
            <i class="fa fa-plus" aria-hidden="true"></i>
            <span class="hidden sm:inline">Topic</span>
          </button>
        )}

        {focusedNodeId.value && (
          <button
            type="button"
            class="topic-map-ctrl topic-map-ctrl--active"
            onClick={() => {
              focusedNodeId.value = null;
            }}
            aria-label="Show all topics"
          >
            <i class="fa fa-compress" aria-hidden="true"></i>
            <span>All topics</span>
          </button>
        )}

        <button
          type="button"
          class="topic-map-ctrl tooltip-btn"
          data-tip={layoutMode.value === "organic"
            ? "Spread topics apart"
            : "Cluster topics closer"}
          onClick={toggleLayout}
          aria-label="Toggle layout density"
        >
          <i
            class={layoutMode.value === "organic"
              ? "fa fa-share-nodes"
              : "fa fa-diagram-project"}
            aria-hidden="true"
          >
          </i>
        </button>

        <button
          type="button"
          class="topic-map-ctrl tooltip-btn"
          data-tip="Fit map in view"
          onClick={fitToView}
          aria-label="Fit map in view"
        >
          <i class="fa fa-expand" aria-hidden="true"></i>
        </button>

        <button
          type="button"
          class="topic-map-ctrl tooltip-btn"
          data-tip="Re-tidy layout"
          onClick={resetVisualization}
          aria-label="Re-tidy layout"
        >
          <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
        </button>
      </div>
    );
  }

  return (
    <div class="relative flex h-full w-full flex-col">
      <div
        ref={svgContainerRef}
        class="topic-map-canvas topic-map-canvas--bleed w-full overflow-hidden"
        style="height: 100%; min-height: 440px;"
      />

      {renderNodeDetail()}
      {renderEdgeDetail()}

      {showAddNode.value && (
        <Modal
          open
          onClose={() => showAddNode.value = false}
          titleId="add-topic-modal-title"
          panelClass="max-w-sm"
        >
          <div class="modal-stack">
            <h3
              id="add-topic-modal-title"
              style={{
                margin: 0,
                fontSize: "var(--heading-size)",
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              Add topic
            </h3>
            <div class="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={newNodeEmoji.value}
                onInput={(event) =>
                  newNodeEmoji.value = (event.target as HTMLInputElement).value}
                placeholder="✨"
                maxLength={16}
                aria-label="Topic emoji"
                class="w-12 h-11 text-center text-xl shrink-0 border-2 border-[var(--border-strong)] rounded-lg bg-[var(--surface-item)] shadow-[2px_2px_0px_var(--border-strong)]"
              />
              <input
                type="text"
                value={newNodeLabel.value}
                onInput={(event) =>
                  newNodeLabel.value = (event.target as HTMLInputElement).value}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addManualNode();
                }}
                placeholder="New topic thread…"
                maxLength={MAX_LABEL_LENGTH}
                autoFocus
                aria-label="Topic name"
                class="flex-1 min-w-0 h-11 px-3 border-2 border-[var(--border-strong)] rounded-lg bg-[var(--surface-item)] shadow-[2px_2px_0px_var(--border-strong)] text-sm font-medium"
              />
            </div>
            <div class="modal-actions mt-3">
              <button
                type="button"
                class="btn btn--secondary"
                style={{ flex: 1 }}
                onClick={() => showAddNode.value = false}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn--primary"
                style={{ flex: 1 }}
                onClick={addManualNode}
                disabled={!newNodeLabel.value.trim()}
              >
                Add topic
              </button>
            </div>
          </div>
        </Modal>
      )}

      {renderControls()}

      <ContextMenu
        visible={contextMenuVisible.value}
        x={contextMenuX.value}
        y={contextMenuY.value}
        items={contextMenuItems}
        onClose={() => contextMenuVisible.value = false}
      />

      {isFullscreen.value && (
        <BodyPortal>
          <div class="topic-map-fullscreen" role="dialog" aria-modal="true">
            <div class="topic-map-fullscreen__panel">
              <div class="topic-map-fullscreen__header">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="card-header-icon" aria-hidden="true">
                    <i class="fa fa-diagram-project"></i>
                  </span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <h3>Topic Map</h3>
                      <span class="card-header-count">
                        {topics.value.length}{" "}
                        {topics.value.length === 1 ? "topic" : "topics"}
                      </span>
                    </div>
                    <p>
                      Drag topics to arrange or drop onto another to merge.
                      Double-click to focus.
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="card-pill-btn"
                    onClick={exportAsPng}
                    aria-label="Save map as PNG"
                  >
                    <i class="fa fa-camera" aria-hidden="true"></i>
                    <span class="hidden sm:inline">Save PNG</span>
                  </button>
                  <button
                    type="button"
                    class="card-icon-btn"
                    onClick={toggleFullscreen}
                    aria-label="Close fullscreen map"
                  >
                    <i class="fa fa-xmark" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div
                ref={fullscreenContainerRef}
                class="topic-map-canvas topic-map-fullscreen__canvas"
              />
              {renderControls()}
              {renderNodeDetail()}
              {renderEdgeDetail()}
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
