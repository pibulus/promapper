/**
 * OpenRouter AI Service - Framework Agnostic
 *
 * Uses OpenRouter's OpenAI-compatible chat completions API.
 */

import { encodeBase64 } from "$std/encoding/base64.ts";
import type { ActionItem, EdgeInput, NodeInput } from "../types/index.ts";
import {
  extractSpeakers,
  parseActionItemsResponse,
  parseGraphResponse,
  parseStatusUpdatesResponse,
  withRetry,
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
import type {
  AIService,
  AudioInput,
  OpenRouterAudioFormat,
  OpenRouterAudioPart,
  ParseErrorSink,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

type Fetcher = typeof fetch;

export interface OpenRouterServiceOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  siteUrl?: string;
  siteName?: string;
  fetcher?: Fetcher;
}

interface ChatMessage {
  role: "user";
  content: string | Array<Record<string, unknown>>;
}

function isOpenRouterAudioPart(
  input: AudioInput,
): input is OpenRouterAudioPart {
  return (
    typeof input === "object" &&
    input !== null &&
    "inputAudio" in input
  );
}

function hasInlineData(input: AudioInput): input is {
  inlineData: { data: string; mimeType: string };
} {
  return (
    typeof input === "object" &&
    input !== null &&
    "inlineData" in input
  );
}

function hasFileData(input: AudioInput): input is {
  fileData: { fileUri: string; mimeType: string };
} {
  return (
    typeof input === "object" &&
    input !== null &&
    "fileData" in input
  );
}

function inferAudioFormat(mimeType: string): OpenRouterAudioFormat {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  const byMime: Record<string, OpenRouterAudioFormat> = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/webm": "webm",
  };

  return byMime[normalized] ?? "webm";
}

async function toOpenRouterAudioPart(
  input: AudioInput,
): Promise<OpenRouterAudioPart> {
  if (isOpenRouterAudioPart(input)) {
    return input;
  }

  if (hasInlineData(input)) {
    return {
      inputAudio: {
        data: input.inlineData.data,
        format: inferAudioFormat(input.inlineData.mimeType),
        mimeType: input.inlineData.mimeType,
      },
    };
  }

  if (hasFileData(input)) {
    throw new Error(
      "OpenRouter audio requests require inline base64 data, not Gemini file URIs",
    );
  }

  const mimeType = input.type || "audio/webm";
  return {
    inputAudio: {
      data: encodeBase64(new Uint8Array(await input.arrayBuffer())),
      format: inferAudioFormat(mimeType),
      mimeType,
    },
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildHeaders(options: OpenRouterServiceOptions): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };

  if (options.siteUrl) {
    headers["HTTP-Referer"] = options.siteUrl;
  }

  if (options.siteName) {
    headers["X-OpenRouter-Title"] = options.siteName;
  }

  return headers;
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    }).join("");
  }

  return "";
}

