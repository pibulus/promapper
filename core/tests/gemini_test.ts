/**
 * Tests for core/ai/gemini.ts
 *
 * Uses a mock model to test service behaviour without real API calls.
 */

import { assertEquals, assertRejects } from "./_assert.ts";

import { createGeminiService } from "../ai/gemini.ts";
import type { ActionItem } from "../types/index.ts";

// ===================================================================
// MOCK HELPERS
// ===================================================================

function mockModel(responseText: string) {
  return {
    generateContent: async (_prompt: unknown) => ({
      response: {
        text: () => responseText,
      },
    }),
  };
}

function mockModelThrows(errorMsg: string) {
  return {
    generateContent: async (_prompt: unknown) => {
      throw new Error(errorMsg);
    },
  };
}

// ===================================================================
// generateTitle
// ===================================================================

Deno.test("generateTitle returns trimmed response", async () => {
  const service = createGeminiService(mockModel("  Team Sync  "));
  const title = await service.generateTitle(
    "Alice: Let's discuss the roadmap.",
  );
  assertEquals(title, "Team Sync");
});

Deno.test("generateTitle throws on model failure", async () => {
  const service = createGeminiService(mockModelThrows("API error"));
  await assertRejects(
    () => service.generateTitle("test"),
    Error,
    "Failed to generate title",
  );
});

// ===================================================================
// extractActionItems
// ===================================================================

Deno.test("extractActionItems parses valid JSON array", async () => {
  const json = JSON.stringify([
    { description: "write report", assignee: "Alice", due_date: "2025-12-01" },
  ]);
  const service = createGeminiService(mockModel(json));
  const items = await service.extractActionItems(
    "Alice will write the report.",
  );
  assertEquals(items.length, 1);
  assertEquals(items[0].description, "Write report"); // capitalised
  assertEquals(items[0].assignee, "Alice");
  assertEquals(items[0].due_date, "2025-12-01");
});

Deno.test("extractActionItems strips markdown code block wrapper", async () => {
  const json =
    '```json\n[{"description":"do thing","assignee":null,"due_date":null}]\n```';
  const service = createGeminiService(mockModel(json));
  const items = await service.extractActionItems("test text");
  assertEquals(items.length, 1);
  assertEquals(items[0].description, "Do thing");
});

Deno.test("extractActionItems converts 'null' string assignee to null", async () => {
  const json = JSON.stringify([{
    description: "task",
    assignee: "null",
    due_date: "null",
  }]);
  const service = createGeminiService(mockModel(json));
  const items = await service.extractActionItems("text");
  assertEquals(items[0].assignee, null);
  assertEquals(items[0].due_date, null);
});

Deno.test("extractActionItems returns empty array on invalid JSON", async () => {
  const service = createGeminiService(mockModel("not json at all"));
  const items = await service.extractActionItems("text");
  assertEquals(items, []);
});

Deno.test("extractActionItems returns empty array on model failure", async () => {
  const service = createGeminiService(mockModelThrows("network error"));
  const items = await service.extractActionItems("text");
  assertEquals(items, []);
});

// ===================================================================
// checkActionItemStatus
// ===================================================================

Deno.test("checkActionItemStatus returns empty array when no existing items", async () => {
  const service = createGeminiService(mockModel("should not be called"));
  const updates = await service.checkActionItemStatus("some text", []);
  assertEquals(updates, []);
});

