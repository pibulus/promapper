/**
 * Live Sync — bridges the conversationData signal to the live room.
 *
 * Outbound: an effect watches conversationData; when we're connected to a room
 * AND the change is local (not a remote apply), it broadcasts the snapshot.
 * Inbound: remote updates are applied via applyRemoteConversation(), which sets
 * the loopback guard so the outbound effect skips them — no echo loop.
 *
 * startLiveSync()/stopLiveSync() are called by the live route island.
 */

import { effect } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import {
  applyingRemoteUpdate,
  applyRemoteConversation,
  conversationData,
} from "@signals/conversationStore.ts";
import {
  type ChatMessage,
  chatMessages,
  partyConnected,
  remoteWhiteboardUpdate,
  unreadChatCount,
} from "@signals/partyConnectionStore.ts";
import {
  connectToRoom,
  disconnectFromRoom,
  type PartyCallbacks,
  type PartyConnectOptions,
  sendChat,
  sendConversationUpdate,
} from "@signals/partyService.ts";
import {
  getLocalIdentity,
  type RemoteUser,
  remoteUserName,
} from "@signals/presenceStore.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";
import {
  loadConversation,
  restoreConversation,
} from "../core/storage/localStorage.ts";

import { showToast } from "@utils/toast.ts";

let stopBroadcast: (() => void) | null = null;
let lastSentJSON = "";
// Reconnect-flush state: a local edit failed to send (socket down). On
// reconnect INIT we compare the room's revision counter against the last rev
// we KNOW includes our writes (updates we receive bump it; our own sends bump
// it via the server's UPDATE_ACK). rev unchanged → nobody else moved the room
// → our local state wins and is re-sent; rev moved → remote wins, honestly.
// (The old JSON comparison could essentially never match — the room sanitizes
// payloads and never echoes your own write back — so it silently discarded
// local edits in the common case while toasting "synced the room's latest".)
let unsentLocal = false;
let lastSeenRev = -1;

/**
 * Connect to a room and start two-way conversation sync. Extra callbacks
 * (chat/typing) can be passed through for the UI layer.
 */
export function startLiveSync(
  options: PartyConnectOptions,
  extra: PartyCallbacks = {},
): void {
  if (!IS_BROWSER) return;

  // Reset chat state for the new room.
  chatMessages.value = [];
  unreadChatCount.value = 0;

  connectToRoom(options, {
    ...extra,
    onInit: (data, meta, whiteboard) => {
      const rev = metaRev(meta);
      if (data) {
        // "Not ahead of us": the room's revision is at (or behind) the last
        // rev we know includes our writes. <= not ===: a dev-server restart
        // can hand back an even older room, and healing it with our state is
        // the right move there too.
        const roomNotAhead = rev !== null && rev <= lastSeenRev;
        if (unsentLocal && conversationData.value && roomNotAhead) {
          // Reconnected and nobody else moved the room while we were away —
          // our unsent local state wins.
          unsentLocal = false;
          lastSentJSON = localJSON(conversationData.value);
          if (sendConversationUpdate(stripWhiteboard(conversationData.value))) {
            showToast("Reconnected — your changes synced", "success");
          }
        } else if (roomNotAhead && conversationData.value) {
          // Nothing new in this snapshot — do NOT re-apply it. A flappy
          // reconnect can deliver a second INIT that races our just-flushed
          // update; applying it rolled the tab back to the pre-flush state
          // (found live: room+peer had the flushed edit, the flusher didn't).
          unsentLocal = false;
        } else {
          if (unsentLocal) {
            // The room moved on while we were offline — remote wins, say so.
            showToast("Reconnected — synced the room's latest", "info");
          }
          unsentLocal = false;
          // Only here: this is the branch that takes the room's version whole.
          const stashed = stashDivergedLocalCopy(data as ConversationData);
          if (stashed) {
            showToast(
              stashed.ok
                ? `Kept your version as "${stashed.title}" in History — the room's map is what's on screen.`
                : "Couldn't set your own version aside — storage is full. Leave the room before editing.",
              stashed.ok ? "info" : "error",
              7000,
            );
          }
          applyRemoteConversation(data as ConversationData);
          lastSentJSON = sentKey();
          if (rev !== null) lastSeenRev = Math.max(lastSeenRev, rev);
        }
      } else if (rev !== null) {
        lastSeenRev = rev;
      }
      // The room remembers the whiteboard — late joiners and reloading hosts
      // get the current drawing instead of a blank board.
      if (whiteboard) remoteWhiteboardUpdate.value = whiteboard;
      extra.onInit?.(data, meta, whiteboard);
    },
    onConversationUpdate: (data, rev) => {
      if (!data) return;
      applyRemoteConversation(data as ConversationData);
      lastSentJSON = sentKey();
      if (typeof rev === "number") lastSeenRev = rev;
      extra.onConversationUpdate?.(data, rev);
    },
    onUpdateAck: (rev) => {
      // Our own write landed — track its rev so a reconnect can tell whether
      // the room moved past us.
      lastSeenRev = rev;
      extra.onUpdateAck?.(rev);
    },
    onChat: (text, sender: RemoteUser, at) => {
      appendChat({
        id: `${sender.id}-${at}`,
        senderId: sender.id,
        senderName: remoteUserName(sender),
        text,
        at,
      });
      extra.onChat?.(text, sender, at);
    },
    onWhiteboardUpdate: (scene) => {
      remoteWhiteboardUpdate.value = scene;
      extra.onWhiteboardUpdate?.(scene);
    },
  });

  // Outbound broadcaster: fire on local conversationData changes only.
  stopBroadcast = effect(() => {
    const data = conversationData.value;
    if (!partyConnected.value || !data) return;
    if (applyingRemoteUpdate.current) return; // remote apply — don't echo
    // Exclude whiteboardScene — the lightweight sendWhiteboardUpdate channel
    // handles live whiteboard sync. It must be stripped from the SENT payload
    // too (not just the dedup key): a big scene riding on every conversation
    // edit could trip the room's 1MB message cap and close the socket.
    const rest = stripWhiteboard(data);
    const json = JSON.stringify(rest);
    if (json === lastSentJSON) return; // nothing actually changed
    lastSentJSON = json;
    if (!sendConversationUpdate(rest)) {
      // Socket down mid-edit — remember so the reconnect INIT can flush.
      unsentLocal = true;
    }
  });
}

