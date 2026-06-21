/**
 * Export Context Builder
 *
 * Turns the full ConversationData into a rich, structured context block for the
 * AI export prompts — title, summary, open + completed action items (with
 * assignee/due/AI-checkoff reason), the topic map + its connections, and the
 * transcript. Without this, every export re-derives everything from raw
 * transcript; with it, a "Meeting Minutes" or "Action Plan" already knows the
 * project's shape. Pure + framework-agnostic.
 */

import type { ConversationData } from "../types/conversation-data.ts";

type ActionItem = ConversationData["actionItems"][number] & {
  checked_reason?: string;
};
type TopicNode = ConversationData["nodes"][number];
type TopicEdge = ConversationData["edges"][number];

function formatActionItemList(items: ActionItem[]): string {
  return items
    .map((item) => {
      const meta = [
        item.assignee ? `assignee: ${item.assignee}` : "",
        item.due_date ? `due: ${item.due_date}` : "",
        item.checked_reason ? `reason: ${item.checked_reason}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      return `- ${item.description}${meta ? ` (${meta})` : ""}`;
    })
    .join("\n");
}

function formatActionItems(items: ActionItem[]): string {
  const open = items.filter((i) => i.status !== "completed");
  const completed = items.filter((i) => i.status === "completed");
  return [
    open.length ? `OPEN ACTION ITEMS:\n${formatActionItemList(open)}` : "",
    completed.length
      ? `COMPLETED ACTION ITEMS:\n${formatActionItemList(completed)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatTopics(nodes: TopicNode[], edges: TopicEdge[]): string {
  const labelById = new Map(nodes.map((n) => [n.id, n.label]));
  const topicList = nodes
    .map((n) => `- ${n.emoji ? `${n.emoji} ` : ""}${n.label}`)
    .join("\n");
  const edgeList = edges
    .map((e) => {
      const source = labelById.get(e.source_topic_id);
      const target = labelById.get(e.target_topic_id);
      return source && target ? `- ${source} -> ${target}` : "";
    })
    .filter(Boolean)
    .join("\n");
  return [
    `TOPICS:\n${topicList}`,
    edgeList ? `TOPIC CONNECTIONS:\n${edgeList}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Build the rich export context. Falls back to `fallbackText` when there's no
 * usable conversation (keeps the simple text-only path working).
 */
export function buildExportContext(
  data: ConversationData | null | undefined,
  fallbackText = "",
): string {
  if (!data) return fallbackText;

  const title = data.conversation?.title?.trim() ?? "";
  const summary = data.summary?.trim() ?? "";
  const transcript = (data.transcript?.text || data.conversation?.transcript ||
    fallbackText || "").trim();
  const actionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];

  const block = [
    title ? `PROJECT TITLE:\n${title}` : "",
    summary ? `CURRENT SUMMARY:\n${summary}` : "",
    actionItems.length ? formatActionItems(actionItems as ActionItem[]) : "",
    nodes.length ? formatTopics(nodes, edges) : "",
    transcript ? `TRANSCRIPT:\n${transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return block || fallbackText;
}
