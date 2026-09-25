// POST /api/supporter/redeem
// Validates and redeems a master code or restores an existing pass token.

import { Handlers } from "$fresh/server.ts";
import { redeemSupporterCode } from "@services/supporterPass.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";

export const handler: Handlers = {
  async POST(req) {
    // Master codes are guessable words, so guessing must cost something.
    const limited = guardPublicRequest(req);
    if (limited) return limited;
    try {
      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string" ? body.code.trim() : "";

      if (!code) {
        return new Response(
          JSON.stringify({ error: "Please enter a supporter code" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const result = await redeemSupporterCode(code);
      if (!result.valid || !result.license) {
        return new Response(
          JSON.stringify({
            error: "Invalid or expired supporter code. Check for typos.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          license: result.license,
          expires: result.exp
            ? new Date(result.exp * 1000).toISOString()
            : null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("[SupporterRedeem] Error:", err);
      return new Response(
        JSON.stringify({ error: "Redeem failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
