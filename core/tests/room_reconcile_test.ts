import { assertEquals } from "./_assert.ts";
import {
  isQuietPeer,
  reconcileRoomUpdate,
} from "../orchestration/room-reconcile.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function item(
  id: string,
  description: string,
  status: "pending" | "completed" = "pending",
  extra: Partial<ConversationData["actionItems"][number]> = {},
): ConversationData["actionItems"][number] {
  return {
    id,
    conversation_id: "c1",
    description,
    assignee: null,
    due_date: null,
    status,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function node(
  id: string,
  label: string,
  pos?: { x: number; y: number },
  extra: Partial<ConversationData["nodes"][number]> = {},
): ConversationData["nodes"][number] {
  return {
    id,
    label,
    emoji: "✨",
    color: "#FF69B4",
    position: pos,
    ...extra,
  };
}

function edge(
  s: string,
  t: string,
  color = "#888",
): ConversationData["edges"][number] {
  return {
    id: `${s}-${t}`,
    source_topic_id: s,
    target_topic_id: t,
    color,
  };
}

function conv(over: Partial<ConversationData> = {}): ConversationData {
  return {
    conversation: { id: "c1", source: "live", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [],
    edges: [],
    actionItems: [],
    statusUpdates: [],
    summary: "",
    ...over,
  };
}

// ── 1. QUIET PEER DELETIONS (THE CRITICAL F04+ BUG) ─────────────────────────

Deno.test("quiet peer: room deletes a topic node — node is NOT resurrected", () => {
  const base = conv({
    nodes: [node("n1", "Venue"), node("n2", "Catering")],
    edges: [edge("n1", "n2")],
  });
  // Peer A deleted "Venue" in the room:
  const theirs = conv({
    nodes: [node("n2", "Catering")],
    edges: [],
    deletedTopicLabels: ["venue"],
  });
  // Peer B made no local edits:
  const mine = conv({
    nodes: [node("n1", "Venue"), node("n2", "Catering")],
    edges: [edge("n1", "n2")],
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.nodes.map((n) => n.id), ["n2"]);
  assertEquals(merged.edges.length, 0);
  assertEquals(merged.deletedTopicLabels, ["venue"]);
});

Deno.test("quiet peer: room deletes an action item — item is NOT resurrected", () => {
  const base = conv({
    actionItems: [
      item("t1", "Book venue", "pending"),
      item("t2", "Order cake", "pending"),
    ],
  });
  // Peer A deleted "Book venue":
  const theirs = conv({
    actionItems: [item("t2", "Order cake", "pending")],
    deletedActionDescriptions: ["book venue"],
  });
  // Peer B is quiet:
  const mine = conv({
    actionItems: [
      item("t1", "Book venue", "pending"),
      item("t2", "Order cake", "pending"),
    ],
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.actionItems.map((i) => i.id), ["t2"]);
  assertEquals(merged.deletedActionDescriptions, ["book venue"]);
});

Deno.test("exact reproduction of F04+ bug: room snapshot with 0 tasks and 0 topics merged against unchanged peer yields 0 tasks and 0 topics", () => {
  const i = item("task", "Book venue", "pending");
  const b = conv({
    nodes: [node("n1", "Venue")],
    actionItems: [i],
  });
  const theirs = conv({ nodes: [], actionItems: [] });
  const mine = { ...b };
  const merged = reconcileRoomUpdate(b, mine, theirs);
  assertEquals(merged.nodes.length, 0);
  assertEquals(merged.actionItems.length, 0);
  assertEquals(isQuietPeer(b, mine), true);
});

Deno.test("quiet peer: room merges topics — absorbed topic stays gone, aliases survive", () => {
  const base = conv({
    nodes: [node("n1", "Budget"), node("n2", "Finance")],
    edges: [edge("n1", "n2")],
  });
  // Peer A merged "Budget" into "Finance":
  const theirs = conv({
    nodes: [node("n2", "Finance", undefined, { aliases: ["Budget"] })],
    edges: [],
    deletedTopicLabels: ["budget"],
  });
  // Peer B is quiet:
  const mine = conv({
    nodes: [node("n1", "Budget"), node("n2", "Finance")],
    edges: [edge("n1", "n2")],
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.nodes.map((n) => n.id), ["n2"]);
  assertEquals(merged.nodes[0].aliases, ["Budget"]);
  assertEquals(merged.edges.length, 0);
});

// ── 2. CONCURRENT EDITS ─────────────────────────────────────────────────────

Deno.test("concurrent edits: Peer A deletes topic while Peer B moves another — delete respected, move kept", () => {
  const base = conv({
    nodes: [
      node("n1", "Venue", { x: 0, y: 0 }),
      node("n2", "Catering", { x: 50, y: 50 }),
    ],
    edges: [edge("n1", "n2")],
  });
  // Peer A deleted "Venue":
  const theirs = conv({
    nodes: [node("n2", "Catering", { x: 50, y: 50 })],
    edges: [],
    deletedTopicLabels: ["venue"],
  });
  // Peer B moved "Catering" to (200, 300):
  const mine = conv({
    nodes: [
      node("n1", "Venue", { x: 0, y: 0 }),
      node("n2", "Catering", { x: 200, y: 300 }),
    ],
    edges: [edge("n1", "n2")],
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.nodes.map((n) => n.id), ["n2"]);
  assertEquals(merged.nodes[0].position, { x: 200, y: 300 });
  assertEquals(merged.edges.length, 0);
});

Deno.test("concurrent edits: Peer A completes task 1, Peer B completes task 2 — both complete", () => {
  const base = conv({
    actionItems: [
      item("t1", "Book venue", "pending"),
      item("t2", "Order cake", "pending"),
    ],
  });
  const theirs = conv({
    actionItems: [
      item("t1", "Book venue", "completed"),
      item("t2", "Order cake", "pending"),
    ],
  });
  const mine = conv({
    actionItems: [
      item("t1", "Book venue", "pending"),
      item("t2", "Order cake", "completed"),
    ],
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(
    merged.actionItems.map((i) => [i.id, i.status]),
    [
      ["t1", "completed"],
      ["t2", "completed"],
    ],
  );
});

Deno.test("concurrent edits: Peer A adds node, Peer B adds node — both nodes survive", () => {
  const base = conv({ nodes: [node("n1", "Base")] });
  const theirs = conv({ nodes: [node("n1", "Base"), node("n2", "Theirs")] });
  const mine = conv({ nodes: [node("n1", "Base"), node("n3", "Mine")] });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.nodes.map((n) => n.id).sort(), ["n1", "n2", "n3"]);
});

// ── 3. LOCAL IN-FLIGHT DELETIONS ───────────────────────────────────────────

Deno.test("local in-flight delete: Peer B deleted node in-flight while Peer A renamed another", () => {
  const base = conv({
    nodes: [node("n1", "Keep Me"), node("n2", "Delete Me")],
  });
  const theirs = conv({
    nodes: [node("n1", "Keep Me (Renamed)"), node("n2", "Delete Me")],
  });
  const mine = conv({
    nodes: [node("n1", "Keep Me")],
    deletedTopicLabels: ["delete me"],
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.nodes.map((n) => n.id), ["n1"]);
  assertEquals(merged.nodes[0].label, "Keep Me (Renamed)");
});

// ── 4. CLIENT-ONLY FIELDS PRESERVED ────────────────────────────────────────

Deno.test("client-only fields: notes, magpie, whiteboardScene survive room update", () => {
  const base = conv({
    nodes: [node("n1", "Topic")],
    notes: "My secret scratch notes",
    whiteboardScene: '{"elements":[1]}',
  });
  const theirs = conv({
    nodes: [node("n1", "Topic"), node("n2", "Room Topic")],
    // room snapshot never includes notes or whiteboard
  });
  const mine = conv({
    nodes: [node("n1", "Topic")],
    notes: "My secret scratch notes (edited)",
    whiteboardScene: '{"elements":[1, 2]}',
  });

  const merged = reconcileRoomUpdate(base, mine, theirs);
  assertEquals(merged.nodes.map((n) => n.id), ["n1", "n2"]);
  assertEquals(merged.notes, "My secret scratch notes (edited)");
  assertEquals(merged.whiteboardScene, '{"elements":[1, 2]}');
});

// ── 5. IS QUIET PEER DETECTOR ──────────────────────────────────────────────

Deno.test("isQuietPeer correctly distinguishes quiet peers from peers with edits", () => {
  const base = conv({
    nodes: [node("n1", "Topic", { x: 10, y: 20 })],
    actionItems: [item("t1", "Task")],
  });
  const quiet = conv({
    nodes: [node("n1", "Topic", { x: 10, y: 20 })],
    actionItems: [item("t1", "Task")],
    notes: "local notes don't break quiet status",
  });
  const moved = conv({
    nodes: [node("n1", "Topic", { x: 99, y: 99 })],
    actionItems: [item("t1", "Task")],
  });
  const checked = conv({
    nodes: [node("n1", "Topic", { x: 10, y: 20 })],
    actionItems: [item("t1", "Task", "completed")],
  });

  assertEquals(isQuietPeer(base, quiet), true);
  assertEquals(isQuietPeer(base, moved), false);
  assertEquals(isQuietPeer(base, checked), false);
});
