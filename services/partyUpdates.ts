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
 * Push a result to the room. Best-effort: never throws into the request path.
 */
export async function pushResultToRoom(
  roomId: string | null | undefined,
  result: ConversationFlowResult,
): Promise<void> {
  if (!roomId) return;
  const host = partyHost();
  if (!host) return; // PartyKit not configured — single-player, skip silently.

  const base = host.replace(/\/+$/, "");
  const url = `${base}/parties/conversation/${encodeURIComponent(roomId)}`;
  const token = Deno.env.get("PARTYKIT_UPDATE_TOKEN")?.trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-partykit-token": token } : {}),
      },
      body: JSON.stringify(toSnapshot(result)),
    });
    if (!res.ok) {
      console.error(`[party] push failed (${res.status}) for room ${roomId}`);
    }
  } catch (error) {
    console.error("[party] push error:", error);
  }
}
