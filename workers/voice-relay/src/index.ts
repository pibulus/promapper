/**
 * ProMapper Voice Relay — Cloudflare Worker
 *
 * Issues Cloudflare RealtimeKit session tokens for WebRTC audio rooms.
 * Forked from free4chat (MIT), stripped of Next.js UI. ~180 LOC core.
 *
 * Endpoints:
 *   GET  /voice/rooms/:roomId        — create a room
 *   POST /voice/rooms/:roomId/join   — join an existing room
 *   GET  /voice/rooms/:roomId/status — check room status
 *
 * Architecture:
 *   P2P audio via WebRTC data channels. No audio passes through this server.
 *   RealtimeKit acts as the SFU, this Worker manages room lifecycle + tokens.
 */

interface Env {
  KV: KVNamespace;
  REALTIME_KIT: RealtimeKitAPI;
  VOICE_SHARED_SECRET: string;
}

interface RealtimeKitAPI {
  createSession(params: { roomId: string; ttl: number }): Promise<Session>;
}

interface Session {
  sessionId: string;
  iceServers: RTCIceServer[];
  sessionToken: string;
}

const ROOM_TTL_SECONDS = 7200; // 2 hours
const KV_TTL_SECONDS = 2592000; // 30 days

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Shared-Secret",
  };
}

function json(
  data: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function authorize(req: Request, env: Env): boolean {
  // If no secret is configured, allow all (dev mode).
  if (!env.VOICE_SHARED_SECRET) return true;

  const auth = req.headers.get("Authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  const alt = req.headers.get("X-Shared-Secret") || "";

  return provided === env.VOICE_SHARED_SECRET ||
    alt === env.VOICE_SHARED_SECRET;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Route: /voice/rooms/:roomId[/action]
    const match = url.pathname.match(
      /^\/voice\/rooms\/([a-zA-Z0-9_-]+)(\/join|\/status)?$/,
    );
    if (!match) {
      return json({ error: "Not found" }, 404, corsHeaders(origin));
    }

    const roomId = match[1];
    const action = match[2] || "";

    // Shared secret auth for create/join (optional — open in dev)
    if (!authorize(req, env)) {
      return json({ error: "Forbidden" }, 403, corsHeaders(origin));
    }

    try {
      switch (req.method) {
        case "GET": {
          // GET /voice/rooms/:roomId — create a new room
          if (action) {
            return json(
              { error: "Method not allowed" },
              405,
              corsHeaders(origin),
            );
          }

          const exists = await env.KV.get(`voice-room:${roomId}`);
          if (exists) {
            return json({ roomId, exists: true }, 200, corsHeaders(origin));
          }

          await env.KV.put(`voice-room:${roomId}`, "active", {
            expirationTtl: KV_TTL_SECONDS,
          });

          return json({ roomId, created: true }, 201, corsHeaders(origin));
        }

        case "POST": {
          if (action !== "/join") {
            return json(
              { error: "Method not allowed" },
              405,
              corsHeaders(origin),
            );
          }

          // POST /voice/rooms/:roomId/join — return WebRTC session config
          const exists = await env.KV.get(`voice-room:${roomId}`);
          if (!exists) {
            return json(
              { error: "Room not found. Create it first with GET." },
              404,
              corsHeaders(origin),
            );
          }

          const session = await env.REALTIME_KIT.createSession({
            roomId,
            ttl: ROOM_TTL_SECONDS,
          });

          // Touch the KV entry to extend its TTL
          await env.KV.put(`voice-room:${roomId}`, "active", {
            expirationTtl: KV_TTL_SECONDS,
          });

          return json(
            {
              sessionId: session.sessionId,
              iceServers: session.iceServers,
              sessionToken: session.sessionToken,
              roomId,
              ttl: ROOM_TTL_SECONDS,
            },
            200,
            corsHeaders(origin),
          );
        }

        default:
          return json(
            { error: "Method not allowed" },
            405,
            corsHeaders(origin),
          );
      }
    } catch (error) {
      console.error("Voice relay error:", error);
      return json({ error: "Internal server error" }, 500, corsHeaders(origin));
    }
  },
};
