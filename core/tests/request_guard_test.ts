/**
 * Tests for services/requestGuard.ts
 *
 * requestGuard reads its config from env at module load, so we set env BEFORE
 * the dynamic import. Run with --allow-env (deno task test already does).
 */

import { assertEquals } from "./_assert.ts";

// Configure the guard's environment before it is imported.
Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8003,https://promapper.app");
Deno.env.set("API_RATE_LIMIT", "3");
Deno.env.set("API_RATE_WINDOW_MS", "60000");
Deno.env.delete("API_AUTH_TOKEN"); // auth disabled for these origin/rate tests

const { guardRequest, shouldBlockUnconfiguredAuth } = await import(
  "../../services/requestGuard.ts"
);

function reqFrom(origin: string | null, ip = "1.1.1.1"): Request {
  const headers = new Headers({ "x-forwarded-for": ip });
  if (origin) headers.set("origin", origin);
  return new Request("https://promapper.app/api/process", {
    method: "POST",
    headers,
  });
}

Deno.test("guardRequest allows a whitelisted origin", async () => {
  const result = await guardRequest(reqFrom("https://promapper.app", "10.0.0.1"));
  assertEquals(result, null);
});

Deno.test("guardRequest allows requests with no origin header (same-origin/server)", async () => {
  const result = await guardRequest(reqFrom(null, "10.0.0.2"));
  assertEquals(result, null);
});

Deno.test("guardRequest blocks a disallowed origin with 403", async () => {
  const result = await guardRequest(reqFrom("https://evil.example", "10.0.0.3"));
  assertEquals(result?.status, 403);
});

Deno.test("guardRequest rate-limits after the configured max", async () => {
  const ip = "10.0.0.99";
  // limit is 3; 4th request in the window should be blocked
  assertEquals(await guardRequest(reqFrom(null, ip)), null);
  assertEquals(await guardRequest(reqFrom(null, ip)), null);
  assertEquals(await guardRequest(reqFrom(null, ip)), null);
  const blocked = await guardRequest(reqFrom(null, ip));
  assertEquals(blocked?.status, 429);
  // a different IP is independent
  assertEquals(await guardRequest(reqFrom(null, "10.0.0.100")), null);

  // sanity: blocked body carries a retry hint
  const body = await blocked?.json();
  assertEquals(typeof body.retry_after_ms, "number");
});

// ===================================================================
// Fail-closed-in-prod policy when API_AUTH_TOKEN is unset (audit #7 2.1)
// ===================================================================

Deno.test("unconfigured auth: OPEN locally, BLOCKED when deployed", () => {
  // hasToken=false, deployed=false -> open (intended dev flow)
  assertEquals(shouldBlockUnconfiguredAuth(false, false), false);
  // hasToken=false, deployed=true  -> BLOCK (don't ship an open API)
  assertEquals(shouldBlockUnconfiguredAuth(false, true), true);
  // hasToken=true is always fine regardless of environment
  assertEquals(shouldBlockUnconfiguredAuth(true, true), false);
  assertEquals(shouldBlockUnconfiguredAuth(true, false), false);
});
