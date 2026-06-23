import { assertEquals } from "./_assert.ts";
import {
  cleanJsonResponse,
  normalizeActionItemInput,
  normalizeStatusUpdate,
  normalizeTopicGraph,
  parseActionItemsResponse,
  parseGraphResponse,
  parseStatusUpdatesResponse,
  withRetry,
} from "../ai/helpers.ts";

// ===================================================================
// withRetry
// ===================================================================

Deno.test("withRetry retries transient errors then succeeds", async () => {
  let calls = 0;
  const result = await withRetry(
    () => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("503 overload"));
      return Promise.resolve("ok");
    },
    3,
    1,
  );
  assertEquals(result, "ok");
  assertEquals(calls, 3);
});

Deno.test("withRetry does not retry non-transient errors", async () => {
  let calls = 0;
  let threw = false;
  try {
    await withRetry(
      () => {
        calls++;
        return Promise.reject(new Error("400 bad request"));
      },
      3,
      1,
    );
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(calls, 1); // gave up immediately, no retry
});

Deno.test("cleanJsonResponse strips markdown code fences", () => {
  assertEquals(cleanJsonResponse('```json\n{"a":1}\n```'), '{"a":1}');
  assertEquals(cleanJsonResponse("```\n[]\n```"), "[]");
});

Deno.test("parseActionItemsResponse capitalizes and normalizes nulls", () => {
  const items = parseActionItemsResponse(
    '[{"description":"send the recap","assignee":"null","due_date":"2026-07-01"}]',
  );
  assertEquals(items.length, 1);
  assertEquals(items[0].description, "Send the recap");
  assertEquals(items[0].assignee, null);
  assertEquals(items[0].due_date, "2026-07-01");
});

Deno.test("parseActionItemsResponse: one malformed item does not discard the batch", () => {
  // Regression: previously a missing/null description threw inside .map(),
  // which the try/catch swallowed by returning [] — losing ALL items.
  const items = parseActionItemsResponse(
    JSON.stringify([
      { description: "Book the venue" },
      { assignee: "Sam" }, // no description -> must be skipped, not fatal
      { description: null }, // null description -> skipped
      { description: "  " }, // empty after trim -> skipped
      { description: "Confirm the date" },
    ]),
  );
  assertEquals(items.map((i) => i.description), [
    "Book the venue",
    "Confirm the date",
  ]);
});

Deno.test("parseActionItemsResponse returns [] for non-array / invalid JSON", () => {
  assertEquals(parseActionItemsResponse("not json"), []);
  assertEquals(parseActionItemsResponse('{"description":"x"}'), []);
});

Deno.test("parseGraphResponse extracts nodes/edges and tolerates junk", () => {
  const graph = parseGraphResponse(
    'prefix {"nodes":[{"id":"silk","label":"Silk"}],"edges":[]} suffix',
  );
  assertEquals(graph.nodes.length, 1);
  assertEquals(graph.edges.length, 0);
  assertEquals(parseGraphResponse("garbage"), { nodes: [], edges: [] });
});

// ===================================================================
// AI brain port: normalization layer
// ===================================================================

Deno.test("normalizeActionItemInput skips the legacy 'No action items' sentinel", () => {
  assertEquals(
    normalizeActionItemInput({ description: "No action items" }),
    null,
  );
  assertEquals(normalizeActionItemInput({ description: "" }), null);
  assertEquals(normalizeActionItemInput({ assignee: "Sam" }), null);
  assertEquals(
    normalizeActionItemInput({ description: "book venue", assignee: "null" }),
    { description: "Book venue", assignee: null, due_date: null },
  );
});

Deno.test("normalizeTopicGraph rejects generic IDs, dedupes nodes, drops bad edges", () => {
  const graph = normalizeTopicGraph({
    nodes: [
      { id: "node1", label: "Silk Yield", color: "#5B8DEF", emoji: "🧵" },
      { id: "node2", label: "silk yield", color: "bad", emoji: "" }, // dup label
      {
        id: "topic-3",
        label: "Public Backlash",
        color: "#D66B8F",
        emoji: "📣",
      },
      { label: "" }, // empty label -> dropped
    ],
    edges: [
      {
        source_topic_id: "node1",
        target_topic_id: "topic-3",
        color: "#888888",
      },
      { source_topic_id: "node1", target_topic_id: "node1" }, // self loop -> drop
      { source_topic_id: "node1", target_topic_id: "ghost" }, // dangling -> drop
      { source_topic_id: "node1", target_topic_id: "topic-3" }, // dup -> drop
    ],
  });
  // generic ids became slugs; dup label collapsed; empty dropped
  assertEquals(graph.nodes.map((n) => n.id), ["silk-yield", "public-backlash"]);
  // only the one valid edge survives, remapped to slug ids
  assertEquals(graph.edges.length, 1);
  assertEquals(graph.edges[0], {
    source_topic_id: "silk-yield",
    target_topic_id: "public-backlash",
    color: "#888888",
  });
});

Deno.test("normalizeStatusUpdate validates id membership and status enum", () => {
  const ids = new Set(["a1", "a2"]);
  assertEquals(
    normalizeStatusUpdate(
      { id: "a1", status: "completed", reason: "done" },
      ids,
    ),
    { id: "a1", description: "", status: "completed", reason: "done" },
  );
  // hallucinated id -> rejected
  assertEquals(
    normalizeStatusUpdate({ id: "zzz", status: "completed" }, ids),
    null,
  );
  // bad status -> rejected
  assertEquals(normalizeStatusUpdate({ id: "a1", status: "maybe" }, ids), null);
});

Deno.test("parseStatusUpdatesResponse filters to known ids", () => {
  const ids = new Set(["a1"]);
  const updates = parseStatusUpdatesResponse(
    JSON.stringify([
      { id: "a1", status: "completed", reason: "shipped" },
      { id: "ghost", status: "completed", reason: "hallucinated" },
    ]),
    ids,
  );
  assertEquals(updates.length, 1);
  assertEquals(updates[0].id, "a1");
});

// ===================================================================
// Parse-error sink (audit #8 degradation surface) — failures must SIGNAL,
// not just silently return empty.
// ===================================================================

Deno.test("parseActionItemsResponse fires onParseError on garbled JSON", () => {
  let signalled = "";
  const items = parseActionItemsResponse("not json at all", (what) => {
    signalled = what;
  });
  assertEquals(items, []);
  assertEquals(signalled, "action items");
});

Deno.test("parseActionItemsResponse does NOT fire onParseError on valid input", () => {
  let fired = false;
  parseActionItemsResponse('[{"description":"feed the cat"}]', () => {
    fired = true;
  });
  assertEquals(fired, false);
});

Deno.test("parseGraphResponse fires onParseError on garbled JSON", () => {
  let signalled = "";
  const graph = parseGraphResponse("totally broken {", (what) => {
    signalled = what;
  });
  assertEquals(graph, { nodes: [], edges: [] });
  assertEquals(signalled, "topic map");
});

Deno.test("parseStatusUpdatesResponse fires onParseError on garbled JSON", () => {
  let signalled = "";
  parseStatusUpdatesResponse("{not an array", new Set(["a1"]), (what) => {
    signalled = what;
  });
  assertEquals(signalled, "self-checkoff updates");
});
