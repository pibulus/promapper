/**
 * ProMapper Voice Relay — Cloudflare Worker
 *
 * Manages WebRTC audio room lifecycle via Cloudflare Realtime SFU.
 * Rooms are stored in KV. The Realtime app secret NEVER leaves this Worker:
 * /join mints a short-lived per-session token (KV-backed), and the SDP
 * offer/answer exchange with the SFU is proxied through /sdp using that
 * token. (The first cut returned the app secret to every browser as both
 * bearer token and TURN credential — anyone who ever joined a room could
 * mint sessions and admin the SFU app.)
 *
 * Endpoints:
 *   GET  /voice/rooms/:roomId        — create a room            (shared secret)
 *   POST /voice/rooms/:roomId/join   — join, mint session token (shared secret)
 *   POST /voice/rooms/:roomId/sdp    — SDP exchange proxy       (session token)
 */

interface Env {
  KV: KVNamespace;
  VOICE_SHARED_SECRET: string;
  REALTIMEKIT_APP_ID?: string;
  REALTIMEKIT_APP_SECRET?: string;
  /** Optional: Cloudflare TURN key for short-lived TURN credentials. */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

const ROOM_TTL_SECONDS = 7200; // 2 hours
const KV_TTL_SECONDS = 2592000; // 30 days
const SESSION_TTL_SECONDS = ROOM_TTL_SECONDS;

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
  if (!env.VOICE_SHARED_SECRET) {
    console.error(
      "VOICE_SHARED_SECRET is required — set it via wrangler secret put",
    );
    return false;
  }
  const auth = req.headers.get("Authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  const alt = req.headers.get("X-Shared-Secret") || "";
  return provided === env.VOICE_SHARED_SECRET ||
    alt === env.VOICE_SHARED_SECRET;
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "").trim();
}

/**
 * Short-lived TURN credentials via the Cloudflare TURN service, if a TURN key
 * is configured. Falls back to STUN-only — never to embedding a long-lived
 * secret in the browser.
 */
async function buildIceServers(env: Env): Promise<unknown[]> {
  const ice: unknown[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.TURN_KEY_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: SESSION_TTL_SECONDS }),
        },
      );
      if (res.ok) {
        const body = await res.json() as { iceServers?: unknown };
        if (body.iceServers) ice.push(body.iceServers);
      } else {
        console.error("TURN credential generation failed:", res.status);
      }
    } catch (error) {
      console.error("TURN credential generation error:", error);
    }
  }
  return ice;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const match = url.pathname.match(
      /^\/voice\/rooms\/([a-zA-Z0-9_-]{1,400})(\/join|\/sdp)?$/,
    );
    if (!match) {
      return json({ error: "Not found" }, 404, corsHeaders(origin));
    }

    const roomId = match[1];
    const action = match[2] || "";

    try {
      // ---- SDP exchange proxy (session-token auth, browser-facing) ----
      if (req.method === "POST" && action === "/sdp") {
        const sessionToken = bearer(req);
        const boundRoom = sessionToken
          ? await env.KV.get(`voice-session:${sessionToken}`)
          : null;
        if (!boundRoom || boundRoom !== roomId) {
          return json({ error: "Forbidden" }, 403, corsHeaders(origin));
        }

        const appId = env.REALTIMEKIT_APP_ID;
        const appSecret = env.REALTIMEKIT_APP_SECRET;
        if (!appId || !appSecret) {
          return json({ error: "SFU not configured" }, 503, corsHeaders(origin));
        }

        const offerSdp = await req.text();
        if (!offerSdp || offerSdp.length > 200_000) {
          return json({ error: "Bad SDP" }, 400, corsHeaders(origin));
        }

        // Forward the offer to the Realtime SFU with the secret held HERE.
        const sfuRes = await fetch(
          `https://rtc.live.cloudflare.com/v1/apps/${appId}/sessions/new`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${appSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionDescription: { type: "offer", sdp: offerSdp },
            }),
          },
        );
        if (!sfuRes.ok) {
          console.error("SFU session/new failed:", sfuRes.status);
          return json({ error: "SFU rejected offer" }, 502, corsHeaders(origin));
        }
        const sfuBody = await sfuRes.json() as {
          sessionDescription?: { sdp?: string };
        };
        const answerSdp = sfuBody.sessionDescription?.sdp;
        if (!answerSdp) {
          return json({ error: "SFU returned no answer" }, 502, corsHeaders(origin));
        }
        return new Response(answerSdp, {
          status: 200,
          headers: { "Content-Type": "application/sdp", ...corsHeaders(origin) },
        });
      }

      // ---- Room lifecycle (shared-secret auth, app-server-facing) ----
      if (!authorize(req, env)) {
        return json({ error: "Forbidden" }, 403, corsHeaders(origin));
      }

      switch (req.method) {
        case "GET": {
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

          if (!env.REALTIMEKIT_APP_ID || !env.REALTIMEKIT_APP_SECRET) {
            return json({ error: "SFU not configured" }, 503, corsHeaders(origin));
          }

          // Mint a short-lived, room-bound session token. This is the ONLY
          // credential the browser ever holds.
          const sessionToken = crypto.randomUUID();
          await env.KV.put(`voice-session:${sessionToken}`, roomId, {
            expirationTtl: SESSION_TTL_SECONDS,
          });

          return json(
            {
              sessionId: crypto.randomUUID(),
              sessionToken,
              roomId,
              displayName: url.searchParams.get("displayName") || undefined,
              ttl: ROOM_TTL_SECONDS,
              // The browser talks to THIS worker, never to the SFU directly.
              rtcEndpoint: `${url.origin}/voice/rooms/${roomId}/sdp`,
              iceServers: await buildIceServers(env),
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
