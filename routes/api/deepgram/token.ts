/**
 * Deepgram Browser Token Endpoint
 *
 * Mints short-lived ephemeral tokens so the browser can connect directly
 * to Deepgram's live streaming WebSocket (wss://api.deepgram.com/v1/listen)
 * without exposing the master DEEPGRAM_API_KEY.
 */

import { Handlers } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { mintDeepgramToken } from "@services/deepgram.ts";

export const handler: Handlers = {
  async GET(req) {
    const guard = await guardRequest(req);
    if (guard) return guard;

    try {
      const result = await mintDeepgramToken(60);
      if (!result) {
        return new Response(
          JSON.stringify({ error: "Deepgram key not configured on server" }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          token: result.token,
          expires_in: result.expiresIn,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    } catch (err) {
      console.error("Failed to mint Deepgram token:", err);
      return new Response(
        JSON.stringify({ error: "Failed to mint live transcription token" }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  },
};
