/**
 * Shared AI helpers — OpenRouter-only provider selection.
 */

import { createOpenRouterService } from "@core/ai/openrouter.ts";
import type { AIService } from "@core/ai/types.ts";

const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL = "~google/gemini-flash-latest";
const DEFAULT_OPENROUTER_SUMMARY_MODEL = "~anthropic/claude-haiku-latest";
const DEFAULT_OPENROUTER_TOPIC_MODEL = "~anthropic/claude-haiku-latest";
/** The Ask module's brain. Haiku, not flash-lite: ask-your-memory is the most
 * reasoning-heavy, least-frequent AI call in the app — quality shows most
 * and costs least here (checked live 2026-07-18: haiku-latest $1/$5 vs
 * flash-lite $0.25/$1.50 per 1M — pennies at Ask's volume). Rolling
 * alias per the anti-drift law. Splurge via OPENROUTER_ASK_MODEL
 * (e.g. ~anthropic/claude-sonnet-latest at $2/$10). */
const DEFAULT_OPENROUTER_ASK_MODEL = "~anthropic/claude-haiku-latest";
/** Markdown exports are rare, user-initiated, and read as deliverables —
 * same profile as Ask, so same quality tier. */
const DEFAULT_OPENROUTER_MARKDOWN_MODEL = "~anthropic/claude-haiku-latest";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Model hint for /api/ask (the Ask module). Read per-call — no cache to bust. */
export function getAskModel(): string {
  return Deno.env.get("OPENROUTER_ASK_MODEL")?.trim() ||
    DEFAULT_OPENROUTER_ASK_MODEL;
}

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
  const markdownModel = Deno.env.get("OPENROUTER_MARKDOWN_MODEL") ??
    DEFAULT_OPENROUTER_MARKDOWN_MODEL;
  // No quality default for status checks: self-checkoff runs on EVERY append
  // and every live-analysis round, so the general (cheap) model is the
  // deliberate volume choice. The env knob exists so flipping it after a
  // real-meeting quality test is config, not code.
  const statusModel = Deno.env.get("OPENROUTER_STATUS_MODEL")?.trim() ||
    undefined;

  const configKey = JSON.stringify({
    apiKey,
    model,
    baseUrl,
    siteUrl,
    siteName,
    transcribeModel,
    summaryModel,
    topicModel,
    markdownModel,
    statusModel,
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
      markdownModel,
      statusModel,
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
