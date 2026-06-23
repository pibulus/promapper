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
