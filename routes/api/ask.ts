/**
 * Ask API Route — the Ask module's brain.
 *
 * Answers a question ABOUT the conversation using the same guarded,
 * provider-agnostic seam as every other AI route. The conversation context
 * is built server-side with the shared export-context builder; keys never
 * reach the client.
 *
 * Since July 2026: multi-turn (recent Q&A exchanges ride along so follow-ups
 * keep their thread), a dedicated ask model (OPENROUTER_ASK_MODEL, Haiku by
 * default — see services/ai.ts), and streaming. Pass `stream: true` to get
 * the answer as chunked plain text; omit it for the JSON shape (which also
 * serves as the client's fallback path when a stream won't start).
 */

import { FreshContext } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService, getAskModel } from "@services/ai.ts";
import { buildExportContext } from "@core/export/exportContext.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";
import {
  ASK_MAX_HISTORY,
  ASK_MAX_HISTORY_CHARS,
  type AskExchange,
  buildAskMessages,
} from "@core/ai/ask.ts";

const MAX_QUESTION_LENGTH = 1_000;
const MAX_TEXT_LENGTH = SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH;
const ASK_TIMEOUT_MS = 45_000;

/** Keep only well-shaped {question, answer} pairs; caps re-applied in the
 *  pure builder, this is transport hygiene. */
function sanitizeHistory(raw: unknown): AskExchange[] {
  if (!Array.isArray(raw)) return [];
  const out: AskExchange[] = [];
  for (const entry of raw.slice(-ASK_MAX_HISTORY)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.question !== "string" || typeof e.answer !== "string") {
      continue;
    }
    out.push({
      question: e.question.slice(0, ASK_MAX_HISTORY_CHARS),
      answer: e.answer.slice(0, ASK_MAX_HISTORY_CHARS),
    });
  }
  return out;
}

export const handler = async (req: Request, _ctx: FreshContext) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const guardResponse = await guardRequest(req);
  if (guardResponse) {
    return guardResponse;
  }

  try {
    const { question, text, conversation, history, stream } = await req.json();

    if (
      typeof question !== "string" || !question.trim() ||
      typeof text !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Missing question" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      question.length > MAX_QUESTION_LENGTH || text.length > MAX_TEXT_LENGTH
    ) {
      return new Response(
        JSON.stringify({ error: "Question or context is too large." }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const context = conversation && typeof conversation === "object"
      ? buildExportContext(conversation, text)
      : text;

    // The text/question caps alone don't bound the CONVERSATION payload —
    // without this, an oversized object sails past the 413 into a
    // pay-per-token AI call (Rex's finding).
    if (context.length > MAX_TEXT_LENGTH * 2) {
      return new Response(
        JSON.stringify({ error: "Conversation is too large to ask about." }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const messages = buildAskMessages(
      context,
      sanitizeHistory(history),
      question,
    );

    const aiService = getAIService();
    const askModel = getAskModel();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);

    if (stream === true) {
      // Chunked plain text. An upstream failure BEFORE the first chunk
      // surfaces as a 502 so the client can fall back to the JSON path;
      // a failure mid-stream just ends the stream (the client keeps what
      // arrived — half an answer beats a vanished one).
      let iterator: AsyncIterator<string>;
      let first: IteratorResult<string>;
      try {
        iterator = aiService.chatStream(messages, askModel, ctrl.signal)
          [Symbol.asyncIterator]();
        first = await iterator.next();
      } catch (error) {
        clearTimeout(timer);
        console.error("Ask stream failed to start:", error);
        return new Response(
          JSON.stringify({ error: "Couldn't reach the advisor — try again." }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            if (!first.done && first.value) {
              controller.enqueue(encoder.encode(first.value));
            }
            while (!first.done) {
              const next = await iterator.next();
              if (next.done) break;
              controller.enqueue(encoder.encode(next.value));
            }
          } catch (error) {
            console.error("Ask stream died mid-answer:", error);
          } finally {
            clearTimeout(timer);
            controller.close();
          }
        },
        cancel() {
          // Client went away — stop paying for tokens.
          ctrl.abort();
          clearTimeout(timer);
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          // Some proxies buffer chunked responses into one blob without this.
          "X-Accel-Buffering": "no",
        },
      });
    }

    let answer: string;
    try {
      answer = await aiService.chatMessages(messages, askModel, ctrl.signal);
    } finally {
      clearTimeout(timer);
    }

    return new Response(
      JSON.stringify({ answer }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Ask generation failed:", error);
    return new Response(
      JSON.stringify({ error: "Couldn't reach the advisor — try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
