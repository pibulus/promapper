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

function publicHost(): string {
  return (Deno.env.get("PUBLIC_PARTYKIT_HOST") ??
    Deno.env.get("PARTYKIT_HOST") ?? "").trim();
}

export const handler: Handlers = {
  async POST(req) {
    const guard = guardRequest(req);
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
    const roomId = `cm_${crypto.randomUUID()}`;

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
