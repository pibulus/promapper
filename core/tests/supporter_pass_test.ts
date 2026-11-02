// Passport token verification and legacy upgrade test suite.

import { assertEquals, assertNotEquals } from "./_assert.ts";
import {
  mintSupporterPassport,
  redeemSupporterCode,
  signLegacySupporterPass,
  verifySupporterPass,
} from "../../services/supporterPass.ts";

const TEST_SECRET = "test-secret-promapper-2026";

function payloadOf(token: string): Record<string, unknown> {
  const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
}

function b64url(value: string | Uint8Array): string {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

async function signClaims(
  claims: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${head}.${body}`),
    ),
  );
  return `${head}.${body}.${b64url(sig)}`;
}

Deno.test("mintSupporterPassport issues a shared JWT with SS code and identity", async () => {
  const minted = await mintSupporterPassport({
    seed: "checkout:test-123",
    checkoutId: "test-123",
    email: "pablo@example.com",
    secret: TEST_SECRET,
  });

  assertEquals(minted.token.split(".").length, 3);
  assertEquals(minted.code.startsWith("SS-"), true);
  assertEquals(minted.name.length > 0, true);
  assertEquals(minted.phrase.split("-").length, 4);

  const payload = payloadOf(minted.token);
  assertEquals(payload.stamps, ["promapper"]);
  assertEquals(payload.code, minted.code);
  assertEquals(payload.sub, minted.code);
  assertEquals(payload.name, minted.name);
  assertEquals(payload.phrase, minted.phrase);
  assertEquals(payload.tier, "supporter");
  assertEquals(payload.plan, "supporter");

  const verified = await verifySupporterPass(minted.token, TEST_SECRET);
  assertEquals(verified?.code, minted.code);
  assertEquals(verified?.tier, "supporter");
});

Deno.test("verifySupporterPass rejects tampered and expired JWTs", async () => {
  const minted = await mintSupporterPassport({
    seed: "checkout:tamper",
    secret: TEST_SECRET,
  });
  const [header, , signature] = minted.token.split(".");
  const tampered = `${header}.${
    btoa(JSON.stringify({ tier: "guild", exp: 2999999999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }.${signature}`;
  assertEquals(await verifySupporterPass(tampered, TEST_SECRET), null);
  assertEquals(
    await verifySupporterPass(minted.token, "different-wrong-secret"),
    null,
  );

  const expired = await mintSupporterPassport({
    seed: "checkout:expired",
    durationDays: -1,
    secret: TEST_SECRET,
  });
  assertEquals(await verifySupporterPass(expired.token, TEST_SECRET), null);
});

Deno.test("a token stamped for another app is not a ProMapper pass", async () => {
  const minted = await mintSupporterPassport({
    seed: "checkout:other-app",
    secret: TEST_SECRET,
  });
  // Correctly signed with the shared secret, but stamped for another app.
  const other = await signClaims({
    tier: "guild",
    plan: "guild",
    stamps: ["talktype"],
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    sub: minted.code,
    code: minted.code,
    name: minted.name,
    phrase: minted.phrase,
  }, TEST_SECRET);
  assertEquals(await verifySupporterPass(other, TEST_SECRET), null);

  // The same claims stamped for ProMapper do verify.
  const ours = await signClaims({
    tier: "guild",
    plan: "guild",
    stamps: ["promapper"],
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    sub: minted.code,
    code: minted.code,
    name: minted.name,
    phrase: minted.phrase,
  }, TEST_SECRET);
  assertEquals((await verifySupporterPass(ours, TEST_SECRET))?.tier, "guild");
});

Deno.test("legacy promapper-pass tokens verify and upgrade in place", async () => {
  Deno.env.set("SOFTSTACK_PASSPORT_SECRET", TEST_SECRET);
  Deno.env.set("PROMAPPER_LICENSE_SECRET", TEST_SECRET);
  try {
    const legacy = await signLegacySupporterPass({
      checkoutId: "legacy-checkout-1",
      email: "legacy@example.com",
      durationDays: 30,
      tier: "guild",
      secret: TEST_SECRET,
    });
    assertEquals(legacy.startsWith("promapper-pass-v1."), true);

    const verified = await verifySupporterPass(legacy, TEST_SECRET);
    assertEquals(verified?.tier, "guild");
    assertEquals(verified?.checkoutId, "legacy-checkout-1");

    const redeemed = await redeemSupporterCode(legacy);
    assertEquals(redeemed.valid, true);
    assertNotEquals(redeemed.license, legacy);
    assertEquals(redeemed.passport?.code.startsWith("SS-"), true);
    assertEquals(Boolean(redeemed.passport?.name), true);

    const upgraded = await verifySupporterPass(redeemed.license);
    assertEquals(upgraded?.tier, "guild");
    assertEquals(upgraded?.code, redeemed.passport?.code);
    assertEquals(upgraded?.stamps, ["promapper"]);
    assertEquals(upgraded?.exp, verified?.exp); // no free extension

    // Same legacy token → same Passport, even on a second device.
    const again = await redeemSupporterCode(legacy);
    assertEquals(again.passport?.code, redeemed.passport?.code);
  } finally {
    Deno.env.delete("SOFTSTACK_PASSPORT_SECRET");
    Deno.env.delete("PROMAPPER_LICENSE_SECRET");
  }
});

Deno.test("master codes come from env, and only from env", async () => {
  Deno.env.set("SUPPORTER_UNLOCK_CODES", "OTTER-HARBOUR-9, Night-Tram-4");
  Deno.env.set("SOFTSTACK_PASSPORT_SECRET", TEST_SECRET);
  try {
    for (
      const code of ["OTTER-HARBOUR-9", "otter-harbour-9", "  NIGHT-TRAM-4 "]
    ) {
      assertEquals((await verifySupporterPass(code))?.tier, "lifetime");
    }
    // One of the five that leaked from this repo's history — never valid.
    assertEquals(await verifySupporterPass("PIBULUS"), null);

    const res = await redeemSupporterCode("otter-harbour-9");
    assertEquals(res.valid, true);
    assertEquals((await verifySupporterPass(res.license))?.tier, "lifetime");
    assertEquals(res.passport?.code.startsWith("SS-"), true);
  } finally {
    Deno.env.delete("SUPPORTER_UNLOCK_CODES");
    Deno.env.delete("SOFTSTACK_PASSPORT_SECRET");
  }
  // Unset env means no master codes at all — not a fallback list.
  assertEquals(await verifySupporterPass("OTTER-HARBOUR-9"), null);
});
