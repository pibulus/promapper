import { encodeBase64 } from "$std/encoding/base64.ts";
import type {
  AudioPart,
  OpenRouterAudioFormat,
  OpenRouterAudioPart,
} from "@core/ai/types.ts";
import { getAIProvider, getGeminiApiKey } from "@services/ai.ts";

const UPLOAD_ENDPOINT =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILES_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface UploadedAudioFile {
  part: AudioPart;
  fileName: string | null;
}

/**
 * Smallest audio upload we treat as a real recording. A glitched/empty capture
 * (permission race, instant tap, backgrounded mobile tab) produces a valid File
 * of only a few hundred bytes of container header; anything with actual audio is
 * comfortably over 1KB. Routes reject below this with a clear message instead of
 * forwarding a doomed request to the provider.
 */
export const MIN_AUDIO_SIZE = 1024;

/** Maximum audio upload accepted, to prevent abuse. */
export const MAX_AUDIO_SIZE = 50 * 1024 * 1024;

const MAX_DELETE_RETRIES = Number(
  Deno.env.get("GEMINI_DELETE_RETRIES") ?? "3",
);
const DELETE_RETRY_DELAY_MS = Number(
  Deno.env.get("GEMINI_DELETE_RETRY_DELAY_MS") ?? "2000",
);

export async function uploadAudioFile(file: File): Promise<UploadedAudioFile> {
  if (getAIProvider() === "openrouter") {
    return createOpenRouterAudioPart(file);
  }

  const apiKey = getGeminiApiKey();
  const mimeType = file.type || "application/octet-stream";
  const displayName = file.name || "conversation-audio";
  const boundary = `Boundary-${crypto.randomUUID()}`;

  const metadata = JSON.stringify({
    file: {
      displayName,
      mimeType,
    },
  });

  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);

  const response = await fetch(`${UPLOAD_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "X-Goog-Upload-Protocol": "multipart",
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Failed to upload audio (${response.status}): ${
        errText || response.statusText
      }`,
    );
  }

  const payload = await response.json();
  const uploadedFile = payload.file ?? payload;

  if (uploadedFile?.uri) {
    return {
      part: {
        fileData: {
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType ?? mimeType,
        },
      },
      fileName: uploadedFile.name ?? null,
    };
  }

  // Fallback to inline data if API didn't return a file URI
  const base64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
  return {
    part: {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
    fileName: null,
  };
}

async function createOpenRouterAudioPart(
  file: File,
): Promise<UploadedAudioFile> {
  const mimeType = file.type || "audio/webm";
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

export async function deleteUploadedFile(
  name: string | null | undefined,
  attempt = 0,
) {
  if (!name) return;

  try {
    const apiKey = getGeminiApiKey();
    const normalizedName = name.startsWith("files/") ? name : `files/${name}`;
    const response = await fetch(
      `${FILES_BASE}/${normalizedName}?key=${apiKey}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      handleDeleteFailure(
        name,
        response.status,
        errorText,
        attempt,
      );
    }
  } catch (error) {
    handleDeleteFailure(name, 0, String(error), attempt);
  }
}

function handleDeleteFailure(
  name: string,
  status: number,
  errorText: string,
  attempt: number,
) {
  if (attempt < MAX_DELETE_RETRIES - 1) {
    setTimeout(() => {
      deleteUploadedFile(name, attempt + 1).catch((error) =>
        console.warn(`⚠️  Retry delete failed for ${name}:`, error)
      );
    }, DELETE_RETRY_DELAY_MS);
  } else {
    console.warn(
      `⚠️  Failed to delete Gemini file ${name}: ${status} ${errorText}`,
    );
  }
}
