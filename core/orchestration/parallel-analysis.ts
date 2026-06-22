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

export interface AnalysisResult {
  topics: ConversationGraph;
  actionItems: ActionItemInput[];
  statusUpdates: ActionItemStatusUpdate[];
  summary: string;
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
): Promise<AnalysisResult> {
  // Topics first so the summary can lead with what the conversation is about.
  // Only the summary waits on topics — action items and status checks run fully
  // parallel the whole time, so wall-clock is the slower of those vs the
  // topics→summary chain, not the sum. If topic extraction fails it degrades to
  // an empty graph (extractTopics already returns {nodes:[],edges:[]} on error),
  // so the summary just falls back to a plain text summary.
  const topicsPromise = aiService.extractTopics(
    text,
    existingNodes,
    existingEdges,
  );
  const summaryPromise = topicsPromise.then((topics) =>
    aiService.generateSummary(text, topics.nodes.map((n) => n.label))
  );

  const [topics, actionItems, statusUpdates, summary] = await Promise.all([
    topicsPromise,
    aiService.extractActionItems(text, speakers, existingActionItems),
    existingActionItems.length > 0
      ? aiService.checkActionItemStatus(text, existingActionItems)
      : Promise.resolve([]),
    summaryPromise,
  ]);

  return {
    topics,
    actionItems,
    statusUpdates,
    summary,
  };
}

/**
 * Run parallel AI analysis on new audio
 */
export async function analyzeAudio(
  aiService: AIService,
  audioInput: AudioPart,
  existingActionItems: ActionItem[] = [],
  existingNodes: NodeInput[] = [],
  existingEdges: EdgeInput[] = [],
): Promise<
  AnalysisResult & { transcription: { text: string; speakers: string[] } }
> {
  // First transcribe the audio
  const transcription = await aiService.transcribeAudio(audioInput);

  // Topics first so the summary leads with the conversation's actual topics.
  // Only the summary waits on topics; everything else stays parallel (see
  // analyzeText for the rationale). Degrades to a plain summary if topics fail.
  const topicsPromise = aiService.extractTopics(
    transcription.text,
    existingNodes,
    existingEdges,
  );
  const summaryPromise = topicsPromise.then((topics) =>
    aiService.generateSummary(
      transcription.text,
      topics.nodes.map((n) => n.label),
    )
  );

  const [topics, actionItems, statusUpdates, summary] = await Promise.all([
    topicsPromise,
    aiService.extractActionItems(
      audioInput,
      transcription.speakers,
      existingActionItems,
    ),
    existingActionItems.length > 0
      ? aiService.checkActionItemStatus(audioInput, existingActionItems)
      : Promise.resolve([]),
    summaryPromise,
  ]);

  return {
    transcription,
    topics,
    actionItems,
    statusUpdates,
    summary,
  };
}
