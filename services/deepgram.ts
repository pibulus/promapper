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

// Breaker: a systematically-failing Deepgram (dead key, model typo, outage)
// used to double-bill every live chunk — pay the doomed REST call AND the
// LLM fallback, silently, for the whole meeting. Three consecutive failures
// close the door for five minutes; the LLM path carries live transcription
// alone meanwhile. Aborts don't count — that's the caller hanging up, not
// Deepgram failing.
const BREAKER_TRIP = 3;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

export async function transcribeChunkDeepgram(
  file: File,
  signal?: AbortSignal,
): Promise<{ text: string; speakers: string[] }> {
  const key = deepgramKey();
  if (!key) throw new Error("Deepgram key not configured");
  if (Date.now() < breakerOpenUntil) {
    throw new Error("Deepgram breaker open — skipping straight to LLM path");
  }

  const model = Deno.env.get("DEEPGRAM_MODEL") || "nova-3";
  const url = `https://api.deepgram.com/v1/listen?model=${model}` +
    "&smart_format=true&diarize=true&utterances=true";

  try {
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
      await res.body?.cancel();
      throw new Error(`Deepgram transcription failed: ${res.status}`);
    }
    const result = formatDeepgramResult(await res.json());
    consecutiveFailures = 0;
    return result;
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      consecutiveFailures++;
      if (consecutiveFailures >= BREAKER_TRIP) {
        breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
        consecutiveFailures = 0;
        console.warn(
          "[deepgram] breaker tripped after repeated failures — LLM path only for 5 minutes",
        );
      }
    }
    throw err;
  }
}
