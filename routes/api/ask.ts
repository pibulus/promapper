/**
 * Ask API Route — Bishop's brain.
 *
 * Answers a question ABOUT the conversation using the same guarded,
 * provider-agnostic seam as every other AI route. The conversation context
 * is built server-side with the shared export-context builder; keys never
 * reach the client.
 */

import { FreshContext } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { buildExportContext } from "@core/export/exportContext.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";

const MAX_QUESTION_LENGTH = 1_000;
const MAX_TEXT_LENGTH = SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH;
const ASK_TIMEOUT_MS = 45_000;

export const handler = async (req: Request, _ctx: FreshContext) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const guardResponse = await guardRequest(req);
  if (guardResponse) {
    return guardResponse;
  }

  try {
    const { question, text, conversation } = await req.json();

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

    const prompt = `You are Bishop, the quiet advisor inside ProMapper — a
tool that turns conversations into living project maps. Answer the user's
question using ONLY the conversation context below. Be concise and warm;
plain prose or a short list, no headings. If the answer isn't in the
context, say so honestly rather than inventing one.

CONVERSATION CONTEXT:
${context}

QUESTION: ${question.trim()}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);
    let answer: string;
    try {
      answer = await getAIService().chatText(prompt, undefined, ctrl.signal);
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
