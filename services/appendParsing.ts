/**
 * Append input parsing — server-side hygiene for client-supplied existing*
 * fields, shared by /api/append and /api/live/analyze.
 *
 * Per-field caps mirror the protocol/share sanitizers so a crafted existing*
 * field can't smuggle multi-KB labels/colors into the merge (and thence into
 * the initiator's response). Extracted from routes/api/append.ts so the two
 * analysis routes can't drift on input caps.
 */

import type { ActionItem, Edge, Node } from "@core/types/index.ts";

/** Prevent a crafted existingTranscript field from OOM'ing the server during
 *  transcript concatenation. 500KB ≈ 2+ hour meeting. */
export const MAX_EXISTING_TRANSCRIPT = 500_000;

export function parseExistingActionItems(
  json: string | null,
  conversationId: string,
): ActionItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeActionItem(item, conversationId))
      .filter((item): item is ActionItem => Boolean(item))
      .slice(0, 200);
  } catch (error) {
    console.warn("Failed to parse existing action items:", error);
    return [];
  }
}

function sanitizeActionItem(
  raw: unknown,
  conversationId: string,
): ActionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  // Cap length to match the protocol/share sanitizers (which cap at 500).
  const MAX_DESCRIPTION = 500;
  const description = typeof record.description === "string"
    ? record.description.trim().slice(0, MAX_DESCRIPTION)
    : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";

  if (!description || !id) {
    return null;
  }

  const isoNow = new Date().toISOString();
  const item: ActionItem = {
    id,
    conversation_id: typeof record.conversation_id === "string"
      ? record.conversation_id
      : conversationId,
    description,
    assignee: typeof record.assignee === "string" && record.assignee.trim()
      ? record.assignee.trim()
      : null,
    due_date: typeof record.due_date === "string" && record.due_date.trim()
      ? record.due_date
      : null,
    status: record.status === "completed" ? "completed" : "pending",
    created_at: typeof record.created_at === "string"
      ? record.created_at
      : isoNow,
    updated_at: typeof record.updated_at === "string"
      ? record.updated_at
      : isoNow,
  };

  if (record.ai_checked === true) {
    item.ai_checked = true;
  }

  if (
    typeof record.checked_reason === "string" && record.checked_reason.trim()
  ) {
    item.checked_reason = record.checked_reason.trim().slice(
      0,
      MAX_DESCRIPTION,
    );
  }

  return item;
}

const cap = (v: unknown, n: number) =>
  typeof v === "string" ? v.slice(0, n) : "";

function sanitizeNode(raw: unknown, conversationId: string): Node | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = cap(r.id, 128).trim();
  const label = cap(r.label, 120).trim();
  if (!id || !label) return null;
  // Only carry a position through if it's a real {x,y} number pair — drop
  // garbage rather than passing an untyped object into the merge.
  const p = r.position as Record<string, unknown> | undefined;
  const position = p && typeof p.x === "number" && typeof p.y === "number"
    ? { x: p.x, y: p.y }
    : undefined;
  return {
    id,
    conversation_id: cap(r.conversation_id, 128) || conversationId,
    label,
    emoji: cap(r.emoji, 16) || "🧠",
    color: cap(r.color, 40) || "#E8839C",
    created_at: typeof r.created_at === "string"
      ? r.created_at
      : new Date().toISOString(),
    ...(position ? { position } : {}),
  };
}

function sanitizeEdge(raw: unknown, conversationId: string): Edge | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = cap(r.source_topic_id, 128).trim();
  const target = cap(r.target_topic_id, 128).trim();
  if (!source || !target) return null;
  return {
    id: typeof r.id === "string" ? cap(r.id, 128) : crypto.randomUUID(),
    conversation_id: cap(r.conversation_id, 128) || conversationId,
    source_topic_id: source,
    target_topic_id: target,
    color: cap(r.color, 40) || "#8A8F98",
    created_at: typeof r.created_at === "string"
      ? r.created_at
      : new Date().toISOString(),
  };
}

export function parseExistingNodes(
  json: string | null,
  conversationId: string,
): Node[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n) => sanitizeNode(n, conversationId))
      .filter((n): n is Node => Boolean(n))
      .slice(0, 200);
  } catch (error) {
    console.warn("Failed to parse existing nodes:", error);
    return [];
  }
}

export function parseExistingEdges(
  json: string | null,
  conversationId: string,
): Edge[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => sanitizeEdge(e, conversationId))
      .filter((e): e is Edge => Boolean(e))
      .slice(0, 400);
  } catch (error) {
    console.warn("Failed to parse existing edges:", error);
    return [];
  }
}
