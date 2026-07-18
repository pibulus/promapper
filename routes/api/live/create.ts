/**
 * Live Room Creation
 *
 * Creates a live-collab room from the current conversation: generates a room id,
 * pushes the conversation snapshot to PartyKit (so joiners get it immediately),
 * and returns the room id + public host for the client to navigate to.
 */

import { Handlers } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { pushSnapshotToRoom } from "@services/partyUpdates.ts";
import { generateShareRoomId } from "@core/realtime/shareProtocol.ts";

function publicHost(): string {
  return (Deno.env.get("PUBLIC_PARTYKIT_HOST") ??
    Deno.env.get("PARTYKIT_HOST") ?? "").trim();
}

export const handler: Handlers = {
  async POST(req) {
    const guard = await guardRequest(req);
    if (guard) return guard;

    const host = publicHost();
    if (!host) {
      return new Response(
        JSON.stringify({ error: "Live collaboration is not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const conversation = (body as { conversation?: unknown })?.conversation;
    // Short, cute room ids (cm_ + 14 base36 chars ≈ 72 bits) instead of a
    // 36-char UUID — the link is the key, so entropy stays well above the
    // 48-bit floor while the URL stops looking like a hash dump. Every consumer
    // (live route sanitizer, sanitizeShareLive, voice-token) accepts
    // [A-Za-z0-9_-]{3,64}. The PartyKit worker is not deployed yet, so the wire
    // format is free to change. Old UUID rooms keep resolving (lookup is exact).
    const roomId = generateShareRoomId();

    // Seed the room with the current snapshot so the first joiner sees it.
    const pushed = await pushSnapshotToRoom(roomId, conversation);
    if (!pushed) {
      return new Response(
        JSON.stringify({ error: "Could not create live room" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ roomId, host }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
