/**
 * LocalStorage Service - Browser Persistence
 *
 * Stores conversations and action items in browser localStorage
 * No backend needed, works offline
 */

import type { ConversationData } from "../types/conversation-data.ts";
import { ts } from "./dates.ts";

// Storage keys
const CONVERSATIONS_KEY = "project_mapper_conversations";
const ACTIVE_ID_KEY = "project_mapper_active_id";
const LEGACY_CONVERSATIONS_KEY = "conversation_mapper_conversations";
const LEGACY_ACTIVE_ID_KEY = "conversation_mapper_active_id";
// Corrupted bytes are parked here (not discarded) so a parse failure is
// recoverable instead of being silently overwritten by the next autosave.
const CORRUPT_BACKUP_KEY = "project_mapper_conversations__corrupt_backup";

/**
 * Wrap localStorage.setItem so a quota/security failure doesn't throw out of a
 * star/delete/restore call (which would leave the UI showing a change that never
 * persisted). Returns whether the write succeeded so callers can warn if needed.
 * saveConversation has its own richer handling; this is for the smaller writes.
 */
function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error(`localStorage write failed for ${key}:`, err);
    return false;
  }
}

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
 * Save a conversation. Returns false if the write failed (e.g. localStorage is
 * full) so the caller can warn the user instead of silently losing their work.
 *
 * Both keys are written under one guard: if the big conversations write throws
 * (quota), we don't touch the active-id key and we don't leave a half-written
 * map (setItem either fully succeeds or fully no-ops on a single key, and we
 * write conversations first, active-id second — so a quota failure leaves the
 * PREVIOUS conversations map intact, not a corrupted one).
 */
export function saveConversation(data: ConversationData): boolean {
  if (typeof window === "undefined") return false;

  const { map: conversations, corrupt } = loadConversationsRaw();
  // CRITICAL: never autosave over a corrupt store. Writing now would collapse
  // the map to just this one conversation and overwrite the recoverable bytes,
  // destroying every other saved conversation. Refuse and let the user recover.
  if (corrupt) {
    console.error(
      "saveConversation: store is corrupt, refusing to overwrite (corrupt " +
        "bytes preserved at recovery key). Latest change NOT saved.",
    );
    return false;
  }

  const conversationId = data.conversation.id;
  // Guard against a missing id polluting the map under a falsy key.
  if (!conversationId) {
    console.warn("saveConversation: conversation has no id, skipping");
    return false;
  }

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

  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    localStorage.setItem(ACTIVE_ID_KEY, conversationId);
    return true;
  } catch (err) {
    // Almost always QuotaExceededError. The conversations map in localStorage is
    // unchanged (the failed write is atomic per key), so no corruption — but the
    // user's latest change is NOT saved. Surface it; don't fail silently.
    console.error("saveConversation failed (storage full?):", err);
    return false;
  }
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
  safeSetItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
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
  safeSetItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  return conv.starred;
}

/**
 * Replace the entire conversations map (used by backup import).
 */
