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
  mergeAppendSummary,
  remapExtractedByAlias,
} from "@core/orchestration/append-merge.ts";
import { guardAudioBudget, guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import {
  MAX_AUDIO_SIZE,
  MIN_AUDIO_SIZE,
  uploadAudioFile,
} from "@services/audio.ts";
import { pushResultToRoom } from "@services/partyUpdates.ts";
import {
  MAX_EXISTING_TRANSCRIPT,
  parseExistingActionItems,
  parseExistingEdges,
  parseExistingNodes,
} from "@services/appendParsing.ts";
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

      // Free-tier audio metering (no-op until AUDIO_BYTES_PER_DAY is set).
      const budgetBlock = guardAudioBudget(req, audioFile.size);
      if (budgetBlock) return budgetBlock;

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
      // (Also keeps the existing summary intact on short/lightweight appends,
      // which return an empty summary — previously that blanked it.)
      result.summary = mergeAppendSummary(existingSummary, result.summary);

      // Process status updates from AI analysis
      // These tell us which action items were marked as complete in the new audio

      const mergedActionItems = mergeAppendActionItems(
        existingActionItems,
        result.actionItems,
        result.statusUpdates,
      );

      // Union the topic map: append GROWS the map. Without this the AI's fresh
      // extraction of just the new clip would REPLACE nodes/edges, silently
      // deleting established topics, their relationships, and hand-dragged
      // positions on every recording. New wins on label/emoji; existing
      // positions are preserved; existing topics never vanish.
      // Merge memory first: extracted topics whose label matches an existing
      // node's label or alias get rewired to that node, so a user's merge
      // isn't resurrected by the next extraction.
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
