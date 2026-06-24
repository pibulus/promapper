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

let stopBroadcast: (() => void) | null = null;
let lastSentJSON = "";

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
        applyRemoteConversation(data as ConversationData);
        lastSentJSON = JSON.stringify(data);
      }
      extra.onInit?.(data, meta);
    },
    onConversationUpdate: (data) => {
      if (!data) return;
      applyRemoteConversation(data as ConversationData);
      lastSentJSON = JSON.stringify(data);
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
    sendConversationUpdate(data);
  });
}

export function stopLiveSync(): void {
  stopBroadcast?.();
  stopBroadcast = null;
  lastSentJSON = "";
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
