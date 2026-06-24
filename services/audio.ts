import { encodeBase64 } from "$std/encoding/base64.ts";
import type {
  OpenRouterAudioFormat,
  OpenRouterAudioPart,
} from "@core/ai/types.ts";

export interface UploadedAudioFile {
  part: OpenRouterAudioPart;
  fileName: null;
}

/**
 * Smallest audio upload we treat as a real recording. A glitched/empty capture
 * (permission race, instant tap, backgrounded mobile tab) produces a valid File
 * of only a few hundred bytes of container header; anything with actual audio is
 * comfortably over 1KB. Routes reject below this with a clear message instead of
 * forwarding a doomed request to the provider.
 */
export const MIN_AUDIO_SIZE = 1024;

/** Maximum audio upload accepted, to prevent abuse.
 *  Kept under 25MB so base64 encoding (~33% overhead) stays within
 *  Deno Deploy's 128MB free-tier memory budget. */
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

export async function uploadAudioFile(file: File): Promise<UploadedAudioFile> {
  const mimeType = file.type || "audio/webm";

  // Reject non-audio MIME types to avoid wasting API credits on garbage.
  if (mimeType && !mimeType.startsWith("audio/")) {
    throw new Error(
      `Unsupported file type: ${mimeType}. Please upload an audio file.`,
    );
  }
  const part: OpenRouterAudioPart = {
    inputAudio: {
      data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
      format: inferOpenRouterAudioFormat(mimeType, file.name),
      mimeType,
    },
  };

  return { part, fileName: null };
}

/**
 * Map a browser-supplied mime type (and optional filename) to the audio format
 * OpenRouter expects. Mime-first, extension-fallback, defaults to webm. Exported
 * for tests — this is the iOS-correctness surface (Safari records audio/mp4, and
 * MediaRecorder mime types can carry a `;codecs=` suffix that must be stripped).
 */
export function inferOpenRouterAudioFormat(
  mimeType: string,
  fileName = "",
): OpenRouterAudioFormat {
  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
  const byMime: Record<string, OpenRouterAudioFormat> = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/webm": "webm",
  };

  if (byMime[normalizedMime]) {
    return byMime[normalizedMime];
  }

  const extension = fileName.toLowerCase().split(".").pop();
  const byExtension: Record<string, OpenRouterAudioFormat> = {
    wav: "wav",
    mp3: "mp3",
    aiff: "aiff",
    aac: "aac",
    ogg: "ogg",
    flac: "flac",
    m4a: "m4a",
    webm: "webm",
  };

  return extension && byExtension[extension] ? byExtension[extension] : "webm";
}
