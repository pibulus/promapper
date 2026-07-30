/**
 * Durable budgets — the money brake.
 *
 * Replaces window_budget_test.ts, which guarded the in-memory primitive that
 * production never actually enforced (module-scoped Maps on per-request
 * isolates). Same arithmetic, storage that survives an isolate.
 *
 * All tests share ONE in-memory KV for the process (the module caches its
 * handle), so every test uses a unique token and never asserts on another
 * test's counters.
 */

import { assertEquals } from "$std/assert/mod.ts";

Deno.env.set("DENO_KV_PATH", ":memory:");

const { consumeCallBudgets, consumeByteBudget, dayBucket } = await import(
  "../../services/durableBudget.ts"
);

const DAY = Date.UTC(2026, 6, 31, 12, 0, 0);
const NEXT_DAY = Date.UTC(2026, 7, 1, 12, 0, 0);

let seq = 0;
const uniq = (label: string) => `${label}-${seq++}`;

Deno.test("dayBucket is a UTC calendar day, not a local one", () => {
  // 11:00 UTC on the 31st is already Aug 1 in Melbourne. The bucket must not
  // follow the server's local zone or two isolates could disagree on the day.
  assertEquals(dayBucket(Date.UTC(2026, 6, 31, 23, 59, 59)), "2026-07-31");
  assertEquals(dayBucket(Date.UTC(2026, 7, 1, 0, 0, 1)), "2026-08-01");
});

Deno.test("allows calls under the per-client limit", async () => {
  const token = uniq("under");
  for (let i = 0; i < 3; i++) {
    const v = await consumeCallBudgets(token, 3, 0, DAY);
    assertEquals(v.ok, true);
  }
});

Deno.test("blocks the call that exceeds the per-client limit", async () => {
  const token = uniq("over");
  await consumeCallBudgets(token, 2, 0, DAY);
  await consumeCallBudgets(token, 2, 0, DAY);

  const v = await consumeCallBudgets(token, 2, 0, DAY);
  assertEquals(v, { ok: false, blew: "token" });
});

Deno.test("a spent budget stays spent when hammered", async () => {
  // Counting happens before the comparison, so retrying cannot reset the race.
  const token = uniq("hammer");
  for (let i = 0; i < 5; i++) await consumeCallBudgets(token, 1, 0, DAY);

  const v = await consumeCallBudgets(token, 1, 0, DAY);
  assertEquals(v.ok, false);
});

Deno.test("the global ceiling blocks clients who are individually fine", async () => {
  // The whole point of the global cap: per-client budgets multiply across a
  // botnet's IPs, so one absolute ceiling has to cap the house.
  const limit = 4;
  for (let i = 0; i < limit; i++) {
    await consumeCallBudgets(uniq("crowd"), 1000, limit, NEXT_DAY);
  }

  const v = await consumeCallBudgets(uniq("crowd"), 1000, limit, NEXT_DAY);
  assertEquals(v, { ok: false, blew: "global" });
});

Deno.test("reports the global ceiling when both are blown", async () => {
  // "You used a lot today" would be a lie when the house is what ran out.
  const token = uniq("both");
  await consumeCallBudgets(token, 1, 1, Date.UTC(2026, 8, 9));
  const v = await consumeCallBudgets(token, 1, 1, Date.UTC(2026, 8, 9));
  assertEquals(v, { ok: false, blew: "global" });
});

Deno.test("a new UTC day is a fresh allowance", async () => {
  const token = uniq("rollover");
  await consumeCallBudgets(token, 1, 0, DAY);
  assertEquals((await consumeCallBudgets(token, 1, 0, DAY)).ok, false);

  // Same client, next day, same limit — the key changes, so the budget resets.
  assertEquals((await consumeCallBudgets(token, 1, 0, NEXT_DAY)).ok, true);
});

Deno.test("limits of zero or less disable that ceiling", async () => {
  const token = uniq("disabled");
  for (let i = 0; i < 50; i++) {
    assertEquals((await consumeCallBudgets(token, 0, 0, DAY)).ok, true);
  }
  assertEquals(await consumeByteBudget(token, 999_999_999, 0, DAY), {
    ok: true,
    degraded: false,
  });
});

Deno.test("byte budget accumulates and blocks past the allowance", async () => {
  const token = uniq("bytes");
  assertEquals((await consumeByteBudget(token, 600, 1000, DAY)).ok, true);

  const v = await consumeByteBudget(token, 600, 1000, DAY);
  assertEquals(v, { ok: false, blew: "token" });
});

Deno.test("byte budget survives fractional and junk sizes", async () => {
  // BigInt() throws on a fraction, and a bad Content-Length should never 500.
  const token = uniq("junk");
  assertEquals((await consumeByteBudget(token, 10.7, 1000, DAY)).ok, true);
  assertEquals((await consumeByteBudget(token, NaN, 1000, DAY)).ok, true);
  assertEquals((await consumeByteBudget(token, -5, 1000, DAY)).ok, true);
  assertEquals((await consumeByteBudget(token, Infinity, 1000, DAY)).ok, true);
});

Deno.test("call and byte budgets do not share a counter", async () => {
  const token = uniq("separate");
  await consumeByteBudget(token, 5000, 5000, DAY);
  // Bytes are spent; calls should be untouched.
  assertEquals((await consumeCallBudgets(token, 5, 0, DAY)).ok, true);
});
