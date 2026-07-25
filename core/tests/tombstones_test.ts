/**
 * Delete memory (tombstones) — the delete twin of merge aliases.
 *
 * Merge memory stops appends resurrecting merged-away topics; these tests
 * pin the same promise for DELETED topics and action items: what the user
 * removed stays removed across future appends, and comes back only when the
 * user brings it back on purpose (re-add, or rename-to).
 *
 * Pure functions, no globals (project convention).
 */

import { assertEquals } from "./_assert.ts";
import {
  addTopic,
  deleteTopic,
  mergeTopics,
  renameTopic,
  updateActionItems,
} from "../orchestration/conversation-ops.ts";
import {
  normalizeDescription,
  remapExtractedByAlias,
} from "../orchestration/append-merge.ts";
import { reconcileAppendResult } from "../orchestration/append-reconcile.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function item(
  id: string,
  description: string,
  status: "pending" | "completed" = "pending",
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
  };
}

function node(
  id: string,
  label: string,
  aliases?: string[],
): ConversationData["nodes"][number] {
  return {
    id,
    label,
    emoji: "🐸",
    color: "#FF69B4",
    ...(aliases ? { aliases } : {}),
  };
}

function conv(over: Partial<ConversationData> = {}): ConversationData {
  return {
    conversation: { id: "c1", source: "audio", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [],
    edges: [],
    actionItems: [],
    statusUpdates: [],
    summary: "",
    ...over,
  };
}

// ── writing tombstones ──────────────────────────────────────────────────────

Deno.test("deleteTopic tombstones the label AND everything it absorbed", () => {
  const data = conv({
    nodes: [node("radio", "Swamp Radio", ["frog choir"])],
  });
  const after = deleteTopic(data, "radio");
  assertEquals(after.nodes.length, 0);
  assertEquals(after.deletedTopicLabels, [
    normalizeDescription("Swamp Radio"),
    normalizeDescription("frog choir"),
  ]);
});

Deno.test("updateActionItems: deleting a PENDING item tombstones it; clearing a DONE one doesn't", () => {
  const data = conv({
    actionItems: [
      item("a1", "tune the frog choir", "pending"),
      item("a2", "mic the rain barrel", "completed"),
    ],
  });
  const after = updateActionItems(data, []);
  assertEquals(after.deletedActionDescriptions, [
    normalizeDescription("tune the frog choir"),
  ]);
});

// ── clearing tombstones (the user changed their mind) ───────────────────────

Deno.test("addTopic clears a matching tombstone — re-add means it's wanted again", () => {
  const data = conv({
    deletedTopicLabels: [normalizeDescription("frog choir")],
  });
  const { data: after } = addTopic(data, { label: "Frog Choir" });
  assertEquals(after.deletedTopicLabels ?? [], []);
  assertEquals(after.nodes.length, 1);
});

Deno.test("renameTopic TO a tombstoned name clears the tombstone", () => {
  const data = conv({
    nodes: [node("shed", "moon shed")],
    deletedTopicLabels: [normalizeDescription("frog choir")],
  });
  const after = renameTopic(data, "shed", "Frog Choir");
  assertEquals(after.deletedTopicLabels ?? [], []);
  assertEquals(after.nodes[0].label, "Frog Choir");
});

Deno.test("updateActionItems: re-adding a tombstoned description clears it", () => {
  const data = conv({
    deletedActionDescriptions: [normalizeDescription("tune the frog choir")],
  });
  const after = updateActionItems(data, [
    item("a9", "Tune the Frog Choir!"),
  ]);
  assertEquals(after.deletedActionDescriptions ?? [], []);
});

// ── enforcing tombstones on the append round-trip ───────────────────────────

Deno.test("reconcile drops a tombstoned server-new topic and its edges — even with zero in-flight edits", () => {
  // mine === base on purpose: a topic deleted LAST SESSION isn't an in-flight
  // edit, and the old fast path would have let it straight through.
  const base = conv({
    nodes: [node("shed", "moon shed")],
    deletedTopicLabels: [normalizeDescription("frog choir")],
  });
  const theirs = conv({
    nodes: [node("shed", "moon shed"), node("fresh-1", "Frog Choir")],
    edges: [{
      id: "e1",
      source_topic_id: "fresh-1",
      target_topic_id: "shed",
      color: "#888",
    }],
  });
  const out = reconcileAppendResult(base, base, theirs);
  assertEquals(out.nodes.map((n) => n.id), ["shed"]);
  assertEquals(out.edges.length, 0);
  // Delete memory survives the round-trip (the server never echoes it).
  assertEquals(out.deletedTopicLabels, base.deletedTopicLabels);
});

Deno.test("reconcile drops a tombstoned server-new action item", () => {
  const base = conv({
    deletedActionDescriptions: [normalizeDescription("tune the frog choir")],
  });
  const theirs = conv({
    actionItems: [
      item("srv-1", "Tune the frog choir"),
      item("srv-2", "oil the shed door"),
    ],
  });
  const out = reconcileAppendResult(base, base, theirs);
  assertEquals(out.actionItems.map((i) => i.id), ["srv-2"]);
  assertEquals(
    out.deletedActionDescriptions,
    base.deletedActionDescriptions,
  );
});

// ── normalizer pin (audit finding: two normalizers must not drift) ──────────

Deno.test("an alias stored by mergeTopics with punctuation/case still routes the remap", () => {
  // mergeTopics stores aliases with its own light normalizer; the append
  // remap matches with normalizeDescription. This pins that a punctuated,
  // cased label survives the storage→match round trip.
  const data = conv({
    nodes: [node("radio", "swamp radio"), node("choir", "Frog Choir!")],
  });
  const merged = mergeTopics(data, "choir", "radio");
  const { nodes } = remapExtractedByAlias(
    merged.nodes,
    [{ id: "fresh-1", label: "frog choir", emoji: "🐸", color: "#333333" }],
    [],
  );
  assertEquals(nodes.length, 0); // folded into the survivor, not re-added
});
