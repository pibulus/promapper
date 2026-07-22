/**
 * Markdown API Route
 *
 * Server-side endpoint for AI markdown generation.
 * Provider-agnostic: uses whichever AI provider is configured.
 * Keeps API keys secure, never exposed to the client.
 */

import { FreshContext } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import { buildExportContext } from "@core/export/exportContext.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";

// Cap the format-instruction prompt (enough for detailed presets, not enough for
// novel-length injection) and reuse the shared transcript ceiling for the body.
const MAX_PROMPT_LENGTH = 5_000;
const MAX_TEXT_LENGTH = SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH;
const MARKDOWN_TIMEOUT_MS = 45_000;

export const handler = async (req: Request, _ctx: FreshContext) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const guardResponse = await guardRequest(req);
  if (guardResponse) {
    return guardResponse;
  }

  try {
    const { prompt, text, conversation } = await req.json();

    // Require actual strings — a non-string truthy value would skip the
    // length caps below.
    if (
      typeof prompt !== "string" || !prompt ||
      typeof text !== "string" || !text
    ) {
      return new Response(
        JSON.stringify({ error: "Missing prompt or text" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (prompt.length > MAX_PROMPT_LENGTH || text.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Prompt or text is too large." }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const aiService = getAIService();

    const context = conversation && typeof conversation === "object"
      ? buildExportContext(conversation, text)
      : text;

    // The prompt/text caps don't bound the CONVERSATION payload — cap the
    // built context so an oversized object can't become an unbounded AI
    // call (same hole Rex found in /api/ask).
    if (context.length > MAX_TEXT_LENGTH * 2) {
      return new Response(
        JSON.stringify({ error: "Conversation is too large to export." }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    // Server-side so presets AND custom prompts both carry it: the export is
    // a document people hand to others — don't launder hate through it.
    const guardedPrompt = `${prompt}\n\n` +
      `If the material is hateful or demeaning toward people or groups, decline in one warm sentence instead of producing the document.`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MARKDOWN_TIMEOUT_MS);
    let markdown: string;
    try {
      markdown = await aiService.generateMarkdown(
        guardedPrompt,
        context,
        ctrl.signal,
      );
    } finally {
      clearTimeout(timer);
    }

    return new Response(
      JSON.stringify({ markdown }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in markdown API:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate markdown — please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
