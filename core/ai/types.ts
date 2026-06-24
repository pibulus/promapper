import type {
  ActionItem,
  ActionItemInput,
  ActionItemStatusUpdate,
  ConversationGraph,
  EdgeInput,
  NodeInput,
  TranscriptionResult,
} from "../types/index.ts";

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

export type AudioPart = OpenRouterAudioPart;
export type AudioInput = Blob | AudioPart;

/**
 * Optional sink the orchestration passes in to learn when an AI response was
 * unparseable. The call still degrades to an empty result (never throws); this
 * just lets a "the AI response was garbled" warning reach the user instead of a
 * silent no-op that looks like success.
 */
export type ParseErrorSink = (what: string) => void;

export interface AIService {
  transcribeAudio(
    audioInput: AudioInput,
    signal?: AbortSignal,
  ): Promise<TranscriptionResult>;
  generateTitle(transcript: string, signal?: AbortSignal): Promise<string>;
  extractActionItems(
    input: string | AudioInput,
    speakers?: string[],
    existingActionItems?: ActionItem[],
    onParseError?: ParseErrorSink,
    signal?: AbortSignal,
  ): Promise<ActionItemInput[]>;
  checkActionItemStatus(
    input: string | AudioInput,
    existingActionItems: ActionItem[],
    onParseError?: ParseErrorSink,
    signal?: AbortSignal,
  ): Promise<ActionItemStatusUpdate[]>;
  extractTopics(
    text: string,
    existingNodes?: NodeInput[],
    existingEdges?: EdgeInput[],
    onParseError?: ParseErrorSink,
    signal?: AbortSignal,
  ): Promise<ConversationGraph>;
  generateSummary(
    text: string,
    topicLabels?: string[],
    signal?: AbortSignal,
  ): Promise<string>;
  generateMarkdown(
    formatPrompt: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<string>;
  /** Raw chat prompt — for whiteboard agent and other tools. */
  chatText(
    prompt: string,
    modelHint?: string,
    signal?: AbortSignal,
  ): Promise<string>;
}
