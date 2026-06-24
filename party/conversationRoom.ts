/**
 * PartyKit room for ProMapper live collaboration.
 *
 * One validated conversation snapshot per room. Clients connect over WebSocket
 * to view/edit; the app's API routes POST AI results in (server-push). Presence
 * is derived from live connections so stale users never become durable data.
 *
 * Access model: the room id is the secret (no passwords). Lifetime: 24h after
 * last activity. RELATIVE IMPORTS ONLY (the bundler ignores Deno aliases).
 */

import type * as Party from "partykit/server";
import {
  createRoomMetadata,
  isRoomExpired,
  LIVE_CLOSE_CODES,
  LIVE_MESSAGE_TYPES,
  normalizeLiveMessage,
  type RoomMetadata,
  sanitizeAlias,
  sanitizeAvatar,
  sanitizeChatText,
  sanitizeConversationData,
  touchRoomMetadata,
} from "./conversationProtocol.ts";

interface PresenceUser {
  id: string;
  avatar: string;
  alias?: string;
  joinedAt: number;
}

type ConnectionState = {
  avatar: string;
  alias?: string;
  joinedAt: number;
};

export default class ConversationRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  // ===============================================================
  // CONNECTION LIFECYCLE
  // ===============================================================

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const state = await this.getRoomState();

    if (state.expired) {
      conn.close(LIVE_CLOSE_CODES.ROOM_EXPIRED, "This live room has expired");
      return;
    }

    conn.setState(
      {
        avatar: sanitizeAvatar(url.searchParams.get("avatar")),
        alias: sanitizeAlias(url.searchParams.get("alias")),
        joinedAt: Date.now(),
      } satisfies ConnectionState,
    );

    // Send the current snapshot (may be null if no one has pushed data yet).
    conn.send(JSON.stringify({
      type: LIVE_MESSAGE_TYPES.INIT,
      data: state.data,
      meta: state.metadata,
    }));

    this.broadcastPresence();
  }

  onClose(conn: Party.Connection) {
    this.broadcastPresence(conn.id);
  }

  // ===============================================================
  // CLIENT MESSAGES (WebSocket)
  // ===============================================================

  async onMessage(message: string, sender: Party.Connection) {
    const state = await this.getRoomState();
    if (state.expired) {
      sender.close(LIVE_CLOSE_CODES.ROOM_EXPIRED, "This live room has expired");
      return;
    }

    const normalized = normalizeLiveMessage(this.parse(message));
    if (!normalized) return;

    switch (normalized.type) {
      case LIVE_MESSAGE_TYPES.CONVERSATION_UPDATE: {
        // A peer edited the conversation — validate + persist, then relay.
        const data = sanitizeConversationData(normalized.data);
        if (!data) return;
        await this.saveData(data);
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.relay(LIVE_MESSAGE_TYPES.CONVERSATION_UPDATE, data, sender);
        return;
      }
      case LIVE_MESSAGE_TYPES.CHAT: {
        const text = sanitizeChatText(
          this.field(normalized.data, "text"),
        );
        if (!text) return;
        // Chat is real activity — extend the room TTL so a room kept alive only
        // by conversation (no edits) doesn't expire out from under active peers.
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.relay(
          LIVE_MESSAGE_TYPES.CHAT,
          { text, at: Date.now() },
          sender,
          /* includeSender */ true,
        );
        return;
      }
      case LIVE_MESSAGE_TYPES.RENAME: {
        const alias = sanitizeAlias(this.field(normalized.data, "alias"));
        const current = sender.state as ConnectionState | null;
        sender.setState({ ...(current ?? { avatar: "Guest", joinedAt: Date.now() }), alias });
        // A rename is also a sign of life — keep the room from expiring.
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.broadcastPresence();
        return;
      }
      case LIVE_MESSAGE_TYPES.TYPING_START:
      case LIVE_MESSAGE_TYPES.TYPING_STOP: {
        // Transient presence-only signal — drop the (uncapped) client payload;
        // peers only need the sender + type. Keeps every relay sanitized.
        this.relay(normalized.type, undefined, sender);
        return;
      }
      case LIVE_MESSAGE_TYPES.WHITEBOARD_UPDATE: {
        const scene = this.field(normalized.data, "scene");
        if (typeof scene !== "string" || scene.length > 500_000) return;
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.relay(LIVE_MESSAGE_TYPES.WHITEBOARD_UPDATE, { scene }, sender);
        return;
      }
      case LIVE_MESSAGE_TYPES.TRANSCRIPT_CHUNK: {
        // Live transcript segment from the recording host — relay to all.
        const text = this.field(normalized.data, "text");
        const speakers = this.field(normalized.data, "speakers");
        const chunkId = this.field(normalized.data, "chunkId");
        if (typeof text !== "string" || text.length > 8000) return;
        this.relay(LIVE_MESSAGE_TYPES.TRANSCRIPT_CHUNK, {
          text,
          speakers: Array.isArray(speakers) ? speakers : [],
          chunkId: typeof chunkId === "string" ? chunkId : String(Date.now()),
          at: Date.now(),
          sender,
        }, sender);
        return;
      }
      case LIVE_MESSAGE_TYPES.SDP_OFFER:
      case LIVE_MESSAGE_TYPES.SDP_ANSWER:
      case LIVE_MESSAGE_TYPES.ICE_CANDIDATE: {
        // WebRTC signaling — relay between peers for P2P voice.
        const payload = this.field(normalized.data, "payload");
        const targetId = this.field(normalized.data, "targetId");
        if (typeof payload !== "string") return;
        // Relay to all except sender (or to specific target if set)
        const message = JSON.stringify({
          type: normalized.type,
          data: { payload, targetId: String(targetId || ""), fromId: sender.id },
          sender: this.getPresenceUser(sender),
        });
        if (targetId && typeof targetId === "string") {
          // Direct message to specific peer
          for (const conn of this.room.getConnections()) {
            if (conn.id === targetId) conn.send(message);
          }
        } else {
          this.room.broadcast(message, [sender.id]);
        }
        return;
      }
    }
  }

  // ===============================================================
  // SERVER-PUSH (HTTP from /api/process + /api/append)
  // ===============================================================

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      const state = await this.getRoomState();
      if (state.expired) {
        return this.json({ error: "Room expired" }, 410);
      }
      if (!state.data) return this.json({ error: "Not found" }, 404);
      return this.json({ data: state.data, meta: state.metadata });
    }

    if (req.method === "POST") {
      const auth = this.authorize(req);
      if (auth) return auth;

      let payload: unknown;
      try {
        payload = await req.json();
      } catch {
        return this.json({ error: "Invalid JSON" }, 400);
      }

      const data = sanitizeConversationData(payload);
      if (!data) return this.json({ error: "Invalid conversation data" }, 400);

      await this.saveData(data);
      const metadata = touchRoomMetadata(
        (await this.getMetadata()) ?? {},
      );
      await this.saveMetadata(metadata);

      // Broadcast to every connected client.
      this.room.broadcast(JSON.stringify({
        type: LIVE_MESSAGE_TYPES.CONVERSATION_UPDATE,
        data,
      }));

      return this.json({
        ok: true,
        roomId: this.room.id,
        expiresAt: metadata.expiresAt,
      });
    }

    return new Response("Method not allowed", { status: 405 });
  }

  // ===============================================================
  // HELPERS
  // ===============================================================

  private parse(message: string): unknown {
    try {
      return JSON.parse(message);
    } catch {
      return null;
    }
  }

  private field(data: unknown, key: string): unknown {
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)[key]
      : undefined;
  }

  /** Only the app server may push (Bearer token); local dev is allowed open. */
  private authorize(req: Party.Request): Response | null {
    const token = String(this.room.env?.PARTYKIT_UPDATE_TOKEN || "").trim();
    if (!token) {
      // No token configured: allow on localhost (dev), reject otherwise.
      return this.isLocal(req)
        ? null
        : this.json({ error: "Server push not configured" }, 503);
    }
    const header = req.headers.get("authorization") || "";
    const alt = req.headers.get("x-partykit-token") || "";
    const provided = header.replace(/^Bearer\s+/i, "").trim() || alt.trim();
    return provided === token ? null : this.json({ error: "Forbidden" }, 403);
  }

  private isLocal(req: Party.Request): boolean {
    const host = new URL(req.url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  }

  private async getData() {
    return (await this.room.storage.get("data")) ?? null;
  }

  private async getMetadata(): Promise<RoomMetadata | null> {
    return (await this.room.storage.get<RoomMetadata>("metadata")) ?? null;
  }

  private async getRoomState() {
    const data = await this.getData();
    const stored = await this.getMetadata();
    const metadata = stored ?? createRoomMetadata();
    return { data, metadata, expired: isRoomExpired(stored) };
  }

  private async saveData(data: unknown) {
    await this.room.storage.put("data", data);
  }

  private async saveMetadata(metadata: RoomMetadata) {
    await this.room.storage.put("metadata", metadata);
  }

  private getPresenceUser(conn: Party.Connection): PresenceUser {
    const state = conn.state as ConnectionState | null;
    return {
      id: conn.id,
      avatar: sanitizeAvatar(state?.avatar),
      alias: state?.alias,
      joinedAt: state?.joinedAt ?? Date.now(),
    };
  }

  private broadcastPresence(excludeId: string | null = null) {
    const users = Array.from(
      this.room.getConnections<ConnectionState>(),
      (c) => this.getPresenceUser(c),
    ).filter((u) => u.id !== excludeId);
    this.room.broadcast(JSON.stringify({
      type: LIVE_MESSAGE_TYPES.PRESENCE,
      data: users,
    }));
  }

  private relay(
    type: string,
    data: unknown,
    sender: Party.Connection,
    includeSender = false,
  ) {
    const message = JSON.stringify({
      type,
      data,
      sender: this.getPresenceUser(sender),
    });
    this.room.broadcast(message, includeSender ? [] : [sender.id]);
  }

  private json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
