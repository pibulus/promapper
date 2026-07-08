/**
 * Tests for the PartyKit broadcast sanitizer (party/conversationProtocol.ts).
 *
 * This is the live-collab data plane: it runs on every peer mutation and every
 * server-push relay, so it's the only thing between a malicious/misconfigured
 * WebSocket message and every peer's state (audit #6 Part B, Rank 1). The file
 * is intentionally self-contained (relative imports only) so the PartyKit
 * bundler can build it — which also means we can import it directly here.
 *
 * Most load-bearing guarantee: it must PRESERVE ai_checked/checked_reason (the
 * AI self-checkoff feature), which a prior version stripped.
 */

import { assertEquals, assertExists } from "./_assert.ts";
import {
  LIMITS,
  sanitizeConversationData,
} from "../../party/conversationProtocol.ts";

function validInput(over: Record<string, unknown> = {}) {
  return {
    conversation: {
      id: "c1",
      title: "the moth situation",
      source: "audio",
      transcript: "Nan: Gerald the moth has tenure now",
    },
    transcript: {
      text: "Nan: Gerald the moth has tenure now",
      speakers: ["Nan"],
    },
    nodes: [{ id: "moth", label: "moths", emoji: "🦟", color: "#E8839C" }],
    edges: [],
    actionItems: [{
      id: "a1",
      conversation_id: "c1",
      description: "buy the warm bulb",
      assignee: "Dev",
      due_date: null,
      status: "completed",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
      ai_checked: true,
      checked_reason: "Dev said they'd grab it this week",
    }],
    summary: "moths, named and tenured",
    ...over,
  };
}

Deno.test("sanitizeConversationData preserves ai_checked/checked_reason through the broadcast", () => {
  const out = sanitizeConversationData(validInput());
  assertExists(out);
  assertEquals(out.actionItems[0].ai_checked, true);
  assertEquals(
    out.actionItems[0].checked_reason,
    "Dev said they'd grab it this week",
  );
});

Deno.test("sanitizeConversationData keeps the core shared shape", () => {
  const out = sanitizeConversationData(validInput());
  assertExists(out);
  assertEquals(out.conversation.id, "c1");
  assertEquals(out.nodes.length, 1);
  assertEquals(out.actionItems[0].status, "completed");
  assertEquals(out.transcript.speakers, ["Nan"]);
});

Deno.test("sanitizeConversationData rejects junk / empty-transcript input", () => {
  assertEquals(sanitizeConversationData(null), null);
  assertEquals(sanitizeConversationData("not an object"), null);
  assertEquals(sanitizeConversationData({}), null);
  // No usable transcript -> rejected.
  assertEquals(
    sanitizeConversationData(validInput({
      conversation: { id: "c1", transcript: "" },
      transcript: { text: "", speakers: [] },
    })),
    null,
  );
});

Deno.test("sanitizeConversationData caps an oversized action-item description", () => {
  const huge = "x".repeat(LIMITS.MAX_ACTION_DESCRIPTION_LENGTH + 500);
  const out = sanitizeConversationData(validInput({
    actionItems: [{
      id: "a1",
      conversation_id: "c1",
      description: huge,
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    }],
  }));
  assertExists(out);
  assertEquals(
    out.actionItems[0].description.length,
    LIMITS.MAX_ACTION_DESCRIPTION_LENGTH,
  );
});

Deno.test("sanitizeConversationData caps the number of nodes", () => {
  const tooMany = Array.from({ length: LIMITS.MAX_NODES + 50 }, (_, i) => ({
    id: `n${i}`,
    label: `topic ${i}`,
    emoji: "🧠",
    color: "#E8839C",
  }));
  const out = sanitizeConversationData(validInput({ nodes: tooMany }));
  assertExists(out);
  assertEquals(out.nodes.length, LIMITS.MAX_NODES);
});

// ── Room revision counter ─────────────────────────────────────────────
// The reconnect-flush decision rests on rev surviving metadata round-trips:
// touch/create must never reset it, or a reconnecting client would wrongly
// re-send stale local state over newer room edits.

Deno.test("createRoomMetadata defaults rev to 0 and preserves an existing rev", async () => {
  const { createRoomMetadata } = await import(
    "../../party/conversationProtocol.ts"
  );
  assertEquals(createRoomMetadata().rev, 0);
  assertEquals(createRoomMetadata({ rev: 7 }).rev, 7);
});

Deno.test("touchRoomMetadata carries rev through untouched", async () => {
  const { createRoomMetadata, touchRoomMetadata } = await import(
    "../../party/conversationProtocol.ts"
  );
  const touched = touchRoomMetadata(createRoomMetadata({ rev: 41 }));
  assertEquals(touched.rev, 41);
});
