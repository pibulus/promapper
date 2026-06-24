/**
 * Whiteboard Agent Route
 *
 * Server-side AI endpoint that watches the conversation transcript and
 * edits the shared whiteboard. The client sends the current Excalidraw
 * scene + the latest transcript chunk; this endpoint formats the scene
 * as line-numbered text, sends it to Claude Haiku, parses the edit
 * operations, applies them, and returns the updated elements array.
 *
 * POST /api/live/whiteboard-agent
 *   Body: { elements: ExcalidrawElement[], transcript: string, topicLabels?: string[] }
 *   Returns: { elements: ExcalidrawElement[] }
 */

import { Handlers } from "$fresh/server.ts";
import { guardRequest } from "@services/requestGuard.ts";
import { getAIService } from "@services/ai.ts";
import {
  applyWhiteboardOps,
  buildWhiteboardAgentPrompt,
  formatSceneAsText,
  parseWhiteboardOps,
} from "@core/ai/whiteboardAgent.ts";

const MAX_ELEMENTS = 500;
const MAX_TRANSCRIPT_LENGTH = 8000;
const AGENT_TIMEOUT_MS = 30_000;

export const handler: Handlers = {
  async POST(req) {
    const guard = await guardRequest(req);
    if (guard) return guard;

    let body: {
      elements?: unknown[];
      transcript?: string;
      topics?: Array<{ label: string; emoji?: string; color?: string }>;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const elements =
      (Array.isArray(body.elements)
        ? body.elements.slice(0, MAX_ELEMENTS)
        : []) as Record<string, unknown>[];
    const transcript = (body.transcript || "").slice(0, MAX_TRANSCRIPT_LENGTH)
      .trim();
    const topics = Array.isArray(body.topics) ? body.topics.slice(0, 50) : [];

    if (!transcript) {
      return new Response(
        JSON.stringify({ elements }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Empty canvas is fine — the agent can seed the first elements.
    const sceneText = elements.length > 0
      ? formatSceneAsText(elements)
      : "(empty canvas)";

    const prompt = buildWhiteboardAgentPrompt(
      sceneText,
      transcript,
      topics,
    );

    try {
      const aiService = getAIService();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT_MS);
      let response: string;
      try {
        response = await aiService.chatText(
          prompt,
          undefined,
          ctrl.signal,
        );
      } finally {
        clearTimeout(timer);
      }

      const ops = parseWhiteboardOps(response);
      if (ops.length === 0) {
        return new Response(JSON.stringify({ elements }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const updated = applyWhiteboardOps(
        elements as Array<Record<string, unknown>>,
        ops,
        topics as Array<{ label: string; emoji?: string; color?: string }>,
      );

      return new Response(JSON.stringify({ elements: updated }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Whiteboard agent failed:", error);
      return new Response(
        JSON.stringify({
          elements,
          error: "AI whiteboard agent unavailable — your scene is unchanged.",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
