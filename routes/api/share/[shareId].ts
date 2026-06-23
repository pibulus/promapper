import { Handlers } from "$fresh/server.ts";
import { getShareStore } from "@core/realtime/shareStore.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    // Shares are public (no auth/origin), but rate-limit so a known shareId
    // can't be hammered without bound.
    const rateBlock = guardPublicRequest(req);
    if (rateBlock) return rateBlock;

    try {
      const shareId = ctx.params.shareId;
      const record = await getShareStore().get(shareId);

      if (!record) {
        return jsonResponse({ error: "Share not found." }, 404);
      }

      return jsonResponse({
        shareId: record.metadata.shareId,
        sharedAt: record.metadata.createdAt,
        expiresAt: record.metadata.expiresAt,
        data: record.data,
      });
    } catch (error) {
      console.error("[ShareRead] Failed to load share:", error);
      return jsonResponse(
        {
          error: error instanceof Error
            ? error.message
            : "Could not load share.",
        },
        500,
      );
    }
  },
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
