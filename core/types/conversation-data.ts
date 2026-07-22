/**
 * Full conversation payload shared between storage, sharing, and UI state.
 *
 * This type intentionally stays framework-neutral. Runtime Preact signals live
 * in signals/conversationStore.ts; core code should import this file instead.
 */

import type { ActionItem, ActionItemStatusUpdate } from "./action-item.ts";

export interface ConversationData {
  conversation: {
    id: string;
    title?: string;
    source: string;
    transcript: string;
    created_at?: string;
  };
  transcript: {
    text: string;
    speakers: string[];
  };
  nodes: Array<{
    id: string;
    label: string;
    emoji: string;
    color: string;
    position?: { x: number; y: number };
    /** Labels this topic absorbed via merge — the map's synonym memory.
     * Appends route these names back to this node instead of resurrecting
     * the merged-away topic. */
    aliases?: string[];
  }>;
  edges: Array<{
    id?: string;
    source_topic_id: string;
    target_topic_id: string;
    color: string;
  }>;
  actionItems: ActionItem[];
  statusUpdates: ActionItemStatusUpdate[];
  summary?: string;
  /** Transient: non-empty when an AI step degraded — shown once, not persisted. */
  warnings?: string[];
  /** The Excalidraw scene (serialised JSON). Survives browser restarts. */
  whiteboardScene?: string;
  /** Human scratch space (Notes module). Rides saves, shares, and backups. */
  notes?: string;
}
