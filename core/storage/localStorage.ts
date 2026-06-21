/**
 * LocalStorage Service - Browser Persistence
 *
 * Stores conversations and action items in browser localStorage
 * No backend needed, works offline
 */

import type { ConversationData } from "../types/conversation-data.ts";

// Storage keys
const CONVERSATIONS_KEY = "project_mapper_conversations";
const ACTIVE_ID_KEY = "project_mapper_active_id";
const LEGACY_CONVERSATIONS_KEY = "conversation_mapper_conversations";
const LEGACY_ACTIVE_ID_KEY = "conversation_mapper_active_id";

// ===================================================================
// TYPES
// ===================================================================

export interface StoredConversation extends ConversationData {
  id: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
}

// ===================================================================
// CORE OPERATIONS
// ===================================================================

/**
 * Save a conversation to localStorage
 */
export function saveConversation(data: ConversationData): void {
  if (typeof window === "undefined") return;

  const conversations = getAllConversations();
  const conversationId = data.conversation.id;

  const stored: StoredConversation = {
    ...data,
    id: conversationId,
    createdAt: conversations[conversationId]?.createdAt ||
      new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Preserve the star across auto-saves (data is ConversationData, no flag).
    starred: conversations[conversationId]?.starred ?? false,
  };

  conversations[conversationId] = stored;

  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  localStorage.setItem(ACTIVE_ID_KEY, conversationId);
}

/**
 * Star / unstar a conversation. Returns the new starred state.
 */
export function setConversationStarred(id: string, starred: boolean): void {
  if (typeof window === "undefined") return;
  const conversations = getAllConversations();
  const conv = conversations[id];
  if (!conv) return;
  conv.starred = starred;
  conversations[id] = conv;
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

/**
 * Toggle a conversation's starred flag. Returns the resulting state.
 */
export function toggleConversationStarred(id: string): boolean {
  if (typeof window === "undefined") return false;
  const conversations = getAllConversations();
  const conv = conversations[id];
  if (!conv) return false;
  conv.starred = !conv.starred;
  conversations[id] = conv;
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  return conv.starred;
}

/**
 * Replace the entire conversations map (used by backup import).
 */
export function replaceAllConversations(
  conversations: Record<string, StoredConversation>,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

/**
 * Load a specific conversation by ID
 */
export function loadConversation(id: string): StoredConversation | null {
  if (typeof window === "undefined") return null;

  const conversations = getAllConversations();
  return conversations[id] || null;
}

/**
 * Get all conversations
 */
export function getAllConversations(): Record<string, StoredConversation> {
  if (typeof window === "undefined") return {};

  try {
    const data = localStorage.getItem(CONVERSATIONS_KEY) ??
      localStorage.getItem(LEGACY_CONVERSATIONS_KEY);
    if (data && !localStorage.getItem(CONVERSATIONS_KEY)) {
      localStorage.setItem(CONVERSATIONS_KEY, data);
    }
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error("Failed to load conversations:", error);
    return {};
  }
}

/**
 * Get conversation list (sorted by updatedAt desc)
 */
export function getConversationList(): StoredConversation[] {
  const conversations = getAllConversations();
  // Coerce invalid dates to 0 so a malformed updatedAt can't make the
  // comparator return NaN (which produces an unstable sort).
  const ts = (v: string | undefined) => {
    const t = new Date(v ?? 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return Object.values(conversations).sort(
    (a, b) => ts(b.updatedAt) - ts(a.updatedAt),
  );
}

/**
 * Delete a conversation
 */
export function deleteConversation(id: string): void {
  if (typeof window === "undefined") return;

  const conversations = getAllConversations();
  delete conversations[id];

  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));

  // Clear active ID if it was this conversation
  const activeId = getActiveConversationId();
  if (activeId === id) {
    localStorage.removeItem(ACTIVE_ID_KEY);
  }
}

/**
 * Re-insert a previously-deleted conversation exactly as it was (used by the
 * delete-conversation undo). Unlike saveConversation, this preserves the
 * original id/createdAt/updatedAt/starred instead of re-deriving them, so an
 * undo restores the record byte-for-byte and keeps its place in the list.
 */
export function restoreConversation(stored: StoredConversation): void {
  if (typeof window === "undefined" || !stored?.id) return;
  const conversations = getAllConversations();
  conversations[stored.id] = stored;
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

/**
 * Get the currently active conversation ID
 */
export function getActiveConversationId(): string | null {
  if (typeof window === "undefined") return null;
  const activeId = localStorage.getItem(ACTIVE_ID_KEY) ??
    localStorage.getItem(LEGACY_ACTIVE_ID_KEY);
  if (activeId && !localStorage.getItem(ACTIVE_ID_KEY)) {
    localStorage.setItem(ACTIVE_ID_KEY, activeId);
  }
  return activeId;
}

/**
 * Clear all conversations (for debugging/reset)
 */
export function clearAllConversations(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(CONVERSATIONS_KEY);
  localStorage.removeItem(ACTIVE_ID_KEY);
  localStorage.removeItem(LEGACY_CONVERSATIONS_KEY);
  localStorage.removeItem(LEGACY_ACTIVE_ID_KEY);
}

// ===================================================================
// AUTO-SAVE HELPERS
// ===================================================================

let saveTimeout: number | null = null;

/**
 * Debounced save - prevents too frequent writes
 */
export function debouncedSave(data: ConversationData, delay = 500): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveConversation(data);
    saveTimeout = null;
  }, delay);
}

/**
 * Get storage usage stats
 */
export function getStorageStats(): {
  used: number;
  total: number;
  percentage: number;
} {
  if (typeof window === "undefined") {
    return { used: 0, total: 0, percentage: 0 };
  }

  try {
    const data = localStorage.getItem(CONVERSATIONS_KEY) || "";
    const used = new Blob([data]).size;
    const total = 5 * 1024 * 1024; // 5MB typical localStorage limit
    const percentage = (used / total) * 100;

    return { used, total, percentage };
  } catch {
    return { used: 0, total: 0, percentage: 0 };
  }
}
