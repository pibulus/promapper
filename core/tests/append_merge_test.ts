import { assertEquals } from "./_assert.ts";
import {
  mergeAppendActionItems,
  mergeAppendEdges,
  mergeAppendNodes,
  mergeAppendSummary,
  normalizeDescription,
  remapExtractedByAlias,
} from "../orchestration/append-merge.ts";
import type { ActionItem } from "../types/index.ts";

interface TestNode {
  id: string;
  label: string;
  emoji: string;
  color: string;
  position?: { x: number; y: number };
}

interface TestEdge {
  id?: string;
  source_topic_id: string;
  target_topic_id: string;
  color: string;
}

function node(id: string, label = id, extra: Partial<TestNode> = {}): TestNode {
  return { id, label, emoji: "💡", color: "#cccccc", ...extra };
}

function edge(source: string, target: string, id?: string): TestEdge {
  return {
    id,
    source_topic_id: source,
    target_topic_id: target,
    color: "#999",
  };
}

const timestamp = "2026-06-10T00:00:00.000Z";

function item(
  id: string,
  description: string,
  status: "pending" | "completed" = "pending",
): ActionItem {
  return {
    id,
    conversation_id: "conversation-1",
    description,
    assignee: null,
    due_date: null,
    status,
    created_at: "2026-06-09T00:00:00.000Z",
    updated_at: "2026-06-09T00:00:00.000Z",
  };
}

Deno.test("mergeAppendActionItems applies status updates to existing items", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Send the recap")],
    [item("new-1", "Book the venue")],
    [{
      id: "existing-1",
      status: "completed",
      reason: "The new recording says the recap was sent.",
    }],
    timestamp,
  );

  assertEquals(merged.length, 2);
  assertEquals(merged[0].status, "completed");
  assertEquals(merged[0].ai_checked, true);
  assertEquals(
    merged[0].checked_reason,
    "The new recording says the recap was sent.",
  );
  assertEquals(merged[0].updated_at, timestamp);
  assertEquals(merged[1].description, "Book the venue");
});

Deno.test("mergeAppendActionItems can reopen an existing completed item", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Publish the post", "completed")],
    [],
    [{
      id: "existing-1",
      status: "pending",
      reason: "The recording clarified it is not published yet.",
    }],
    timestamp,
  );

  assertEquals(merged.length, 1);
  assertEquals(merged[0].status, "pending");
  assertEquals(merged[0].ai_checked, true);
});

Deno.test("mergeAppendActionItems skips duplicate extracted items", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Send the recap")],
    [
      item("new-1", " send the recap "),
      item("new-2", "Confirm launch date"),
    ],
    [],
    timestamp,
  );

  assertEquals(merged.map((actionItem) => actionItem.description), [
    "Send the recap",
    "Confirm launch date",
  ]);
});

Deno.test("mergeAppendActionItems skips semantic duplicates (punctuation + filler)", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Send the recap email")],
    [
      item("new-1", "send recap email."),
      item("new-2", "Please send the recap email!"),
      item("new-3", "Book the venue"),
    ],
    [],
    timestamp,
  );

  assertEquals(merged.map((actionItem) => actionItem.description), [
    "Send the recap email",
    "Book the venue",
  ]);
});

Deno.test("mergeAppendActionItems dedupes within the extracted batch", () => {
  const merged = mergeAppendActionItems(
    [],
    [
      item("new-1", "Confirm the launch date"),
      item("new-2", "confirm launch date"),
    ],
    [],
    timestamp,
  );

  assertEquals(merged.length, 1);
  assertEquals(merged[0].description, "Confirm the launch date");
});

Deno.test("mergeAppendActionItems keeps distinct tasks that share words", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Email the client")],
    [item("new-1", "Email the designer")],
    [],
    timestamp,
  );

  assertEquals(merged.length, 2);
});

// ===================================================================
// TOPIC MAP UNION (append grows the map, never replaces it)
// ===================================================================

Deno.test("mergeAppendNodes keeps existing topics the new clip didn't mention", () => {
  const existing = [node("alpha"), node("beta")];
  const extracted = [node("gamma")]; // new clip only mentioned gamma
  const merged = mergeAppendNodes(existing, extracted);
  assertEquals(merged.map((n) => n.id).sort(), ["alpha", "beta", "gamma"]);
});

Deno.test("mergeAppendNodes: new wins on label/emoji, existing position preserved", () => {
  const existing = [
    node("alpha", "Old Label", { position: { x: 100, y: 200 }, emoji: "🌱" }),
  ];
  const extracted = [node("alpha", "New Label", { emoji: "🌳" })];
  const merged = mergeAppendNodes(existing, extracted);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].label, "New Label");
  assertEquals(merged[0].emoji, "🌳");
  // Hand-dragged position survives even though the new node had none.
  assertEquals(merged[0].position, { x: 100, y: 200 });
});

Deno.test("mergeAppendNodes adds brand-new topics from the new clip", () => {
  const merged = mergeAppendNodes([node("alpha")], [
    node("alpha"),
    node("beta"),
  ]);
  assertEquals(merged.map((n) => n.id).sort(), ["alpha", "beta"]);
});

Deno.test("mergeAppendEdges unions edges without dropping or duplicating", () => {
  const existing = [edge("a", "b", "e1")];
  const extracted = [edge("a", "b"), edge("b", "c")]; // a->b dupes, b->c is new
  const valid = new Set(["a", "b", "c"]);
  const merged = mergeAppendEdges(existing, extracted, valid);
  // a->b kept once (with its original id), b->c added.
  assertEquals(merged.length, 2);
  const ab = merged.find((e) =>
    e.source_topic_id === "a" && e.target_topic_id === "b"
  );
  assertEquals(ab?.id, "e1"); // existing edge kept its identity
});

