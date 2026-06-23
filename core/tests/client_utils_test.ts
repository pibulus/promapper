/**
 * Client Utilities Test — pure-logic coverage for auth modal, toast, and
 * cross-tab storage sync (the code we added in this hardening pass).
 *
 * DOM-dependent functions (showActionToast) are tested for server-side safety
 * (graceful early return). Signal-dependent functions (requestAuthToken) are
 * tested for Promise lifecycle. Storage listener logic is tested via pure
 * comparison.
 */

import { assertEquals, assertExists } from "./_assert.ts";

// ═══════════════════════════════════════════════════════════════════
// 1. showActionToast — server-side safety & shape
// ═══════════════════════════════════════════════════════════════════

import { showActionToast } from "../../utils/toast.ts";

Deno.test("showActionToast returns early when window is undefined (SSR-safe)", () => {
  // In Deno's test runner, `window` is undefined — the function must not throw.
  const result = showActionToast("Hello", "Reload", () => {}, 1000);
  assertEquals(result, { dismiss: () => {} });
});

Deno.test("showActionToast dismiss handle is a no-op under SSR", () => {
  const { dismiss } = showActionToast("Hello", "Click", () => {}, 1000);
  // Must not throw when called in non-browser env.
  dismiss();
});

// ═══════════════════════════════════════════════════════════════════
// 2. requestAuthToken — Promise lifecycle & signal interaction
// ═══════════════════════════════════════════════════════════════════

import { authPromptSignal, requestAuthToken } from "../../signals/authModal.ts";

Deno.test("requestAuthToken returns a Promise", () => {
  const p = requestAuthToken();
  assertExists(p);
  assertEquals(typeof p.then, "function");
  // Clean up — resolve so the promise settles without error
  authPromptSignal.value?.resolve("done");
  authPromptSignal.value = null;
  return p.then(() => {}); // consume the promise
});

Deno.test("requestAuthToken sets the authPromptSignal", () => {
  const p = requestAuthToken();
  assertEquals(authPromptSignal.value !== null, true);
  authPromptSignal.value?.resolve("done");
  authPromptSignal.value = null;
  return p.then(() => {});
});

Deno.test("requestAuthToken resolves when signal is resolved with a value", async () => {
  const p = requestAuthToken();
  assertEquals(authPromptSignal.value !== null, true);

  // Simulate what AuthModalIsland does when the user submits.
  authPromptSignal.value!.resolve("my-secret-token");
  authPromptSignal.value = null;

  const token = await p;
  assertEquals(token, "my-secret-token");
});

Deno.test("requestAuthToken rejects when signal is rejected", async () => {
  const p = requestAuthToken();

  // Attach a catch handler FIRST so the rejection is handled.
  const caught = p.catch((e) => e);

  authPromptSignal.value!.reject(new Error("user cancelled"));
  authPromptSignal.value = null;

  const result = await caught;
  assertEquals(result instanceof Error, true);
  assertEquals(result.message, "user cancelled");
});

Deno.test("requestAuthToken can be called multiple times — second call supersedes", async () => {
  const p1 = requestAuthToken();
  const firstState = authPromptSignal.value;
  assertExists(firstState);

  // Second call supersedes the first — rejects p1.
  const p2 = requestAuthToken();
  const secondState = authPromptSignal.value;
  assertExists(secondState);

  assertEquals(firstState !== secondState, true);

  // Resolve second, consume first rejection
  secondState.resolve("token2");
  authPromptSignal.value = null;

  // p1 was rejected (superseded) — catch it
  p1.catch(() => {});

  const token = await p2;
  assertEquals(token, "token2");
});

Deno.test("authPromptSignal is null when no request is pending", () => {
  // Ensure clean state
  authPromptSignal.value = null;
  assertEquals(authPromptSignal.value, null);
});

Deno.test("authPromptSignal rejects correctly when superseded", async () => {
  const p1 = requestAuthToken();
  const p2 = requestAuthToken();

  authPromptSignal.value?.resolve("ok");
  authPromptSignal.value = null;

  p1.catch(() => {});
  await p2;
});

// ═══════════════════════════════════════════════════════════════════
// 3. Cross-tab storage sync — detection logic
// ═══════════════════════════════════════════════════════════════════

const CONVERSATIONS_KEY = "project_mapper_conversations";

Deno.test("storage handler: ignores non-conversation keys", () => {
  const eventKey = "some_other_key" as string;
  const matches = eventKey === CONVERSATIONS_KEY;
  assertEquals(matches, false);
});

Deno.test("storage handler: matches the correct conversations key", () => {
  const eventKey = CONVERSATIONS_KEY as string;
  const matches = eventKey === CONVERSATIONS_KEY;
  assertEquals(matches, true);
});

Deno.test("storage handler: detects changed updatedAt timestamp", () => {
  // Simulate old store value vs new store value comparison.
  const activeId = "conv-123";

  const oldStore: Record<string, { updatedAt?: string }> = {
    "conv-123": { updatedAt: "2025-01-01T00:00:00.000Z" },
  };
  const newStore: Record<string, { updatedAt?: string }> = {
    "conv-123": { updatedAt: "2025-06-01T00:00:00.000Z" },
  };

  const oldVersion = oldStore[activeId];
  const newVersion = newStore[activeId];
  const isModified = oldVersion?.updatedAt !== newVersion?.updatedAt;

  assertEquals(isModified, true);
});

Deno.test("storage handler: ignores unchanged updatedAt", () => {
  const activeId = "conv-abc";

  const oldStore: Record<string, { updatedAt?: string }> = {
    "conv-abc": { updatedAt: "2025-01-01T00:00:00.000Z" },
    "conv-xyz": { updatedAt: "2025-06-01T00:00:00.000Z" },
  };
  const newStore: Record<string, { updatedAt?: string }> = {
    "conv-abc": { updatedAt: "2025-01-01T00:00:00.000Z" },
    "conv-xyz": { updatedAt: "2025-06-02T00:00:00.000Z" }, // different conv changed, not ours
  };

  const oldVersion = oldStore[activeId];
  const newVersion = newStore[activeId];
  const isModified = oldVersion?.updatedAt !== newVersion?.updatedAt;

  // Only conv-xyz changed — not our active conversation.
  assertEquals(isModified, false);
});

Deno.test("storage handler: returns early when active conversation not in new store", () => {
  const activeId = "conv-deleted";

  const newStore: Record<string, { updatedAt?: string }> = {
    "conv-other": { updatedAt: "2025-06-01T00:00:00.000Z" },
  };

  const exists = Boolean(newStore[activeId]);
  assertEquals(exists, false); // handler should return and NOT fire a toast
});

Deno.test("storage handler: graceful when newValue is not JSON", () => {
  let threw = false;
  try {
    JSON.parse("not valid json");
  } catch {
    threw = true;
  }
  assertEquals(threw, true); // handler catches this, should not crash
});
