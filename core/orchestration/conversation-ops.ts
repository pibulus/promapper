/**
 * Conversation Operations
 *
 * Pure, framework-neutral transforms over ConversationData. These return a NEW
 * ConversationData (never mutate the input) so signal/state layers can assign
 * the result directly. Keeping them here makes the domain logic unit-testable
 * and gives islands/stores a single source of truth for these mutations.
 */

import type { ConversationData } from "../types/conversation-data.ts";

type ActionItem = ConversationData["actionItems"][number];
type TopicNode = ConversationData["nodes"][number];
type TopicEdge = ConversationData["edges"][number];

/**
 * Replace the action item list (e.g. after reorder/edit/delete in the UI).
 */
export function updateActionItems(
  data: ConversationData,
  actionItems: ActionItem[],
): ConversationData {
  return { ...data, actionItems };
}

/**
 * Rebuild an item without ai_checked/checked_reason and with a new status +
 * updated_at stamp. A manual status change is the user overriding the AI, so
 * the item must no longer count as AI-decided — otherwise a later append's
 * status reconciliation could silently re-flip it. Every manual status
 * mutation (single toggle, bulk complete) funnels through here so the guard
 * can't drift between call sites.
 */
function withManualStatus(
  item: ActionItem,
  status: ActionItem["status"],
  now: string,
): ActionItem {
  const { ai_checked: _ai, checked_reason: _reason, ...rest } = item as
    & ActionItem
    & { ai_checked?: boolean; checked_reason?: string };
  return { ...rest, status, updated_at: now };
}

/**
 * Toggle one action item's completed/pending status within a plain item list.
 * List-level twin of toggleActionItemStatus for callers that hold items
 * without the surrounding ConversationData (the card's local state).
 */
export function toggleActionItemInList(
  items: ActionItem[],
  id: string,
  now: string,
): ActionItem[] {
  return items.map((item) =>
    item.id === id
      ? withManualStatus(
        item,
        item.status === "completed" ? "pending" : "completed",
        now,
      )
      : item
  );
}

/**
 * Toggle a single action item's completed/pending status by id, stamping
 * updated_at and clearing the AI-attribution flags (see withManualStatus).
 */
export function toggleActionItemStatus(
  data: ConversationData,
  id: string,
  now: string,
): ConversationData {
  return {
    ...data,
    actionItems: toggleActionItemInList(data.actionItems, id, now),
  };
}

/**
 * Complete every pending item (bulk "Complete all" / "Mark all done").
 * Already-completed items are untouched — their AI attribution survives.
 */
export function completeAllActionItems(
  items: ActionItem[],
  now: string,
): ActionItem[] {
  return items.map((item) =>
    item.status === "pending" ? withManualStatus(item, "completed", now) : item
  );
}

/**
 * Drop every completed item (bulk "Clear done").
 */
export function clearCompletedActionItems(items: ActionItem[]): ActionItem[] {
  return items.filter((item) => item.status !== "completed");
}

/**
 * Rename a speaker everywhere it appears: the transcript text, the conversation
 * transcript copy, and the speakers list (deduped). No-op for an empty/identical
 * rename. Returns the same object reference when nothing changes.
 */
export function renameSpeaker(
  data: ConversationData,
  oldName: string,
  newName: string,
): ConversationData {
  const trimmedNew = newName.trim();
  if (!oldName || !trimmedNew || oldName === trimmedNew) return data;

  const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const speakerPrefix = new RegExp(`(^|\\n)${escapedOldName}:`, "g");

  const updatedText = data.transcript.text.replace(
    speakerPrefix,
    `$1${trimmedNew}:`,
  );
  const updatedConversationTranscript = data.conversation.transcript.replace(
    speakerPrefix,
    `$1${trimmedNew}:`,
  );
  const nextSpeakers = data.transcript.speakers.map((speaker) =>
    speaker === oldName ? trimmedNew : speaker
  );

  return {
    ...data,
    conversation: {
      ...data.conversation,
      transcript: updatedConversationTranscript,
    },
    transcript: {
      ...data.transcript,
      text: updatedText,
      speakers: Array.from(new Set(nextSpeakers)),
    },
  };
}

// ===================================================================
// TOPIC GRAPH
// ===================================================================

/**
 * Drop self-loops and duplicate edges (same source->target) from an edge list,
 * keeping the first occurrence. Used after a merge rewires endpoints.
 */
