/**
 * Shared AI helpers to keep server routes consistent.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createGeminiService } from "@core/ai/gemini.ts";
import { createOpenRouterService } from "@core/ai/openrouter.ts";
import { withRetry } from "@core/ai/helpers.ts";
import type { AIService } from "@core/ai/types.ts";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL =
  "mistralai/voxtral-small-24b-2507";
// Budget/free transcription alternative (nemotron-3-nano-omni is free).
// Set OPENROUTER_TRANSCRIPTION_MODEL to this for zero-cost audio transcription.
// "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type AIProvider = "gemini" | "openrouter";

let cachedGeminiKey: string | null = null;
let cachedGeminiModelName: string | null = null;
let cachedModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null =
  null;
let cachedGeminiService: AIService | null = null;
let cachedOpenRouterConfig: string | null = null;
let cachedOpenRouterService: AIService | null = null;

function requireEnv(name: string): string {
  const apiKey = Deno.env.get(name);
  if (!apiKey) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return apiKey;
}

function buildModel(apiKey: string, modelName: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  // Wrap generateContent so every Gemini call gets transient-error retries.
  const originalGenerateContent = model.generateContent.bind(model);
  model.generateContent =
    ((...args: Parameters<typeof originalGenerateContent>) =>
      withRetry(() =>
        originalGenerateContent(...args)
      )) as typeof model.generateContent;
  return model;
}

export function getAIProvider(): AIProvider {
  const provider = (Deno.env.get("AI_PROVIDER") ?? "openrouter").toLowerCase();

  if (provider === "gemini" || provider === "openrouter") {
    return provider;
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

export function getAIService(): AIService {
  return getAIProvider() === "openrouter"
    ? getOpenRouterService()
    : getGeminiService();
}

export function getGeminiModel() {
  const apiKey = getGeminiApiKey();
  const modelName = getGeminiModelName();
  if (
    !cachedModel || cachedGeminiKey !== apiKey ||
    cachedGeminiModelName !== modelName
  ) {
    cachedModel = buildModel(apiKey, modelName);
    cachedGeminiKey = apiKey;
    cachedGeminiModelName = modelName;
    cachedGeminiService = null;
  }
  return cachedModel;
}

export function getGeminiService(): AIService {
  if (!cachedGeminiService) {
    cachedGeminiService = createGeminiService(getGeminiModel());
  }
  return cachedGeminiService;
}

export function getGeminiModelName() {
  return Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
}

export function getGeminiApiKey() {
  return requireEnv("GEMINI_API_KEY");
}

export function getOpenRouterService(): AIService {
  const apiKey = getOpenRouterApiKey();
  const model = getOpenRouterModelName();
  const baseUrl = Deno.env.get("OPENROUTER_BASE_URL") ??
    DEFAULT_OPENROUTER_BASE_URL;
  const siteUrl = Deno.env.get("OPENROUTER_SITE_URL") ?? undefined;
  const siteName = Deno.env.get("OPENROUTER_SITE_NAME") ??
    "ProMapper";
  const transcribeModel = Deno.env.get("OPENROUTER_TRANSCRIPTION_MODEL") ??
    DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL;
  const configKey = JSON.stringify({
    apiKey,
    model,
    baseUrl,
    siteUrl,
    siteName,
    transcribeModel,
  });

  if (!cachedOpenRouterService || cachedOpenRouterConfig !== configKey) {
    cachedOpenRouterService = createOpenRouterService({
      apiKey,
      model,
      baseUrl,
      siteUrl,
      siteName,
      transcriptionModel: transcribeModel,
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
