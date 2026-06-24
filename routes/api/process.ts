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
import {
  MAX_AUDIO_SIZE,
  MIN_AUDIO_SIZE,
  uploadAudioFile,
} from "@services/audio.ts";
import { pushResultToRoom } from "@services/partyUpdates.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";

// Max accepted text length, reusing the existing transcript ceiling so anything
// processable is also shareable (one source of truth, no second magic number).
const MAX_TEXT_LENGTH = SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH;
/** Audio processing can take up to 60s for large files (transcription + analysis). */
const PROCESS_TIMEOUT_MS = 60_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const handler: Handlers = {
  async POST(req) {
    try {
      const guardResponse = await guardRequest(req);
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
        // Reject oversized uploads before buffering the full body into memory.
        // MAX_AUDIO_SIZE + 2MB for form overhead (boundaries, metadata, fields).
        const cl = req.headers.get("content-length");
        if (cl && parseInt(cl, 10) > MAX_AUDIO_SIZE + 2_097_152) {
          return new Response(
            JSON.stringify({ error: "Request body too large" }),
            { status: 413, headers: { "Content-Type": "application/json" } },
          );
        }
        const formData = await req.formData();
        const audioFile = formData.get("audio") as File;

        if (!audioFile) {
          return new Response(
            JSON.stringify({ error: "No audio file provided" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        // Reject empty/near-empty recordings before they hit the provider — a
        // glitched mobile capture yields a valid-but-tiny File that would
        // otherwise become a cryptic transcription failure (see append route).
        if (audioFile.size < MIN_AUDIO_SIZE) {
          return new Response(
            JSON.stringify({
              error:
                "That recording came through empty — we didn't catch any audio. Give it another go.",
            }),
            { status: 422, headers: { "Content-Type": "application/json" } },
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

        const { part: audioPart } = await uploadAudioFile(audioFile);
        const result = await withTimeout(
          processAudio(aiService, audioPart, conversationId, {}),
          PROCESS_TIMEOUT_MS,
          "Audio processing",
        );

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

      // Cap input length before allocating/forwarding to the AI. Aligns with the
      // existing transcript ceiling (SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH):
      // anything we accept for processing must also be shareable.
      if (typeof text === "string" && text.length > MAX_TEXT_LENGTH) {
        return new Response(
          JSON.stringify({
            error:
              `That's a lot of text — keep it under ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
          }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }

      // Process through nervous system
      const result = await withTimeout(
        processText(
          aiService,
          text,
          conversationId,
          speakers,
        ),
        PROCESS_TIMEOUT_MS,
        "Text processing",
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
          error: "Processing failed — please try again.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
