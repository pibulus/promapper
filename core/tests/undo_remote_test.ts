/**
 * Tests for the undo / remote-collab interaction (audit #5 bug #2).
 *
 * The bug: applyRemoteConversation wrote conversationData directly but left a
 * pending undoSnapshot stale. Undoing after a remote collaborator update would
 * roll back PAST their change and silently discard it. The fix invalidates the
 * undo snapshot whenever a remote update is applied.
 *
 * These exercise the public contract (canUndo / withUndo / applyRemoteConversation)
 * without reaching into module-private state.
 */

import { assertEquals } from "./_assert.ts";
import {
  applyRemoteConversation,
  canUndo,
  conversationData,
  undoLastMutation,
  withUndo,
} from "../../signals/conversationStore.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function conv(title: string): ConversationData {
  return {
    conversation: { id: "c1", title, source: "text", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [],
    edges: [],
    actionItems: [],
    statusUpdates: [],
    summary: "",
  };
}

Deno.test("a remote update invalidates a pending undo snapshot", () => {
  conversationData.value = conv("before");
  // Arm undo with a real reference-changing mutation.
  withUndo(() => {
    conversationData.value = conv("after local edit");
  });
  assertEquals(canUndo(), true);

  // Collaborator update arrives.
  applyRemoteConversation(conv("after remote edit"));

  // Undo must NOT be available — restoring the pre-remote snapshot would discard
  // the collaborator's change.
  assertEquals(canUndo(), false);
  assertEquals(undoLastMutation(), false);
  // The remote state stands.
  assertEquals(conversationData.value?.conversation.title, "after remote edit");
});

Deno.test("undo still works normally when no remote update intervenes", () => {
  conversationData.value = conv("base");
  withUndo(() => {
    conversationData.value = conv("edited");
  });
  assertEquals(canUndo(), true);
  assertEquals(undoLastMutation(), true);
  assertEquals(conversationData.value?.conversation.title, "base");
});

// ── Client-only fields must survive a remote frame ─────────────────────────
Deno.test("a remote update keeps notes, magpie, whiteboard and delete memory", () => {
  // The room's sanitizer emits {conversation, transcript, nodes, edges,
  // actionItems, statusUpdates, summary} and has never heard of the rest, so
  // assigning its payload whole ERASED five client-only fields on every
  // inbound frame. The first frame is the host's own INIT — so writing notes,
  // drawing on the canvas, then hitting "Start a live room" wiped all of it
  // before a single guest joined, and autosave persisted the loss.
  conversationData.value = {
    ...conv("mine"),
    notes: "ring the fiddle player back",
    magpie: [{
      id: "m1",
      kind: "link",
      value: "https://example.org/kelp",
      addedAt: "2026-01-01T00:00:00.000Z",
    }],
    whiteboardScene: '{"elements":[]}',
    deletedTopicLabels: ["the sinkhole"],
    deletedActionDescriptions: ["fence it"],
  };

  // What actually arrives from the room: sanitized, stripped.
  applyRemoteConversation(conv("theirs"));

  const after = conversationData.value!;
  assertEquals(after.conversation.title, "theirs", "remote content must win");
  assertEquals(after.notes, "ring the fiddle player back");
  assertEquals(after.magpie?.length, 1);
  assertEquals(after.whiteboardScene, '{"elements":[]}');
  assertEquals(after.deletedTopicLabels, ["the sinkhole"]);
  assertEquals(after.deletedActionDescriptions, ["fence it"]);
});
