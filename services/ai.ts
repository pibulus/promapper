/**
 * Shared AI helpers — OpenRouter-only provider selection.
 */

import { createOpenRouterService } from "@core/ai/openrouter.ts";
import type { AIService } from "@core/ai/types.ts";

const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL =
  "mistralai/voxtral-small-24b-2507";
const DEFAULT_OPENROUTER_SUMMARY_MODEL = "~anthropic/claude-haiku-latest";
const DEFAULT_OPENROUTER_TOPIC_MODEL = "~anthropic/claude-haiku-latest";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let cachedOpenRouterConfig: string | null = null;
let cachedOpenRouterService: AIService | null = null;

function requireEnv(name: string): string {
  const apiKey = Deno.env.get(name);
  if (!apiKey) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return apiKey;
}

export function getAIService(): AIService {
  const apiKey = getOpenRouterApiKey();
  const model = getOpenRouterModelName();
  const baseUrl = Deno.env.get("OPENROUTER_BASE_URL") ??
    DEFAULT_OPENROUTER_BASE_URL;
  const siteUrl = Deno.env.get("OPENROUTER_SITE_URL") ?? undefined;
  const siteName = Deno.env.get("OPENROUTER_SITE_NAME") ?? "ProMapper";
  const transcribeModel = Deno.env.get("OPENROUTER_TRANSCRIPTION_MODEL") ??
    DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL;
  const summaryModel = Deno.env.get("OPENROUTER_SUMMARY_MODEL") ??
    DEFAULT_OPENROUTER_SUMMARY_MODEL;
  const topicModel = Deno.env.get("OPENROUTER_TOPIC_MODEL") ??
    DEFAULT_OPENROUTER_TOPIC_MODEL;

  const configKey = JSON.stringify({
    apiKey,
    model,
    baseUrl,
    siteUrl,
    siteName,
    transcribeModel,
    summaryModel,
    topicModel,
  });

  if (!cachedOpenRouterService || cachedOpenRouterConfig !== configKey) {
    cachedOpenRouterService = createOpenRouterService({
      apiKey,
      model,
      baseUrl,
      siteUrl,
      siteName,
      transcriptionModel: transcribeModel,
      summaryModel,
      topicModel,
    });
    cachedOpenRouterConfig = configKey;
  }

  return cachedOpenRouterService;
}

export function getOpenRouterModelName() {
  return Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_OPENROUTER_MODEL;
}

export function getOpenRouterApiKey() {
  return requireEnv("OPENROUTER_API_KEY");
}
