/**
 * Deepgram live-chunk transcription — the REST prerecorded endpoint hit
 * per chunk. Used only by /api/live/chunk when a Deepgram key is
 * configured; the LLM transcription path stays the fallback. Point:
 * ~300ms per chunk instead of a multi-second LLM turn, so the live
 * transcript feels instant.
 */

interface DeepgramUtterance {
  transcript: string;
  speaker?: number;
}

interface DeepgramResponse {
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

export function deepgramKey(): string | undefined {
  return Deno.env.get("DEEPGRAM_API_KEY") ||
    Deno.env.get("PROMAPPER_DEEPGRAM_KEY") || undefined;
}

/**
 * Shape a Deepgram response into the pipeline's transcript contract:
 * "Speaker1:"-prefixed lines when diarisation found multiple voices,
 * plain text when it's one voice (a solo line needs no prefix — and the
 * label would just be noise in the live stream).
 */
export function formatDeepgramResult(
  data: DeepgramResponse,
): { text: string; speakers: string[] } {
  const utterances = (data.results?.utterances ?? []).filter(
    (u) => u.transcript?.trim(),
  );
  const distinct = new Set(
    utterances.map((u) => u.speaker).filter((s) => s !== undefined),
  );

  if (utterances.length && distinct.size > 1) {
    const speakers: string[] = [];
    const lines = utterances.map((u) => {
      const label = `Speaker${(u.speaker ?? 0) + 1}`;
      if (!speakers.includes(label)) speakers.push(label);
      return `${label}: ${u.transcript.trim()}`;
    });
    return { text: lines.join("\n"), speakers };
  }

  const plain = utterances.length
    ? utterances.map((u) => u.transcript.trim()).join(" ")
    : data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  return { text: plain, speakers: [] };
}

export async function transcribeChunkDeepgram(
  file: File,
  signal?: AbortSignal,
): Promise<{ text: string; speakers: string[] }> {
  const key = deepgramKey();
  if (!key) throw new Error("Deepgram key not configured");

  const model = Deno.env.get("DEEPGRAM_MODEL") || "nova-3";
  const url = `https://api.deepgram.com/v1/listen?model=${model}` +
    "&smart_format=true&diarize=true&utterances=true";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": file.type || "audio/webm",
    },
    body: await file.arrayBuffer(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Deepgram transcription failed: ${res.status}`);
  }
  return formatDeepgramResult(await res.json());
}