/** The conversation without its (heavy, separately-synced) whiteboard scene. */
function stripWhiteboard(data: ConversationData): ConversationData {
  const { whiteboardScene: _s, ...rest } = data as ConversationData & {
    whiteboardScene?: string;
  };
  return rest as ConversationData;
}

/** The outbound JSON shape (whiteboardScene excluded) for echo-dedup. */
function localJSON(data: ConversationData): string {
  return JSON.stringify(stripWhiteboard(data));
}

/**
 * What a map SAYS, ignoring how it's stored. Sorted, and blind to positions,
 * colors, timestamps and transcript text — so a copy that came back through
 * the room (which re-normalizes `created_at` and re-orders nothing reliably)
 * still matches itself. What it does catch is a topic or task added, removed,
 * renamed, reworded or ticked: divergence a person would notice losing.
 */
function substance(data: ConversationData): string {
  return JSON.stringify({
    nodes: (data.nodes ?? []).map((n) => [n.id, n.label, n.emoji]).sort(),
    items: (data.actionItems ?? []).map((
      i,
    ) => [i.id, i.description, i.status]).sort(),
    summary: data.summary ?? "",
  });
}

/**
 * A room snapshot is about to land on a conversation id this device already
 * holds. Usually that's fine — it's your own copy of this very room, coming
 * back after a reload.
 *
 * But `Go Live` mints a BRAND NEW room id every time and nothing remembers the
 * old one, so the second time a map is shared it's a different room carrying
 * the same conversation id. A guest who left the first meeting with a copy,
 * edited it for a week, then opened the new link had all of it replaced under
 * that id — silently, no merge, no warning, and their notes and whiteboard
 * went too (the join path nulls the signal first, so `applyRemoteConversation`
 * has no `mine` to preserve client-only fields from).
 *
 * Keep their version beside it instead. Not a merge — the reconcile engine
 * could do that properly with a stored BASE per room — just: never delete a
 * week of someone's work to make room for a link they clicked.
 *
 * Returns what it filed (so the caller owns the toast and this stays testable
 * without a DOM), or null when nothing needed keeping. Exported for its test.
 */
export function stashDivergedLocalCopy(
  incoming: ConversationData,
): { title: string; ok: boolean } | null {
  const id = incoming.conversation?.id;
  if (!id) return null;
  const stored = loadConversation(id);
  if (!stored) return null; // nothing of ours here — the room lands free
  if (substance(stored) === substance(incoming)) return null; // same map

  const copyId = crypto.randomUUID();
  const title = `${stored.conversation?.title || "Untitled"} (your copy)`;
  const ok = restoreConversation({
    ...stored,
    id: copyId,
    conversation: { ...stored.conversation, id: copyId, title },
  }, []);
  return { title, ok };
}

/**
 * The dedup key for what we've just taken on board. Must be the LOCAL shape:
 * stamping the raw server payload here compared a sanitized snapshot (no
 * notes/magpie/deleted*) against the local one, so anyone holding a
 * client-only field never matched — every reconnect re-broadcast the whole
 * conversation and bumped the room's revision for nothing.
 */
function sentKey(): string {
  const current = conversationData.value;
  return current ? localJSON(current) : "";
}

/** Read the revision counter out of the INIT meta blob (null if absent). */
function metaRev(meta: unknown): number | null {
  if (meta && typeof meta === "object") {
    const rev = (meta as { rev?: unknown }).rev;
    if (typeof rev === "number" && rev >= 0) return rev;
  }
  return null;
}

export function stopLiveSync(): void {
  stopBroadcast?.();
  stopBroadcast = null;
  lastSentJSON = "";
  unsentLocal = false;
  lastSeenRev = -1;
  chatMessages.value = [];
  unreadChatCount.value = 0;
  remoteWhiteboardUpdate.value = null;
  disconnectFromRoom();
}

function appendChat(message: ChatMessage): void {
  // Cap the log so a long session can't grow unbounded.
  chatMessages.value = [...chatMessages.value, message].slice(-200);
}

/** Send a chat message (broadcasts; the server echoes it back to us too). */
export function sendChatMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  sendChat(trimmed);
}

// Re-export for convenience to the UI layer.
export { getLocalIdentity, remoteUserName };
