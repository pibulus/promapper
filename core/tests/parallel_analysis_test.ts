/**
 * Tests for core/orchestration/parallel-analysis.ts
 *
 * Verifies parallel orchestration with mock AIService.
 */

import { assertEquals } from "./_assert.ts";

import {
  analyzeAudio,
  analyzeText,
} from "../orchestration/parallel-analysis.ts";
import type { AIService, AudioPart } from "../ai/types.ts";
import type { ActionItem } from "../types/index.ts";

// ===================================================================
// MOCK AI SERVICE
// ===================================================================

function createMockAIService(
  overrides: Partial<AIService> = {},
): AIService & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async transcribeAudio(_blob: Blob, _signal?: AbortSignal) {
      calls.push("transcribeAudio");
      return { text: "Speaker1: hello world", speakers: ["Speaker1"] };
    },
    async generateTitle(_transcript: string, _signal?: AbortSignal) {
      calls.push("generateTitle");
      return "Test Title";
    },
    async extractActionItems(
      _input,
      _speakers,
      _existing,
      _onParseError,
      _signal?: AbortSignal,
    ) {
      calls.push("extractActionItems");
      return [{ description: "Do the thing", assignee: null, due_date: null }];
    },
    async checkActionItemStatus(
      _input,
      _existing,
      _onParseError,
      _signal?: AbortSignal,
    ) {
      calls.push("checkActionItemStatus");
      return [];
    },
    async extractTopics(
      _text,
      _existing,
      _existingEdges,
      _onParseError,
      _signal?: AbortSignal,
    ) {
      calls.push("extractTopics");
      return { nodes: [], edges: [] };
    },
    async generateSummary(_text, _labels, _signal?: AbortSignal) {
      calls.push("generateSummary");
      return "A brief summary.";
    },
    async generateMarkdown(_formatPrompt, _text, _signal?: AbortSignal) {
      calls.push("generateMarkdown");
      return "# Markdown";
    },
    async chatText(_prompt: string, _hint, _signal?: AbortSignal) {
      calls.push("chatText");
      return "";
    },
    async chatMessages(_messages, _hint, _signal?: AbortSignal) {
      calls.push("chatMessages");
      return "";
    },
    async *chatStream(_messages, _hint, _signal?: AbortSignal) {
      calls.push("chatStream");
      yield "";
    },
    ...overrides,
  };
}

const mockAudioPart: AudioPart = {
  inputAudio: {
    data: "YXVkaW8=",
    format: "webm",
    mimeType: "audio/webm",
  },
};

// ===================================================================
// analyzeText
// ===================================================================

Deno.test("analyzeText calls extractTopics, extractActionItems, generateSummary", async () => {
  const service = createMockAIService();
  await analyzeText(service, "Some meeting text");

  assertEquals(service.calls.includes("extractTopics"), true);
  assertEquals(service.calls.includes("extractActionItems"), true);
  assertEquals(service.calls.includes("generateSummary"), true);
});

Deno.test("analyzeText feeds extracted topic labels into the summary", async () => {
  let summaryTopics: string[] | undefined;
  const service = createMockAIService({
    async extractTopics(_text, _existingNodes, _existingEdges) {
      return {
        nodes: [
          {
            id: "swamp-radio",
            label: "swamp-radio",
            emoji: "📻",
            color: "#abc",
          },
          { id: "frog-choir", label: "frog-choir", emoji: "🐸", color: "#def" },
        ],
        edges: [],
      };
    },
    async generateSummary(_text, topicLabels) {
      summaryTopics = topicLabels;
      return "A brief summary.";
    },
  });

  await analyzeText(service, "The swamp radio station only plays frog choir.");

  // The summary must receive the labels the topic graph produced.
  assertEquals(summaryTopics, ["swamp-radio", "frog-choir"]);
});

Deno.test("analyzeText gives the summary empty labels when no topics surface", async () => {
  let summaryTopics: string[] | undefined;
  const service = createMockAIService({
    async extractTopics() {
      return { nodes: [], edges: [] };
    },
    async generateSummary(_text, topicLabels) {
      summaryTopics = topicLabels;
      return "A brief summary.";
    },
  });

  await analyzeText(service, "Just one person mumbling about lost socks.");

  // Non-blocking degrade: no topics => empty labels => plain summary.
  assertEquals(summaryTopics, []);
});

