import { Handlers } from "$fresh/server.ts";
import { getShareStore } from "@core/realtime/shareStore.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";
import { guardRequest } from "@services/requestGuard.ts";

// Sanitized share payloads top out well under 1MB (160KB transcript + capped
// nodes/edges/items), so 5MB of raw JSON is already generous. Reject bigger
// bodies before req.json() buffers them into memory.
const MAX_SHARE_BODY_BYTES = 5_242_880;

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = await guardRequest(req);
      if (guardResponse) return guardResponse;

      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl, 10) > MAX_SHARE_BODY_BYTES) {
        return jsonResponse({ error: "Share payload too large." }, 413);
      }

      const body = await req.json();
      const data = body?.data;
      const ttlDays = Number(body?.ttlDays ?? 30);
      const ttlMs = Number.isFinite(ttlDays) && ttlDays > 0
        ? Math.min(ttlDays, 30) * 24 * 60 * 60 * 1000
        : SHARE_ROOM_LIMITS.DEFAULT_TTL_MS;

      const record = await getShareStore().create(data, { ttlMs });

      return jsonResponse({
        shareId: record.metadata.shareId,
        expiresAt: record.metadata.expiresAt,
      });
    } catch (error) {
      console.error("[ShareCreate] Failed to create share:", error);
      // Payload-validation failures are the caller's fault and safe to name;
      // everything else (Supabase/provider errors) stays server-side only so
      // DB internals never reach the client.
      if (
        error instanceof Error &&
        error.message === "Invalid conversation share payload."
      ) {
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ error: "Could not create share." }, 500);
    }
  },
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
