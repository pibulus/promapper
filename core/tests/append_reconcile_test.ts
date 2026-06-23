/**
 * Tests for reconcileAppendResult — the three-way merge that protects a user's
 * in-flight edits (made during the 5-10s append round-trip) from being clobbered
 * by the server result. Pure function, no globals (project convention).
 *
 * BASE   = request-time snapshot the server merged against
 * THEIRS = server result (authoritative for AI growth + status checkoffs)
 * MINE   = current signal (BASE + the user's in-flight edits)
 */

import { assertEquals } from "./_assert.ts";
import { reconcileAppendResult } from "../orchestration/append-reconcile.ts";
import type { ConversationData } from "../types/conversation-data.ts";

// ── tiny builders, in the project's warm test-data voice ────────────────────
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
): ConversationData["nodes"][number] {
  return { id, label, emoji: "\u{1F408}", color: "#FF69B4", position: pos };
}

function edge(
  s: string,
  t: string,
): ConversationData["edges"][number] {
  return {
    id: `${s}-${t}`,
    source_topic_id: s,
    target_topic_id: t,
    color: "#888",
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

// ── S1: in-flight toggle ────────────────────────────────────────────────────
Deno.test("S1 toggle: user completes an item the AI left pending — toggle wins", () => {
  const base = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  const theirs = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  // Manual toggle: completed, ai_checked stripped (toggleActionItemStatus does this).
  const mine = conv({
    actionItems: [item("a1", "feed the cat", "completed")],
  });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.actionItems[0].status, "completed");
  assertEquals("ai_checked" in out.actionItems[0], false);
});

Deno.test("S1 inverse: AI checks off an item the user didn't touch — AI checkoff (incl. reason) wins", () => {
  const base = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  const theirs = conv({
    actionItems: [
      item("a1", "feed the cat", "completed", {
        ai_checked: true,
        checked_reason: "they said the cat is fed",
      }),
    ],
  });
  const mine = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.actionItems[0].status, "completed");
  assertEquals(out.actionItems[0].ai_checked, true);
  assertEquals(out.actionItems[0].checked_reason, "they said the cat is fed");
});

