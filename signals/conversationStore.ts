/**
 * Shared Conversation Store
 *
 * Global signals for sharing conversation data between islands
 * Auto-saves to localStorage on updates (unless viewing shared)
 */

import { effect, signal } from "@preact/signals";
import {
  cancelPendingSave,
  CONVERSATIONS_KEY,
  debouncedSave,
  getActiveConversationId,
  loadConversation,
} from "../core/storage/localStorage.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";
import { showActionToast, showToast } from "../utils/toast.ts";
import { liveSession } from "@signals/liveSessionStore.ts";

export type { ConversationData };

// Global conversation data signal
export const conversationData = signal<ConversationData | null>(null);

// Global UI signal for history drawer open state
export const historyDrawerOpen = signal<boolean>(false);

// Flag to prevent auto-save when viewing shared conversations
export const isViewingShared = signal<boolean>(false);

// Live-collab loopback guard: when a remote update is being applied, this is
// true so the live-sync broadcaster doesn't echo it back to the room.
export const applyingRemoteUpdate = { current: false };

/**
 * Apply a conversation snapshot that arrived from the live room, without
 * triggering a re-broadcast (echo loop). Use this instead of assigning
 * conversationData.value directly for remote updates.
 */
export function applyRemoteConversation(data: ConversationData): void {
  applyingRemoteUpdate.current = true;
  // A pending undo snapshot predates this remote update, so restoring it would
  // roll back PAST the collaborator's change and silently discard it. A remote
  // update is a new baseline — drop the stale undo target.
  undoSnapshot = null;
  try {
    conversationData.value = data;
  } finally {
    // Release after the synchronous signal-effect microtask flush.
    queueMicrotask(() => {
      applyingRemoteUpdate.current = false;
    });
  }
}

// ===================================================================
// UNDO (last action only)
// ===================================================================

// The single previous conversationData snapshot, captured right before a
// destructive in-place mutation. Because conversation-ops returns NEW objects
// (never mutates), the prior .value is already a complete, zero-cost pre-state —
// undo is just reassigning it. Last-action-only by design: it pairs with the
// undo toast's lifetime, no stack to reason about.
let undoSnapshot: ConversationData | null = null;

/**
 * Remember the current conversation as the undo target, then run the mutation.
 * Call this from store actions wrapping a destructive change. Returns true if a
 * snapshot was captured (i.e. there was data to undo).
 */
export function withUndo(mutate: () => void): boolean {
  const prev = conversationData.value;
  mutate();
  // Only arm undo if the mutation actually changed the reference (ops no-op by
  // returning the same object when nothing changed).
  if (prev && conversationData.value !== prev) {
    undoSnapshot = prev;
    return true;
  }
  return false;
}

/** True if there's a captured snapshot to roll back to. */
export function canUndo(): boolean {
  return undoSnapshot !== null;
}

/**
 * Restore the last captured snapshot. Goes through the signal so the autosave
 * effect AND the live-sync broadcaster both re-persist/rebroadcast the restored
 * state. One-shot: clears the snapshot so a second undo is a no-op.
 */
export function undoLastMutation(): boolean {
  if (!undoSnapshot) return false;
  conversationData.value = undoSnapshot;
  undoSnapshot = null;
  return true;
}

/** Forget any pending undo (e.g. after a non-undoable navigation/reset). */
export function clearUndo(): void {
  undoSnapshot = null;
}

// Global processing state (true when AI is analyzing)
export const isProcessing = signal<boolean>(false);

// Auto-save to localStorage whenever conversationData changes
// SKIP auto-save when viewing shared conversations
if (typeof window !== "undefined") {
  effect(() => {
    const data = conversationData.value;

    // Only auto-save if we have data AND we're not viewing a shared conversation
    if (data && !isViewingShared.value) {
      debouncedSave(data, 500, () => {
        showToast(
          "Storage is full — your latest change didn't save. Export a backup to free space.",
          "error",
          6000,
        );
      });
    } else {
      // Data went null (delete) or we're now viewing a shared conversation.
      // Cancel any save already scheduled with the OLD data — otherwise it fires
      // ~500ms later and resurrects the deleted conversation (or leaks shared
      // data into the owner's localStorage). Audit #8 findings 3.1/3.2.
      cancelPendingSave();
    }
  });

  // Cross-tab sync: when another tab writes to the conversations store, check
  // if the currently-open conversation was changed. Skip entirely during live
  // meetings — PartyKit is the source of truth, and a storage event would race
  // with collab updates from the server.
  window.addEventListener("storage", (e) => {
    if (e.key !== CONVERSATIONS_KEY) return;
    if (isViewingShared.value) return;
    if (liveSession.value) return; // PartyKit owns the data during live meetings

    const activeId = getActiveConversationId();
    const current = conversationData.value;
    if (!activeId || !current) return;
    if (!e.newValue) return;

    try {
      const prev = e.oldValue ? JSON.parse(e.oldValue)[activeId] : null;
      const next = JSON.parse(e.newValue)[activeId];

      // Conversation not in the new store — another tab deleted it, ignore.
      if (!next) return;
      // No prior version or same timestamp — nothing changed for us.
      if (!prev || prev.updatedAt === next.updatedAt) return;

      // Different timestamp → another tab modified this conversation.
      showActionToast(
        "This conversation was edited in another tab.",
        "Reload",
        () => {
          const fresh = loadConversation(activeId);
          if (fresh) conversationData.value = fresh;
        },
        8000,
      );
    } catch {
      // JSON parse failed — not our data, ignore.
    }
  });
}