function dedupeEdges(edges: TopicEdge[]): TopicEdge[] {
  const seen = new Set<string>();
  const out: TopicEdge[] = [];
  for (const edge of edges) {
    if (edge.source_topic_id === edge.target_topic_id) continue; // self loop
    const key = `${edge.source_topic_id}->${edge.target_topic_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

/**
 * Merge the source topic into the target topic (drag-to-merge). The source node
 * is removed; every edge touching source is rewired to target; resulting
 * self-loops and duplicate edges are dropped. promapper edge fields (id,
 * conversation_id, created_at) are preserved on the surviving edges. No-op if
 * either id is missing/unknown or both are the same.
 */
export function mergeTopics(
  data: ConversationData,
  sourceId: string,
  targetId: string,
): ConversationData {
  if (!sourceId || !targetId || sourceId === targetId) return data;
  const ids = new Set(data.nodes.map((n) => n.id));
  if (!ids.has(sourceId) || !ids.has(targetId)) return data;

  const nodes = data.nodes.filter((n) => n.id !== sourceId);
  const rewired = data.edges.map((edge) => ({
    ...edge,
    source_topic_id: edge.source_topic_id === sourceId
      ? targetId
      : edge.source_topic_id,
    target_topic_id: edge.target_topic_id === sourceId
      ? targetId
      : edge.target_topic_id,
  }));

  return { ...data, nodes, edges: dedupeEdges(rewired) };
}

/**
 * Longest a topic label may be. A node label is rendered as centered SVG text
 * with no wrapping/clipping, so an unbounded label (a pasted paragraph, a
 * fat-fingered rename) spills off the canvas and breaks the fit-to-view math.
 * Cap it at the data layer so every caller (rename prompt, add-form, AI) is safe.
 */
export const MAX_LABEL_LENGTH = 60;

/**
 * Rename a topic node's label by id. No-op for empty/identical labels.
 * Clamps to MAX_LABEL_LENGTH so a runaway label can't overflow the graph.
 */
export function renameTopic(
  data: ConversationData,
  id: string,
  label: string,
): ConversationData {
  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!id || !trimmed) return data;
  let changed = false;
  const nodes = data.nodes.map((node) => {
    if (node.id === id && node.label !== trimmed) {
      changed = true;
      return { ...node, label: trimmed };
    }
    return node;
  });
  return changed ? { ...data, nodes } : data;
}

/**
 * Add a topic node. Pure sibling to renameTopic/deleteTopic so a manual add goes
 * through the same audited, undoable path as every other graph mutation instead
 * of a hand-rolled spread in the island. Caps the label, defaults emoji/color,
 * and mints a stable id. No-op (returns same ref) on an empty label.
 */
export function addTopic(
  data: ConversationData,
  input: { label: string; emoji?: string; color?: string },
): { data: ConversationData; id: string | null } {
  const label = input.label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!label) return { data, id: null };
  const id = `manual_${crypto.randomUUID()}`;
  const node = {
    id,
    label,
    emoji: (input.emoji?.trim() || "✨").slice(0, 16),
    color: input.color?.trim() || "#E8839C",
  };
  return { data: { ...data, nodes: [...data.nodes, node] }, id };
}

/**
 * Delete a topic node by id and any edges touching it.
 */
export function deleteTopic(
  data: ConversationData,
  id: string,
): ConversationData {
  if (!id || !data.nodes.some((n) => n.id === id)) return data;
  const nodes = data.nodes.filter((n) => n.id !== id);
  const edges = data.edges.filter(
    (e) => e.source_topic_id !== id && e.target_topic_id !== id,
  );
  return { ...data, nodes, edges };
}

/**
 * Remove a single connection (edge) between two topics, leaving both topics in
 * place. Matches the edge by its source/target pair (order-independent), so it
 * works whether or not the edge carries an explicit id — and because mapEdges
 * dedupes pairs, a pair identifies at most one edge. Used to sever a spurious
 * link the AI drew. No-op if no such edge exists.
 */
export function deleteEdge(
  data: ConversationData,
  sourceId: string,
  targetId: string,
): ConversationData {
  if (!sourceId || !targetId) return data;
  const matches = (e: ConversationData["edges"][number]) =>
    (e.source_topic_id === sourceId && e.target_topic_id === targetId) ||
    (e.source_topic_id === targetId && e.target_topic_id === sourceId);
  if (!data.edges.some(matches)) return data;
  return { ...data, edges: data.edges.filter((e) => !matches(e)) };
}

/**
 * Persist node positions from the graph layout back onto the nodes, so the graph
 * does not re-scramble on reload. Positions arrive as an id -> {x,y} map.
 */
export function persistTopicPositions(
  data: ConversationData,
  positions: Record<string, { x: number; y: number }>,
): ConversationData {
  let changed = false;
  const nodes = data.nodes.map((node) => {
    const pos = positions[node.id];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      changed = true;
      return { ...node, position: { x: pos.x, y: pos.y } } as TopicNode;
    }
    return node;
  });
  return changed ? { ...data, nodes } : data;
}
