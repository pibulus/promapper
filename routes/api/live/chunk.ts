/**
 * Live meeting chunk endpoint — lightweight audio transcription for
 * streaming meeting capture. Transcribes a short audio chunk and returns
 * the transcript text. No analysis (topics/actions run separately).
 */

import { Handlers } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { MAX_AUDIO_SIZE, uploadAudioFile } from "@services/audio.ts";

/** Live chunks can be very small (Opus compressed silence <200 bytes).
 *  Raise the floor only for clearly invalid blobs (<64 bytes = no audio). */
const LIVE_CHUNK_MIN_SIZE = 64;
/** Live chunk transcription should be fast — 15s is generous for a 15s clip. */
const CHUNK_TRANSCRIBE_TIMEOUT_MS = 15_000;

export const handler: Handlers = {
  async POST(req) {
    const guardResponse = await guardRequest(req);
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

      // Prevent OOM — live chunks shouldn't exceed the general audio limit
      if (audioFile.size > MAX_AUDIO_SIZE) {
        return new Response(
          JSON.stringify({ error: "Chunk too large" }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }

      const { part: audioPart } = await uploadAudioFile(audioFile);
      const aiService = getAIService();

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CHUNK_TRANSCRIBE_TIMEOUT_MS);
      let transcription: { text: string; speakers: string[] };
      try {
        transcription = await aiService.transcribeAudio(audioPart, ctrl.signal);
      } finally {
        clearTimeout(timer);
      }

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
