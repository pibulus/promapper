import { assertEquals } from "./_assert.ts";
import {
  LIVE_ANALYSIS_COOLDOWN_MS,
  LIVE_ANALYSIS_EVERY,
  LIVE_ANALYSIS_FLUSH_MIN_CHARS,
  LIVE_ANALYSIS_MAX_WAIT_MS,
  LIVE_ANALYSIS_MIN_NEW_CHARS,
  type LiveAnalysisState,
  shouldFlushLiveAnalysis,
  shouldRunLiveAnalysis,
} from "../orchestration/live-analysis-policy.ts";

const NOW = 1_000_000_000;

function state(overrides: Partial<LiveAnalysisState> = {}): LiveAnalysisState {
  // A "ready" baseline: enough text, enough chunks, cooldown long expired.
  return {
    pendingChars: LIVE_ANALYSIS_MIN_NEW_CHARS,
    chunkCount: LIVE_ANALYSIS_EVERY,
    lastRunAt: NOW - LIVE_ANALYSIS_COOLDOWN_MS,
    oldestPendingAt: NOW - 1_000,
    inFlight: false,
    ...overrides,
  };
}

Deno.test("runs on the chunk leg when all guards pass", () => {
  assertEquals(shouldRunLiveAnalysis(state(), NOW), true);
});

Deno.test("first run ever passes the cooldown (lastRunAt 0)", () => {
  assertEquals(shouldRunLiveAnalysis(state({ lastRunAt: 0 }), NOW), true);
});

Deno.test("in-flight run blocks a second trigger", () => {
  assertEquals(shouldRunLiveAnalysis(state({ inFlight: true }), NOW), false);
});

Deno.test("skips when barely anything new was said", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({ pendingChars: LIVE_ANALYSIS_MIN_NEW_CHARS - 1 }),
      NOW,
    ),
    false,
  );
});

Deno.test("cooldown holds even when the chunk counter tripped", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({ lastRunAt: NOW - LIVE_ANALYSIS_COOLDOWN_MS + 1 }),
      NOW,
    ),
    false,
  );
});

Deno.test("waits below the chunk threshold when text is fresh", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({ chunkCount: LIVE_ANALYSIS_EVERY - 1 }),
      NOW,
    ),
    false,
  );
});

Deno.test("time leg fires for slow talkers who never hit N chunks", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({
        chunkCount: 1,
        oldestPendingAt: NOW - LIVE_ANALYSIS_MAX_WAIT_MS,
      }),
      NOW,
    ),
    true,
  );
});

Deno.test("time leg needs something pending (oldestPendingAt 0 = idle)", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({ chunkCount: 0, oldestPendingAt: 0 }),
      NOW,
    ),
    false,
  );
});

Deno.test("time leg still respects the min-chars guard", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({
        pendingChars: LIVE_ANALYSIS_MIN_NEW_CHARS - 1,
        chunkCount: 1,
        oldestPendingAt: NOW - LIVE_ANALYSIS_MAX_WAIT_MS,
      }),
      NOW,
    ),
    false,
  );
});

Deno.test("time leg still respects the cooldown", () => {
  assertEquals(
    shouldRunLiveAnalysis(
      state({
        chunkCount: 1,
        oldestPendingAt: NOW - LIVE_ANALYSIS_MAX_WAIT_MS,
        lastRunAt: NOW - 5_000,
      }),
      NOW,
    ),
    false,
  );
});

Deno.test("flush runs on a meaningful tail, bypassing cooldown + counter", () => {
  assertEquals(
    shouldFlushLiveAnalysis(
      state({
        pendingChars: LIVE_ANALYSIS_FLUSH_MIN_CHARS,
        chunkCount: 1,
        lastRunAt: NOW, // cooldown would normally block — flush ignores it
      }),
    ),
    true,
  );
});

Deno.test("flush skips a two-word goodbye", () => {
  assertEquals(
    shouldFlushLiveAnalysis(
      state({ pendingChars: LIVE_ANALYSIS_FLUSH_MIN_CHARS - 1 }),
    ),
    false,
  );
});

Deno.test("flush never doubles an in-flight run", () => {
  assertEquals(
    shouldFlushLiveAnalysis(state({ inFlight: true })),
    false,
  );
});
