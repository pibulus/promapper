/**
 * Tests for the live-collab broadcast sanitizer
 * (workers/collab/src/conversationProtocol.ts).
 *
 * This is the live-collab data plane: it runs on every peer mutation and every
 * server-push relay, so it's the only thing between a malicious/misconfigured
 * WebSocket message and every peer's state (audit #6 Part B, Rank 1). The file
 * is intentionally self-contained (relative imports only) so the Cloudflare
 * bundler can build it — which also means we can import it directly here.
 *
 * ⚠️ THIS FILE USED TO IMPORT party/ — THE DEAD COPY. PartyKit deploys can
 * never succeed again (see services/collabHost.ts: its shared zone hit
 * Cloudflare's 10k-custom-domains limit), so live collab moved to Durable
 * Objects in workers/collab/. But the tests kept guarding party/, and so did
 * every fix: merge memory and statusUpdate sanitising both landed in the dead
 * copy while the LIVE worker silently drifted for six days. Aliases were being
 * stripped in real rooms, so merged topics resurrected as duplicates.
 * The drift guard at the bottom of this file exists so that can't recur.
 *
 * Most load-bearing guarantee: it must PRESERVE ai_checked/checked_reason (the
 * AI self-checkoff feature), which a prior version stripped.
 */

import { assertEquals, assertExists } from "./_assert.ts";
import {
  LIMITS,
  sanitizeConversationData,
} from "../../workers/collab/src/conversationProtocol.ts";

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

// ── Drift guard ────────────────────────────────────────────────────────────
// Three hand-synced copies of this sanitizer exist because neither the
// Cloudflare nor the PartyKit bundler can read Deno's import map — that
// constraint is real and a build step isn't worth it. What is NOT acceptable
// is the copies silently disagreeing: for six days the live worker stripped
// node `aliases` (killing merge memory in real rooms — merged topics came back
// as duplicates on the next sync) and passed statusUpdates through
// unsanitized, while party/ had both fixes and the tests pointed at party/.
//
// This compares BEHAVIOUR, not text, so harmless formatting drift is fine and
// a real divergence fails the build.
import { sanitizeConversationData as sanitizeInPartyCopy } from "../../party/conversationProtocol.ts";

Deno.test("the collab sanitizer copies agree — live worker vs party/", async () => {
  const { sanitizeShareConversation: sanitizeInCore } = await import(
    "../realtime/shareProtocol.ts"
  );

  const hostile = validInput({
    // Pin created_at: the sanitizers default it to new Date().toISOString(),
    // so two calls milliseconds apart legitimately differ and the comparison
    // would flake under load (it did — passed alone, failed in the suite).
    conversation: {
      id: "c1",
      title: "the moth situation",
      source: "audio",
      transcript: "x",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    nodes: [
      {
        id: "n1",
        label: "the sinkhole",
        emoji: "\u{1F573}",
        color: "#ff2e88",
        position: { x: 10, y: 20 },
        // Merge memory: the survivor's record of what it absorbed.
        aliases: ["the hole", "that pit in the paddock"],
      },
    ],
    statusUpdates: [
      {
        id: "a1",
        description: "fence the sinkhole",
        status: "completed",
        reason: "they said it's done",
        // Junk the sanitizer must drop.
        evil: "<script>alert(1)</script>",
      },
    ],
  });

  const fromWorker = sanitizeConversationData(structuredClone(hostile));
  const fromParty = sanitizeInPartyCopy(structuredClone(hostile));
  assertEquals(
    fromWorker,
    fromParty,
    "workers/collab and party/ sanitizers disagree — re-sync them",
  );

  // And both must agree with core/, which is the canonical shape the app uses.
  const fromCore = sanitizeInCore(structuredClone(hostile));
  assertEquals(
    fromWorker?.nodes?.[0]?.aliases,
    fromCore?.nodes?.[0]?.aliases,
    "live worker drops node aliases that core/ preserves — merge memory dies in live rooms",
  );
});
