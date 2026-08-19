/**
 * Conversation Flow Orchestrator
 *
 * Main flow: Audio/Text → Transcription → Parallel AI Analysis → Data
 * This is the nervous system in action
 */

import type { AIService, AudioPart } from "../ai/types.ts";
import { analyzeText, buildWarnings } from "./parallel-analysis.ts";
import { MAX_LABEL_LENGTH } from "./conversation-ops.ts";

// The data layer promises every caller is label-safe (rename, add-form, AI).
// These clamps make the AI caller keep that promise — a runaway model reply
// otherwise lands an unbounded label/description straight in the graph and
// breaks the fit-to-view math the cap exists for.
const clampLabel = (v: unknown) => String(v ?? "").slice(0, MAX_LABEL_LENGTH);
const clampShort = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const clampOpt = (v: string | null | undefined, n: number) =>
  v == null ? null : String(v).slice(0, n);
import type {
  ActionItem,
  ActionItemStatusUpdate,
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
  // The full ActionItemStatusUpdate, not a narrower inline shape: every
  // producer (normalizeStatusUpdate) already populates `description`, and the
  // client type (ConversationData["statusUpdates"]) demands it. Under-declaring
  // it here made coerceFlowResult's cast look like it was widening a real
  // runtime gap when it wasn't.
  statusUpdates: ActionItemStatusUpdate[];
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
  signal?: AbortSignal,
): Promise<string> {
  try {
    const title = (await aiService.generateTitle(source, signal)).trim();
    if (title) return title;
  } catch (error) {
    console.error("Title generation failed, using fallback:", error);
  }
  const snippet = source.trim().replace(/\s+/g, " ").slice(0, 40);
  return snippet ? `${snippet}${source.length > 40 ? "…" : ""}` : "Untitled";
}

/**
 * Char count under which an append is treated as "short" and skips the heavy
 * analyses (topics + summary), keeping only transcription + status checks.
 *
 * Defaults to 500 (≈30s of speech at normal pace). Override with
 * `SHORT_APPEND_THRESHOLD` to tune without a code change — raise it to make
 * more appends lightweight (cheaper, less re-analysis), lower it (or set 0) to
 * effectively disable the optimisation and always run full analysis.
 *
 * Read once at module load. `Deno.env` is guarded so this stays importable in
 * non-Deno contexts (the PartyKit bundler, tests that stub the runtime).
 */
function resolveShortAppendThreshold(): number {
  try {
    const raw = Deno.env.get("SHORT_APPEND_THRESHOLD");
    if (raw != null && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
      console.warn(
        `Ignoring invalid SHORT_APPEND_THRESHOLD="${raw}" — using default 500.`,
      );
    }
  } catch {
    // Deno unavailable (non-Deno bundler/test) — fall through to default.
  }
  return 500;
}

export const SHORT_APPEND_THRESHOLD = resolveShortAppendThreshold();

