import { assertEquals } from "./_assert.ts";
import {
  renameSpeaker,
  toggleActionItemStatus,
  updateActionItems,
} from "../orchestration/conversation-ops.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function baseData(): ConversationData {
  return {
    conversation: {
      id: "c1",
      source: "text",
      transcript: "Alice: hi\nBob: hello\nAlice: bye",
    },
    transcript: {
      text: "Alice: hi\nBob: hello\nAlice: bye",
      speakers: ["Alice", "Bob"],
    },
    nodes: [],
    edges: [],
    actionItems: [
      {
        id: "a1",
        conversation_id: "c1",
        description: "Ship it",
        assignee: null,
        due_date: null,
        status: "pending",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    statusUpdates: [],
  };
}

Deno.test("updateActionItems replaces the list immutably", () => {
  const data = baseData();
  const next = updateActionItems(data, []);
  assertEquals(next.actionItems.length, 0);
  assertEquals(data.actionItems.length, 1); // original untouched
  assertEquals(next.conversation, data.conversation); // other fields preserved
});

Deno.test("toggleActionItemStatus flips status and stamps updated_at", () => {
  const data = baseData();
  const now = "2026-06-21T12:00:00.000Z";
  const next = toggleActionItemStatus(data, "a1", now);
  assertEquals(next.actionItems[0].status, "completed");
  assertEquals(next.actionItems[0].updated_at, now);
  assertEquals(data.actionItems[0].status, "pending"); // original untouched
  // toggling again returns to pending
  assertEquals(
    toggleActionItemStatus(next, "a1", now).actionItems[0].status,
    "pending",
  );
});

Deno.test("toggleActionItemStatus ignores unknown ids", () => {
  const data = baseData();
  const next = toggleActionItemStatus(data, "ghost", "now");
  assertEquals(next.actionItems[0].status, "pending");
});

Deno.test("renameSpeaker rewrites transcript, conversation copy, and speakers", () => {
  const data = baseData();
  const next = renameSpeaker(data, "Alice", "Alicia");
  assertEquals(next.transcript.text, "Alicia: hi\nBob: hello\nAlicia: bye");
  assertEquals(
    next.conversation.transcript,
    "Alicia: hi\nBob: hello\nAlicia: bye",
  );
  assertEquals(next.transcript.speakers, ["Alicia", "Bob"]);
  // original untouched
  assertEquals(data.transcript.speakers, ["Alice", "Bob"]);
});

Deno.test("renameSpeaker is a no-op for empty/identical names", () => {
  const data = baseData();
  assertEquals(renameSpeaker(data, "Alice", "Alice"), data);
  assertEquals(renameSpeaker(data, "Alice", "  "), data);
  assertEquals(renameSpeaker(data, "", "X"), data);
});

Deno.test("renameSpeaker dedupes when renaming onto an existing speaker", () => {
  const data = baseData();
  const next = renameSpeaker(data, "Bob", "Alice");
  assertEquals(next.transcript.speakers, ["Alice"]);
});

Deno.test("renameSpeaker escapes regex-special characters in the old name", () => {
  const data = baseData();
  data.transcript.text = "A.B: hi\nAXB: no";
  data.conversation.transcript = "A.B: hi\nAXB: no";
  data.transcript.speakers = ["A.B", "AXB"];
  const next = renameSpeaker(data, "A.B", "Friend");
  // only the literal "A.B:" prefix is rewritten, not "AXB:" (proves escaping)
  assertEquals(next.transcript.text, "Friend: hi\nAXB: no");
});
