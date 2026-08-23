// ===================================================================
// geminiFallback.ts — the second till
// ===================================================================
// ProMapper reaches every model through OpenRouter, which is a fine gateway
// but a single BILLING ACCOUNT. On 2026-08-23 the fleet's other single
// account hit zero and took seven apps down at once while every key was
// still perfectly valid. A depleted balance is the one failure a second
// provider can actually rescue, so this translates an in-flight OpenRouter
// chat request into Gemini's native generateContent call and replays it
// against a different account.
//
// It sits under the ONE shared fetch path in openrouter.ts, so all nine
// non-streaming methods inherit it - transcription, title, action items,
// status checks, topics, summary, markdown, chatText, chatMessages. The
// streaming path (Ask) is not covered: SSE translation is a different job
// and Ask is the one call a human is already watching.
//
// Deliberately narrow: ONLY quota failures. A bad key, a malformed request
// or a model outage is not something a second vendor fixes, and retrying
// those just doubles the wait before the same error surfaces.
//
// Silent when unconfigured: no key means null, and the caller rethrows the
// original OpenRouter error exactly as it would have.

import { isBalanceExhausted } from "./helpers.ts";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 60_000;

export interface ChatMessageLike {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

/** OpenRouter sends a bare format name; Gemini wants a MIME type. */
const FORMAT_MIME: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  aiff: "audio/aiff",
  pcm16: "audio/wav",
  pcm24: "audio/wav",
};

/**
 * Map an OpenRouter slug to a direct-Gemini rolling alias.
 *
 * Always a *-latest alias, never a dated model (the anti-drift law): the
 * rescue path must not itself rot. Anthropic roles map onto Gemini as a
 * best-effort - a summary in a slightly different voice beats no summary
 * while the balance is empty.
 */
function toGeminiModel(openRouterModel: string): string {
  const slug = openRouterModel.replace(/^~/, "").toLowerCase();
  if (slug.includes("pro")) return "gemini-pro-latest";
  if (slug.includes("flash-lite")) return "gemini-flash-lite-latest";
  return "gemini-flash-latest";
}

/**
 * Is this the one error worth a second provider? OpenRouter surfaces a
 * depleted balance as 402/429; Google's own wording (RESOURCE_EXHAUSTED,
 * "credits are depleted") can also arrive proxied through the body.
 */
export function isQuotaError(error: unknown): boolean {
  if (isBalanceExhausted(error)) return true;
  // Broader than isBalanceExhausted on purpose: by the time we reach the
  // fallback, withRetry has already spent its attempts, so a 429 that
  // survived three tries is worth a second provider too.
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\((?:402|429)\)|resource_exhausted|quota/i.test(message);
}

function toGeminiParts(
  content: ChatMessageLike["content"],
): Array<Record<string, unknown>> {
  if (typeof content === "string") return [{ text: content }];

  const parts: Array<Record<string, unknown>> = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Record<string, unknown>;

    if (part.type === "input_audio") {
      const audio = part.input_audio as
        | { data?: string; format?: string }
        | undefined;
      if (audio?.data) {
        parts.push({
          inlineData: {
            mimeType: FORMAT_MIME[String(audio.format ?? "webm")] ??
              "audio/webm",
            data: audio.data,
          },
        });
      }
      continue;
    }

    if (typeof part.text === "string") parts.push({ text: part.text });
  }
  return parts;
}

/**
 * Replay one chat request against Gemini directly. Returns the text, or null
 * if the fallback is unconfigured or fails - it never throws, because the
 * caller is already holding an error worth reporting.
 */
export async function chatViaGemini(
  messages: ChatMessageLike[],
  openRouterModel: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = Deno.env.get("GEMINI_API_KEY") ??
    Deno.env.get("PROMAPPER_GEMINI_KEY");
  if (!key) return null;

  const model = toGeminiModel(openRouterModel);
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n")
    .trim();

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    }))
    .filter((c) => c.parts.length > 0);

  if (contents.length === 0) return null;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        ...(systemText
          ? { systemInstruction: { parts: [{ text: systemText }] } }
          : {}),
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          // Roll the model, pin the behaviour: these aliases are
          // thinking-capable and thinking bills as output. Uncapped, the
          // rescue would cost ~8x what it needs to.
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[gemini-fallback] returned ${response.status}`);
      return null;
    }

    const payload = await response.json();
    const parts = payload?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p?.text ?? "").join("").trim()
      : "";
    if (!text) return null;

    console.log(`[gemini-fallback] rescued a call via ${model}`);
    return text;
  } catch (error) {
    console.warn("[gemini-fallback] failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
