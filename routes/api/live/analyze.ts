/**
 * Live Analysis Route
 *
 * Periodic re-analysis during a live session: the host's chunk stream has
 * already been transcribed by /api/live/chunk, so this endpoint takes the
 * accumulated NEW transcript text (no audio, no second transcription bill),
 * runs the full analysis (topics + action items + status self-checkoff +
 * summary), and merges against the existing conversation exactly like
 * /api/append does.
 *
 * No title generation — a loop that fires every ~30s must not rename the
 * conversation mid-meeting; `existingTitle` is echoed back instead.
 *
 * POST /api/live/analyze
 *   Body: {
 *     conversationId: string,
 *     newText: string,               // accumulated since the last run
 *     speakers?: string[],           // union of chunk speakers
 *     existingTranscript?: string,
 *     existingSummary?: string,
 *     existingTitle?: string,
 *     existingActionItems?: unknown[],
 *     existingNodes?: unknown[],
 *     existingEdges?: unknown[],
 *     roomId?: string,               // server-push path; the in-app loop
 *   }                                // omits it (host applies + liveSync
 *                                    // broadcasts — one write, no echo)
 *   Returns: ConversationFlowResult + { analyzedAt }
 */

import { Handlers } from "$fresh/server.ts";
import { processLiveText } from "@core/orchestration/conversation-flow.ts";
import type { ConversationFlowResult } from "@core/orchestration/conversation-flow.ts";
import {
  mergeAppendActionItems,
  mergeAppendEdges,
  mergeAppendNodes,
  mergeAppendSummary,
  remapExtractedByAlias,
} from "@core/orchestration/append-merge.ts";
import { getByoKey, guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { pushResultToRoom } from "@services/partyUpdates.ts";
import {
  MAX_EXISTING_TRANSCRIPT,
  parseExistingActionItems,
  parseExistingEdges,
  parseExistingNodes,
} from "@services/appendParsing.ts";

/** Accumulated-new-text cap — 100KB ≈ half an hour of nonstop talk, far above
 *  anything the client loop (which runs every ~30-90s) can accumulate. */
const MAX_NEW_TEXT = 100_000;
/** Whole-body cap: transcript + nodes/edges/items comfortably fit. */
const MAX_BODY_BYTES = 2_097_152;
const ANALYZE_TIMEOUT_MS = 60_000;

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = await guardRequest(req);
      if (guardResponse) return guardResponse;

      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
        return jsonError("Request body too large", 413);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonError("Expected a JSON body", 400);
      }

      const conversationId = typeof body.conversationId === "string"
        ? body.conversationId.trim().slice(0, 128)
        : "";
      if (!conversationId) {
        return jsonError("No conversation ID provided", 400);
      }

      const newText = typeof body.newText === "string"
        ? body.newText.trim().slice(0, MAX_NEW_TEXT)
        : "";
      if (!newText) {
        return jsonError("No new transcript text to analyze", 400);
      }

      const speakers = Array.isArray(body.speakers)
        ? body.speakers
          .filter((s): s is string => typeof s === "string" && s.trim() !== "")
          .map((s) => s.slice(0, 120))
          .slice(0, 50)
        : [];

      const existingTranscript = typeof body.existingTranscript === "string"
        ? body.existingTranscript.slice(0, MAX_EXISTING_TRANSCRIPT)
        : "";
      const existingSummary = typeof body.existingSummary === "string"
        ? body.existingSummary
        : null;
      const existingTitle = typeof body.existingTitle === "string"
        ? body.existingTitle.trim().slice(0, 200)
        : "";

      // The parse helpers take JSON strings (shared with the FormData route).
      const asJson = (v: unknown) =>
        Array.isArray(v) ? JSON.stringify(v) : null;
      const existingActionItems = parseExistingActionItems(
        asJson(body.existingActionItems),
        conversationId,
      );
      const existingNodes = parseExistingNodes(
        asJson(body.existingNodes),
        conversationId,
      );
      const existingEdges = parseExistingEdges(
        asJson(body.existingEdges),
        conversationId,
      );

      const aiService = getAIService(getByoKey(req));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
      let result: ConversationFlowResult;
      try {
        result = await processLiveText(
          aiService,
          newText,
          conversationId,
          speakers,
          existingTitle || "Live session",
          {
            existingActionItems,
            existingNodes,
            existingEdges,
            signal: ctrl.signal,
          },
        );
      } finally {
        clearTimeout(timer);
      }

      // Same merge steps as /api/append, minus the "--- New Recording ---"
      // marker — a rolling loop would stamp one every 30s and shred the
      // transcript into confetti. Plain paragraph joins read as one meeting.
      if (existingTranscript) {
        const combined = `${existingTranscript}\n\n${result.transcript.text}`;
        result.transcript.text = combined;
        result.conversation.transcript = combined;
      }

      result.summary = mergeAppendSummary(existingSummary, result.summary);

      const mergedActionItems = mergeAppendActionItems(
        existingActionItems,
        result.actionItems,
        result.statusUpdates,
      );
      // Merge memory: route alias-matching extractions to their survivor
      // node before the union (same as /api/append).
      const remapped = remapExtractedByAlias(
        existingNodes,
        result.nodes,
        result.edges,
      );
      const mergedNodes = mergeAppendNodes(existingNodes, remapped.nodes);
      const validNodeIds = new Set(mergedNodes.map((n) => n.id));
      const mergedEdges = mergeAppendEdges(
        existingEdges,
        remapped.edges,
        validNodeIds,
      );

      const finalResult = {
        ...result,
        actionItems: mergedActionItems,
        nodes: mergedNodes,
        edges: mergedEdges,
      };

      // Server-push path (parity with /api/append). The in-app loop omits
      // roomId on purpose: the host applies the result and liveSync
      // broadcasts ONE conversation_update — no double write.
      // Same room-id shape rule as shareProtocol's sanitizeShareLive —
      // anything else never reaches the party worker.
      const roomId = typeof body.roomId === "string" &&
          /^[A-Za-z0-9_-]{3,64}$/.test(body.roomId.trim())
        ? body.roomId.trim()
        : null;
      await pushResultToRoom(roomId, finalResult);

      return new Response(
        JSON.stringify({ ...finalResult, analyzedAt: Date.now() }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("❌ Live analysis error:", error);
      return jsonError("Analysis failed — please try again.", 500);
    }
  },
};
