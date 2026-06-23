/**
 * Tests for core/orchestration/conversation-flow.ts
 *
 * Verifies that processText and processAudio build correct output shapes.
 */

import { assertEquals, assertExists } from "./_assert.ts";

import {
  processAudio,
  processText,
} from "../orchestration/conversation-flow.ts";
import type { AIService, AudioPart } from "../ai/types.ts";

// ===================================================================
// MOCK AI SERVICE
// ===================================================================

function createMockAIService(): AIService {
  return {
    async transcribeAudio(_blob: Blob) {
      return { text: "Speaker1: hello", speakers: ["Speaker1"] };
    },
    async generateTitle(_transcript: string) {
      return "Mock Title";
    },
    async extractActionItems(_input, _speakers, _existing) {
      return [{
        description: "Do something",
        assignee: "Alice",
        due_date: "2025-12-01",
      }];
    },
    async checkActionItemStatus(_input, _existing) {
      return [];
    },
    async extractTopics(_text, _existing) {
      return {
        nodes: [{ id: "n1", label: "Topic", color: "#aaa", emoji: "📌" }],
        edges: [],
      };
    },
    async generateSummary(_text) {
      return "This is a summary.";
    },
    async generateMarkdown(_formatPrompt, _text) {
      return "# Result";
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
  const result = await processAudio(service, mockAudioPart, "conv-2");

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

  const result = await processAudio(service, mockAudioPart, "conv-3");

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
