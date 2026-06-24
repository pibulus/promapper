/**
 * Live meeting chunk endpoint — lightweight audio transcription for
 * streaming meeting capture. Transcribes a short audio chunk and returns
 * the transcript text. No analysis (topics/actions run separately).
 */

import { Handlers } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { uploadAudioFile } from "@services/audio.ts";

/** Live chunks can be very small (e.g., a 500ms near-silent interval
 *  compressed by Opus to <200 bytes). Raise the floor only for clearly
 *  empty/invalid blobs (<64 bytes = no audio data at all). */
const LIVE_CHUNK_MIN_SIZE = 64;

export const handler: Handlers = {
  async POST(req) {
    const guardResponse = guardRequest(req);
    if (guardResponse) return guardResponse;

    try {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File | null;

      if (!audioFile || audioFile.size < LIVE_CHUNK_MIN_SIZE) {
        return new Response(
          JSON.stringify({ error: "No audio data in chunk" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const { part: audioPart } = await uploadAudioFile(audioFile);
      const aiService = getAIService();
      const transcription = await aiService.transcribeAudio(audioPart);

      return new Response(
        JSON.stringify({
          text: transcription.text,
          speakers: transcription.speakers,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Live chunk transcription failed:", error);
      return new Response(
        JSON.stringify({ error: "Transcription failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
