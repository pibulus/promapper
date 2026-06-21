/**
 * Party Service — client-side WebSocket wrapper for live collaboration.
 *
 * Wraps PartySocket, routes inbound messages to the presence/connection
 * signals, and exposes typed send helpers. Conversation updates are handed to
 * an injected callback (wired with the loopback guard in the live route) so
 * this module stays free of app-state coupling.
 *
 * Browser-only: connect() is a no-op on the server (IS_BROWSER guard).
 */

import { IS_BROWSER } from "$fresh/runtime.ts";
import PartySocket from "partysocket";
import {
  connectedRoomId,
  partyConnected,
  roomMeta,
} from "@signals/partyConnectionStore.ts";
import { type RemoteUser, remoteUsers } from "@signals/presenceStore.ts";

// Message type strings — must match party/conversationProtocol.ts.
export const MSG = {
  INIT: "init",
  PRESENCE: "presence",
  CONVERSATION_UPDATE: "conversation_update",
  CHAT: "chat",
  TYPING_START: "typing_start",
  TYPING_STOP: "typing_stop",
  RENAME: "rename",
} as const;

export interface PartyCallbacks {
  /** Full snapshot on join (data may be null if no one has pushed yet). */
  onInit?: (data: unknown, meta: unknown) => void;
  /** A conversation mutation arrived from a peer or server-push. */
  onConversationUpdate?: (data: unknown) => void;
  /** A chat message arrived. */
  onChat?: (text: string, sender: RemoteUser, at: number) => void;
  /** A peer started/stopped typing. */
  onTyping?: (typing: boolean, sender: RemoteUser) => void;
}

export interface PartyConnectOptions {
  host: string; // PartyKit host (e.g. localhost:1999 or *.partykit.dev)
  roomId: string;
  avatar: string;
  alias?: string;
}

let socket: PartySocket | null = null;

function parse(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function connectToRoom(
  options: PartyConnectOptions,
  callbacks: PartyCallbacks = {},
): void {
  if (!IS_BROWSER) return;
  if (socket) disconnectFromRoom();

  const query: Record<string, string> = { avatar: options.avatar };
  if (options.alias) query.alias = options.alias;

  socket = new PartySocket({
    host: options.host,
    party: "conversation", // matches party/conversationRoom.ts (file: conversationRoom)
    room: options.roomId,
    query,
  });

  socket.addEventListener("open", () => {
    partyConnected.value = true;
    connectedRoomId.value = options.roomId;
  });

  socket.addEventListener("close", () => {
    partyConnected.value = false;
  });

  socket.addEventListener("message", (event) => {
    const msg = parse(event.data);
    if (!msg) return;
    const sender = (msg.sender ?? null) as RemoteUser | null;

    switch (msg.type) {
      case MSG.INIT:
        if (msg.meta) roomMeta.value = msg.meta as typeof roomMeta.value;
        callbacks.onInit?.(msg.data, msg.meta);
        break;
      case MSG.PRESENCE:
        remoteUsers.value = Array.isArray(msg.data)
          ? (msg.data as RemoteUser[])
          : [];
        break;
      case MSG.CONVERSATION_UPDATE:
        callbacks.onConversationUpdate?.(msg.data);
        break;
      case MSG.CHAT:
        if (sender && msg.data && typeof msg.data === "object") {
          const d = msg.data as { text?: string; at?: number };
          callbacks.onChat?.(d.text ?? "", sender, d.at ?? Date.now());
        }
        break;
      case MSG.TYPING_START:
        if (sender) callbacks.onTyping?.(true, sender);
        break;
      case MSG.TYPING_STOP:
        if (sender) callbacks.onTyping?.(false, sender);
        break;
    }
  });
}

export function disconnectFromRoom(): void {
  socket?.close();
  socket = null;
  partyConnected.value = false;
  connectedRoomId.value = null;
  remoteUsers.value = [];
}

function send(type: string, data?: unknown): boolean {
  if (!socket || socket.readyState !== PartySocket.OPEN) return false;
  socket.send(JSON.stringify({ type, data }));
  return true;
}

export function sendConversationUpdate(data: unknown): boolean {
  return send(MSG.CONVERSATION_UPDATE, data);
}

export function sendChat(text: string): boolean {
  return send(MSG.CHAT, { text });
}

export function sendRename(alias: string): boolean {
  return send(MSG.RENAME, { alias });
}

export function sendTyping(typing: boolean): boolean {
  return send(typing ? MSG.TYPING_START : MSG.TYPING_STOP);
}

export function isConnected(): boolean {
  return Boolean(socket && socket.readyState === PartySocket.OPEN);
}
