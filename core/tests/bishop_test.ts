import { assert, assertEquals } from "./_assert.ts";
import {
  BISHOP_MAX_HISTORY,
  BISHOP_MAX_HISTORY_CHARS,
  buildBishopMessages,
} from "../ai/bishop.ts";
import { parseOpenRouterStreamLine } from "../ai/openrouter.ts";

// ===================================================================
// buildBishopMessages
// ===================================================================

Deno.test("system turn carries persona + context, question comes last", () => {
  const msgs = buildBishopMessages("Mabel bit the pig.", [], "Who bit whom?");
  assertEquals(msgs.length, 2);
  assertEquals(msgs[0].role, "system");
  assert(msgs[0].content.includes("Mabel bit the pig."));
  assert(msgs[0].content.includes("Bishop"));
  assertEquals(msgs[msgs.length - 1], {
    role: "user",
    content: "Who bit whom?",
  });
});

Deno.test("history becomes alternating user/assistant turns in order", () => {
  const msgs = buildBishopMessages("ctx", [
    { question: "q1", answer: "a1" },
    { question: "q2", answer: "a2" },
  ], "q3");
  assertEquals(
    msgs.map((m) => m.role),
    ["system", "user", "assistant", "user", "assistant", "user"],
  );
  assertEquals(msgs[1].content, "q1");
  assertEquals(msgs[2].content, "a1");
  assertEquals(msgs[4].content, "a2");
});

Deno.test("history trims to the most recent MAX exchanges", () => {
  const history = Array.from({ length: BISHOP_MAX_HISTORY + 4 }, (_, i) => ({
    question: `q${i}`,
    answer: `a${i}`,
  }));
  const msgs = buildBishopMessages("ctx", history, "new");
  // system + 2 per kept exchange + final question
  assertEquals(msgs.length, 1 + BISHOP_MAX_HISTORY * 2 + 1);
  // Oldest kept exchange is the (4th) one — the first four dropped.
  assertEquals(msgs[1].content, "q4");
});

Deno.test("half-exchanges are dropped so alternation never breaks", () => {
  const msgs = buildBishopMessages("ctx", [
    { question: "orphan", answer: "  " },
    { question: "", answer: "ghost" },
    { question: "kept", answer: "yes" },
  ], "new");
  assertEquals(
    msgs.map((m) => m.role),
    ["system", "user", "assistant", "user"],
  );
  assertEquals(msgs[1].content, "kept");
});

Deno.test("runaway history entries are clipped to the char cap", () => {
  const msgs = buildBishopMessages("ctx", [
    { question: "q", answer: "x".repeat(BISHOP_MAX_HISTORY_CHARS * 3) },
  ], "new");
  assertEquals(msgs[2].content.length, BISHOP_MAX_HISTORY_CHARS);
});

// ===================================================================
// parseOpenRouterStreamLine
// ===================================================================

Deno.test("extracts a text delta from a data line", () => {
  const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
  assertEquals(parseOpenRouterStreamLine(line), "Hello");
});

Deno.test("ignores heartbeats, blanks, [DONE], and junk", () => {
  assertEquals(parseOpenRouterStreamLine(""), null);
  assertEquals(parseOpenRouterStreamLine(": OPENROUTER PROCESSING"), null);
  assertEquals(parseOpenRouterStreamLine("data: [DONE]"), null);
  assertEquals(parseOpenRouterStreamLine("data: {not json"), null);
  assertEquals(
    parseOpenRouterStreamLine('data: {"choices":[{"delta":{}}]}'),
    null,
  );
});

Deno.test("empty-string deltas are treated as no-ops", () => {
  assertEquals(
    parseOpenRouterStreamLine('data: {"choices":[{"delta":{"content":""}}]}'),
    null,
  );
});
