// POST /api/square/webhook
// Square webhook handler for payment updates.
// Verifies HMAC signature, marks checkout paid, and generates signed supporter pass.

import { Handlers } from "$fresh/server.ts";
import {
  extractSquarePayment,
  getSquareConfig,
  verifySquareWebhookSignature,
} from "@services/square.ts";
import {
  findCheckoutIdByOrderId,
  markCheckoutPaid,
} from "@services/checkoutStore.ts";

export const handler: Handlers = {
  async POST(req) {
    const signature = req.headers.get("x-square-hmacsha256-signature") || "";
    const rawBody = await req.text();

    const config = getSquareConfig();
    const notificationUrl = Deno.env.get("SQUARE_WEBHOOK_NOTIFICATION_URL") ||
      `${new URL(req.url).origin}/api/square/webhook`;

    // FAIL CLOSED. This used to read "only verify signature if webhook key is
    // configured", which meant an UNSET key skipped verification entirely —
    // so any anonymous POST of a forged `payment.created` with
    // status:"COMPLETED" would mint a supporter pass. An unconfigured
    // verifier must refuse to verify, never wave traffic through.
    if (!config.webhookSignatureKey) {
      console.error(
        "[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY is not set — refusing " +
          "the webhook rather than trusting an unsigned payload.",
      );
      return new Response(
        JSON.stringify({ error: "Webhook verification is not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const isValid = await verifySquareWebhookSignature({
      rawBody,
      signature,
      notificationUrl,
    });

    if (!isValid) {
      console.warn("[SquareWebhook] Invalid signature received");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const event = JSON.parse(rawBody);
      const eventType = event?.type;

      if (eventType === "payment.updated" || eventType === "payment.created") {
        const payment = extractSquarePayment(event);
        if (payment && payment.status === "COMPLETED") {
          let checkoutId = "";

          // 1. Try finding checkout ID from order ID
          if (payment.orderId) {
            const foundId = await findCheckoutIdByOrderId(payment.orderId);
            if (foundId) checkoutId = foundId;
          }

          // 2. Try extracting from note / description if present
          if (!checkoutId) {
            const note = (event?.data?.object?.payment?.note as string) ||
              (event?.data?.object?.payment?.reference_id as string) ||
              "";
            const match = note.match(/[0-9a-fA-F-]{36}/);
            if (match) checkoutId = match[0];
          }

          if (checkoutId) {
            console.log(
              `[SquareWebhook] Payment COMPLETED for checkout: ${checkoutId}`,
            );
            await markCheckoutPaid({
              checkoutId,
              providerOrderId: payment.orderId,
              paymentId: payment.id,
              email: payment.buyerEmail,
            });
          } else {
            console.warn(
              "[SquareWebhook] Completed payment without matched checkout ID:",
              payment.id,
            );
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[SquareWebhook] Processing error:", err);
      return new Response(JSON.stringify({ error: "Processing error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
