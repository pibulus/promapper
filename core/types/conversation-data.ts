/**
 * Full conversation payload shared between storage, sharing, and UI state.
 *
 * This type intentionally stays framework-neutral. Runtime Preact signals live
 * in signals/conversationStore.ts; core code should import this file instead.
 */

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
  }>;
  edges: Array<{
    id?: string;
    source_topic_id: string;
    target_topic_id: string;
    color: string;
  }>;
  actionItems: Array<{
    id: string;
    conversation_id: string;
    description: string;
    assignee: string | null;
    due_date: string | null;
    status: "pending" | "completed";
    created_at: string;
    updated_at: string;
  }>;
  statusUpdates: unknown[];
  summary?: string;
}
