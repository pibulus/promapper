/**
 * Parallel Analysis Coordinator
 *
 * The magic that makes Project Mapper fast:
 * - Topics, action items, and self-checkoff run simultaneously
 * - Efficient API usage
 * - Fast user experience
 */

import type { AIService, AudioPart } from "../ai/types.ts";
import type {
  ActionItem,
  ActionItemInput,
  ActionItemStatusUpdate,
  ConversationGraph,
  EdgeInput,
  NodeInput,
} from "../types/index.ts";

const summary_fallback =
  "(summary unavailable — the AI couldn't generate it this round, but your transcript is preserved)";

export interface AnalysisResult {
  topics: ConversationGraph;
  actionItems: ActionItemInput[];
  statusUpdates: ActionItemStatusUpdate[];
  summary: string;
  /** Non-empty when an AI step degraded — always safe to show the user. */
  warnings: string[];
}

/**
 * Run parallel AI analysis on new text
 */
export async function analyzeText(
  aiService: AIService,
  text: string,
  speakers: string[] = [],
  existingActionItems: ActionItem[] = [],
  existingNodes: NodeInput[] = [],
  existingEdges: EdgeInput[] = [],
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  // Topics first so the summary can lead with what the conversation is about.
  // Only the summary waits on topics — action items and status checks run fully
  // parallel the whole time, so wall-clock is the slower of those vs the
  // topics→summary chain, not the sum. If topic extraction fails it degrades to
  // an empty graph (extractTopics already returns {nodes:[],edges:[]} on error),
  // so the summary just falls back to a plain text summary.
  // Collect which AI outputs came back unparseable so the user gets a real
  // "the AI response was garbled" signal instead of a silent empty result that
  // looks like success.
  const garbled = new Set<string>();
  const onParseError = (what: string) => garbled.add(what);

  const topicsPromise = aiService.extractTopics(
    text,
    existingNodes,
    existingEdges,
    onParseError,
    signal,
  );
  const summaryPromise = topicsPromise.then((topics) =>
    aiService.generateSummary(text, topics.nodes.map((n) => n.label), signal)
  ).catch((error) => {
    console.error("Summary generation failed, using fallback:", error);
    return summary_fallback;
  });

  const [topics, actionItems, statusUpdates, summary] = await Promise.all([
    topicsPromise,
    aiService.extractActionItems(
      text,
      speakers,
      existingActionItems,
      onParseError,
      signal,
    ),
    existingActionItems.length > 0
      ? aiService.checkActionItemStatus(
        text,
        existingActionItems,
        onParseError,
        signal,
      )
      : Promise.resolve([]),
    summaryPromise,
  ]);

  const warnings = buildWarnings(summary, garbled);

  return {
    topics,
    actionItems,
    statusUpdates,
    summary,
    warnings,
  };
}

/**
 * Fold the summary-fallback flag and any garbled-parse parts into user-facing
 * warning strings. Pure + shared by analyzeText/analyzeAudio so the messaging
 * stays consistent.
 */
function buildWarnings(summary: string, garbled: Set<string>): string[] {
  const warnings: string[] = [];
  if (summary === summary_fallback) {
    warnings.push("Summary generation failed — your transcript is preserved.");
  }
  if (garbled.size > 0) {
    warnings.push(
      `The AI response for ${
        [...garbled].join(", ")
      } came back garbled — some results may be incomplete.`,
    );
  }
  return warnings;
}

/**
 * Run parallel AI analysis on new audio.
 *
 * @deprecated Not used by any production route. processAudio() in
 * conversation-flow.ts handles transcription inline then calls analyzeText().
 * Kept for the test suite and as a reference for future audio-only pipelines.
 */
export async function analyzeAudio(
  aiService: AIService,
  audioInput: AudioPart,
  existingActionItems: ActionItem[] = [],
  existingNodes: NodeInput[] = [],
  existingEdges: EdgeInput[] = [],
  signal?: AbortSignal,
): Promise<
  AnalysisResult & { transcription: { text: string; speakers: string[] } }
> {
  // First transcribe the audio
  const transcription = await aiService.transcribeAudio(audioInput, signal);

  const garbled = new Set<string>();
  const onParseError = (what: string) => garbled.add(what);

  const topicsPromise = aiService.extractTopics(
    transcription.text,
    existingNodes,
    existingEdges,
    onParseError,
    signal,
  );
  const summaryPromise = topicsPromise.then((topics) =>
    aiService.generateSummary(
      transcription.text,
      topics.nodes.map((n) => n.label),
      signal,
    )
  ).catch((error) => {
    console.error("Summary generation failed, using fallback:", error);
    return summary_fallback;
  });

  const [topics, actionItems, statusUpdates, summary] = await Promise.all([
    topicsPromise,
    aiService.extractActionItems(
      transcription.text,
      transcription.speakers,
      existingActionItems,
      onParseError,
      signal,
    ),
    existingActionItems.length > 0
      ? aiService.checkActionItemStatus(
        transcription.text,
        existingActionItems,
        onParseError,
        signal,
      )
      : Promise.resolve([]),
    summaryPromise,
  ]);

  return {
    transcription,
    topics,
    actionItems,
    statusUpdates,
    summary,
    warnings: buildWarnings(summary, garbled),
  };
}
