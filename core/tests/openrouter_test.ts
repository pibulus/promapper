/**
 * Tests for core/ai/openrouter.ts
 *
 * Uses an injected fetch implementation to verify request formatting without
 * real API calls.
 */

import { assertEquals, assertStringIncludes } from "./_assert.ts";

import { createOpenRouterService } from "../ai/openrouter.ts";
import type { OpenRouterAudioPart } from "../ai/types.ts";

function jsonResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content },
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

Deno.test("OpenRouter generateMarkdown posts chat completion request", async () => {
  let capturedUrl = "";
  let capturedBody: any = null;
  let capturedHeaders: Headers | null = null;

  const service = createOpenRouterService({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash-lite",
    siteUrl: "http://localhost:8003",
    siteName: "ProMapper Test",
    fetcher: async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      capturedHeaders = new Headers(init?.headers);
      return jsonResponse("  # Report  ");
    },
  });

  const result = await service.generateMarkdown("make a report", "text");

  assertEquals(result, "# Report");
  assertEquals(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assertEquals(capturedBody.model, "google/gemini-2.5-flash-lite");
  assertEquals(capturedBody.stream, false);
  assertStringIncludes(
    capturedBody.messages[0].content,
    "Transform the following conversation text",
  );
  assertEquals(capturedHeaders?.get("Authorization"), "Bearer test-key");
  assertEquals(capturedHeaders?.get("HTTP-Referer"), "http://localhost:8003");
  assertEquals(
    capturedHeaders?.get("X-OpenRouter-Title"),
    "ProMapper Test",
  );
});

Deno.test("OpenRouter transcribeAudio sends input_audio content", async () => {
  let capturedBody: any = null;
  const audioPart: OpenRouterAudioPart = {
    inputAudio: {
      data: "YXVkaW8=",
      format: "webm",
      mimeType: "audio/webm",
    },
  };

  const service = createOpenRouterService({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash-lite",
    fetcher: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse("Speaker1: hello\nSpeaker2: hi");
    },
  });

  const result = await service.transcribeAudio(audioPart);
  const content = capturedBody.messages[0].content;

  assertEquals(result.text, "Speaker1: hello\nSpeaker2: hi");
  assertEquals(result.speakers, ["Speaker1", "Speaker2"]);
  assertEquals(content[0].type, "text");
  assertStringIncludes(content[0].text, "Transcribe this audio file");
  assertEquals(content[1].type, "input_audio");
  assertEquals(content[1].input_audio.data, "YXVkaW8=");
  assertEquals(content[1].input_audio.format, "webm");
});

Deno.test("an empty balance is not retried - it falls through immediately", async () => {
  // A depleted balance cannot succeed on attempt 2 or 3. Retrying it only
  // delays the fallback, so withRetry must let it straight through.
  let calls = 0;
  const service = createOpenRouterService({
    apiKey: "test-key",
    model: "~google/gemini-flash-latest",
    fetcher: (_input, _init) => {
      calls++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { message: "Your prepayment credits are depleted." },
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  });

  // No GEMINI_API_KEY in the test env, so the fallback declines and the
  // original error surfaces - which is exactly the unconfigured contract.
  await service.generateTitle("some transcript").catch(() => {});

  assertEquals(calls, 1, "an empty balance must not be retried");
});

Deno.test("a rate limit IS still retried - it can succeed on the next try", async () => {
  let calls = 0;
  const service = createOpenRouterService({
    apiKey: "test-key",
    model: "~google/gemini-flash-latest",
    fetcher: (_input, _init) => {
      calls++;
      if (calls < 3) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: "rate limited" } }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(jsonResponse("Recovered Title"));
    },
  });

  const title = await service.generateTitle("some transcript");

  assertEquals(title, "Recovered Title");
  assertEquals(calls, 3, "a transient 429 should still be retried");
});

Deno.test("reasoning is capped for Google models and left alone for Anthropic", async () => {
  // Google's rolling aliases think by default and thinking bills as output -
  // uncapped it cost 8x. Anthropic roles (summary, Ask, markdown) are the ones
  // we want thorough, so they must NOT be capped.
  // deno-lint-ignore no-explicit-any
  const bodies: any[] = [];
  const make = (model: string) =>
    createOpenRouterService({
      apiKey: "test-key",
      model,
      fetcher: (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(jsonResponse("ok"));
      },
    });

  await make("~google/gemini-flash-latest").generateTitle("t");
  await make("~anthropic/claude-haiku-latest").generateTitle("t");

  assertEquals(bodies[0].reasoning, { effort: "low" });
  assertEquals(bodies[1].reasoning, undefined);
});
