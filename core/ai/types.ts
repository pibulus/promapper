import type {
  ActionItem,
  ActionItemInput,
  ActionItemStatusUpdate,
  ConversationGraph,
  EdgeInput,
  NodeInput,
  TranscriptionResult,
} from "../types/index.ts";

export type GeminiAudioPart =
  | {
    inlineData: { data: string; mimeType: string };
  }
  | {
    fileData: { fileUri: string; mimeType: string };
  };

export type OpenRouterAudioFormat =
  | "wav"
  | "mp3"
  | "aiff"
  | "aac"
  | "ogg"
  | "flac"
  | "m4a"
  | "pcm16"
  | "pcm24"
  | "webm";

export interface OpenRouterAudioPart {
  inputAudio: {
    data: string;
    format: OpenRouterAudioFormat;
    mimeType: string;
  };
}

export type AudioPart = GeminiAudioPart | OpenRouterAudioPart;
export type AudioInput = Blob | AudioPart;

export interface AIService {
  transcribeAudio(audioInput: AudioInput): Promise<TranscriptionResult>;
  generateTitle(transcript: string): Promise<string>;
  extractActionItems(
    input: string | AudioInput,
    speakers?: string[],
    existingActionItems?: ActionItem[],
  ): Promise<ActionItemInput[]>;
  checkActionItemStatus(
    input: string | AudioInput,
    existingActionItems: ActionItem[],
  ): Promise<ActionItemStatusUpdate[]>;
  extractTopics(
    text: string,
    existingNodes?: NodeInput[],
    existingEdges?: EdgeInput[],
  ): Promise<ConversationGraph>;
  generateSummary(text: string, topicLabels?: string[]): Promise<string>;
  generateMarkdown(formatPrompt: string, text: string): Promise<string>;
}
