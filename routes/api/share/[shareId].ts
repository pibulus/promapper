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
      // Real share ids are "cm_" + either a short base36 slug (new, 14 chars,
      // from generateShareRoomId) or a legacy 36-char UUID. Rejecting junk here
      // avoids a pointless Supabase round-trip per request on a public endpoint.
      // NOTE: the old gate was /^cm_[0-9a-fA-F-]{36}$/ which only matched UUIDs
      // and 404'd every new short share id — this broadening fixes that.
      if (!/^cm_[A-Za-z0-9-]{8,40}$/.test(shareId)) {
        return jsonResponse({ error: "Share not found." }, 404);
      }
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
      // Log the detail server-side; never forward provider/DB messages to an
      // unauthenticated caller.
      console.error("[ShareRead] Failed to load share:", error);
      return jsonResponse({ error: "Could not load share." }, 500);
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
