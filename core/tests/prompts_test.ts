/**
 * Tests for core/ai/prompts.ts
 *
 * Pure functions - no mocks needed.
 */

import { assertEquals, assertStringIncludes } from "./_assert.ts";

import {
  ACTION_ITEMS_BASE_PROMPT,
  buildActionItemsPrompt,
  buildActionItemStatusPrompt,
  buildMarkdownTransformPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
  buildTopicExtractionPrompt,
  TRANSCRIPTION_PROMPT,
} from "../ai/prompts.ts";

import type { ActionItem } from "../types/index.ts";
import { localDateISO } from "../storage/dates.ts";

// ===================================================================
// TRANSCRIPTION_PROMPT
// ===================================================================

Deno.test("TRANSCRIPTION_PROMPT is a non-empty string", () => {
  assertEquals(typeof TRANSCRIPTION_PROMPT, "string");
  assertEquals(TRANSCRIPTION_PROMPT.length > 0, true);
});

Deno.test("TRANSCRIPTION_PROMPT mentions speakers", () => {
  assertStringIncludes(TRANSCRIPTION_PROMPT.toLowerCase(), "speaker");
});

// ===================================================================
// buildTitlePrompt
// ===================================================================

Deno.test("buildTitlePrompt includes transcript text", () => {
  const transcript = "This is a meeting about project planning.";
  const prompt = buildTitlePrompt(transcript);
  assertStringIncludes(prompt, transcript);
});

Deno.test("buildTitlePrompt asks for concise title", () => {
  const prompt = buildTitlePrompt("test");
  assertStringIncludes(prompt.toLowerCase(), "title");
});

// ===================================================================
// buildActionItemsPrompt
// ===================================================================

Deno.test("buildActionItemsPrompt with text input includes text", () => {
  const text = "Alice will write the report by Friday.";
  const prompt = buildActionItemsPrompt(text);
  assertStringIncludes(prompt, text);
  assertStringIncludes(prompt, "Analyze this text");
});

Deno.test("buildActionItemsPrompt with Blob input uses audio prefix", () => {
  const blob = new Blob(["audio data"], { type: "audio/webm" });
  const prompt = buildActionItemsPrompt(blob);
  assertStringIncludes(prompt, "Listen to this audio");
});

Deno.test("buildActionItemsPrompt with speakers includes them", () => {
  const prompt = buildActionItemsPrompt("some text", ["Alice", "Bob"]);
  assertStringIncludes(prompt, "Alice");
  assertStringIncludes(prompt, "Bob");
});

