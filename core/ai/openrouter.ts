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
  /** Optional model override for audio transcription only. Falls back to model. */
  transcriptionModel?: string;
  /** Optional model override for summary generation (prose quality). */
  summaryModel?: string;
  /** Optional model override for topic extraction (relationship mapping). */
  topicModel?: string;
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

function inferAudioFormat(
  mimeType: string,
  fileName = "",
): OpenRouterAudioFormat {
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
  if (byMime[normalized]) return byMime[normalized];

  const extension = fileName.toLowerCase().split(".").pop();
  const byExt: Record<string, OpenRouterAudioFormat> = {
    wav: "wav",
    mp3: "mp3",
    aiff: "aiff",
    aac: "aac",
    ogg: "ogg",
    flac: "flac",
    m4a: "m4a",
    webm: "webm",
  };
  return (extension && byExt[extension]) ? byExt[extension] : "webm";
}

async function toOpenRouterAudioPart(
  input: AudioInput,
): Promise<OpenRouterAudioPart> {
  if (isOpenRouterAudioPart(input)) {
    return input;
  }

  const blob = input as Blob;
  const mimeType = blob.type || "audio/webm";
  const fileName = "name" in blob ? (blob as { name?: string }).name ?? "" : "";
  return {
    inputAudio: {
      data: encodeBase64(new Uint8Array(await blob.arrayBuffer())),
      format: inferAudioFormat(mimeType, fileName),
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

  async function chat(
    messages: ChatMessage[],
    modelHint?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return await withRetry(
      async () => {
        const response = await fetcher(joinUrl(baseUrl, "/chat/completions"), {
          method: "POST",
          headers: buildHeaders(options),
          body: JSON.stringify({
            model: modelHint ?? options.model,
            messages,
            stream: false,
            temperature: 0.1, // low temp for consistent structured extraction
            max_tokens: 8192,
          }),
          signal,
        });

        return await parseOpenRouterResponse(response);
      },
      3,
      600,
      signal,
    );
  }

  async function chatText(
    prompt: string,
    modelHint?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return await chat([{ role: "user", content: prompt }], modelHint, signal);
  }

  async function chatAudio(
    prompt: string,
    audioInput: AudioInput,
    modelHint?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const audioPart = await toOpenRouterAudioPart(audioInput);
    return await chat(
      [
        {
          role: "user",
          content: buildAudioContent(prompt, audioPart),
        },
      ],
      modelHint,
      signal,
    );
  }

  return {
    async transcribeAudio(audioInput: AudioInput, signal?: AbortSignal) {
      try {
        const transcriptText = await chatAudio(
          TRANSCRIPTION_PROMPT,
          audioInput,
          options.transcriptionModel,
          signal,
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

    async generateTitle(
      transcript: string,
      signal?: AbortSignal,
    ): Promise<string> {
      try {
        return (await chatText(buildTitlePrompt(transcript), undefined, signal))
          .trim();
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
      signal?: AbortSignal,
    ) {
      try {
        const prompt = buildActionItemsPrompt(
          input,
          speakers,
          existingActionItems,
        );
        const text = typeof input === "string"
          ? await chatText(prompt, undefined, signal)
          : await chatAudio(prompt, input, undefined, signal);
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
      signal?: AbortSignal,
    ) {
      try {
        if (!existingActionItems || existingActionItems.length === 0) {
          return [];
        }

        const prompt = buildActionItemStatusPrompt(existingActionItems);
        const text = typeof input === "string"
          ? await chatText(`${prompt}\n\nText: ${input}`, undefined, signal)
          : await chatAudio(prompt, input, undefined, signal);

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
      signal?: AbortSignal,
    ) {
      if (!text) return { nodes: [], edges: [] };

      try {
        return parseGraphResponse(
          await chatText(
            buildTopicExtractionPrompt(text, existingNodes, existingEdges),
            options.topicModel,
            signal,
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
      signal?: AbortSignal,
    ): Promise<string> {
      try {
        return (await chatText(
          buildSummaryPrompt(text, topicLabels),
          options.summaryModel,
          signal,
        )).trim();
      } catch (error) {
        console.error("Error generating summary:", error);
        throw new Error("Failed to generate summary with OpenRouter");
      }
    },

    async generateMarkdown(
      formatPrompt: string,
      text: string,
      signal?: AbortSignal,
    ): Promise<string> {
      try {
        return (await chatText(
          buildMarkdownTransformPrompt(formatPrompt, text),
          undefined,
          signal,
        )).trim();
      } catch (error) {
        console.error("Error generating markdown:", error);
        throw new Error("Failed to generate markdown with OpenRouter");
      }
    },

    async chatText(
      prompt: string,
      modelHint?: string,
      signal?: AbortSignal,
    ): Promise<string> {
      return await chat(
        [{ role: "user", content: prompt }],
        modelHint,
        signal,
      );
    },
  };
}
