/**
 * ProMapper live collaboration — Cloudflare Durable Object.
 *
 * Ported from the PartyKit room (party/conversationRoom.ts) after PartyKit's
 * SHARED partykit.dev zone hit Cloudflare's 10,000-custom-domains-per-zone
 * ceiling, permanently blocking deploys. DO is the primitive PartyKit wraps, so
 * the mapping is nearly 1:1 and the WIRE PROTOCOL IS UNCHANGED — the client
 * only swaps its connection URL.
 *
 * PartyKit -> Durable Object:
 *   onConnect(conn, ctx)  -> fetch() 101 upgrade + acceptWebSocket(server)
 *   onMessage(msg, sender)-> webSocketMessage(ws, msg)
 *   onClose / onError     -> webSocketClose / webSocketError
 *   onRequest(req)        -> fetch() non-upgrade branch
 *   room.storage          -> ctx.storage
 *   conn.setState/state   -> ws.serializeAttachment/deserializeAttachment
 *   room.broadcast        -> manual loop over ctx.getWebSockets()
 *
 * HIBERNATION: we use the WebSocket Hibernation API, so the DO can be evicted
 * from memory while sockets stay open (cheaper, and survives idle meetings).
 * That is exactly why per-connection state lives in the socket ATTACHMENT and
 * not on an instance field — instance fields do not survive hibernation, and a
 * revived DO must still be able to report everyone's avatar in presence.
 */

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

export interface Env {
  CONVERSATION_ROOM: DurableObjectNamespace;
  /** Bearer token the ProMapper app server must present to push snapshots. */
  PARTYKIT_UPDATE_TOKEN?: string;
}

interface PresenceUser {
  id: string;
  avatar: string;
  alias?: string;
  joinedAt: number;
}

/** Survives hibernation via serializeAttachment. `id` replaces conn.id. */
type ConnectionState = {
  id: string;
  avatar: string;
  alias?: string;
  joinedAt: number;
};

