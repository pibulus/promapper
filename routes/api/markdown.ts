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

  const guardResponse = guardRequest(req);
  if (guardResponse) {
    return guardResponse;
  }

  try {
    const { prompt, text, conversation } = await req.json();

    if (!prompt || !text) {
      return new Response(
        JSON.stringify({ error: "Missing prompt or text" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      (typeof prompt === "string" && prompt.length > MAX_PROMPT_LENGTH) ||
      (typeof text === "string" && text.length > MAX_TEXT_LENGTH)
    ) {
      return new Response(
        JSON.stringify({ error: "Prompt or text is too large." }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const aiService = getAIService();

    const context = conversation
      ? buildExportContext(conversation, text)
      : text;

    console.log("📝 Generating markdown");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MARKDOWN_TIMEOUT_MS);
    let markdown: string;
    try {
      markdown = await aiService.generateMarkdown(prompt, context, ctrl.signal);
    } finally {
      clearTimeout(timer);
    }

    console.log("✅ Markdown generation complete");

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