export interface ProcessAudioOptions {
  existingActionItems?: ActionItem[];
  existingNodes?: NodeInput[];
  existingEdges?: EdgeInput[];
  existingSummary?: string;
  /** Skip topic extraction + summary when transcript is short. */
  lightweightIfShort?: boolean;
  /** Appends pass the conversation's current title through so it is neither
   * regenerated (an LLM call per append, pure waste) nor churned (a user's
   * manual rename must survive an append). Empty/absent = generate one. */
  existingTitle?: string;
  /** AbortSignal to cancel AI calls (threaded to all fetches). */
  signal?: AbortSignal;
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
    existingSummary,
    lightweightIfShort = false,
    existingTitle,
    signal,
  } = options;

  // 1. Always transcribe
  const transcription = await aiService.transcribeAudio(audioInput, signal);
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
  let statusUpdates: ActionItemStatusUpdate[] = [];
  let summary = "";
  let warnings: string[] = [];

  if (isShort) {
    // Lightweight: skip topic extraction, action extraction, summary.
    // Only check if existing items were completed/reopened.
    if (existingActionItems.length > 0) {
      // The status check is the ONLY AI call on this path, so a silent failure
      // here means the append lands as a 200 that changed nothing — and the
      // receipt toast says "no new items this time", which reads as "the AI
      // didn't hear you" when in fact it never got an answer. Warn instead.
      // onParseError was `undefined` here while the full path (analyzeText)
      // has always passed it, so a garbled reply degraded silently too.
      const garbled = new Set<string>();
      try {
        statusUpdates = await aiService.checkActionItemStatus(
          transcriptText,
          existingActionItems,
          (what) => garbled.add(what),
          signal,
        );
      } catch (error) {
        console.error("Lightweight status check failed:", error);
        warnings.push(
          "Couldn't check your items against this take — nothing was ticked off this round.",
        );
      }
      warnings.push(...buildWarnings("", garbled));
    }
    summary = ""; // short append — summary not updated this round
  } else {
    // Full analysis — use analyzeText since we already transcribed
    const analysis = await analyzeText(
      aiService,
      transcriptText,
      transcription.speakers,
      existingActionItems,
      existingNodes,
      existingEdges,
      existingSummary,
      signal,
    );

    nodes = analysis.topics.nodes.map((node) => ({
      id: node.id,
      conversation_id: conversationId,
      label: clampLabel(node.label),
      emoji: clampShort(node.emoji, 16),
      color: clampShort(node.color, 32),
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
      description: clampShort(item.description, 500),
      assignee: clampOpt(item.assignee, 100),
      due_date: clampOpt(item.due_date, 40),
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    statusUpdates = analysis.statusUpdates;
    summary = analysis.summary;
    warnings = analysis.warnings;
  }

  // A conversation is titled ONCE. Appends pass the existing title through —
  // regenerating burned an LLM call per append AND churned the header (a
  // user's manual rename got clobbered mid-meeting by a 3-second aside).
  const title = existingTitle?.trim() ||
    await safeGenerateTitle(aiService, transcriptText, signal);

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

type TextAnalysis = Awaited<ReturnType<typeof analyzeText>>;

/** Map a raw analysis onto the flow-result node/edge/action shapes. */
function mapAnalysis(analysis: TextAnalysis, conversationId: string): {
  nodes: Node[];
  edges: Edge[];
  actionItems: ActionItem[];
} {
  return {
    nodes: analysis.topics.nodes.map((node) => ({
      id: node.id,
      conversation_id: conversationId,
      label: clampLabel(node.label),
      emoji: clampShort(node.emoji, 16),
      color: clampShort(node.color, 32),
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
      description: clampShort(item.description, 500),
      assignee: clampOpt(item.assignee, 100),
      due_date: clampOpt(item.due_date, 40),
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  };
}

/**
 * Process already-transcribed text from a live session — full analysis, no
 * title generation. The live loop runs every ~30s; regenerating the title
 * each round would rename the conversation mid-meeting, so the caller keeps
 * whatever title it already has (`title` is echoed into the result).
 */
export async function processLiveText(
  aiService: AIService,
  text: string,
  conversationId: string,
  speakers: string[],
  title: string,
  options: Omit<ProcessAudioOptions, "lightweightIfShort"> = {},
): Promise<ConversationFlowResult> {
  const {
    existingActionItems = [],
    existingNodes = [],
    existingEdges = [],
    signal,
  } = options;

  const analysis = await analyzeText(
    aiService,
    text,
    speakers,
    existingActionItems,
    existingNodes,
    existingEdges,
    existingSummary,
    signal,
  );

  return {
    conversation: {
      id: conversationId,
      title,
      source: "audio",
      transcript: text,
    },
    transcript: {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      text,
      speakers,
      source: "audio",
      created_at: new Date().toISOString(),
    },
    ...mapAnalysis(analysis, conversationId),
    summary: analysis.summary,
    statusUpdates: analysis.statusUpdates,
    warnings: analysis.warnings,
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
  existingSummary?: string,
  signal?: AbortSignal,
): Promise<ConversationFlowResult> {
  // Parallel AI analysis
  const analysis = await analyzeText(
    aiService,
    text,
    speakers,
    existingActionItems,
    existingNodes,
    existingEdges,
    existingSummary,
    signal,
  );

  // Generate title (graceful fallback so a title failure does not sink the flow)
  const title = await safeGenerateTitle(aiService, text, signal);

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
    ...mapAnalysis(analysis, conversationId),
    summary: analysis.summary,
    statusUpdates: analysis.statusUpdates,
    warnings: analysis.warnings,
  };
}