async function parseOpenRouterResponse(response: Response): Promise<string> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter request failed (${response.status}): ${
        errorText || response.statusText
      }`,
    );
  }

  const payload = await response.json();
  const choice = payload.choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  const text = extractMessageText(content).trim();

  if (!text) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text;
}

function buildAudioContent(
  prompt: string,
  audioPart: OpenRouterAudioPart,
): Array<Record<string, unknown>> {
  return [
    {
      type: "text",
      text: prompt,
    },
    {
      type: "input_audio",
      input_audio: {
        data: audioPart.inputAudio.data,
        format: audioPart.inputAudio.format,
      },
    },
  ];
}

export function createOpenRouterService(
  options: OpenRouterServiceOptions,
): AIService {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  async function chat(messages: ChatMessage[]): Promise<string> {
    // Retry transient failures (429/5xx/network) with backoff. parse throws
    // with the status code in the message, so withRetry catches it.
    return await withRetry(async () => {
      const response = await fetcher(joinUrl(baseUrl, "/chat/completions"), {
        method: "POST",
        headers: buildHeaders(options),
        body: JSON.stringify({
          model: options.model,
          messages,
          stream: false,
          // Lower temperature for steadier structured extraction; generous
          // ceiling so long transcripts/graphs are not truncated.
          temperature: 0.4,
          max_tokens: 8192,
        }),
      });

      return await parseOpenRouterResponse(response);
    });
  }

  async function chatText(prompt: string): Promise<string> {
    return await chat([{ role: "user", content: prompt }]);
  }

  async function chatAudio(
    prompt: string,
    audioInput: AudioInput,
  ): Promise<string> {
    const audioPart = await toOpenRouterAudioPart(audioInput);
    return await chat([
      {
        role: "user",
        content: buildAudioContent(prompt, audioPart),
      },
    ]);
  }

  return {
    async transcribeAudio(audioInput: AudioInput) {
      try {
        const transcriptText = await chatAudio(
          TRANSCRIPTION_PROMPT,
          audioInput,
        );
        return {
          text: transcriptText,
          speakers: extractSpeakers(transcriptText),
        };
      } catch (error) {
        console.error("❌ Error transcribing audio:", error);
        throw new Error("Failed to transcribe audio with OpenRouter");
      }
    },

    async generateTitle(transcript: string): Promise<string> {
      try {
        return (await chatText(buildTitlePrompt(transcript))).trim();
      } catch (error) {
        console.error("❌ Error generating title:", error);
        throw new Error("Failed to generate title with OpenRouter");
      }
    },

    async extractActionItems(
      input: string | AudioInput,
      speakers: string[] = [],
      existingActionItems: ActionItem[] = [],
      onParseError?: ParseErrorSink,
    ) {
      try {
        const prompt = buildActionItemsPrompt(
          input,
          speakers,
          existingActionItems,
        );
        const text = typeof input === "string"
          ? await chatText(prompt)
          : await chatAudio(prompt, input);
        return parseActionItemsResponse(text, onParseError);
      } catch (error) {
        console.error("Error extracting action items:", error);
        return [];
      }
    },

    async checkActionItemStatus(
      input: string | AudioInput,
      existingActionItems: ActionItem[],
      onParseError?: ParseErrorSink,
    ) {
      try {
        if (!existingActionItems || existingActionItems.length === 0) {
          return [];
        }

        const prompt = buildActionItemStatusPrompt(existingActionItems);
        const text = typeof input === "string"
          ? await chatText(`${prompt}\n\nText: ${input}`)
          : await chatAudio(prompt, input);

        // Validate against real IDs + enum so a hallucinated id/status can't
        // silently flip the wrong task.
        const existingIds = new Set(existingActionItems.map((item) => item.id));
        return parseStatusUpdatesResponse(text, existingIds, onParseError);
      } catch (error) {
        console.error("Error checking action item status:", error);
        return [];
      }
    },

    async extractTopics(
      text: string,
      existingNodes: NodeInput[] = [],
      existingEdges: EdgeInput[] = [],
      onParseError?: ParseErrorSink,
    ) {
      if (!text) return { nodes: [], edges: [] };

      try {
        return parseGraphResponse(
          await chatText(
            buildTopicExtractionPrompt(text, existingNodes, existingEdges),
          ),
          onParseError,
        );
      } catch (error) {
        console.error("Error extracting topics:", error);
        return { nodes: [], edges: [] };
      }
    },

    async generateSummary(
      text: string,
      topicLabels: string[] = [],
    ): Promise<string> {
      try {
        return (await chatText(buildSummaryPrompt(text, topicLabels))).trim();
      } catch (error) {
        console.error("Error generating summary:", error);
        throw new Error("Failed to generate summary with OpenRouter");
      }
    },

    async generateMarkdown(
      formatPrompt: string,
      text: string,
    ): Promise<string> {
      try {
        return (await chatText(
          buildMarkdownTransformPrompt(formatPrompt, text),
        )).trim();
      } catch (error) {
        console.error("Error generating markdown:", error);
        throw new Error("Failed to generate markdown with OpenRouter");
      }
    },
  };
}
