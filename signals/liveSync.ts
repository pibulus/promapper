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

import { showToast } from "@utils/toast.ts";

let stopBroadcast: (() => void) | null = null;
let lastSentJSON = "";
// Reconnect-flush state: a local edit failed to send (socket down) and the
// last room snapshot we saw. On reconnect INIT, if the room hasn't moved,
// our local state wins and gets re-sent; if it has, remote wins (honestly).
let unsentLocal = false;
let lastRemoteJSON = "";

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
    onInit: (data, meta) => {
      if (data) {
        const incoming = JSON.stringify(data);
        if (
          unsentLocal && lastRemoteJSON && incoming === lastRemoteJSON &&
          conversationData.value
        ) {
          // Reconnected and the room is exactly where we left it — nobody
          // else edited while we were away. Our unsent local state wins.
          unsentLocal = false;
          lastSentJSON = localJSON(conversationData.value);
          if (sendConversationUpdate(conversationData.value)) {
            showToast("Reconnected — your changes synced", "success");
          }
        } else {
          if (unsentLocal) {
            // The room moved on while we were offline — remote wins, say so.
            showToast("Reconnected — synced the room's latest", "info");
          }
          unsentLocal = false;
          applyRemoteConversation(data as ConversationData);
          lastSentJSON = incoming;
        }
        lastRemoteJSON = incoming;
      }
      extra.onInit?.(data, meta);
    },
    onConversationUpdate: (data) => {
      if (!data) return;
      applyRemoteConversation(data as ConversationData);
      lastSentJSON = JSON.stringify(data);
      lastRemoteJSON = lastSentJSON;
      extra.onConversationUpdate?.(data);
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
    // handles live whiteboard sync. Including it here would broadcast the
    // entire heavy conversation payload on every mouse stroke.
    const { whiteboardScene: _wbScene, ...rest } = data as ConversationData & {
      whiteboardScene?: string;
    };
    const json = JSON.stringify(rest);
    if (json === lastSentJSON) return; // nothing actually changed
    lastSentJSON = json;
    if (!sendConversationUpdate(data)) {
      // Socket down mid-edit — remember so the reconnect INIT can flush.
      unsentLocal = true;
    }
  });
}

/** The outbound JSON shape (whiteboardScene excluded) for echo-dedup. */
function localJSON(data: ConversationData): string {
  const { whiteboardScene: _s, ...rest } = data as ConversationData & {
    whiteboardScene?: string;
  };
  return JSON.stringify(rest);
}

export function stopLiveSync(): void {
  stopBroadcast?.();
  stopBroadcast = null;
  lastSentJSON = "";
  unsentLocal = false;
  lastRemoteJSON = "";
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
