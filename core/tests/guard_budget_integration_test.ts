/**
 * End-to-end proof that the money brake is actually wired: a real Request
 * through the real guardRequest, until the real durable budget says no.
 *
 * durable_budget_test.ts proves the counter arithmetic. This proves the counter
 * is CONNECTED — that guardRequest charges it and turns a blown budget into a
 * 429. Those are different failures, and the second one is the one that shipped:
 * the arithmetic was always right, it just ran against per-isolate Maps that
 * production never shared.
 *
 * Limits are set per-test and restored, because `deno test` runs every file in
 * one process and request_guard_test.ts configures the same module. That works
 * only because requestGuard now reads its limits per call rather than at import.
 */

import { assertEquals } from "$std/assert/mod.ts";

Deno.env.set("DENO_KV_PATH", ":memory:");

const { guardRequest } = await import("../../services/requestGuard.ts");

function req(ip: string): Request {
  return new Request("https://promapper.app/api/markdown", {
    method: "POST",
    // No Origin header on purpose: the guard treats that as same-origin/server
    // (see request_guard_test.ts), which keeps this file independent of
    // ALLOWED_ORIGINS — still read at module load, so the first importing test
    // file would otherwise decide it for everyone.
    headers: { "x-forwarded-for": ip },
  });
}

/** Set env for the duration of one test, then put it back exactly as found. */
async function withEnv(
  vars: Record<string, string>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    previous.set(k, Deno.env.get(k));
    Deno.env.set(k, v);
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("guardRequest lets a client through until its daily budget is spent", async () => {
  await withEnv({
    API_DAILY_LIMIT: "3",
    API_GLOBAL_DAILY_LIMIT: "0", // off; the unit test covers it with a fixed clock
    API_RATE_LIMIT: "0", // off; this is about budgets, not bursts
    API_AUTH_TOKEN: "", // auth off; this file tests budgets
  }, async () => {
    // A unique IP: the KV counter is shared across this whole test process, so
    // a reused address would inherit another test's spending.
    const ip = "203.0.113.77";

    for (let i = 1; i <= 3; i++) {
      assertEquals(await guardRequest(req(ip)), null, `call ${i} should pass`);
    }

    const blocked = await guardRequest(req(ip));
    assertEquals(blocked?.status, 429);
    assertEquals(
      (await blocked!.json()).error,
      "That's a lot for one day — things reset tomorrow.",
    );
  });
});

Deno.test("a spent daily budget still blocks on a later request", async () => {
  await withEnv({
    API_DAILY_LIMIT: "3",
    API_GLOBAL_DAILY_LIMIT: "0",
    API_RATE_LIMIT: "0",
    API_AUTH_TOKEN: "", // auth off; this file tests budgets
  }, async () => {
    // Same IP as above. If the budget lived in a per-call Map this would pass;
    // it blocks because the count survived in KV.
    const blocked = await guardRequest(req("203.0.113.77"));
    assertEquals(blocked?.status, 429);
  });
});

Deno.test("the global ceiling blocks a client whose own budget is untouched", async () => {
  await withEnv({
    API_DAILY_LIMIT: "0", // per-client budget off, so only the house cap can bite
    API_GLOBAL_DAILY_LIMIT: "2",
    API_RATE_LIMIT: "0",
    API_AUTH_TOKEN: "", // auth off; this file tests budgets
  }, async () => {
    // Distinct IPs, each on its first ever request — the botnet shape the
    // global cap exists for. Global starts at 0 for today: nothing above it
    // enabled the global counter.
    assertEquals(await guardRequest(req("198.51.100.1")), null);
    assertEquals(await guardRequest(req("198.51.100.2")), null);

    const blocked = await guardRequest(req("198.51.100.3"));
    assertEquals(blocked?.status, 429);
    assertEquals(
      (await blocked!.json()).error,
      "The workshop is unusually busy today — back tomorrow.",
    );
  });
});
