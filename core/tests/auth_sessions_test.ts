/**
 * Tests for authSessions — JWT-based stateless sessions.
 *
 * createSession returns a signed JWT, validateSession verifies the
 * signature + expiry + revocation. deleteSession adds the session ID
 * to an in-memory revocation set (per-isolate — the cookie delete
 * handles real revocation).
 */

import { assertEquals } from "./_assert.ts";
import {
  createSession,
  deleteSession,
  validateSession,
} from "../../services/authSessions.ts";

// JWT signing needs a key — set one before the dynamic import loads it.
Deno.env.set("API_AUTH_TOKEN", "test-jwt-secret-key-for-session-signing");

Deno.test("a fresh session validates true", async () => {
  const id = await createSession();
  assertEquals(await validateSession(id), true);
});

Deno.test("null / undefined / unknown ids validate false", async () => {
  assertEquals(await validateSession(null), false);
  assertEquals(await validateSession(undefined), false);
  assertEquals(await validateSession("not-a-real-session-id"), false);
});

Deno.test("a deleted session no longer validates", async () => {
  const id = await createSession();
  assertEquals(await validateSession(id), true);
  deleteSession(id);
  assertEquals(await validateSession(id), false);
});

Deno.test("deleteSession on null/unknown is a safe no-op", async () => {
  deleteSession(null);
  deleteSession(undefined);
  deleteSession("ghost");
  const id = await createSession();
  assertEquals(await validateSession(id), true);
});

Deno.test("JWT signatures are stable under repeated validation", async () => {
  const id = await createSession();
  for (let i = 0; i < 250; i++) {
    assertEquals(await validateSession(id), true);
  }
});

Deno.test("a tampered JWT fails validation", async () => {
  const id = await createSession();
  const parts = id.split(".");
  // Modify a character in the payload
  const tampered = parts[0] + "." + "X" + parts[1].slice(1) + "." + parts[2];
  assertEquals(await validateSession(tampered), false);
});

Deno.test("a JWT with a malformed signature fails validation", async () => {
  const id = await createSession();
  const parts = id.split(".");
  const bad = parts[0] + "." + parts[1] + ".notvalidsig";
  assertEquals(await validateSession(bad), false);
});
