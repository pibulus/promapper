import type {
  ActionItemInput,
  ActionItemStatusUpdate,
  ConversationGraph,
  NodeInput,
} from "../types/index.ts";

// ===================================================================
// SPEAKERS
// ===================================================================

export function extractSpeakers(text: string): string[] {
  const speakerSet = new Set<string>();
  const lines = text.split("\n");
  lines.forEach((line) => {
    const match = line.match(/^([\w\s]+):/);
    if (match) {
      speakerSet.add(match[1].trim());
    }
  });
  return Array.from(speakerSet);
}

// ===================================================================
// TRANSIENT-ERROR RETRY
// ===================================================================

/**
 * Retry transient AI failures (503 overload, 429 rate limit, network blips)
 * with exponential backoff. Non-transient errors throw immediately. Shared by
 * both providers and the server service layer so retry behavior is identical.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  tries = 3,
  baseMs = 600,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      const transient =
        /\b(408|429|500|502|503|504|overload|UNAVAILABLE|RESOURCE_EXHAUSTED|ECONNRESET|ETIMEDOUT)\b/i
          .test(msg);
      lastErr = err;
      if (!transient || i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}

// ===================================================================
// JSON CLEANUP
// ===================================================================

export function cleanJsonResponse(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?\s*/, "")
    .replace(/\s*```$/, "");
}

// ===================================================================
// PRIMITIVE NORMALIZERS
// ===================================================================

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "null") {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

// ===================================================================
// ACTION ITEMS
// ===================================================================

export function normalizeActionItemInput(
  item: unknown,
): ActionItemInput | null {
  if (!isRecord(item)) return null;

  const description = normalizeString(item.description);
  // Skip empties and the legacy "No action items" sentinel.
  if (!description || description.toLowerCase() === "no action items") {
    return null;
  }

  return {
    description: description.charAt(0).toUpperCase() + description.slice(1),
    assignee: normalizeNullableString(item.assignee),
    due_date: normalizeNullableString(item.due_date),
  };
}

export function parseActionItemsResponse(text: string): ActionItemInput[] {
  const cleanedText = cleanJsonResponse(text);
  try {
    const actionItems = JSON.parse(cleanedText);
    if (!Array.isArray(actionItems)) return [];
    // Per-item normalization: a single malformed entry is skipped, not fatal.
    return actionItems
      .map(normalizeActionItemInput)
      .filter((item): item is ActionItemInput => item !== null);
  } catch (error) {
    console.error("Error parsing action items JSON:", error);
    console.error("Raw text was:", text);
    return [];
  }
}

// ===================================================================
// ACTION ITEM STATUS UPDATES (AI self-checkoff)
// ===================================================================

export function normalizeStatusUpdate(
  update: unknown,
  existingIds: Set<string>,
): ActionItemStatusUpdate | null {
  if (!isRecord(update)) return null;

  const id = normalizeString(update.id);
  // The AI may hallucinate IDs; only accept updates for items we actually have.
  if (!id || !existingIds.has(id)) return null;

  const status = normalizeString(update.status);
  if (status !== "completed" && status !== "pending") return null;

  return {
    id,
    description: normalizeString(update.description),
    status,
    reason: normalizeString(update.reason),
  };
}

export function parseStatusUpdatesResponse(
  text: string,
  existingIds: Set<string>,
): ActionItemStatusUpdate[] {
  const cleanedText = cleanJsonResponse(text);
  if (cleanedText.trim() === "[]") return [];
  try {
    const updates = JSON.parse(cleanedText);
    if (!Array.isArray(updates)) return [];
    return updates
      .map((update) => normalizeStatusUpdate(update, existingIds))
      .filter((update): update is ActionItemStatusUpdate => update !== null);
  } catch (error) {
    console.error("Error parsing action item status JSON:", error);
    console.error("Raw text was:", text);
    return [];
  }
}

// ===================================================================
// TOPIC GRAPH NORMALIZATION
// ===================================================================

function isEmojiLikeCodepoint(value: string): boolean {
  const codepoint = value.codePointAt(0) || 0;
  return (
    (codepoint >= 0x1f000 && codepoint <= 0x1faff) ||
    (codepoint >= 0x2600 && codepoint <= 0x27bf) ||
    codepoint === 0xfe0f ||
    codepoint === 0x200d
  );
}

function normalizeTopicLabel(value: unknown): string {
  return Array.from(normalizeString(value))
    .filter((char) => !isEmojiLikeCodepoint(char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function normalizeTopicId(rawId: string, label: string): string {
  const normalizedId = rawId.trim();
  // Reject generic placeholder IDs like "node1"/"topic-2" in favor of a slug.
  if (normalizedId && !/^(node|topic)-?\d+$/i.test(normalizedId)) {
    return normalizedId;
  }
  return slugify(label) || crypto.randomUUID();
}

function normalizeHexColor(value: unknown): string {
  const color = normalizeString(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function colorForLabel(label: string): string {
  const palette = [
    "#5B8DEF",
    "#52A37F",
    "#C47C48",
    "#B66AD9",
    "#D66B8F",
    "#6E9EAE",
    "#A9925A",
    "#7A83C2",
  ];
  const hash = Array.from(label).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return palette[hash % palette.length];
}

function fallbackEmoji(label: string): string {
  const normalized = label.toLowerCase();
  if (/(risk|warning|danger|issue|problem)/.test(normalized)) return "⚠️";
  if (/(idea|insight|concept|thinking)/.test(normalized)) return "💡";
  if (/(task|action|todo|plan)/.test(normalized)) return "✅";
  if (/(people|team|user|customer|public)/.test(normalized)) return "👥";
  if (/(science|lab|research|experiment|data)/.test(normalized)) return "🧪";
  if (/(money|cost|revenue|market)/.test(normalized)) return "💰";
  if (/(launch|deploy|release|ship)/.test(normalized)) return "🚀";
  return "🧠";
}

function normalizeEmoji(value: unknown, label: string): string {
  const emoji = normalizeString(value);
  if (emoji) return Array.from(emoji)[0] || fallbackEmoji(label);
  return fallbackEmoji(label);
}

function normalizeTopicNode(node: unknown): NodeInput | null {
  if (!isRecord(node)) return null;

  const rawId = normalizeString(node.id);
  const label = normalizeTopicLabel(node.label);
  if (!label) return null;

  return {
    id: normalizeTopicId(rawId, label),
    label,
    color: normalizeHexColor(node.color) || colorForLabel(label),
    emoji: normalizeEmoji(node.emoji, label),
  };
}

/**
 * Normalize a raw AI topic-graph response: dedupe nodes by label, remap raw IDs
 * to stable slugs, drop dangling/self/duplicate edges, validate colors. This is
 * what makes the topic map robust across providers.
 */
export function normalizeTopicGraph(data: unknown): ConversationGraph {
  if (!isRecord(data)) return { nodes: [], edges: [] };

  const rawNodes = Array.isArray(data.nodes) ? data.nodes.filter(isRecord) : [];
  const rawToNormalizedId = new Map<string, string>();
  const seenLabels = new Set<string>();
  const nodes: NodeInput[] = [];

  for (const rawNode of rawNodes) {
    const rawId = normalizeString(rawNode.id);
    const node = normalizeTopicNode(rawNode);
    if (!node) continue;

    const labelKey = node.label.toLowerCase();
    if (seenLabels.has(labelKey)) {
      // Duplicate label: point its raw id at the node we already kept.
      if (rawId) {
        const existing = nodes.find(
          (item) => item.label.toLowerCase() === labelKey,
        );
        if (existing) rawToNormalizedId.set(rawId, existing.id);
      }
      continue;
    }

    seenLabels.add(labelKey);
    nodes.push(node);
    if (rawId) rawToNormalizedId.set(rawId, node.id);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const seenEdges = new Set<string>();

  const edges = Array.isArray(data.edges)
    ? data.edges
      .filter(isRecord)
      .map((edge) => ({
        source_topic_id:
          rawToNormalizedId.get(normalizeString(edge.source_topic_id)) ||
          normalizeString(edge.source_topic_id),
        target_topic_id:
          rawToNormalizedId.get(normalizeString(edge.target_topic_id)) ||
          normalizeString(edge.target_topic_id),
        color: normalizeHexColor(edge.color) || "#8A8F98",
      }))
      .filter((edge) => {
        const key = `${edge.source_topic_id}->${edge.target_topic_id}`;
        if (
          !edge.source_topic_id ||
          !edge.target_topic_id ||
          edge.source_topic_id === edge.target_topic_id ||
          !nodeIds.has(edge.source_topic_id) ||
          !nodeIds.has(edge.target_topic_id) ||
          seenEdges.has(key)
        ) {
          return false;
        }
        seenEdges.add(key);
        return true;
      })
    : [];

  return { nodes, edges };
}

/**
 * Parse + normalize a topic-graph response string.
 */
export function parseGraphResponse(text: string): ConversationGraph {
  let jsonString = cleanJsonResponse(text);
  jsonString = jsonString.replace(/^.*?({.*}).*?$/s, "$1");

  try {
    const data = JSON.parse(jsonString);
    return normalizeTopicGraph(data);
  } catch (error) {
    console.error("Error parsing JSON response", error, jsonString);
    return { nodes: [], edges: [] };
  }
}