Deno.test("buildActionItemsPrompt with existing items includes dedup context", () => {
  const existing: ActionItem[] = [
    {
      id: "1",
      conversation_id: "c1",
      description: "Write the report",
      assignee: "Alice",
      due_date: null,
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  const prompt = buildActionItemsPrompt("new text", [], existing);
  assertStringIncludes(prompt, "EXISTING ACTION ITEMS");
  assertStringIncludes(prompt, "Write the report");
  assertStringIncludes(prompt, "do not duplicate");
});

Deno.test("buildActionItemsPrompt without existing items has no dedup context", () => {
  const prompt = buildActionItemsPrompt("some text");
  assertEquals(prompt.includes("EXISTING ACTION ITEMS"), false);
});

// The date anchor is what lets "by Friday" resolve to a real due_date — a
// refactor that drops it regresses silently, so both input branches pin it.
Deno.test("buildActionItemsPrompt anchors relative dates to today (text)", () => {
  const prompt = buildActionItemsPrompt("Finish it by Friday.");
  assertStringIncludes(prompt, `today is ${localDateISO(0)}`);
});

Deno.test("buildActionItemsPrompt anchors relative dates to today (audio)", () => {
  const blob = new Blob(["audio data"], { type: "audio/webm" });
  const prompt = buildActionItemsPrompt(blob);
  assertStringIncludes(prompt, `today is ${localDateISO(0)}`);
});

// ===================================================================
// buildActionItemStatusPrompt
// ===================================================================

Deno.test("buildActionItemStatusPrompt includes action item IDs and descriptions", () => {
  const items: ActionItem[] = [
    {
      id: "item-abc",
      conversation_id: "c1",
      description: "Finish the slides",
      assignee: "Bob",
      due_date: "2025-12-01",
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  const prompt = buildActionItemStatusPrompt(items);
  assertStringIncludes(prompt, "item-abc");
  assertStringIncludes(prompt, "Finish the slides");
});

Deno.test("buildActionItemStatusPrompt requests JSON array response", () => {
  const prompt = buildActionItemStatusPrompt([]);
  assertStringIncludes(prompt, "JSON array");
});

// ===================================================================
// buildTopicExtractionPrompt
// ===================================================================

Deno.test("buildTopicExtractionPrompt includes conversation text", () => {
  const text = "We discussed the budget and timeline.";
  const prompt = buildTopicExtractionPrompt(text);
  assertStringIncludes(prompt, text);
});

Deno.test("buildTopicExtractionPrompt requests nodes and edges JSON", () => {
  const prompt = buildTopicExtractionPrompt("text");
  assertStringIncludes(prompt, '"nodes"');
  assertStringIncludes(prompt, '"edges"');
});

Deno.test("buildTopicExtractionPrompt with existing nodes includes reuse context", () => {
  const nodes = [{ id: "n1", label: "Budget", color: "#aaa", emoji: "💰" }];
  const prompt = buildTopicExtractionPrompt("some text", nodes);
  assertStringIncludes(prompt, "EXISTING TOPICS");
  assertStringIncludes(prompt, "n1");
  assertStringIncludes(prompt, "Budget");
});

Deno.test("buildTopicExtractionPrompt without existing nodes has no reuse context", () => {
  const prompt = buildTopicExtractionPrompt("some text");
  assertEquals(prompt.includes("EXISTING TOPICS"), false);
});

Deno.test("buildTopicExtractionPrompt encodes quality rules (kebab ids, generic-label ban)", () => {
  const prompt = buildTopicExtractionPrompt("text");
  assertStringIncludes(prompt, "kebab-case");
  assertStringIncludes(prompt, "Avoid labels like");
  assertStringIncludes(prompt, "Return only JSON");
});

Deno.test("buildTopicExtractionPrompt includes existing relationships when edges given", () => {
  const nodes = [
    { id: "budget", label: "Budget", color: "#aaa", emoji: "💰" },
    { id: "timeline", label: "Timeline", color: "#bbb", emoji: "📅" },
  ];
  const edges = [
    { source_topic_id: "budget", target_topic_id: "timeline", color: "#888" },
  ];
  const prompt = buildTopicExtractionPrompt("some text", nodes, edges);
  assertStringIncludes(prompt, "EXISTING RELATIONSHIPS");
  // edge endpoints rendered by label, not raw id
  assertStringIncludes(prompt, "Budget -> Timeline");
});

// ===================================================================
// buildSummaryPrompt
// ===================================================================

Deno.test("buildSummaryPrompt includes conversation text", () => {
  const text = "Long discussion about Q4 goals.";
  const prompt = buildSummaryPrompt(text);
  assertStringIncludes(prompt, text);
});

Deno.test("buildSummaryPrompt weaves in topic labels when provided", () => {
  const text = "Nan keeps forgetting where she buried the seed jars.";
  const prompt = buildSummaryPrompt(text, ["seed-jars", "memory-garden"]);
  assertStringIncludes(prompt, "seed-jars");
  assertStringIncludes(prompt, "memory-garden");
  assertStringIncludes(prompt, text);
});

Deno.test("buildSummaryPrompt stays plain when topic labels are empty", () => {
  const text = "Two ghosts arguing about whose turn it is to haunt the attic.";
  const withEmpty = buildSummaryPrompt(text, []);
  const withNone = buildSummaryPrompt(text);
  // No topics => identical to the no-arg form (summary never waits on topics).
  assertEquals(withEmpty, withNone);
  assertStringIncludes(withEmpty, text);
});

// ===================================================================
// buildMarkdownTransformPrompt
// ===================================================================

Deno.test("buildMarkdownTransformPrompt includes both formatPrompt and text", () => {
  const formatPrompt = "Convert to bullet points";
  const text = "Alice will do X. Bob will do Y.";
  const prompt = buildMarkdownTransformPrompt(formatPrompt, text);
  assertStringIncludes(prompt, formatPrompt);
  assertStringIncludes(prompt, text);
});

Deno.test("buildMarkdownTransformPrompt requests markdown output", () => {
  const prompt = buildMarkdownTransformPrompt("format", "text");
  assertStringIncludes(prompt.toLowerCase(), "markdown");
});

// ===================================================================
// ACTION_ITEMS_BASE_PROMPT
// ===================================================================

Deno.test("ACTION_ITEMS_BASE_PROMPT contains JSON schema example", () => {
  assertStringIncludes(ACTION_ITEMS_BASE_PROMPT, '"description"');
  assertStringIncludes(ACTION_ITEMS_BASE_PROMPT, '"assignee"');
  assertStringIncludes(ACTION_ITEMS_BASE_PROMPT, '"due_date"');
});

Deno.test("ACTION_ITEMS_BASE_PROMPT uses empty-array contract, not the 'No action items' sentinel", () => {
  assertStringIncludes(ACTION_ITEMS_BASE_PROMPT, "empty array");
  assertEquals(ACTION_ITEMS_BASE_PROMPT.includes("No action items"), false);
});
