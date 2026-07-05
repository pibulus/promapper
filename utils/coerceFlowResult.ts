/**
 * Guard the shape of /api/process and /api/append responses before they touch
 * `conversationData` (and from there, localStorage). A 200 with an unexpected
 * body — proxy interstitial, partial server result, changed contract — would
 * otherwise commit garbage to the global signal and persist it. Sibling of
 * `normalizeStored` in core/storage/localStorage.ts, which does the same for
 * records loaded back from disk.
 */

import type { ConversationData } from "@core/types/conversation-data.ts";

export function coerceFlowResult(raw: unknown): ConversationData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // The conversation id is the one thing nothing downstream can synthesize —
  // storage keys, appends, and shares all hang off it.
  const conv = r.conversation as Record<string, unknown> | undefined;
  if (!conv || typeof conv !== "object" || typeof conv.id !== "string") {
    return null;
  }

  const transcript = r.transcript as Record<string, unknown> | undefined;

  return {
    conversation: {
      id: conv.id,
      title: typeof conv.title === "string" ? conv.title : undefined,
      source: typeof conv.source === "string" ? conv.source : "text",
      transcript: typeof conv.transcript === "string" ? conv.transcript : "",
      created_at: typeof conv.created_at === "string"
        ? conv.created_at
        : undefined,
    },
    transcript: {
      text: typeof transcript?.text === "string" ? transcript.text : "",
      speakers: Array.isArray(transcript?.speakers)
        ? transcript.speakers.filter((s): s is string => typeof s === "string")
        : [],
    },
    nodes: Array.isArray(r.nodes) ? r.nodes as ConversationData["nodes"] : [],
    edges: Array.isArray(r.edges) ? r.edges as ConversationData["edges"] : [],
    actionItems: Array.isArray(r.actionItems)
      ? r.actionItems as ConversationData["actionItems"]
      : [],
    statusUpdates: Array.isArray(r.statusUpdates)
      ? r.statusUpdates as ConversationData["statusUpdates"]
      : [],
    summary: typeof r.summary === "string" ? r.summary : undefined,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}
