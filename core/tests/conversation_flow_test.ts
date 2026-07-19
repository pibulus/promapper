/**
 * Tests for core/orchestration/conversation-flow.ts
 *
 * Verifies that processText and processAudio build correct output shapes.
 */

import { assertEquals, assertExists } from "./_assert.ts";

import {
  processAudio,
  processText,
  SHORT_APPEND_THRESHOLD,
} from "../orchestration/conversation-flow.ts";
import type { AIService, AudioPart } from "../ai/types.ts";

// ===================================================================
// MOCK AI SERVICE
// ===================================================================

function createMockAIService(): AIService {
  return {
    async transcribeAudio(_blob: Blob, _signal?: AbortSignal) {
      return { text: "Speaker1: hello", speakers: ["Speaker1"] };
    },
    async generateTitle(_transcript: string, _signal?: AbortSignal) {
      return "Mock Title";
    },
    async extractActionItems(
      _input,
      _speakers,
      _existing,
      _onParseError,
      _signal?: AbortSignal,
    ) {
      return [{
        description: "Do something",
        assignee: "Alice",
        due_date: "2025-12-01",
      }];
    },
    async checkActionItemStatus(
      _input,
      _existing,
      _onParseError,
      _signal?: AbortSignal,
    ) {
      return [];
    },
    async extractTopics(
      _text,
      _existing,
      _existingEdges,
      _onParseError,
      _signal?: AbortSignal,
    ) {
      return {
        nodes: [{ id: "n1", label: "Topic", color: "#aaa", emoji: "📌" }],
        edges: [],
      };
    },
    async generateSummary(_text, _labels, _signal?: AbortSignal) {
      return "This is a summary.";
    },
    async generateMarkdown(_formatPrompt, _text, _signal?: AbortSignal) {
      return "# Result";
    },
    async chatText(_prompt, _hint, _signal?: AbortSignal) {
      return '{"operations": []}';
    },
    async chatMessages(_messages, _hint, _signal?: AbortSignal) {
      return "";
    },
    async *chatStream(_messages, _hint, _signal?: AbortSignal) {
      yield "";
    },
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
// processText
// ===================================================================

Deno.test("processText returns ConversationFlowResult with correct shape", async () => {
  const service = createMockAIService();
  const result = await processText(
    service,
    "Alice: we need to ship this.",
    "conv-1",
  );

  // conversation
  assertEquals(result.conversation.id, "conv-1");
  assertEquals(result.conversation.title, "Mock Title");
  assertEquals(result.conversation.source, "text");

  // transcript
  assertEquals(result.transcript.conversation_id, "conv-1");
  assertEquals(result.transcript.text, "Alice: we need to ship this.");
  assertEquals(result.transcript.source, "text");

  // nodes
  assertEquals(result.nodes.length, 1);
  assertEquals(result.nodes[0].conversation_id, "conv-1");
  assertEquals(result.nodes[0].label, "Topic");

  // action items
  assertEquals(result.actionItems.length, 1);
  assertEquals(result.actionItems[0].description, "Do something");
  assertEquals(result.actionItems[0].status, "pending");
  assertEquals(result.actionItems[0].conversation_id, "conv-1");
  assertExists(result.actionItems[0].id);

  // summary
  assertEquals(result.summary, "This is a summary.");

  // statusUpdates
  assertEquals(result.statusUpdates, []);
});

Deno.test("processText action items have unique UUIDs", async () => {
  const service = createMockAIService();
  const r1 = await processText(service, "text1", "conv-1");
  const r2 = await processText(service, "text2", "conv-2");

  // IDs should be different between runs
  assertEquals(r1.actionItems[0].id !== r2.actionItems[0].id, true);
});

Deno.test("processText passes speakers to AIService", async () => {
  let capturedSpeakers: string[] = [];
  const service: AIService = {
    ...createMockAIService(),
    async extractActionItems(_input, speakers = [], _existing) {
      capturedSpeakers = speakers ?? [];
      return [];
    },
  };

  await processText(service, "some text", "conv-1", ["Alice", "Bob"]);
  assertEquals(capturedSpeakers, ["Alice", "Bob"]);
});

// ===================================================================
// processAudio
// ===================================================================

Deno.test("processAudio returns ConversationFlowResult with correct shape", async () => {
  const service = createMockAIService();
  const result = await processAudio(service, mockAudioPart, "conv-2", {});

  assertEquals(result.conversation.id, "conv-2");
  assertEquals(result.conversation.source, "audio");
  assertEquals(result.conversation.title, "Mock Title");

  assertEquals(result.transcript.text, "Speaker1: hello");
  assertEquals(result.transcript.speakers, ["Speaker1"]);
  assertEquals(result.transcript.source, "audio");

  assertEquals(result.actionItems.length, 1);
  assertEquals(result.actionItems[0].status, "pending");
  assertEquals(result.actionItems[0].conversation_id, "conv-2");

  assertEquals(result.nodes.length, 1);
  assertEquals(result.summary, "This is a summary.");
});

Deno.test("processAudio generates a title from transcription", async () => {
  let capturedTitle = "";
  const service: AIService = {
    ...createMockAIService(),
    async generateTitle(transcript: string) {
      capturedTitle = transcript;
      return "Generated Title";
    },
  };

  const result = await processAudio(service, mockAudioPart, "conv-3", {});

  // Title was generated from the transcription text
  assertEquals(capturedTitle, "Speaker1: hello");
  assertEquals(result.conversation.title, "Generated Title");
});

// ===================================================================
// title-generation fallback (resilience)
// ===================================================================

Deno.test("processText still succeeds when title generation throws", async () => {
  const service = createMockAIService();
  service.generateTitle = () => {
    throw new Error("title model down");
  };

  const result = await processText(
    service,
    "Ship the new onboarding flow before Friday.",
    "conv-fallback",
  );

  // Flow completes; title falls back to a derived snippet, not a crash.
  assertExists(result.conversation.title);
  assertEquals((result.conversation.title as string).length > 0, true);
  // Everything else still came through.
  assertEquals(result.actionItems.length, 1);
});

// ===================================================================
// short-append optimisation (lightweightIfShort)
// ===================================================================
// The mock transcribes to "Speaker1: hello" (15 chars), comfortably under
// SHORT_APPEND_THRESHOLD — so lightweightIfShort:true takes the light path.

Deno.test("processAudio short path skips topics + summary, keeps status check", async () => {
  let statusChecked = false;
  let topicsExtracted = false;
  let summaryGenerated = false;

  const existing = [{
    id: "task-feed-the-axolotl",
    conversation_id: "conv-light",
    description: "feed the axolotl before the tank rave",
    assignee: "Marisol",
    due_date: null,
    status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const service: AIService = {
    ...createMockAIService(),
    async checkActionItemStatus(_input, _existing, _onErr, _signal) {
      statusChecked = true;
      return [{
        id: "task-feed-the-axolotl",
        description: "feed the axolotl before the tank rave",
        status: "completed",
        reason: "they said the axolotl's been fed",
      }];
    },
    async extractTopics(_t, _e, _ee, _onErr, _signal) {
      topicsExtracted = true;
      return { nodes: [], edges: [] };
    },
    async generateSummary(_t, _l, _signal) {
      summaryGenerated = true;
      return "should not run";
    },
  };

  const result = await processAudio(service, mockAudioPart, "conv-light", {
    existingActionItems: existing,
    lightweightIfShort: true,
  });

  // Heavy analyses were skipped...
  assertEquals(topicsExtracted, false);
  assertEquals(summaryGenerated, false);
  assertEquals(result.nodes.length, 0);
  assertEquals(result.summary, "");

  // ...but the killer self-checkoff feature still fired.
  assertEquals(statusChecked, true);
  assertEquals(result.statusUpdates.length, 1);
  assertEquals(result.statusUpdates[0].status, "completed");
});

Deno.test("processAudio runs full analysis when lightweightIfShort is off", async () => {
  let topicsExtracted = false;
  const service: AIService = {
    ...createMockAIService(),
    async extractTopics(_t, _e, _ee, _onErr, _signal) {
      topicsExtracted = true;
      return {
        nodes: [{ id: "n1", label: "Topic", color: "#aaa", emoji: "📌" }],
        edges: [],
      };
    },
  };

  // Same short transcript, but the flag is off → full path regardless.
  const result = await processAudio(service, mockAudioPart, "conv-full", {
    lightweightIfShort: false,
  });

  assertEquals(topicsExtracted, true);
  assertEquals(result.nodes.length, 1);
  assertEquals(result.summary, "This is a summary.");
});

Deno.test("SHORT_APPEND_THRESHOLD is a sane non-negative number", () => {
  // Resolved once at module load from env (default 500). Whatever the
  // environment, it must be a usable threshold — never NaN/negative, which
  // would silently disable or invert the optimisation.
  assertEquals(Number.isFinite(SHORT_APPEND_THRESHOLD), true);
  assertEquals(SHORT_APPEND_THRESHOLD >= 0, true);
});
