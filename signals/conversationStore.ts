/**
 * Shared Conversation Store
 *
 * Global signals for sharing conversation data between islands
 * Auto-saves to localStorage on updates (unless viewing shared)
 */

import { effect, signal } from "@preact/signals";
import { debouncedSave } from "../core/storage/localStorage.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";

export type { ConversationData };

// Global conversation data signal
export const conversationData = signal<ConversationData | null>(null);

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
  try {
    conversationData.value = data;
  } finally {
    // Release after the synchronous signal-effect microtask flush.
    queueMicrotask(() => {
      applyingRemoteUpdate.current = false;
    });
  }
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
      debouncedSave(data);
    }
  });
}
