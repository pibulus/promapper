/**
 * Conversation Flow Orchestrator
 *
 * Main flow: Audio/Text → Transcription → Parallel AI Analysis → Data
 * This is the nervous system in action
 */

import type { AIService, AudioPart } from "../ai/types.ts";
import { analyzeText } from "./parallel-analysis.ts";
import type {
  ActionItem,
  Conversation,
  Edge,
  EdgeInput,
  Node,
  NodeInput,
  Transcript,
} from "../types/index.ts";

export interface ConversationFlowResult {
  conversation: Partial<Conversation>;
  transcript: Partial<Transcript>;
  nodes: Node[];
  edges: Edge[];
  actionItems: ActionItem[];
  summary: string;
  statusUpdates: Array<{
    id: string;
    status: "completed" | "pending";
    reason: string;
  }>;
  /** Non-empty when an AI step degraded — always safe to show the user. */
  warnings: string[];
}

/**
 * Generate a title, falling back to a short derived snippet if the AI call
 * fails. A failed title should never reject the whole conversation flow.
 */
async function safeGenerateTitle(
  aiService: AIService,
  source: string,
): Promise<string> {
  try {
    const title = (await aiService.generateTitle(source)).trim();
    if (title) return title;
  } catch (error) {
    console.error("Title generation failed, using fallback:", error);
  }
  const snippet = source.trim().replace(/\s+/g, " ").slice(0, 40);
  return snippet ? `${snippet}${source.length > 40 ? "…" : ""}` : "Untitled";
}

/** Rough char count for ~30s of speech at normal pace. */
export const SHORT_APPEND_THRESHOLD = 500;

export interface ProcessAudioOptions {
  existingActionItems?: ActionItem[];
  existingNodes?: NodeInput[];
  existingEdges?: EdgeInput[];
  /** Skip topic extraction + summary when transcript is short. */
  lightweightIfShort?: boolean;
}

/**
 * Process new audio input.
 *
 * When `lightweightIfShort` is true and the transcription is under
 * SHORT_APPEND_THRESHOLD characters, the heavy analyses (topic extraction,
 * action-item extraction, summary) are skipped — only transcription and
 * status checks run. Saves ~2x on live-meeting append costs.
 */
export async function processAudio(
  aiService: AIService,
  audioInput: AudioPart,
  conversationId: string,
  options: ProcessAudioOptions = {},
): Promise<ConversationFlowResult> {
  const {
    existingActionItems = [],
    existingNodes = [],
    existingEdges = [],
    lightweightIfShort = false,
  } = options;

  // 1. Always transcribe
  const transcription = await aiService.transcribeAudio(audioInput);
  const transcriptText = transcription.text.trim();
  const isShort = lightweightIfShort &&
    transcriptText.length < SHORT_APPEND_THRESHOLD;

  // If transcription came back empty (silence, model error, etc.), bail
  // early instead of wasting API calls on topics/summary for empty input.
  if (!transcriptText) {
    return {
      conversation: {
        id: conversationId,
        title: "Untitled",
        source: "audio",
        transcript: "",
      },
      transcript: {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        text: "",
        speakers: transcription.speakers,
        source: "audio",
        created_at: new Date().toISOString(),
      },
      nodes: [],
      edges: [],
      actionItems: [],
      statusUpdates: [],
      warnings: ["No speech detected in this recording."],
      summary: "(no speech detected)",
    };
  }

  let nodes: Node[] = [];
  let edges: Edge[] = [];
  let actionItems: ActionItem[] = [];
  let statusUpdates: Array<
    { id: string; status: "completed" | "pending"; reason: string }
  > = [];
  let summary = "";
  let warnings: string[] = [];

  if (isShort) {
    // Lightweight: skip topic extraction, action extraction, summary.
    // Only check if existing items were completed/reopened.
    if (existingActionItems.length > 0) {
      try {
        statusUpdates = await aiService.checkActionItemStatus(
          transcriptText,
          existingActionItems,
        );
      } catch (error) {
        console.error("Lightweight status check failed:", error);
      }
    }
    summary = "(skipped — short append)";
  } else {
    // Full analysis — use analyzeText since we already transcribed
    const analysis = await analyzeText(
      aiService,
      transcriptText,
      transcription.speakers,
      existingActionItems,
      existingNodes,
      existingEdges,
    );

    nodes = analysis.topics.nodes.map((node) => ({
      id: node.id,
      conversation_id: conversationId,
      label: node.label,
      emoji: node.emoji,
      color: node.color,
      created_at: new Date().toISOString(),
    }));
    edges = analysis.topics.edges.map((edge) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      source_topic_id: edge.source_topic_id,
      target_topic_id: edge.target_topic_id,
      color: edge.color,
      created_at: new Date().toISOString(),
    }));
    actionItems = analysis.actionItems.map((item) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      description: item.description,
      assignee: item.assignee,
      due_date: item.due_date,
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    statusUpdates = analysis.statusUpdates;
    summary = analysis.summary;
    warnings = analysis.warnings;
  }

  const title = await safeGenerateTitle(aiService, transcriptText);

  return {
    conversation: {
      id: conversationId,
      title,
      source: "audio",
      transcript: transcriptText,
    },
    transcript: {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      text: transcriptText,
      speakers: transcription.speakers,
      source: "audio",
      created_at: new Date().toISOString(),
    },
    nodes,
    edges,
    actionItems,
    summary,
    statusUpdates,
    warnings,
  };
}

/**
 * Process new text input
 */
export async function processText(
  aiService: AIService,
  text: string,
  conversationId: string,
  speakers: string[] = [],
  existingActionItems: ActionItem[] = [],
  existingNodes: NodeInput[] = [],
  existingEdges: EdgeInput[] = [],
): Promise<ConversationFlowResult> {
  // Parallel AI analysis
  const analysis = await analyzeText(
    aiService,
    text,
    speakers,
    existingActionItems,
    existingNodes,
    existingEdges,
  );

  // Generate title (graceful fallback so a title failure does not sink the flow)
  const title = await safeGenerateTitle(aiService, text);

  // Build result
  return {
    conversation: {
      id: conversationId,
      title,
      source: "text",
      transcript: text,
    },
    transcript: {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      text,
      speakers,
      source: "text",
      created_at: new Date().toISOString(),
    },
    nodes: analysis.topics.nodes.map((node) => ({
      id: node.id,
      conversation_id: conversationId,
      label: node.label,
      emoji: node.emoji,
      color: node.color,
      created_at: new Date().toISOString(),
    })),
    edges: analysis.topics.edges.map((edge) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      source_topic_id: edge.source_topic_id,
      target_topic_id: edge.target_topic_id,
      color: edge.color,
      created_at: new Date().toISOString(),
    })),
    actionItems: analysis.actionItems.map((item) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      description: item.description,
      assignee: item.assignee,
      due_date: item.due_date,
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    summary: analysis.summary,
    statusUpdates: analysis.statusUpdates,
    warnings: analysis.warnings,
  };
}
