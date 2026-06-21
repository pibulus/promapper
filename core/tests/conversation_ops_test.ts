import { assertEquals } from "./_assert.ts";
import {
  deleteTopic,
  mergeTopics,
  persistTopicPositions,
  renameSpeaker,
  renameTopic,
  toggleActionItemStatus,
  updateActionItems,
} from "../orchestration/conversation-ops.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function graphData(): ConversationData {
  return {
    conversation: { id: "c1", source: "text", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [
      { id: "budget", label: "Budget", emoji: "💰", color: "#aaaaaa" },
      { id: "timeline", label: "Timeline", emoji: "📅", color: "#bbbbbb" },
      { id: "risk", label: "Risk", emoji: "⚠️", color: "#cccccc" },
    ],
    edges: [
      {
        id: "e1",
        source_topic_id: "budget",
        target_topic_id: "timeline",
        color: "#888888",
      },
      {
        id: "e2",
        source_topic_id: "timeline",
        target_topic_id: "risk",
        color: "#999999",
      },
    ],
    actionItems: [],
    statusUpdates: [],
  };
}

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

// ===================================================================
// topic graph ops
// ===================================================================

Deno.test("mergeTopics removes source, rewires edges, preserves edge fields", () => {
  const data = graphData();
  // merge budget -> timeline; edge budget->timeline becomes a self-loop (dropped)
  const next = mergeTopics(data, "budget", "timeline");
  assertEquals(next.nodes.map((n) => n.id), ["timeline", "risk"]);
  // only timeline->risk survives (budget->timeline self-looped after rewire)
  assertEquals(next.edges.length, 1);
  assertEquals(next.edges[0].id, "e2"); // original edge field preserved
  assertEquals(next.edges[0].source_topic_id, "timeline");
});

Deno.test("mergeTopics rewires a far edge onto the target without dupes", () => {
  const data = graphData();
  // merge risk -> budget: edge timeline->risk becomes timeline->budget
  const next = mergeTopics(data, "risk", "budget");
  assertEquals(next.nodes.map((n) => n.id).sort(), ["budget", "timeline"]);
  const keys = next.edges.map((e) =>
    `${e.source_topic_id}->${e.target_topic_id}`
  ).sort();
  assertEquals(keys, ["budget->timeline", "timeline->budget"]);
});

Deno.test("mergeTopics is a no-op for same/unknown ids", () => {
  const data = graphData();
  assertEquals(mergeTopics(data, "budget", "budget"), data);
  assertEquals(mergeTopics(data, "budget", "ghost"), data);
});

Deno.test("renameTopic updates label by id, no-op when unchanged/empty", () => {
  const data = graphData();
  const next = renameTopic(data, "budget", "Q4 Budget");
  assertEquals(next.nodes.find((n) => n.id === "budget")?.label, "Q4 Budget");
  assertEquals(renameTopic(data, "budget", "  "), data);
  assertEquals(renameTopic(data, "budget", "Budget"), data);
});

Deno.test("deleteTopic removes node and its edges", () => {
  const data = graphData();
  const next = deleteTopic(data, "timeline");
  assertEquals(next.nodes.map((n) => n.id), ["budget", "risk"]);
  // both edges touched timeline -> both gone
  assertEquals(next.edges.length, 0);
});

Deno.test("persistTopicPositions writes finite positions, ignores bad ones", () => {
  const data = graphData();
  const next = persistTopicPositions(data, {
    budget: { x: 10, y: 20 },
    risk: { x: NaN, y: 5 }, // ignored
  });
  assertEquals(next.nodes.find((n) => n.id === "budget")?.position, {
    x: 10,
    y: 20,
  });
  assertEquals(next.nodes.find((n) => n.id === "risk")?.position, undefined);
});
