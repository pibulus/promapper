/**
 * Append Audio API Route
 *
 * Appends new audio to an existing conversation
 * - Transcribes audio
 * - Appends transcript
 * - Re-analyzes action items with smart completion detection
 * - Updates topics if needed
 * - Returns updated conversation data
 */

import { Handlers } from "$fresh/server.ts";
import { processAudio } from "@core/orchestration/conversation-flow.ts";
import type { ConversationFlowResult } from "@core/orchestration/conversation-flow.ts";
import {
  mergeAppendActionItems,
  mergeAppendEdges,
  mergeAppendNodes,
} from "@core/orchestration/append-merge.ts";
import type { ActionItem, Edge, Node } from "@core/types/index.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import {
  MAX_AUDIO_SIZE,
  MIN_AUDIO_SIZE,
  uploadAudioFile,
} from "@services/audio.ts";
import { pushResultToRoom } from "@services/partyUpdates.ts";

/** Prevent a crafted existingTranscript FormData field from OOM'ing the
 *  server during transcript concatenation. 500KB ≈ 2+ hour meeting. */
const MAX_EXISTING_TRANSCRIPT = 500_000;
/** Append audio processing timeout (threaded as AbortSignal to all fetches). */
const APPEND_TIMEOUT_MS = 60_000;

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = await guardRequest(req);
      if (guardResponse) {
        return guardResponse;
      }

      const contentType = req.headers.get("content-type") || "";

      if (!contentType.includes("multipart/form-data")) {
        return new Response(
          JSON.stringify({ error: "Expected multipart/form-data" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Reject oversized uploads before buffering the full body into memory.
      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl, 10) > MAX_AUDIO_SIZE + 2_097_152) {
        return new Response(
          JSON.stringify({ error: "Request body too large" }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }

      const aiService = getAIService();

      // Parse form data
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File;
      const conversationId = formData.get("conversationId") as string;
      const existingTranscript = formData.get("existingTranscript") as
        | string
        | null;
      const existingActionItemsJson = formData.get("existingActionItems") as
        | string
        | null;
      const existingSummary = formData.get("existingSummary") as string | null;
      const existingNodesJson = formData.get("existingNodes") as string | null;
      const existingEdgesJson = formData.get("existingEdges") as string | null;

      if (!audioFile) {
        return new Response(
          JSON.stringify({ error: "No audio file provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Reject empty/near-empty recordings before they hit the provider. A
      // glitched mobile recording (permission race, instant tap, backgrounded
      // tab) yields a valid-but-tiny File that would otherwise become a cryptic
      // transcription failure. A real recording with any audio is well over 1KB.
      if (audioFile.size < MIN_AUDIO_SIZE) {
        return new Response(
          JSON.stringify({
            error:
              "That recording came through empty — we didn't catch any audio. Give it another go.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      }

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: "No conversation ID provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Validate file size (max to prevent abuse)
      if (audioFile.size > MAX_AUDIO_SIZE) {
        return new Response(
          JSON.stringify({
            error: `File too large. Maximum size is 25MB (received ${
              (audioFile.size / 1024 / 1024).toFixed(1)
            }MB)`,
          }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }

      const existingActionItems = parseExistingActionItems(
        existingActionItemsJson,
        conversationId,
      );
      const existingNodes = parseExistingNodes(
        existingNodesJson,
        conversationId,
      );
      const existingEdges = parseExistingEdges(
        existingEdgesJson,
        conversationId,
      );
      const { part: audioPart } = await uploadAudioFile(audioFile);

      console.log(`📎 Appending audio to conversation ${conversationId}`);
      console.log(
        `📋 Found ${existingActionItems.length} existing action items`,
      );
      console.log(`🕸️ Found ${existingNodes.length} existing topics`);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), APPEND_TIMEOUT_MS);
      let result: ConversationFlowResult;
      try {
        result = await processAudio(
          aiService,
          audioPart,
          conversationId,
          {
            existingActionItems,
            existingNodes,
            existingEdges,
            lightweightIfShort: true,
            signal: ctrl.signal,
          },
        );
      } finally {
        clearTimeout(timer);
      }

      // Merge transcripts if we have existing content.
      // Cap the existing transcript to prevent OOM from oversized FormData values
      // (the field is client-controlled, not server-enforced).
      const safeExistingTranscript = existingTranscript
        ? existingTranscript.slice(0, MAX_EXISTING_TRANSCRIPT)
        : "";
      if (safeExistingTranscript) {
        const combinedTranscript =
          `${safeExistingTranscript}\n\n--- New Recording ---\n\n${result.transcript.text}`;
        result.transcript.text = combinedTranscript;
        result.conversation.transcript = combinedTranscript;
      }

      // Append summaries: keep the original base summary and only the LATEST
      // update block, so the summary doesn't grow unbounded across recordings.
      if (existingSummary && result.summary) {
        const updateMarker = "**Update from latest recording:**";
        const base = existingSummary.split(updateMarker)[0].trim();
        result.summary = `${base}\n\n${updateMarker}\n${result.summary}`;
      }

      // Process status updates from AI analysis
      // These tell us which action items were marked as complete in the new audio
      console.log(`✅ Status updates detected: ${result.statusUpdates.length}`);

      const mergedActionItems = mergeAppendActionItems(
        existingActionItems,
        result.actionItems,
        result.statusUpdates,
      );

      console.log(`📊 Final action items: ${mergedActionItems.length} total`);
      console.log(
        `   - ${
          mergedActionItems.filter((i) => i.status === "completed").length
        } completed`,
      );
      console.log(
        `   - ${
          mergedActionItems.filter((i) => i.status === "pending").length
        } pending`,
      );

      // Union the topic map: append GROWS the map. Without this the AI's fresh
      // extraction of just the new clip would REPLACE nodes/edges, silently
      // deleting established topics, their relationships, and hand-dragged
      // positions on every recording. New wins on label/emoji; existing
      // positions are preserved; existing topics never vanish.
      const mergedNodes = mergeAppendNodes(existingNodes, result.nodes);
      const validNodeIds = new Set(mergedNodes.map((n) => n.id));
      const mergedEdges = mergeAppendEdges(
        existingEdges,
        result.edges,
        validNodeIds,
      );
      console.log(
        `🕸️ Topic map merged: ${mergedNodes.length} nodes, ${mergedEdges.length} edges`,
      );

      // Build final result
      const finalResult = {
        ...result,
        actionItems: mergedActionItems,
        nodes: mergedNodes,
        edges: mergedEdges,
      };

      // If this came from a live room, push the merged result to collaborators.
      await pushResultToRoom(
        formData.get("roomId") as string | null,
        finalResult,
      );

      // NOTE: This endpoint is stateless — two concurrent appends for the
      // same conversationId both see the same existing* state, merge
      // independently, and race on localStorage. The client should treat
      // appendedAt as a conflict detector: if the local conversation has
      // been updated (by another tab) since the append was submitted, warn
      // the user and offer to re-merge. See signals/conversationStore.ts.
      const appendedAt = Date.now();

      return new Response(
        JSON.stringify({ ...finalResult, appendedAt }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("❌ Append error:", error);
      return new Response(
        JSON.stringify({
          error: "Processing failed — please try again.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};

function parseExistingActionItems(
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

  // Cap length to match the protocol/share sanitizers (which cap at 500). A
  // crafted existingActionItems FormData field could otherwise inject multi-KB
  // descriptions. Peers are already protected (sanitizeConversationData caps on
  // every relay); this is initiator-side hygiene for consistency.
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

// Per-field caps mirror the protocol/share sanitizers so a crafted existing*
// FormData field can't smuggle multi-KB labels/colors into the merge (and thence
// into the initiator's response). The action-item parser already sanitizes
// per-item; nodes/edges were the overlooked siblings.
const cap = (v: unknown, n: number) =>
  typeof v === "string" ? v.slice(0, n) : "";

function sanitizeNode(raw: unknown, conversationId: string): Node | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = cap(r.id, 128).trim();
  const label = cap(r.label, 120).trim();
  if (!id || !label) return null;
  // Only carry a position through if it's a real {x,y} number pair — drop garbage
  // rather than passing an untyped object into the merge.
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

function parseExistingNodes(json: string | null, conversationId: string) {
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

function parseExistingEdges(json: string | null, conversationId: string) {
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
