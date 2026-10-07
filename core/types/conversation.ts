/**
 * Conversation Types
 */

export interface Conversation {
  id: string;
  title: string; // AI-generated
  audio_url?: string;
  transcript?: string;
  summary?: string;
  source: "audio" | "text";
  created_at: string;
  updated_at: string;
}

export interface ConversationGraph {
  nodes: Array<{
    id: string;
    label: string;
    color: string;
    emoji: string;
  }>;
  edges: Array<{
    source_topic_id: string;
    target_topic_id: string;
    color: string;
    kind?: import("./edge.ts").EdgeKind;
  }>;
}
