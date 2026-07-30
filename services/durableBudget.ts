/**
 * Durable daily budgets — the money brake that actually holds in production.
 *
 * WHY THIS EXISTS
 *
 * requestGuard's daily and global ceilings lived in module-scoped `Map`s. On
 * Deno Deploy each request can land in a fresh isolate, so those Maps were
 * per-isolate: "1000 calls/day per client" and "20,000/day global" were
 * effectively unbounded in production. The arithmetic was right and tested
 * (windowBudget.ts); only the storage was wrong. This moves the storage to
 * Deno KV, which is shared across isolates.
 *
 * DESIGN, and the measurements behind it
 *
 * 1. Bucket-in-key, not a sliding window. The key carries its own UTC day
 *    (`budget/v1/call/2026-07-31/<token>`), so the day rolls over by addressing
 *    a different key. Correctness never depends on cleanup, expiry, or a sweep.
 *    The tradeoff versus the old rolling 24h window: a client gets a fresh
 *    allowance at UTC midnight rather than 24h after their first call. For a
 *    daily spend ceiling that is fine, and a fixed reset is easier to explain.
 *
 * 2. `sum`, and therefore no expiry. Verified on Deno 2.9.3: `sum` accepts no
 *    `expireIn` — neither `atomic().sum(k, n, {expireIn})` nor
 *    `mutate({type:"sum", ..., expireIn})` type-checks. The alternative,
 *    read-then-CAS-`set`, does support expiry but contends, and the global
 *    counter is a single hot key that every request touches. Contention-free
 *    beats tidy here.
 *
 *    So keys are never deleted. The arithmetic that makes that fine: one key
 *    per client per day at roughly 50 bytes. A thousand unique clients a day is
 *    about 18 MB a year against a 1 GiB free tier. If it ever matters, deleting
 *    buckets older than N days is a ten-line task — not a design constraint.
 *
 * 3. One commit, two counters. Per-token and global are summed in a single
 *    atomic commit, so the brake costs one KV write per guarded request.
 *
 * 4. Count first, then compare — matching the old `consumeWindowBudget`. A
 *    blocked request still increments, so hammering a spent budget keeps it
 *    spent instead of resetting the race each time.
 *
 * 5. Fails OPEN, on purpose. If KV is unreachable or unprovisioned the request
 *    is allowed and the reason is logged. An app that hard-fails because a
 *    counter store blipped is a worse product than one that briefly over-serves,
 *    and the in-memory 60/min burst limiter plus the provider's own token
 *    ceiling are still underneath. `degraded` is returned so callers can see it.
 */

const PREFIX = "budget";
const SCHEMA = "v1";

let kvPromise: Promise<Deno.Kv> | null = null;

async function getKv(): Promise<Deno.Kv | null> {
  try {
    // Unset in production, where Deploy binds the provisioned database. Tests
    // set ":memory:" so they never touch a developer's real local KV file.
    const path = Deno.env.get("DENO_KV_PATH") || undefined;
    if (!kvPromise) kvPromise = Deno.openKv(path);
    return await kvPromise;
  } catch (err) {
    // Let the next request try again rather than latching off for the isolate's
    // whole life — a missing KV binding and a transient blip look the same here.
    kvPromise = null;
    console.error(
      "[durableBudget] KV unavailable, budgets are failing OPEN:",
      err,
    );
    return null;
  }
}

/** UTC calendar day, the window bucket. Exported for tests. */
export function dayBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Deliberately a flat interface with optional fields rather than a discriminated
 * union: this project compiles with `strict: false`, and without strictNullChecks
 * TypeScript will not narrow `{ok: true} | {ok: false}` on the `ok` check, so a
 * union makes `verdict.blew` unreachable at the call site.
 */
export interface BudgetVerdict {
  ok: boolean;
  /** Which ceiling stopped it. Only meaningful when `ok` is false. */
  blew?: "token" | "global";
  /** The budget could not be consulted, so the request was let through. */
  degraded?: boolean;
}

async function readCounter(
  store: Deno.Kv,
  key: Deno.KvKey,
): Promise<number> {
  const entry = await store.get<Deno.KvU64>(key);
  return Number(entry.value?.value ?? 0n);
}

/**
 * Charge one call against the per-client daily budget and the global daily
 * ceiling. A limit of 0 or less disables that particular ceiling.
 */
export async function consumeCallBudgets(
  token: string,
  perTokenLimit: number,
  globalLimit: number,
  now: number,
): Promise<BudgetVerdict> {
  if (perTokenLimit <= 0 && globalLimit <= 0) {
    return { ok: true, degraded: false };
  }

  const store = await getKv();
  if (!store) return { ok: true, degraded: true };

  const day = dayBucket(now);
  const tokenKey = [PREFIX, SCHEMA, "call", day, token];
  const globalKey = [PREFIX, SCHEMA, "call-global", day];

  try {
    const op = store.atomic();
    if (perTokenLimit > 0) op.sum(tokenKey, 1n);
    if (globalLimit > 0) op.sum(globalKey, 1n);
    await op.commit();

    // The global ceiling is checked first: when the house is out of budget that
    // is the true reason, and saying "you personally used a lot" would be a lie.
    if (globalLimit > 0 && await readCounter(store, globalKey) > globalLimit) {
      return { ok: false, blew: "global" };
    }
    if (
      perTokenLimit > 0 && await readCounter(store, tokenKey) > perTokenLimit
    ) {
      return { ok: false, blew: "token" };
    }
    return { ok: true, degraded: false };
  } catch (err) {
    console.error("[durableBudget] call budget failed, allowing:", err);
    return { ok: true, degraded: true };
  }
}

/**
 * Charge metered audio bytes against a per-client daily allowance. No global
 * twin: audio is billed per client, and the global call ceiling already caps
 * the number of requests that can carry audio at all.
 */
export async function consumeByteBudget(
  token: string,
  bytes: number,
  limit: number,
  now: number,
): Promise<BudgetVerdict> {
  if (limit <= 0) return { ok: true, degraded: false };
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: true, degraded: false };
  }

  const store = await getKv();
  if (!store) return { ok: true, degraded: true };

  const key = [PREFIX, SCHEMA, "bytes", dayBucket(now), token];

  try {
    // BigInt needs an integer; a fractional byte count would throw.
    await store.atomic().sum(key, BigInt(Math.floor(bytes))).commit();
    if (await readCounter(store, key) > limit) {
      return { ok: false, blew: "token" };
    }
    return { ok: true, degraded: false };
  } catch (err) {
    console.error("[durableBudget] byte budget failed, allowing:", err);
    return { ok: true, degraded: true };
  }
}
