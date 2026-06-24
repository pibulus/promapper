import { Handlers } from "$fresh/server.ts";
import { getShareStore } from "@core/realtime/shareStore.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";
import { guardRequest } from "@services/requestGuard.ts";

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = await guardRequest(req);
      if (guardResponse) return guardResponse;

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
      return jsonResponse(
        {
          error: error instanceof Error
            ? error.message
            : "Could not create share.",
        },
        500,
      );
    }
  },
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