Deno.test("checkActionItemStatus parses valid JSON response", async () => {
  const responseData = [
    {
      id: "1",
      description: "write report",
      status: "completed",
      reason: "mentioned done",
    },
  ];
  const service = createGeminiService(mockModel(JSON.stringify(responseData)));
  const existing: ActionItem[] = [
    {
      id: "1",
      conversation_id: "c1",
      description: "write report",
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  const updates = await service.checkActionItemStatus(
    "I finished the report.",
    existing,
  );
  assertEquals(updates.length, 1);
  assertEquals(updates[0].id, "1");
  assertEquals(updates[0].status, "completed");
});

Deno.test("checkActionItemStatus returns empty array for empty JSON response", async () => {
  const service = createGeminiService(mockModel("[]"));
  const existing: ActionItem[] = [
    {
      id: "1",
      conversation_id: "c1",
      description: "a task",
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  const updates = await service.checkActionItemStatus(
    "nothing relevant",
    existing,
  );
  assertEquals(updates, []);
});

Deno.test("checkActionItemStatus returns empty array on invalid JSON", async () => {
  const service = createGeminiService(mockModel("broken json"));
  const existing: ActionItem[] = [
    {
      id: "1",
      conversation_id: "c1",
      description: "a task",
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  const updates = await service.checkActionItemStatus("text", existing);
  assertEquals(updates, []);
});

// ===================================================================
// extractTopics
// ===================================================================

Deno.test("extractTopics returns empty graph on empty text", async () => {
  const service = createGeminiService(mockModel("{}"));
  const graph = await service.extractTopics("");
  assertEquals(graph, { nodes: [], edges: [] });
});

Deno.test("extractTopics parses + normalizes valid graph JSON", async () => {
  const graphJson = JSON.stringify({
    nodes: [
      { id: "n1", label: "Budget", color: "#aabbcc", emoji: "💰" },
      { id: "n2", label: "Timeline", color: "#ddeeff", emoji: "📅" },
    ],
    edges: [{ source_topic_id: "n1", target_topic_id: "n2", color: "#bbbbbb" }],
  });
  const service = createGeminiService(mockModel(graphJson));
  const graph = await service.extractTopics("budget discussion");
  assertEquals(graph.nodes.length, 2);
  assertEquals(graph.nodes[0].label, "Budget");
  // "n1" is a real id (not the generic node1/topic1 pattern), so it is kept
  assertEquals(graph.nodes[0].id, "n1");
  assertEquals(graph.edges.length, 1);
  assertEquals(graph.edges[0].source_topic_id, "n1");
  assertEquals(graph.edges[0].target_topic_id, "n2");
});

Deno.test("extractTopics slugifies generic node/topic ids", async () => {
  const graphJson = JSON.stringify({
    nodes: [{
      id: "node1",
      label: "Public Backlash",
      color: "#5b8def",
      emoji: "📣",
    }],
    edges: [],
  });
  const service = createGeminiService(mockModel(graphJson));
  const graph = await service.extractTopics("text");
  // generic placeholder id -> stable kebab slug from the label
  assertEquals(graph.nodes[0].id, "public-backlash");
});

Deno.test("extractTopics returns empty graph on invalid JSON", async () => {
  const service = createGeminiService(mockModel("definitely not json"));
  const graph = await service.extractTopics("some text");
  assertEquals(graph, { nodes: [], edges: [] });
});

Deno.test("extractTopics returns empty graph on model failure", async () => {
  const service = createGeminiService(mockModelThrows("api down"));
  const graph = await service.extractTopics("some text");
  assertEquals(graph, { nodes: [], edges: [] });
});

// ===================================================================
// generateSummary
// ===================================================================

Deno.test("generateSummary returns trimmed response", async () => {
  const service = createGeminiService(mockModel("  Key points discussed.  "));
  const summary = await service.generateSummary("long meeting transcript");
  assertEquals(summary, "Key points discussed.");
});

Deno.test("generateSummary throws on model failure", async () => {
  const service = createGeminiService(mockModelThrows("timeout"));
  await assertRejects(
    () => service.generateSummary("text"),
    Error,
    "Failed to generate summary",
  );
});

// ===================================================================
// generateMarkdown
// ===================================================================

Deno.test("generateMarkdown returns trimmed response", async () => {
  const service = createGeminiService(mockModel("  # Report\n\n- item  "));
  const result = await service.generateMarkdown(
    "convert to report",
    "meeting text",
  );
  assertEquals(result, "# Report\n\n- item");
});

Deno.test("generateMarkdown throws on model failure", async () => {
  const service = createGeminiService(mockModelThrows("server error"));
  await assertRejects(
    () => service.generateMarkdown("format", "text"),
    Error,
    "Failed to generate markdown",
  );
});
