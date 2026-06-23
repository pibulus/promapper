/**
 * Markdown API Route
 *
 * Server-side endpoint for AI markdown generation.
 * Provider-agnostic: uses whichever AI provider is configured.
 * Keeps API keys secure, never exposed to the client.
 */

import { FreshContext } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIProvider, getAIService } from "@services/ai.ts";
import { buildExportContext } from "@core/export/exportContext.ts";
import { SHARE_ROOM_LIMITS } from "@core/realtime/shareProtocol.ts";

// Cap the format-instruction prompt (enough for detailed presets, not enough for
// novel-length injection) and reuse the shared transcript ceiling for the body.
const MAX_PROMPT_LENGTH = 5_000;
const MAX_TEXT_LENGTH = SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH;

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
    const provider = getAIProvider();

    // Feed the AI the full project shape (title/summary/actions/topic-map) when
    // the client sends the conversation; otherwise fall back to raw text. This
    // makes presets like Meeting Minutes / Action Plan dramatically richer.
    const context = conversation
      ? buildExportContext(conversation, text)
      : text;

    console.log(`📝 Generating markdown with ${provider}`);

    const markdown = await aiService.generateMarkdown(prompt, context);

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
        error: "Failed to generate markdown",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