Deno.test("analyzeText skips checkActionItemStatus when no existing items", async () => {
  const service = createMockAIService();
  await analyzeText(service, "Some text", [], []);

  assertEquals(service.calls.includes("checkActionItemStatus"), false);
});

Deno.test("analyzeText calls checkActionItemStatus when existing items present", async () => {
  const service = createMockAIService();
  const existing: ActionItem[] = [
    {
      id: "1",
      conversation_id: "c1",
      description: "task",
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  await analyzeText(service, "text mentioning task done", [], existing);

  assertEquals(service.calls.includes("checkActionItemStatus"), true);
});

Deno.test("analyzeText returns AnalysisResult with all four fields", async () => {
  const service = createMockAIService();
  const result = await analyzeText(service, "text");

  assertEquals(typeof result.summary, "string");
  assertEquals(Array.isArray(result.topics.nodes), true);
  assertEquals(Array.isArray(result.actionItems), true);
  assertEquals(Array.isArray(result.statusUpdates), true);
});

Deno.test("analyzeText returns empty statusUpdates when no existing items", async () => {
  const service = createMockAIService();
  const result = await analyzeText(service, "text");

  assertEquals(result.statusUpdates, []);
});

Deno.test("analyzeText degrades summary when generateSummary throws, still returns results", async () => {
  let summaryCalled = false;
  const service = createMockAIService({
    async generateSummary(_text, _topicLabels): Promise<string> {
      summaryCalled = true;
      throw new Error("summary model overloaded");
    },
  });
  const result = await analyzeText(service, "Nan: the moths have unionised.");

  assertEquals(summaryCalled, true);
  // Must still return topic nodes and action items even though summary failed.
  assertEquals(Array.isArray(result.topics.nodes), true);
  assertEquals(Array.isArray(result.actionItems), true);
  assertEquals(typeof result.summary, "string");
  assertEquals(result.summary.length > 0, true);
  assertEquals(result.warnings.length, 1);
  assertEquals(
    result.warnings[0].includes("Summary generation failed"),
    true,
  );
});

// ===================================================================
// analyzeAudio
// ===================================================================

Deno.test("analyzeAudio calls transcribeAudio first", async () => {
  const service = createMockAIService();
  await analyzeAudio(service, mockAudioPart);

  // transcribeAudio must be in calls
  assertEquals(service.calls.includes("transcribeAudio"), true);
});

Deno.test("analyzeAudio returns transcription alongside analysis", async () => {
  const service = createMockAIService();
  const result = await analyzeAudio(service, mockAudioPart);

  assertEquals(result.transcription.text, "Speaker1: hello world");
  assertEquals(result.transcription.speakers, ["Speaker1"]);
  assertEquals(Array.isArray(result.actionItems), true);
  assertEquals(Array.isArray(result.topics.nodes), true);
  assertEquals(typeof result.summary, "string");
});

Deno.test("analyzeAudio skips status check with no existing items", async () => {
  const service = createMockAIService();
  await analyzeAudio(service, mockAudioPart, []);

  assertEquals(service.calls.includes("checkActionItemStatus"), false);
});

Deno.test("analyzeAudio calls status check with existing items", async () => {
  const service = createMockAIService();
  const existing: ActionItem[] = [
    {
      id: "1",
      conversation_id: "c1",
      description: "task",
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "",
      updated_at: "",
    },
  ];
  await analyzeAudio(service, mockAudioPart, existing);

  assertEquals(service.calls.includes("checkActionItemStatus"), true);
});

Deno.test("analyzeAudio preserves transcription when generateSummary throws", async () => {
  const service = createMockAIService({
    async generateSummary(_text, _topicLabels): Promise<string> {
      throw new Error("summary service down");
    },
  });
  const result = await analyzeAudio(service, mockAudioPart);

  // Transcription must survive even though summary failed.
  assertEquals(result.transcription.text, "Speaker1: hello world");
  assertEquals(result.transcription.speakers, ["Speaker1"]);
  assertEquals(Array.isArray(result.actionItems), true);
  assertEquals(typeof result.summary, "string");
  assertEquals(result.summary.length > 0, true);
  assertEquals(result.warnings.length, 1);
  assertEquals(
    result.warnings[0].includes("Summary generation failed"),
    true,
  );
});
