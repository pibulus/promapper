/**
 * Gemini AI Service - Framework Agnostic
 *
 * Pure TypeScript wrapper for Google's Generative AI
 * Can be used in any environment (Node, Deno, Browser)
 */

import type {
  ActionItem,
  ActionItemInput,
  ActionItemStatusUpdate,
  ConversationGraph,
  EdgeInput,
  NodeInput,
  TranscriptionResult,
} from "../types/index.ts";

import {
  extractSpeakers,
  parseActionItemsResponse,
  parseGraphResponse,
  parseStatusUpdatesResponse,
} from "./helpers.ts";
import {
  buildActionItemsPrompt,
  buildActionItemStatusPrompt,
  buildMarkdownTransformPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
  buildTopicExtractionPrompt,
  TRANSCRIPTION_PROMPT,
} from "./prompts.ts";
import type { AIService, AudioInput, GeminiAudioPart } from "./types.ts";

// ===================================================================
// UTILITIES
// ===================================================================

function isAudioPart(input: AudioInput): input is GeminiAudioPart {
  return (
    typeof input === "object" &&
    input !== null &&
    ("inlineData" in input || "fileData" in input)
  );
}

async function toAudioPart(input: AudioInput): Promise<GeminiAudioPart> {
  if (isAudioPart(input)) {
    return input;
  }

  if (!(input instanceof Blob)) {
    throw new Error(
      "Gemini audio requests require a Blob or Gemini audio part",
    );
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(",")[1];
      resolve({
        inlineData: {
          data: base64data,
          mimeType: input.type,
        },
      });
    };
    reader.readAsDataURL(input);
  });
}

interface GeminiModel {
  generateContent: (
    contents: unknown,
  ) => Promise<{ response: { text: () => string } }>;
}

/**
 * Create Gemini AI Service
 */
export function createGeminiService(model: GeminiModel): AIService {
  return {
    // ===============================================================
    // TRANSCRIPTION
    // ===============================================================

    async transcribeAudio(
      audioInput: AudioInput,
    ): Promise<TranscriptionResult> {
      try {
        const audioPart = await toAudioPart(audioInput);
        const result = await model.generateContent([
          TRANSCRIPTION_PROMPT,
          audioPart,
        ]);
        const transcriptText = result.response.text().trim();
        const speakers = extractSpeakers(transcriptText);
        return { text: transcriptText, speakers };
      } catch (error) {
        console.error("❌ Error transcribing audio:", error);
        throw new Error("Failed to transcribe audio with Gemini");
      }
    },

    // ===============================================================
    // TITLE GENERATION
    // ===============================================================

    async generateTitle(transcript: string): Promise<string> {
      try {
        const prompt = buildTitlePrompt(transcript);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      } catch (error) {
        console.error("❌ Error generating title:", error);
        throw new Error("Failed to generate title with Gemini");
      }
    },

    // ===============================================================
    // ACTION ITEMS
    // ===============================================================

    async extractActionItems(
      input: string | AudioInput,
      speakers: string[] = [],
      existingActionItems: ActionItem[] = [],
    ): Promise<ActionItemInput[]> {
      try {
        const prompt = buildActionItemsPrompt(
          input,
          speakers,
          existingActionItems,
        );

        let result;
        if (typeof input !== "string") {
          const audioPart = await toAudioPart(input);
          result = await model.generateContent([prompt, audioPart]);
        } else {
          result = await model.generateContent(prompt);
        }

        return parseActionItemsResponse(result.response.text());
      } catch (error) {
        console.error("Error extracting action items:", error);
        return [];
      }
    },

    // ===============================================================
    // AI SELF-CHECKOFF (The Magic!)
    // ===============================================================

    async checkActionItemStatus(
      input: string | AudioInput,
      existingActionItems: ActionItem[],
    ): Promise<ActionItemStatusUpdate[]> {
      try {
        if (!existingActionItems || existingActionItems.length === 0) {
          return [];
        }

        const prompt = buildActionItemStatusPrompt(existingActionItems);

        let result;
        if (typeof input !== "string") {
          const audioPart = await toAudioPart(input);
          result = await model.generateContent([prompt, audioPart]);
        } else {
          result = await model.generateContent(`${prompt}\n\nText: ${input}`);
        }

        const text = result.response.text();

        // Validate against real IDs + enum so a hallucinated id/status can't
        // silently flip the wrong task.
        const existingIds = new Set(existingActionItems.map((item) => item.id));
        return parseStatusUpdatesResponse(text, existingIds);
      } catch (error) {
        console.error("Error checking action item status:", error);
        return [];
      }
    },

    // ===============================================================
    // TOPIC/NODE EXTRACTION
    // ===============================================================

    async extractTopics(
      text: string,
      existingNodes: NodeInput[] = [],
      existingEdges: EdgeInput[] = [],
    ): Promise<ConversationGraph> {
      if (!text) return { nodes: [], edges: [] };

      try {
        const prompt = buildTopicExtractionPrompt(
          text,
          existingNodes,
          existingEdges,
        );
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return parseGraphResponse(response.text());
      } catch (error) {
        console.error("Error extracting topics:", error);
        return { nodes: [], edges: [] };
      }
    },

    // ===============================================================
    // SUMMARY
    // ===============================================================

    async generateSummary(
      text: string,
      topicLabels: string[] = [],
    ): Promise<string> {
      try {
        const prompt = buildSummaryPrompt(text, topicLabels);
        const result = await model.generateContent(prompt);
        const response = await result.response.text();
        return response.trim();
      } catch (error) {
        console.error("Error generating summary:", error);
        throw new Error("Failed to generate summary with Gemini");
      }
    },

    // ===============================================================
    // EXPORT TRANSFORMATION
    // ===============================================================

    async generateMarkdown(
      formatPrompt: string,
      text: string,
    ): Promise<string> {
      try {
        const prompt = buildMarkdownTransformPrompt(formatPrompt, text);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      } catch (error) {
        console.error("Error generating markdown:", error);
        throw new Error("Failed to generate markdown with Gemini");
      }
    },
  };
}
