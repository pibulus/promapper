// POST /api/supporter/checkout
// Creates a new Square Online Checkout payment link and records the pending checkout.

import { Handlers } from "$fresh/server.ts";
import {
  createSquareCheckout,
  getSupporterPrice,
  isSquareConfigured,
} from "@services/square.ts";
import { savePendingCheckout } from "@services/checkoutStore.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";

export const handler: Handlers = {
  async POST(req) {
    // Every call mints a real Square payment link and two KV rows.
    const limited = guardPublicRequest(req);
    if (limited) return limited;
    if (!isSquareConfigured()) {
      return new Response(
        JSON.stringify({
          error:
            "Square checkout is not configured yet. Supporter codes still work.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      let body: { email?: string } = {};
      try {
        body = await req.json();
      } catch {
        // empty body is fine
      }

      const checkoutId = crypto.randomUUID();
      const origin = new URL(req.url).origin;
      const redirectUrl = `${origin}/?checkout=${checkoutId}`;

      const checkout = await createSquareCheckout({
        checkoutId,
        redirectUrl,
        userEmail: body.email,
      });

      await savePendingCheckout({
        checkoutId,
        amount: checkout.amount,
        currency: checkout.currency,
        providerOrderId: checkout.providerOrderId,
        email: body.email,
      });

      return new Response(
        JSON.stringify({
          checkoutId,
          checkoutUrl: checkout.checkoutUrl,
          amount: checkout.amount,
          currency: checkout.currency,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (err) {
      console.error("[SupporterCheckout] Failed to start checkout:", err);
      const msg = err instanceof Error
        ? err.message
        : "Could not start checkout";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },

  GET() {
    const price = getSupporterPrice();
    return new Response(
      JSON.stringify({
        enabled: isSquareConfigured(),
        price: price.amount / 100,
        currency: price.currency,
        displayPrice: price.displayPrice,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
