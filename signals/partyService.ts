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
  WHITEBOARD_UPDATE: "whiteboard_update",
  TRANSCRIPT_CHUNK: "transcript_chunk",
  UPDATE_ACK: "update_ack",
} as const;

/** The room closed us with ROOM_EXPIRED — no point auto-reconnecting. */
const CLOSE_ROOM_EXPIRED = 4005;

export interface PartyCallbacks {
  /** Full snapshot on join (data may be null if no one has pushed yet). */
  onInit?: (data: unknown, meta: unknown, whiteboard?: string | null) => void;
  /** A conversation mutation arrived from a peer or server-push. */
  onConversationUpdate?: (data: unknown, rev?: number) => void;
  /** The server acknowledged OUR conversation update with its new revision. */
  onUpdateAck?: (rev: number) => void;
  /** The room expired server-side; the connection will not be retried. */
  onRoomExpired?: () => void;
  /** A chat message arrived. */
  onChat?: (text: string, sender: RemoteUser, at: number) => void;
  /** A peer started/stopped typing. */
  onTyping?: (typing: boolean, sender: RemoteUser) => void;
  /** A whiteboard scene update arrived from a peer. */
  onWhiteboardUpdate?: (scene: string) => void;
  /** A live transcript chunk from the recording host. */
  onTranscriptChunk?: (
    chunk: { text: string; speakers: string[]; chunkId: string; at: number },
  ) => void;
}

export interface PartyConnectOptions {
  /**
   * Collab server host — the Durable Objects worker
   * (e.g. promapper-collab.pibulus.workers.dev), or localhost:8799 in dev.
   * Scheme-less is fine; ws/wss is chosen from the host below.
   */
  host: string;
  roomId: string;
  avatar: string;
  alias?: string;
}

/**
 * Local dev hosts speak plain ws://; everything else (the workers.dev DO
 * worker, any custom domain) is TLS-only and must be wss://.
 */
export function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:|$)/.test(
    host.trim().replace(/^\w+:\/\//, ""),
  );
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

  let thisSocket: PartySocket;
  try {
    // partysocket builds `${protocol}://${host}/parties/${party}/${room}` —
    // which is EXACTLY the path the Durable Objects worker serves, by design.
    // So the PartyKit -> DO migration needs no change here beyond the host
    // (and the scheme, since workers.dev is always TLS).
    thisSocket = new PartySocket({
      host: options.host,
      party: "conversation",
      room: options.roomId,
      query,
      ...(isLocalHost(options.host) ? {} : { protocol: "wss" as const }),
    });
  } catch (err) {
    console.error("Collab socket constructor failed:", err);
    partyConnected.value = false;
    connectedRoomId.value = null;
    return;
  }
  socket = thisSocket;

  // Every handler bails if the module-level `socket` has since been replaced by
  // a reconnect. Without this, an OLD socket's async "close" (fired after
  // disconnectFromRoom on a reconnect) would set partyConnected=false AFTER the
  // NEW socket already opened — silently killing this client's outbound
  // broadcasts (liveSync guards on partyConnected). Comparing against the
  // captured instance, not event.target, is what makes the guard actually work:
  // a closing socket still reports itself as event.target.
  thisSocket.addEventListener("open", () => {
    if (socket !== thisSocket) return;
    partyConnected.value = true;
    connectedRoomId.value = options.roomId;
  });

  thisSocket.addEventListener("close", (event) => {
    if (socket !== thisSocket) return;
    partyConnected.value = false;
    // Room expired: PartySocket would happily retry forever, leaving the UI
    // stuck on "Reconnecting…" against a room that will never come back.
    if ((event as CloseEvent).code === CLOSE_ROOM_EXPIRED) {
      disconnectFromRoom();
      callbacks.onRoomExpired?.();
    }
  });

  thisSocket.addEventListener("message", (event) => {
    if (socket !== thisSocket) return;
    const msg = parse(event.data);
    if (!msg) return;
    const sender = (msg.sender ?? null) as RemoteUser | null;

    switch (msg.type) {
      case MSG.INIT:
        if (msg.meta) roomMeta.value = msg.meta as typeof roomMeta.value;
        callbacks.onInit?.(
          msg.data,
          msg.meta,
          typeof msg.whiteboard === "string" ? msg.whiteboard : null,
        );
        break;
      case MSG.PRESENCE:
        remoteUsers.value = Array.isArray(msg.data)
          ? (msg.data as RemoteUser[])
          : [];
        break;
      case MSG.CONVERSATION_UPDATE:
        callbacks.onConversationUpdate?.(
          msg.data,
          typeof msg.rev === "number" ? msg.rev : undefined,
        );
        break;
      case MSG.UPDATE_ACK:
        if (typeof msg.rev === "number") callbacks.onUpdateAck?.(msg.rev);
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
      case MSG.WHITEBOARD_UPDATE:
        if (msg.data && typeof msg.data === "object") {
          const d = msg.data as { scene?: string };
          if (d.scene) callbacks.onWhiteboardUpdate?.(d.scene);
        }
        break;
      case MSG.TRANSCRIPT_CHUNK:
        if (msg.data && typeof msg.data === "object") {
          const d = msg.data as {
            text?: string;
            speakers?: string[];
            chunkId?: string;
            at?: number;
          };
          if (d.text) {
            callbacks.onTranscriptChunk?.({
              text: d.text,
              speakers: Array.isArray(d.speakers) ? d.speakers : [],
              chunkId: d.chunkId ?? "",
              at: d.at ?? Date.now(),
            });
          }
        }
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

export function sendWhiteboardUpdate(scene: string): boolean {
  return send(MSG.WHITEBOARD_UPDATE, { scene });
}

export function sendTranscriptChunk(text: string, speakers: string[]): boolean {
  return send(MSG.TRANSCRIPT_CHUNK, {
    text,
    speakers,
    chunkId: String(Date.now()),
  });
}

export function isConnected(): boolean {
  return Boolean(socket && socket.readyState === PartySocket.OPEN);
}
