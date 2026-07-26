import { assertEquals } from "$std/assert/mod.ts";
import {
  computeAppendReceipt,
  formatAppendReceipt,
} from "../orchestration/append-receipt.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function conv(partial: Partial<ConversationData>): ConversationData {
  return {
    conversation: { id: "c1", source: "audio", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [],
    edges: [],
    actionItems: [],
    statusUpdates: [],
    ...partial,
  };
}

function node(id: string) {
  return { id, label: id, emoji: "🦆", color: "#eee" };
}

function item(
  id: string,
  status: "pending" | "completed",
  ai_checked?: boolean,
) {
  return {
    id,
    conversation_id: "c1",
    description: id,
    assignee: null,
    due_date: null,
    status,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...(ai_checked !== undefined ? { ai_checked } : {}),
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("receipt counts new topics and new tasks", () => {
  const base = conv({
    nodes: [node("a")],
    actionItems: [item("t1", "pending")],
  });
  const next = conv({
    nodes: [node("a"), node("b"), node("c")],
    actionItems: [item("t1", "pending"), item("t2", "pending")],
  });
  // The AI produced everything in `next` this round.
  const r = computeAppendReceipt(base, next, next);
  assertEquals(r, {
    topicsAdded: 2,
    itemsAdded: 1,
    itemsCompleted: 0,
    itemsReopened: 0,
  });
});

Deno.test("in-flight user additions are not credited to the take", () => {
  const base = conv({
    nodes: [node("a")],
    actionItems: [item("t1", "pending")],
  });
  // The server heard one new topic ("b") and one new task ("t2").
  const theirs = conv({
    nodes: [node("a"), node("b")],
    actionItems: [item("t1", "pending"), item("t2", "pending")],
  });
  // Reconcile kept those AND the topic/task the user added mid-round-trip.
  const next = conv({
    nodes: [node("a"), node("b"), node("user-added")],
    actionItems: [
      item("t1", "pending"),
      item("t2", "pending"),
      item("user-typed", "pending"),
    ],
  });
  const r = computeAppendReceipt(base, next, theirs);
  assertEquals(r.topicsAdded, 1);
  assertEquals(r.itemsAdded, 1);
});

Deno.test("a suggestion reconcile dropped is not counted as added", () => {
  const base = conv({ actionItems: [item("t1", "pending")] });
  // Server re-extracted a task the user had already deleted (tombstoned), so
  // reconcile filtered it out — the map never gained it.
  const theirs = conv({
    actionItems: [item("t1", "pending"), item("zombie", "pending")],
  });
  const next = conv({ actionItems: [item("t1", "pending")] });
  assertEquals(computeAppendReceipt(base, next, theirs).itemsAdded, 0);
});

Deno.test("receipt attributes only ai_checked flips to the take", () => {
  const base = conv({
    actionItems: [
      item("ai-done", "pending"),
      item("user-done", "pending"),
      item("ai-reopen", "completed"),
    ],
  });
  const next = conv({
    actionItems: [
      item("ai-done", "completed", true), // AI checked it off
      item("user-done", "completed"), // user toggled mid-flight — not the take's
      item("ai-reopen", "pending", true), // AI reopened it
    ],
  });
  const r = computeAppendReceipt(base, next, next);
  assertEquals(r.itemsCompleted, 1);
  assertEquals(r.itemsReopened, 1);
});

Deno.test("null base counts everything as added, nothing as flipped", () => {
  const next = conv({
    nodes: [node("a")],
    actionItems: [item("t1", "completed", true)],
  });
  // base null → reconcile passes THEIRS straight through, so next IS theirs.
  const r = computeAppendReceipt(null, next, next);
  assertEquals(r, {
    topicsAdded: 1,
    itemsAdded: 1,
    itemsCompleted: 0,
    itemsReopened: 0,
  });
});

Deno.test("formatAppendReceipt joins parts and pluralizes", () => {
  assertEquals(
    formatAppendReceipt({
      topicsAdded: 2,
      itemsAdded: 1,
      itemsCompleted: 1,
      itemsReopened: 0,
    }),
    "+2 topics · 1 new task · ✓ 1 done",
  );
  assertEquals(
    formatAppendReceipt({
      topicsAdded: 0,
      itemsAdded: 0,
      itemsCompleted: 0,
      itemsReopened: 2,
    }),
    "↺ 2 reopened",
  );
  assertEquals(
    formatAppendReceipt({
      topicsAdded: 0,
      itemsAdded: 0,
      itemsCompleted: 0,
      itemsReopened: 0,
    }),
    "",
  );
});
