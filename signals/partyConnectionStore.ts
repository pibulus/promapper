/**
 * Party Connection Store
 *
 * Live-room connection state: which room we're in, whether the socket is open,
 * room metadata (expiry), and the in-session chat log. Driven by partyService.
 */

import { signal } from "@preact/signals";

export const connectedRoomId = signal<string | null>(null);
export const partyConnected = signal<boolean>(false);

export interface RoomMeta {
  createdAt?: string;
  updatedAt?: string;
  lastActiveAt?: string;
  expiresAt?: string;
}
export const roomMeta = signal<RoomMeta | null>(null);

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  at: number;
}
export const chatMessages = signal<ChatMessage[]>([]);
export const unreadChatCount = signal<number>(0);

// Inbound whiteboard scene updates from remote peers
export const remoteWhiteboardUpdate = signal<string | null>(null);
