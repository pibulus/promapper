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
} from "./conversationStore.ts";
import { partyConnected } from "./partyConnectionStore.ts";
import {
  connectToRoom,
  disconnectFromRoom,
  type PartyCallbacks,
  type PartyConnectOptions,
  sendConversationUpdate,
} from "./partyService.ts";
import { remoteUserName } from "./presenceStore.ts";
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
  });

  // Outbound broadcaster: fire on local conversationData changes only.
  stopBroadcast = effect(() => {
    const data = conversationData.value;
    if (!partyConnected.value || !data) return;
    if (applyingRemoteUpdate.current) return; // remote apply — don't echo
    const json = JSON.stringify(data);
    if (json === lastSentJSON) return; // nothing actually changed
    lastSentJSON = json;
    sendConversationUpdate(data);
  });
}

export function stopLiveSync(): void {
  stopBroadcast?.();
  stopBroadcast = null;
  lastSentJSON = "";
  disconnectFromRoom();
}

// Re-export for convenience to the UI layer.
export { remoteUserName };
