/**
 * Conversation Processing API Route
 *
 * Accepts audio or text input and processes it through the nervous system
 * Returns: conversation data, transcript, nodes, edges, action items
 */

import { Handlers } from "$fresh/server.ts";
import {
  processAudio,
  processText,
} from "@core/orchestration/conversation-flow.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { deleteUploadedFile, uploadAudioFile } from "@services/audio.ts";
import { pushResultToRoom } from "@services/partyUpdates.ts";

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = guardRequest(req);
      if (guardResponse) {
        return guardResponse;
      }

      const contentType = req.headers.get("content-type") || "";
      const aiService = getAIService();

      const conversationId = crypto.randomUUID();

      // ===============================================================
      // AUDIO UPLOAD PROCESSING
      // ===============================================================

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const audioFile = formData.get("audio") as File;

        if (!audioFile) {
          return new Response(
            JSON.stringify({ error: "No audio file provided" }),
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

        const { part: audioPart, fileName } = await uploadAudioFile(audioFile);
        let result;
        try {
          result = await processAudio(aiService, audioPart, conversationId);
        } finally {
          await deleteUploadedFile(fileName);
        }

        // If this came from a live room, push the result to all collaborators.
        await pushResultToRoom(formData.get("roomId") as string | null, result);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // ===============================================================
      // TEXT INPUT PROCESSING
      // ===============================================================

      const body = await req.json();
      const { text, speakers = [], roomId = null } = body;

      if (!text) {
        return new Response(
          JSON.stringify({ error: "No text provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Process through nervous system
      const result = await processText(
        aiService,
        text,
        conversationId,
        speakers,
      );

      // If this came from a live room, push the result to all collaborators.
      await pushResultToRoom(roomId, result);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("❌ Processing error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
