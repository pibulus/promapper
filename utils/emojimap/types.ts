/**
 * Emojimap — shared types + default config.
 *
 * The data shapes and configuration for the force-directed topic graph. Kept
 * framework-neutral (no Preact/Fresh) so the physics/render modules can import
 * them without dragging in UI deps.
 */

export interface NodeData {
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
  /** Transient: where the node was grabbed, to tell a real drag from a click. */
  _dragStart?: { x: number; y: number };
  /** Transient: this gesture actually moved, so the sim was reheated. */
  _dragMoved?: boolean;
  /** Transient (on the dragged node): id of the merge target currently frozen
   * in place so it can't be towed away mid-gesture. */
  _mergeTargetId?: string;
}

export interface EdgeData {
  id?: string;
  source: string | NodeData;
  target: string | NodeData;
  sourceTopicId?: string;
  targetTopicId?: string;
  source_topic_id?: string;
  target_topic_id?: string;
  color?: string;
}

export interface Config {
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
  /**
   * Transient, internal: the current sim run was started by a hand-drag, so
   * the settle handler must NOT re-fit the camera (the user placed a node —
   * yanking the viewport right after reads as the whole map reloading).
   * Cleared on every settle and by update()/reset, which do want their fit.
   */
  dragSettling?: boolean;
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
   * Called when a dragged node is released within MERGE_THRESHOLD (drag.ts,
   * 60 SVG units) of another node. The caller should merge sourceId into
   * targetId.
   */
  onMergeNodes?: (sourceId: string, targetId: string) => void;
}

export const defaultConfig: Config = {
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
