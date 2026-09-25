// Checkout Store KV persistence and payment transition test suite.

import { assertEquals, assertNotEquals } from "./_assert.ts";
import {
  findCheckoutIdByOrderId,
  getCheckout,
  markCheckoutPaid,
  savePendingCheckout,
} from "../../services/checkoutStore.ts";
import { verifySupporterPass } from "../../services/supporterPass.ts";

Deno.test("savePendingCheckout and getCheckout manage checkout records", async () => {
  const checkoutId = `test-chk-${Date.now()}`;
  const orderId = `order-${Date.now()}`;

  const saved = await savePendingCheckout({
    checkoutId,
    amount: 4900,
    currency: "AUD",
    providerOrderId: orderId,
    email: "pablo@promapper.app",
  });

  assertEquals(saved.status, "pending");
  assertEquals(saved.checkoutId, checkoutId);

  const retrieved = await getCheckout(checkoutId);
  assertNotEquals(retrieved, null);
  assertEquals(retrieved?.status, "pending");
  assertEquals(retrieved?.amount, 4900);

  const foundId = await findCheckoutIdByOrderId(orderId);
  assertEquals(foundId, checkoutId);
});

Deno.test("markCheckoutPaid generates signed license token and transitions status", async () => {
  const checkoutId = `paid-chk-${Date.now()}`;

  await savePendingCheckout({
    checkoutId,
    amount: 4900,
    currency: "AUD",
    email: "crew@promapper.app",
  });

  const paid = await markCheckoutPaid({
    checkoutId,
    paymentId: "sq-pay-999",
  });

  assertNotEquals(paid, null);
  assertEquals(paid?.status, "paid");
  assertNotEquals(paid?.licenseToken, undefined);

  // Verify the attached license token
  const verified = await verifySupporterPass(paid?.licenseToken);
  assertNotEquals(verified, null);
  assertEquals(verified?.tier, "supporter");
  assertEquals(verified?.checkoutId, checkoutId);
});

Deno.test("a repeated COMPLETED webhook keeps the first pass", async () => {
  const checkoutId = `twice-chk-${Date.now()}`;
  await savePendingCheckout({ checkoutId, amount: 4900, currency: "AUD" });
  const first = await markCheckoutPaid({ checkoutId, paymentId: "sq-1" });
  const again = await markCheckoutPaid({ checkoutId, paymentId: "sq-1" });
  assertEquals(again?.licenseToken, first?.licenseToken);
  assertEquals(again?.paidAt, first?.paidAt);
});
