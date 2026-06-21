import { assertEquals } from "./_assert.ts";
import {
  cleanJsonResponse,
  parseActionItemsResponse,
  parseGraphResponse,
} from "../ai/helpers.ts";

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
    'prefix {"nodes":[{"id":"a"}],"edges":[]} suffix',
  );
  assertEquals(graph.nodes.length, 1);
  assertEquals(graph.edges.length, 0);
  assertEquals(parseGraphResponse("garbage"), { nodes: [], edges: [] });
});
