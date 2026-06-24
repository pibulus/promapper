/**
 * Voice Token Proxy
 *
 * Proxies room creation and session-token requests to the Cloudflare
 * Voice Relay Worker so the browser never sees the Worker's public URL.
 * Also adds local auth — only authenticated API clients can create or
 * join voice rooms.
 *
 * POST /api/live/voice-token
 *   Body: { roomId }
 *   Returns: { roomId, sessionId, iceServers, sessionToken, ttl, rtcEndpoint }
 */

import { Handlers } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";

const VOICE_RELAY_URL = (Deno.env.get("VOICE_RELAY_URL") ?? "").trim();
const VOICE_SHARED_SECRET = (Deno.env.get("VOICE_SHARED_SECRET") ?? "").trim();
const VOICE_RTC_ENDPOINT = (Deno.env.get("VOICE_RTC_ENDPOINT") ?? "").trim();
const RELAY_FETCH_TIMEOUT_MS = 10_000;

function relayHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (VOICE_SHARED_SECRET) {
    headers["X-Shared-Secret"] = VOICE_SHARED_SECRET;
  }
  return headers;
}

export const handler: Handlers = {
  async POST(req) {
    const guard = await guardRequest(req);
    if (guard) return guard;

    let body: { roomId?: string; displayName?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const roomId = (body.roomId ?? "").trim();
    const displayName = (body.displayName ?? "").trim();
    if (!roomId || roomId.length < 3 || roomId.length > 128) {
      return new Response(
        JSON.stringify({ error: "A valid roomId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // If the Voice Relay Worker isn't deployed yet, return a local-dev
    // session with public STUN servers so P2P WebRTC can still work on
    // localhost (no SFU — direct peer connections only).
    if (!VOICE_RELAY_URL) {
      return new Response(
        JSON.stringify({
          sessionId: crypto.randomUUID(),
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
          sessionToken: `local_${crypto.randomUUID()}`,
          roomId,
          ttl: 7200,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const baseUrl = VOICE_RELAY_URL.replace(/\/+$/, "");

    try {
      // Step 1: create the room (idempotent GET)
      const createCtl = new AbortController();
      const createTimer = setTimeout(
        () => createCtl.abort(),
        RELAY_FETCH_TIMEOUT_MS,
      );
      let createRes: Response;
      try {
        createRes = await fetch(
          `${baseUrl}/voice/rooms/${encodeURIComponent(roomId)}`,
          { method: "GET", headers: relayHeaders(), signal: createCtl.signal },
        );
      } finally {
        clearTimeout(createTimer);
      }

      if (!createRes.ok && createRes.status !== 201) {
        console.error("Voice relay room creation failed:", createRes.status);
        return new Response(
          JSON.stringify({ error: "Could not create voice room" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      // Step 2: get a session token (pass displayName so peers can see it)
      const joinUrl = new URL(
        `${baseUrl}/voice/rooms/${encodeURIComponent(roomId)}/join`,
      );
      if (displayName) joinUrl.searchParams.set("displayName", displayName);
      const joinCtl = new AbortController();
      const joinTimer = setTimeout(
        () => joinCtl.abort(),
        RELAY_FETCH_TIMEOUT_MS,
      );
      let joinRes: Response;
      try {
        joinRes = await fetch(
          joinUrl.toString(),
          { method: "POST", headers: relayHeaders(), signal: joinCtl.signal },
        );
      } finally {
        clearTimeout(joinTimer);
      }

      if (!joinRes.ok) {
        console.error("Voice relay join failed:", joinRes.status);
        return new Response(
          JSON.stringify({ error: "Could not join voice room" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      const session = await joinRes.json();

      // Include the Cloudflare RealtimeKit WebRTC endpoint so the client
      // knows where to send its SDP offer. (This is the SFU ingress URL;
      // typically https://rtc.live.cloudflare.com/v1/offer.)
      return new Response(
        JSON.stringify({
          ...session,
          rtcEndpoint: VOICE_RTC_ENDPOINT || undefined,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Voice relay proxy error:", error);
      return new Response(
        JSON.stringify({ error: "Voice relay unavailable" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
