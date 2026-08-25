// GET /api/supporter/checkout/[checkoutId]
// Polls checkout status when redirected back from Square.

import { Handlers } from "$fresh/server.ts";
import { getCheckout } from "@services/checkoutStore.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const checkoutId = ctx.params.checkoutId;
    if (!checkoutId) {
      return new Response(
        JSON.stringify({ error: "Missing checkout ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const checkout = await getCheckout(checkoutId);
    if (!checkout) {
      return new Response(
        JSON.stringify({ error: "Checkout not found", status: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        checkoutId: checkout.checkoutId,
        status: checkout.status,
        license: checkout.status === "paid" ? checkout.licenseToken : null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
