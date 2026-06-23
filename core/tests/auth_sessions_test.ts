/**
 * Tests for authSessions — the in-memory HttpOnly session store. Covers the
 * create/validate/delete contracts and the null/garbage guards. Time-based
 * expiry uses the env TTL (4h default) so it isn't forced here; the amortized
 * sweep is exercised structurally (many validations don't throw / don't evict a
 * live session).
 */

import { assertEquals } from "./_assert.ts";
import {
  createSession,
  deleteSession,
  validateSession,
} from "../../services/authSessions.ts";

Deno.test("a fresh session validates true", () => {
  const id = createSession();
  assertEquals(validateSession(id), true);
});

Deno.test("null / undefined / unknown ids validate false", () => {
  assertEquals(validateSession(null), false);
  assertEquals(validateSession(undefined), false);
  assertEquals(validateSession("not-a-real-session-id"), false);
});

Deno.test("a deleted session no longer validates", () => {
  const id = createSession();
  assertEquals(validateSession(id), true);
  deleteSession(id);
  assertEquals(validateSession(id), false);
});

Deno.test("deleteSession on null/unknown is a safe no-op", () => {
  deleteSession(null);
  deleteSession(undefined);
  deleteSession("ghost");
  // A real session created afterwards still works — the no-ops didn't corrupt state.
  const id = createSession();
  assertEquals(validateSession(id), true);
});

Deno.test("the amortized sweep doesn't evict a live session under heavy validation", () => {
  // Drive well past SWEEP_EVERY (100) validations; a fresh session must survive
  // every sweep that fires along the way.
  const id = createSession();
  for (let i = 0; i < 250; i++) {
    assertEquals(validateSession(id), true);
  }
});