export class ConversationRoom {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  // ===============================================================
  // ENTRY POINT — WebSocket upgrade + server-push HTTP
  // ===============================================================

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return await this.handleUpgrade(req);
    }
    return await this.handleRequest(req);
  }

  /** PartyKit onConnect equivalent. */
  private async handleUpgrade(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const state = await this.getRoomState();

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // An expired room is closed immediately — but we must still return a 101,
    // because a browser WebSocket that gets a non-101 surfaces an opaque
    // "connection failed" instead of our 4005 code, and the client's
    // room-expired UI keys off that code.
    if (state.expired) {
      this.ctx.acceptWebSocket(server);
      server.close(LIVE_CLOSE_CODES.ROOM_EXPIRED, "This live room has expired");
      return new Response(null, { status: 101, webSocket: client });
    }

    const connState: ConnectionState = {
      id: crypto.randomUUID(),
      avatar: sanitizeAvatar(url.searchParams.get("avatar")),
      alias: sanitizeAlias(url.searchParams.get("alias")),
      joinedAt: Date.now(),
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(connState);

    server.send(JSON.stringify({
      type: LIVE_MESSAGE_TYPES.INIT,
      data: state.data,
      meta: state.metadata,
      whiteboard: await this.getWhiteboard(),
    }));

    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  // ===============================================================
  // CLIENT MESSAGES (PartyKit onMessage)
  // ===============================================================

  async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string) {
    const message = typeof raw === "string" ? raw : new TextDecoder().decode(raw);

    // Prevent OOM from oversized WebSocket messages.
    if (message.length > 1_000_000) {
      ws.close(4009, "Message too large");
      return;
    }

    const state = await this.getRoomState();
    if (state.expired) {
      ws.close(LIVE_CLOSE_CODES.ROOM_EXPIRED, "This live room has expired");
      return;
    }

    const normalized = normalizeLiveMessage(this.parse(message));
    if (!normalized) return;

    switch (normalized.type) {
      case LIVE_MESSAGE_TYPES.CONVERSATION_UPDATE: {
        const data = sanitizeConversationData(normalized.data);
        if (!data) return;
        await this.saveData(data);
        const metadata = touchRoomMetadata(state.metadata ?? {});
        metadata.rev = (state.metadata?.rev ?? 0) + 1;
        await this.saveMetadata(metadata);
        this.relay(
          LIVE_MESSAGE_TYPES.CONVERSATION_UPDATE,
          data,
          ws,
          false,
          metadata.rev,
        );
        // Ack the sender with the new rev — relays exclude the sender, so
        // without this a client never learns the rev of its OWN write.
        ws.send(JSON.stringify({
          type: LIVE_MESSAGE_TYPES.UPDATE_ACK,
          rev: metadata.rev,
        }));
        return;
      }
      case LIVE_MESSAGE_TYPES.CHAT: {
        const text = sanitizeChatText(this.field(normalized.data, "text"));
        if (!text) return;
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.relay(
          LIVE_MESSAGE_TYPES.CHAT,
          { text, at: Date.now() },
          ws,
          /* includeSender */ true,
        );
        return;
      }
      case LIVE_MESSAGE_TYPES.RENAME: {
        const alias = sanitizeAlias(this.field(normalized.data, "alias"));
        const current = this.stateOf(ws);
        ws.serializeAttachment({ ...current, alias });
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.broadcastPresence();
        return;
      }
      case LIVE_MESSAGE_TYPES.TYPING_START:
      case LIVE_MESSAGE_TYPES.TYPING_STOP: {
        // Transient presence-only signal — drop the (uncapped) client payload.
        this.relay(normalized.type, undefined, ws);
        return;
      }
      case LIVE_MESSAGE_TYPES.WHITEBOARD_UPDATE: {
        const scene = this.field(normalized.data, "scene");
        if (typeof scene !== "string" || scene.length > 500_000) return;
        await this.ctx.storage.put("whiteboard", scene);
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.relay(LIVE_MESSAGE_TYPES.WHITEBOARD_UPDATE, { scene }, ws);
        return;
      }
      case LIVE_MESSAGE_TYPES.TRANSCRIPT_CHUNK: {
        const text = this.field(normalized.data, "text");
        const speakers = this.field(normalized.data, "speakers");
        const chunkId = this.field(normalized.data, "chunkId");
        if (typeof text !== "string" || text.length > 8000) return;
        await this.saveMetadata(touchRoomMetadata(state.metadata ?? {}));
        this.relay(LIVE_MESSAGE_TYPES.TRANSCRIPT_CHUNK, {
          text,
          speakers: Array.isArray(speakers)
            ? speakers.filter((s): s is string => typeof s === "string")
              .map((s) => s.slice(0, 100)).slice(0, 50)
            : [],
          chunkId: typeof chunkId === "string" ? chunkId : String(Date.now()),
          at: Date.now(),
        }, ws);
        return;
      }
    }
  }

  /** PartyKit onClose. The socket is already gone from getWebSockets() by the
   * time this runs in some paths, so we exclude explicitly like PartyKit did. */
  webSocketClose(ws: WebSocket) {
    this.broadcastPresence(this.stateOf(ws).id);
  }

  /** PartyKit onError — runtime-forced disconnects (oversized frame, socket
   * error) skip the close path, leaving a ghost peer in everyone's roster. */
  webSocketError(ws: WebSocket) {
    this.broadcastPresence(this.stateOf(ws).id);
  }

  // ===============================================================
  // SERVER-PUSH (HTTP from /api/process + /api/append + /api/live/create)
  // ===============================================================

  private async handleRequest(req: Request): Promise<Response> {
    if (req.method === "GET") {
      const state = await this.getRoomState();
      if (state.expired) return this.json({ error: "Room expired" }, 410);
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
      const stored = await this.getMetadata();
      const metadata = touchRoomMetadata(stored ?? {});
      metadata.rev = (stored?.rev ?? 0) + 1;
      await this.saveMetadata(metadata);

      this.broadcast(JSON.stringify({
        type: LIVE_MESSAGE_TYPES.CONVERSATION_UPDATE,
        data,
        rev: metadata.rev,
      }));

      return this.json({ ok: true, expiresAt: metadata.expiresAt });
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

  /** Only the app server may push (Bearer token). Unlike PartyKit there is no
   * "localhost" case — a deployed Worker is never local, so an unset token
   * fails closed rather than silently accepting anonymous pushes. */
  private authorize(req: Request): Response | null {
    const token = String(this.env.PARTYKIT_UPDATE_TOKEN || "").trim();
    if (!token) return this.json({ error: "Server push not configured" }, 503);
    const header = req.headers.get("authorization") || "";
    const alt = req.headers.get("x-partykit-token") || "";
    const provided = header.replace(/^Bearer\s+/i, "").trim() || alt.trim();
    if (!provided) return this.json({ error: "Forbidden" }, 403);
    return this.timingSafeEqual(provided, token)
      ? null
      : this.json({ error: "Forbidden" }, 403);
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return result === 0;
  }

  private stateOf(ws: WebSocket): ConnectionState {
    const raw = ws.deserializeAttachment() as ConnectionState | null;
    return raw ?? { id: "unknown", avatar: "Guest", joinedAt: Date.now() };
  }

  private async getData() {
    return (await this.ctx.storage.get("data")) ?? null;
  }

  private async getWhiteboard(): Promise<string | null> {
    const scene = await this.ctx.storage.get("whiteboard");
    return typeof scene === "string" ? scene : null;
  }

  private async getMetadata(): Promise<RoomMetadata | null> {
    return (await this.ctx.storage.get<RoomMetadata>("metadata")) ?? null;
  }

  private async getRoomState() {
    const data = await this.getData();
    const stored = await this.getMetadata();
    const metadata = stored ?? createRoomMetadata();
    return { data, metadata, expired: isRoomExpired(stored) };
  }

  private async saveData(data: unknown) {
    await this.ctx.storage.put("data", data);
  }

  private async saveMetadata(metadata: RoomMetadata) {
    await this.ctx.storage.put("metadata", metadata);
  }

  private getPresenceUser(ws: WebSocket): PresenceUser {
    const state = this.stateOf(ws);
    return {
      id: state.id,
      avatar: sanitizeAvatar(state.avatar),
      alias: state.alias,
      joinedAt: state.joinedAt ?? Date.now(),
    };
  }

  private broadcast(message: string, excludeIds: string[] = []) {
    for (const ws of this.ctx.getWebSockets()) {
      if (excludeIds.length && excludeIds.includes(this.stateOf(ws).id)) continue;
      try {
        ws.send(message);
      } catch {
        // Socket died mid-broadcast; the close handler will clean up presence.
      }
    }
  }

  private broadcastPresence(excludeId: string | null = null) {
    const users = this.ctx.getWebSockets()
      .map((ws) => this.getPresenceUser(ws))
      .filter((u) => u.id !== excludeId);
    this.broadcast(
      JSON.stringify({ type: LIVE_MESSAGE_TYPES.PRESENCE, data: users }),
      excludeId ? [excludeId] : [],
    );
  }

  private relay(
    type: string,
    data: unknown,
    sender: WebSocket,
    includeSender = false,
    rev?: number,
  ) {
    const senderId = this.stateOf(sender).id;
    const message = JSON.stringify({
      type,
      data,
      sender: this.getPresenceUser(sender),
      ...(typeof rev === "number" ? { rev } : {}),
    });
    this.broadcast(message, includeSender ? [] : [senderId]);
  }

  private json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ===================================================================
// WORKER ROUTER
// ===================================================================

/**
 * Routes to a room DO by id. The path shape is kept IDENTICAL to PartyKit's
 * (`/parties/conversation/<roomId>`) so the existing client and the app
 * server's push URL builder work unchanged — that path is the whole reason
 * this migration touches so little application code.
 */
const ROOM_PATH = /^\/parties\/conversation\/([A-Za-z0-9_-]{3,128})$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "promapper-collab" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const match = ROOM_PATH.exec(url.pathname);
    if (!match) return new Response("Not found", { status: 404 });

    const roomId = match[1];
    // idFromName is deterministic: the same room id always resolves to the
    // same DO instance globally, which is what makes this a shared room.
    const id = env.CONVERSATION_ROOM.idFromName(roomId);
    return await env.CONVERSATION_ROOM.get(id).fetch(req);
  },
};
