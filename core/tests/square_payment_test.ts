// Square payment and webhook verification test suite.

import { assertEquals, assertNotEquals } from "./_assert.ts";
import {
  extractSquarePayment,
  getSupporterPrice,
  verifySquareWebhookSignature,
} from "../../services/square.ts";

Deno.test("getSupporterPrice returns $49 AUD default", () => {
  const price = getSupporterPrice();
  assertEquals(price.amount, 4900);
  assertEquals(price.currency, "AUD");
  assertEquals(price.displayPrice, "$49");
});

Deno.test("verifySquareWebhookSignature validates authentic HMAC signature", async () => {
  const sigKey = "square-signature-key-test-123";
  Deno.env.set("SQUARE_WEBHOOK_SIGNATURE_KEY", sigKey);

  const notificationUrl = "https://promapper.app/api/square/webhook";
  const rawBody = JSON.stringify({
    type: "payment.updated",
    data: { object: { payment: { id: "pay-1" } } },
  });

  // Generate valid Square signature: HMAC-SHA256(notificationUrl + rawBody)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sigKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const payload = `${notificationUrl}${rawBody}`;
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  let binary = "";
  const bytes = new Uint8Array(sigBuf);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const validSignature = btoa(binary);

  const isValid = await verifySquareWebhookSignature({
    rawBody,
    signature: validSignature,
    notificationUrl,
  });
  assertEquals(isValid, true);

  // Tampered body fails
  const tamperedValid = await verifySquareWebhookSignature({
    rawBody: rawBody + " ",
    signature: validSignature,
    notificationUrl,
  });
  assertEquals(tamperedValid, false);
});

Deno.test("extractSquarePayment parses payment event correctly", () => {
  const event = {
    type: "payment.updated",
    data: {
      object: {
        payment: {
          id: "PAYMENT_12345",
          order_id: "ORDER_ABCDE",
          status: "COMPLETED",
          buyer_email_address: "supporter@test.com",
          amount_money: { amount: 4900, currency: "AUD" },
        },
      },
    },
  };

  const parsed = extractSquarePayment(event);
  assertNotEquals(parsed, null);
  assertEquals(parsed?.id, "PAYMENT_12345");
  assertEquals(parsed?.orderId, "ORDER_ABCDE");
  assertEquals(parsed?.status, "COMPLETED");
  assertEquals(parsed?.buyerEmail, "supporter@test.com");
  assertEquals(parsed?.amountMoney?.amount, 4900);
});