Deno.test("S1 both-changed: user manually completed AND AI also checked off — USER wins, ai_checked stripped", () => {
  // base pending; both sides move it to completed, but for different reasons:
  // the AI attributes it (ai_checked) while the user's manual toggle strips that
  // attribution. User-wins means completed WITHOUT the AI flags — the manual
  // override must not silently inherit the AI's reason.
  const base = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  const theirs = conv({
    actionItems: [
      item("a1", "feed the cat", "completed", {
        ai_checked: true,
        checked_reason: "assumed done",
      }),
    ],
  });
  // User manually completed it in-flight (toggleActionItemStatus strips flags).
  const mine = conv({ actionItems: [item("a1", "feed the cat", "completed")] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.actionItems[0].status, "completed");
  assertEquals("ai_checked" in out.actionItems[0], false);
  assertEquals("checked_reason" in out.actionItems[0], false);
});

// ── S2: in-flight delete (no resurrection) ──────────────────────────────────
Deno.test("S2 node delete: deleted topic + its edges are not resurrected", () => {
  const base = conv({
    nodes: [node("budget", "budget"), node("moth", "moth")],
    edges: [edge("budget", "moth")],
  });
  const theirs = conv({
    nodes: [node("budget", "budget"), node("moth", "moth")],
    edges: [edge("budget", "moth")],
  });
  // User deleted "moth" in-flight.
  const mine = conv({ nodes: [node("budget", "budget")], edges: [] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.nodes.map((n) => n.id), ["budget"]);
  assertEquals(out.edges.length, 0); // edge cascaded out
});

Deno.test("S2 item delete + AI re-extracts same desc: not resurrected under a new id (tombstone)", () => {
  const base = conv({ actionItems: [item("a1", "feed the cat")] });
  // Server preserved a1 AND extracted the same task fresh as b9.
  const theirs = conv({
    actionItems: [item("a1", "feed the cat"), item("b9", "feed the cat")],
  });
  // User deleted a1 in-flight.
  const mine = conv({ actionItems: [] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.actionItems.length, 0); // a1 dropped, b9 tombstoned
});

Deno.test("S2 edge delete: reverse twin doesn't resurrect a severed undirected edge", () => {
  const base = conv({
    nodes: [node("a", "a"), node("b", "b")],
    edges: [edge("a", "b")],
  });
  // Server re-emitted the same relationship in the other direction.
  const theirs = conv({
    nodes: [node("a", "a"), node("b", "b")],
    edges: [edge("b", "a")],
  });
  // User severed a<->b in-flight.
  const mine = conv({ nodes: [node("a", "a"), node("b", "b")], edges: [] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.edges.length, 0);
});

// ── S3: in-flight drag ──────────────────────────────────────────────────────
Deno.test("S3 drag: user's new position survives AND the latest AI label is kept", () => {
  const base = conv({ nodes: [node("moth", "moth", { x: 100, y: 100 })] });
  // Server carried the request-time position (always does) but relabelled.
  const theirs = conv({
    nodes: [node("moth", "moth in the lamp", { x: 100, y: 100 })],
  });
  // User dragged it during the append.
  const mine = conv({ nodes: [node("moth", "moth", { x: 540, y: 300 })] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.nodes[0].position, { x: 540, y: 300 });
  assertEquals(out.nodes[0].label, "moth in the lamp");
});

// ── S4: determinism / idempotency (the live-collab safety property) ─────────
Deno.test("S4 determinism: reconcile is byte-stable across calls (no clock drift)", () => {
  const base = conv({
    actionItems: [item("a1", "feed the cat")],
    nodes: [node("moth", "moth", { x: 0, y: 0 })],
  });
  const theirs = conv({
    actionItems: [item("a1", "feed the cat"), item("b2", "buy a new lamp")],
    nodes: [node("moth", "moth", { x: 0, y: 0 })],
  });
  const mine = conv({
    actionItems: [item("a1", "feed the cat", "completed")],
    nodes: [node("moth", "moth", { x: 7, y: 9 })],
  });
  const once = reconcileAppendResult(base, mine, theirs);
  const twice = reconcileAppendResult(base, mine, theirs);
  assertEquals(once, twice);
});

Deno.test("S4 idempotency: reconciling an already-reconciled MINE re-yields the same result", () => {
  const base = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  const theirs = conv({ actionItems: [item("a1", "feed the cat", "pending")] });
  const mine = conv({ actionItems: [item("a1", "feed the cat", "completed")] });
  const first = reconcileAppendResult(base, mine, theirs);
  const second = reconcileAppendResult(base, first, theirs);
  assertEquals(second, first);
});

// ── passthrough fast paths ──────────────────────────────────────────────────
Deno.test("passthrough: null base returns theirs unchanged (ref-equal)", () => {
  const theirs = conv({ summary: "fresh conversation" });
  const out = reconcileAppendResult(null, conv(), theirs);
  assertEquals(out === theirs, true);
});

Deno.test("passthrough: mine === base (no in-flight edits) returns theirs (ref-equal)", () => {
  const base = conv({ actionItems: [item("a1", "feed the cat")] });
  const theirs = conv({ actionItems: [item("a1", "feed the cat")] });
  const out = reconcileAppendResult(base, base, theirs);
  assertEquals(out === theirs, true);
});

// ── speaker rename reapplied over the server's fresh transcript ──────────────
Deno.test("speaker rename: in-flight Sam->Sammy survives onto the server's concatenated transcript", () => {
  const base = conv({
    transcript: { text: "Sam: hi", speakers: ["Sam"] },
    conversation: { id: "c1", source: "audio", transcript: "Sam: hi" },
  });
  const theirs = conv({
    transcript: {
      text: "Sam: hi\n\n--- New Recording ---\n\nSam: bye",
      speakers: ["Sam"],
    },
    conversation: {
      id: "c1",
      source: "audio",
      transcript: "Sam: hi\n\n--- New Recording ---\n\nSam: bye",
    },
  });
  // User renamed Sam -> Sammy during the append.
  const mine = conv({
    transcript: { text: "Sammy: hi", speakers: ["Sammy"] },
    conversation: { id: "c1", source: "audio", transcript: "Sammy: hi" },
  });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.transcript.speakers, ["Sammy"]);
  assertEquals(out.transcript.text.includes("Sammy: hi"), true);
  assertEquals(out.transcript.text.includes("Sammy: bye"), true);
  assertEquals(out.transcript.text.includes("Sam:"), false);
});

// ── user-added item dedupe against the AI's independent extraction ──────────
Deno.test("user-added item that the AI also extracted collapses to one (semantic dedupe)", () => {
  const base = conv({ actionItems: [] });
  // User typed an item in-flight...
  const mine = conv({ actionItems: [item("u1", "Send the recap email")] });
  // ...and the AI independently extracted the same task with only filler/punct
  // differences (normalizeDescription collapses "the"/punctuation).
  const theirs = conv({ actionItems: [item("ai1", "send recap email.")] });
  const out = reconcileAppendResult(base, mine, theirs);
  assertEquals(out.actionItems.length, 1);
});