Deno.test("mergeAppendEdges drops dangling edges and self-loops", () => {
  const valid = new Set(["a", "b"]);
  const merged = mergeAppendEdges([], [
    edge("a", "b"),
    edge("a", "z"), // z not in node set -> dropped
    edge("a", "a"), // self-loop -> dropped
  ], valid);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].source_topic_id, "a");
  assertEquals(merged[0].target_topic_id, "b");
});

Deno.test("normalizeDescription collapses noise but preserves meaning", () => {
  assertEquals(
    normalizeDescription("Please send the recap email!"),
    normalizeDescription("send recap email"),
  );
  assertEquals(normalizeDescription("Book the venue."), "book venue");
  // Distinct tasks must not collapse together
  if (
    normalizeDescription("Email the client") ===
      normalizeDescription("Email the designer")
  ) {
    throw new Error("distinct descriptions normalized to the same key");
  }
});

// ===================================================================
// mergeAppendSummary
// ===================================================================

Deno.test("summary merge keeps base + only the latest update block", () => {
  const first = mergeAppendSummary(
    "The town met about the fox.",
    "Fox update one.",
  );
  assertEquals(
    first,
    "The town met about the fox.\n\n**Update from latest recording:**\nFox update one.",
  );
  const second = mergeAppendSummary(first, "Fox update two.");
  assertEquals(
    second,
    "The town met about the fox.\n\n**Update from latest recording:**\nFox update two.",
  );
});

Deno.test("summary merge with no existing summary returns the new one", () => {
  assertEquals(mergeAppendSummary(null, "Fresh summary."), "Fresh summary.");
  assertEquals(mergeAppendSummary("", "Fresh summary."), "Fresh summary.");
});

Deno.test("empty new summary leaves the existing one untouched (short rounds)", () => {
  assertEquals(mergeAppendSummary("Keep me.", ""), "Keep me.");
  assertEquals(mergeAppendSummary(null, ""), "");
});

Deno.test("no-op status flips don't stamp ai_checked (phantom sparkle guard)", () => {
  const existing: ActionItem[] = [{
    id: "fence",
    conversation_id: "c",
    description: "Mend the west fence",
    assignee: null,
    due_date: null,
    status: "pending",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
  }];
  const merged = mergeAppendActionItems(existing, [], [
    { id: "fence", status: "pending", reason: "sarcasm, actually" },
  ]);
  assertEquals(merged[0].ai_checked, undefined);
  assertEquals(merged[0].updated_at, "2026-07-18T00:00:00.000Z");
});

// ===================================================================
// MERGE MEMORY — remapExtractedByAlias routes dead names to survivors
// ===================================================================

const swampNodes = [
  {
    id: "radio",
    label: "swamp radio",
    emoji: "📻",
    color: "#111111",
    aliases: ["frog choir"],
  },
  { id: "shed", label: "moon shed", emoji: "🌙", color: "#222222" },
];

Deno.test("remapExtractedByAlias: an alias-named extraction folds into its survivor", () => {
  const { nodes, edges } = remapExtractedByAlias(
    swampNodes,
    [
      { id: "fresh-1", label: "Frog Choir", emoji: "🐸", color: "#333333" },
      { id: "fresh-2", label: "tape hiss", emoji: "📼", color: "#444444" },
    ],
    [
      {
        source_topic_id: "fresh-1",
        target_topic_id: "fresh-2",
        color: "",
      },
    ],
  );
  // The dead name is NOT re-added; the genuinely-new topic survives.
  assertEquals(nodes.map((n) => n.id), ["fresh-2"]);
  // Its edge now hangs off the survivor.
  assertEquals(edges[0].source_topic_id, "radio");
  assertEquals(edges[0].target_topic_id, "fresh-2");
});

Deno.test("remapExtractedByAlias: a same-label new id folds in too (no twin nodes)", () => {
  const { nodes } = remapExtractedByAlias(
    swampNodes,
    [{ id: "fresh-9", label: "Moon Shed", emoji: "🌙", color: "#555555" }],
    [],
  );
  assertEquals(nodes.length, 0);
});

Deno.test("remapExtractedByAlias: reused ids and new topics pass through untouched", () => {
  const extracted = [
    { id: "radio", label: "swamp radio hour", emoji: "📻", color: "#666666" },
    { id: "fresh-3", label: "night walks", emoji: "🦉", color: "#777777" },
  ];
  const extractedEdges = [
    { source_topic_id: "radio", target_topic_id: "fresh-3", color: "" },
  ];
  const { nodes, edges } = remapExtractedByAlias(
    swampNodes,
    extracted,
    extractedEdges,
  );
  assertEquals(nodes, extracted);
  assertEquals(edges, extractedEdges);
});

Deno.test("remap + union: a resurrected edge to the survivor dies as a self-loop", () => {
  // Extraction re-emits "frog choir" AND links it to swamp radio — after the
  // remap that edge is radio->radio, and the union must drop it.
  const { nodes, edges } = remapExtractedByAlias(
    swampNodes,
    [{ id: "fresh-1", label: "frog choir", emoji: "🐸", color: "#333333" }],
    [{ source_topic_id: "fresh-1", target_topic_id: "radio", color: "" }],
  );
  const mergedNodes = mergeAppendNodes(swampNodes, nodes);
  const merged = mergeAppendEdges(
    [],
    edges,
    new Set(mergedNodes.map((n) => n.id)),
  );
  assertEquals(merged.length, 0);
  // And the survivor still holds its alias after the union.
  assertEquals(
    mergedNodes.find((n) => n.id === "radio")?.aliases,
    ["frog choir"],
  );
});
