/**
 * Party Updates — server-side push of AI results into a live room.
 *
 * After /api/process or /api/append computes a result, if the request carried a
 * roomId we POST the conversation snapshot to the PartyKit room so every
 * connected client gets it in real time. No-ops silently when PartyKit isn't
 * configured (PARTYKIT_HOST unset), so single-player flows are unaffected.
 */

import type { ConversationFlowResult } from "@core/orchestration/conversation-flow.ts";

function partyHost(): string {
  return (Deno.env.get("PARTYKIT_HOST") ??
    Deno.env.get("PUBLIC_PARTYKIT_HOST") ?? "").trim();
}

/** Map a flow result into the conversation-snapshot shape the room sanitizes. */
function toSnapshot(result: ConversationFlowResult) {
  return {
    conversation: result.conversation,
    transcript: result.transcript,
    nodes: result.nodes,
    edges: result.edges,
    actionItems: result.actionItems,
    statusUpdates: result.statusUpdates,
    summary: result.summary,
  };
}

/**
 * POST a raw conversation snapshot to a room. Returns true on success.
 * Shared by result-push and room-creation. Never throws.
 */
export async function pushSnapshotToRoom(
  roomId: string | null | undefined,
  snapshot: unknown,
): Promise<boolean> {
  if (!roomId) return false;
  const host = partyHost();
  if (!host) return false; // PartyKit not configured.

  // The documented config is scheme-less (`PUBLIC_PARTYKIT_HOST=localhost:1999`
  // — PartySocket accepts that), but server-side fetch() needs a real URL, so
  // add the scheme here: plain http for local dev, https for anything else.
  const bare = host.replace(/\/+$/, "");
  const base = /^https?:\/\//.test(bare)
    ? bare
    : `${
      /^(localhost|127\.0\.0\.1)(:|$)/.test(bare) ? "http" : "https"
    }://${bare}`;
  const url = `${base}/parties/conversation/${encodeURIComponent(roomId)}`;
  const token = Deno.env.get("PARTYKIT_UPDATE_TOKEN")?.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-partykit-token": token } : {}),
      },
      body: JSON.stringify(snapshot),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[party] push failed (${res.status}) for room ${roomId}`);
    }
    return res.ok;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`[party] push timed out for room ${roomId}`);
    } else {
      console.error("[party] push error:", error);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Push an AI flow result to the room. Best-effort; never throws into the
 * request path. No-ops when no roomId or PartyKit isn't configured.
 */
export async function pushResultToRoom(
  roomId: string | null | undefined,
  result: ConversationFlowResult,
): Promise<void> {
  if (!roomId) return;
  await pushSnapshotToRoom(roomId, toSnapshot(result));
}
