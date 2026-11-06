// Passport token verification and legacy upgrade test suite.

import { assertEquals, assertNotEquals } from "./_assert.ts";
import {
  getPassportSecret,
  mintSupporterPassport,
  passportForSeed,
  redeemSupporterCode,
  signLegacySupporterPass,
  verifySupporterPass,
} from "../../services/supporterPass.ts";
import {
  clearPhraseFailures,
  getPassportRecordByPhrase,
  isPhraseLockedOut,
  recordPhraseFailure,
  savePassportRecord,
} from "../../services/passportStore.ts";
import { handler as passportHandler } from "../../routes/api/supporter/passport.ts";
import { handler as redeemHandler } from "../../routes/api/supporter/redeem.ts";

const TEST_SECRET = "test-secret-promapper-2026-32chars!!";

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

Deno.test("getPassportSecret fails closed in production when secret is missing or under 32 chars", () => {
  Deno.env.set("DENO_DEPLOYMENT_ID", "prod-deploy-123");
  Deno.env.set("PROMAPPER_LICENSE_SECRET", TEST_SECRET);
  try {
    Deno.env.delete("SOFTSTACK_PASSPORT_SECRET");
    let threwMissing = false;
    try {
      getPassportSecret();
    } catch {
      threwMissing = true;
    }
    assertEquals(threwMissing, true);

    Deno.env.set("SOFTSTACK_PASSPORT_SECRET", "too-short-16-chr");
    let threwShort = false;
    try {
      getPassportSecret();
    } catch {
      threwShort = true;
    }
    assertEquals(threwShort, true);

    Deno.env.set("SOFTSTACK_PASSPORT_SECRET", TEST_SECRET);
    assertEquals(getPassportSecret(), TEST_SECRET);
  } finally {
    Deno.env.delete("DENO_DEPLOYMENT_ID");
    Deno.env.delete("SOFTSTACK_PASSPORT_SECRET");
    Deno.env.delete("PROMAPPER_LICENSE_SECRET");
  }
});

Deno.test("passportForSeed derives 4-word phrase first and one-way SS- code from phrase", async () => {
  const fromSeed = await passportForSeed(
    "checkout-test-001",
    "softstack-test-secret-32-chars-min!!",
  );
  assertEquals(fromSeed.phrase, "umbra-scanner-amplify-cosmos");
  assertEquals(fromSeed.code, "SS-FA39-DE19-4608");
  assertEquals(fromSeed.name, "Quiet Tapir");

  // Feeding the SS- code back as a seed does NOT reverse-derive the phrase
  const fromCode = await passportForSeed(
    fromSeed.code,
    "softstack-test-secret-32-chars-min!!",
  );
  assertNotEquals(fromCode.phrase, fromSeed.phrase);
});

Deno.test("savePassportRecord indexes by PBKDF2 passkey hash, rejects bare SS- codes on redeem, and enforces 5-miss lockout", async () => {
  Deno.env.set("SOFTSTACK_PASSPORT_SECRET", TEST_SECRET);
  try {
    const minted = await mintSupporterPassport({
      seed: `checkout:phrase-test-${Date.now()}`,
      checkoutId: `chk-${Date.now()}`,
      email: "pablo@promapper.app",
      secret: TEST_SECRET,
    });

    await savePassportRecord({
      code: minted.code,
      name: minted.name,
      phrase: minted.phrase,
      licenseToken: minted.token,
      email: "pablo@promapper.app",
      checkoutId: "chk-phrase-1",
      exp: minted.exp,
    });

    const foundByPhrase = await getPassportRecordByPhrase(minted.phrase);
    assertEquals(foundByPhrase?.code, minted.code);
    assertEquals(foundByPhrase?.licenseToken, minted.token);

    // GET /api/supporter/passport?code=SS-... is retired (410)
    const getRes = await passportHandler.GET!(
      new Request(
        `https://promapper.app/api/supporter/passport?code=${minted.code}`,
      ),
      {} as never,
    );
    assertEquals(getRes.status, 410);

    // POST /api/supporter/redeem rejects bare SS- code with 400
    const bareRedeemRes = await redeemHandler.POST!(
      new Request("https://promapper.app/api/supporter/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: minted.code }),
      }),
      {} as never,
    );
    assertEquals(bareRedeemRes.status, 400);
    const bareBody = await bareRedeemRes.json();
    assertEquals(bareBody.valid, false);

    // POST /api/supporter/redeem accepts the 4-word passkey
    const phraseRedeemRes = await redeemHandler.POST!(
      new Request("https://promapper.app/api/supporter/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: minted.phrase }),
      }),
      {} as never,
    );
    assertEquals(phraseRedeemRes.status, 200);
    const phraseBody = await phraseRedeemRes.json();
    assertEquals(phraseBody.valid, true);
    assertEquals(phraseBody.passport?.code, minted.code);

    // 5-miss per-phrase lockout
    const targetPhrase = "amber-harbor-velvet-lantern";
    await clearPhraseFailures(targetPhrase);
    assertEquals(await isPhraseLockedOut(targetPhrase), false);
    for (let i = 0; i < 4; i++) {
      await recordPhraseFailure(targetPhrase);
      assertEquals(await isPhraseLockedOut(targetPhrase), false);
    }
    await recordPhraseFailure(targetPhrase);
    assertEquals(await isPhraseLockedOut(targetPhrase), true);

    const lockedRedeemRes = await redeemHandler.POST!(
      new Request("https://promapper.app/api/supporter/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: targetPhrase }),
      }),
      {} as never,
    );
    assertEquals(lockedRedeemRes.status, 429);
    await clearPhraseFailures(targetPhrase);
  } finally {
    Deno.env.delete("SOFTSTACK_PASSPORT_SECRET");
  }
});
