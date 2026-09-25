// Supporter Pass cryptographic verification and redemption test suite.

import { assertEquals, assertNotEquals } from "./_assert.ts";
import {
  redeemSupporterCode,
  signSupporterPass,
  verifySupporterPass,
} from "../../services/supporterPass.ts";

const TEST_SECRET = "test-secret-promapper-2026";

Deno.test("signSupporterPass generates a valid 3-part token", async () => {
  const token = await signSupporterPass({
    checkoutId: "test-checkout-123",
    email: "pablo@example.com",
    secret: TEST_SECRET,
  });

  assertNotEquals(token, "");
  const parts = token.split(".");
  assertEquals(parts.length, 3);
  assertEquals(parts[0], "promapper-pass-v1");
});

Deno.test("verifySupporterPass validates a freshly signed token", async () => {
  const token = await signSupporterPass({
    checkoutId: "test-chk-456",
    email: "tester@promapper.app",
    durationDays: 30,
    secret: TEST_SECRET,
  });

  const payload = await verifySupporterPass(token, TEST_SECRET);
  assertNotEquals(payload, null);
  assertEquals(payload?.tier, "supporter");
  assertEquals(payload?.checkoutId, "test-chk-456");
  assertEquals(payload?.email, "tester@promapper.app");
});

Deno.test("verifySupporterPass rejects tampered tokens", async () => {
  const token = await signSupporterPass({
    checkoutId: "valid-1",
    secret: TEST_SECRET,
  });

  const parts = token.split(".");
  // Tamper payload
  const tamperedPayload = `${
    parts[0]
  }.eyJ0aWVyIjoic3VwcG9ydGVyIiwiZXhwIjoyOTk5OTk5OTk5fQ.${parts[2]}`;
  const res1 = await verifySupporterPass(tamperedPayload, TEST_SECRET);
  assertEquals(res1, null);

  // Tamper signature
  const tamperedSig = `${parts[0]}.${parts[1]}.bad-signature-data-here`;
  const res2 = await verifySupporterPass(tamperedSig, TEST_SECRET);
  assertEquals(res2, null);

  // Wrong secret
  const res3 = await verifySupporterPass(token, "different-wrong-secret");
  assertEquals(res3, null);
});

Deno.test("verifySupporterPass rejects expired passes", async () => {
  const token = await signSupporterPass({
    checkoutId: "expired-chk",
    durationDays: -1, // Expired yesterday
    secret: TEST_SECRET,
  });

  const payload = await verifySupporterPass(token, TEST_SECRET);
  assertEquals(payload, null);
});

Deno.test("master codes come from env, and only from env", async () => {
  Deno.env.set("SUPPORTER_UNLOCK_CODES", "OTTER-HARBOUR-9, Night-Tram-4");
  try {
    for (
      const code of ["OTTER-HARBOUR-9", "otter-harbour-9", "  NIGHT-TRAM-4 "]
    ) {
      assertEquals((await verifySupporterPass(code))?.tier, "lifetime");
    }
    // One of the five that leaked from this repo's history — never valid.
    assertEquals(await verifySupporterPass("PIBULUS"), null);

    // Redeeming mints a real signed token that verifies on its own.
    const res = await redeemSupporterCode("otter-harbour-9");
    assertEquals(res.valid, true);
    assertEquals((await verifySupporterPass(res.license))?.tier, "lifetime");
  } finally {
    Deno.env.delete("SUPPORTER_UNLOCK_CODES");
  }
  // Unset env means no master codes at all — not a fallback list.
  assertEquals(await verifySupporterPass("OTTER-HARBOUR-9"), null);
});
