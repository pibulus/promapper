/**
 * ProMapper Voice Relay — Cloudflare Worker
 *
 * Manages WebRTC audio room lifecycle via Cloudflare Realtime SFU.
 * Rooms are stored in KV. Clients connect directly to the SFU using
 * the App API Token returned by the join endpoint.
 *
 * Endpoints:
 *   GET  /voice/rooms/:roomId        — create a room
 *   POST /voice/rooms/:roomId/join   — join an existing room
 */

interface Env {
  KV: KVNamespace;
  VOICE_SHARED_SECRET: string;
  REALTIMEKIT_APP_ID?: string;
  REALTIMEKIT_APP_SECRET?: string;
}

const ROOM_TTL_SECONDS = 7200; // 2 hours
const KV_TTL_SECONDS = 2592000; // 30 days

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shared-Secret",
  };
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function authorize(req: Request, env: Env): boolean {
  if (!env.VOICE_SHARED_SECRET) return true;
  const auth = req.headers.get("Authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  const alt = req.headers.get("X-Shared-Secret") || "";
  return provided === env.VOICE_SHARED_SECRET || alt === env.VOICE_SHARED_SECRET;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const match = url.pathname.match(
      /^\/voice\/rooms\/([a-zA-Z0-9_-]+)(\/join)?$/,
    );
    if (!match) {
      return json({ error: "Not found" }, 404, corsHeaders(origin));
    }

    const roomId = match[1];
    const action = match[2] || "";

    if (!authorize(req, env)) {
      return json({ error: "Forbidden" }, 403, corsHeaders(origin));
    }

    try {
      switch (req.method) {
        case "GET": {
          if (action) {
            return json({ error: "Method not allowed" }, 405, corsHeaders(origin));
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
            return json({ error: "Method not allowed" }, 405, corsHeaders(origin));
          }

          const exists = await env.KV.get(`voice-room:${roomId}`);
          if (!exists) {
            return json(
              { error: "Room not found. Create it first with GET." },
              404,
              corsHeaders(origin),
            );
          }

          await env.KV.put(`voice-room:${roomId}`, "active", {
            expirationTtl: KV_TTL_SECONDS,
          });

          const appId = env.REALTIMEKIT_APP_ID;
          const appSecret = env.REALTIMEKIT_APP_SECRET;

          if (!appId || !appSecret) {
            return json(
              { error: "SFU not configured" },
              503,
              corsHeaders(origin),
            );
          }

          // Return SFU credentials — the client connects directly to the SFU.
          // Each join gets a unique sessionId for tracking. The sfuToken is the
          // app secret (needed by WebRTC to auth with the Cloudflare SFU).
          return json(
            {
              sessionId: crypto.randomUUID(),
              sfuToken: appSecret,
              roomId,
              ttl: ROOM_TTL_SECONDS,
              sfuAppId: appId,
              rtcEndpoint: `https://rtc.live.cloudflare.com/v1/apps/${appId}`,
              iceServers: [
                { urls: "stun:stun.cloudflare.com:3478" },
                { urls: "turn:turn.cloudflare.com:3478", username: appId, credential: appSecret },
              ],
            },
            200,
            corsHeaders(origin),
          );
        }

        default:
          return json({ error: "Method not allowed" }, 405, corsHeaders(origin));
      }
    } catch (error) {
      console.error("Voice relay error:", error);
      return json({ error: "Internal server error" }, 500, corsHeaders(origin));
    }
  },
};