export function replaceAllConversations(
  conversations: Record<string, StoredConversation>,
): void {
  if (typeof window === "undefined") return;
  safeSetItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

/**
 * Backfill arrays/objects that downstream code (conversation-ops, the graph)
 * assumes are always present. A record from an older schema or a hand-edited
 * backup might omit them; without this, `.nodes.map()` / `.edges.filter()` /
 * `.actionItems.map()` throw a TypeError on load. Belt-and-suspenders against
 * the deliberately-permissive import path.
 */
export function normalizeStored(
  record: StoredConversation,
): StoredConversation {
  return {
    ...record,
    conversation: record.conversation ?? {
      id: record.id,
      source: "text",
      transcript: "",
    },
    transcript: record.transcript ?? { text: "", speakers: [] },
    nodes: Array.isArray(record.nodes) ? record.nodes : [],
    edges: Array.isArray(record.edges) ? record.edges : [],
    actionItems: Array.isArray(record.actionItems) ? record.actionItems : [],
    statusUpdates: Array.isArray(record.statusUpdates)
      ? record.statusUpdates
      : [],
  };
}

/**
 * Load a specific conversation by ID
 */
export function loadConversation(id: string): StoredConversation | null {
  if (typeof window === "undefined") return null;

  const conversations = getAllConversations();
  const record = conversations[id];
  return record ? normalizeStored(record) : null;
}

/**
 * Pure: classify the raw conversations string. Kept free of any browser globals
 * so it's directly unit-testable (same pattern as parseBackup). The empty-vs-
 * corrupt distinction is load-bearing: if a parse failure looks like "no
 * conversations", the next autosave overwrites the (recoverable) corrupt bytes
 * with a one-entry map, destroying every other saved conversation forever.
 *
 * - null/empty input  → { map:{}, corrupt:false }  (genuinely empty store)
 * - valid JSON        → { map, corrupt:false }
 * - invalid JSON      → { map:{}, corrupt:true }    (caller preserves the bytes)
 */
export function classifyConversationsRaw(
  data: string | null,
): { map: Record<string, StoredConversation>; corrupt: boolean } {
  if (!data) return { map: {}, corrupt: false };
  try {
    return { map: JSON.parse(data), corrupt: false };
  } catch (error) {
    console.error("Conversations store is corrupt:", error);
    return { map: {}, corrupt: true };
  }
}

/**
 * Internal: read the conversations map from localStorage and classify it. On
 * corruption it parks the raw bytes under a recovery key (once) and reports
 * `corrupt: true` so writers can refuse to overwrite a recoverable store.
 */
function loadConversationsRaw(): {
  map: Record<string, StoredConversation>;
  corrupt: boolean;
} {
  if (typeof window === "undefined") return { map: {}, corrupt: false };

  const data = localStorage.getItem(CONVERSATIONS_KEY) ??
    localStorage.getItem(LEGACY_CONVERSATIONS_KEY);
  if (!data) return { map: {}, corrupt: false };

  // Migrate legacy bytes to the current key on first read.
  if (!localStorage.getItem(CONVERSATIONS_KEY)) {
    localStorage.setItem(CONVERSATIONS_KEY, data);
  }

  const result = classifyConversationsRaw(data);
  if (result.corrupt && !localStorage.getItem(CORRUPT_BACKUP_KEY)) {
    // Preserve the corrupt bytes once. Don't clobber an existing backup with a
    // later (possibly already-shrunk) read.
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, data);
    } catch (backupErr) {
      console.error("Failed to back up corrupt conversations:", backupErr);
    }
  }
  return result;
}

/**
 * Get all conversations. Read callers get `{}` on corruption (they render an
 * empty list, which is harmless); the corrupt bytes are preserved by
 * loadConversationsRaw for recovery. Writers must use loadConversationsRaw
 * directly so they can refuse to overwrite a corrupt store.
 */
export function getAllConversations(): Record<string, StoredConversation> {
  return loadConversationsRaw().map;
}

/**
 * Get conversation list (sorted by updatedAt desc)
 */
export function getConversationList(): StoredConversation[] {
  const conversations = getAllConversations();
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

  safeSetItem(CONVERSATIONS_KEY, JSON.stringify(conversations));

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
  safeSetItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
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
// So the "storage full" warning fires once, not on every keystroke while full.
let warnedStorageFull = false;

/**
 * Debounced save. `onSaveFailed` (if given) is called the first time a save
 * fails (e.g. quota), and not again until a save succeeds — so the caller (the
 * signals layer) can warn the user once without importing UI into this
 * framework-neutral storage module.
 */
export function debouncedSave(
  data: ConversationData,
  delay = 500,
  onSaveFailed?: () => void,
): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    const ok = saveConversation(data);
    if (!ok && !warnedStorageFull) {
      warnedStorageFull = true;
      onSaveFailed?.();
    } else if (ok) {
      warnedStorageFull = false; // recovered → allow the warning again later
    }
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
