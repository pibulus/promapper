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
import { mergeAppendActionItems } from "@core/orchestration/append-merge.ts";
import type { ActionItem } from "@core/types/index.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { deleteUploadedFile, uploadAudioFile } from "@services/audio.ts";

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = guardRequest(req);
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

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: "No conversation ID provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Validate file size (50MB max to prevent abuse)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (audioFile.size > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({
            error: `File too large. Maximum size is 50MB (received ${
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
      const existingNodes = parseExistingNodes(existingNodesJson);
      const existingEdges = parseExistingEdges(existingEdgesJson);
      const { part: audioPart, fileName } = await uploadAudioFile(audioFile);

      // Process audio through nervous system with existing action items and nodes
      console.log(`📎 Appending audio to conversation ${conversationId}`);
      console.log(
        `📋 Found ${existingActionItems.length} existing action items`,
      );
      console.log(`🕸️ Found ${existingNodes.length} existing topics`);

      let result: ConversationFlowResult;
      try {
        result = await processAudio(
          aiService,
          audioPart,
          conversationId,
          existingActionItems,
          existingNodes,
          existingEdges,
        );
      } finally {
        await deleteUploadedFile(fileName);
      }

      // Merge transcripts if we have existing content
      if (existingTranscript) {
        const combinedTranscript =
          `${existingTranscript}\n\n--- New Recording ---\n\n${result.transcript.text}`;
        result.transcript.text = combinedTranscript;
        result.conversation.transcript = combinedTranscript;
      }

      // Append summaries if we have existing summary
      if (existingSummary && result.summary) {
        result.summary =
          `${existingSummary}\n\n**Update from latest recording:**\n${result.summary}`;
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

      // Build final result
      const finalResult = {
        ...result,
        actionItems: mergedActionItems,
      };

      return new Response(JSON.stringify(finalResult), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("❌ Append error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
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

  const description = typeof record.description === "string"
    ? record.description.trim()
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
    item.checked_reason = record.checked_reason.trim();
  }

  return item;
}

function parseExistingNodes(json: string | null) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch (error) {
    console.warn("Failed to parse existing nodes:", error);
    return [];
  }
}

function parseExistingEdges(json: string | null) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.slice(0, 400) : [];
  } catch (error) {
    console.warn("Failed to parse existing edges:", error);
    return [];
  }
}
