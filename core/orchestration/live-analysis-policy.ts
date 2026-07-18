/**
 * Live Analysis Policy — when does a live session re-run analysis?
 *
 * Pure decision logic for the debounced live-analysis loop (nodes/actions/
 * summary updating as the meeting is spoken). Mirrors the whiteboard
 * auto-draw guards in DashboardIsland (AUTO_DRAW_EVERY / cooldown / min new
 * chars) plus a time leg so slow-chunking talkers still get updates.
 *
 * Framework-free on purpose: the stateful loop lives in
 * signals/liveAnalysis.ts; every decision it makes routes through here so the
 * trigger behavior is unit-testable without a browser.
 */

/** Fire an analysis run every Nth transcript chunk. */
export const LIVE_ANALYSIS_EVERY = 3;

/** Minimum ms between runs so back-to-back chunks don't stack model calls. */
export const LIVE_ANALYSIS_COOLDOWN_MS = 30_000;

/** Skip a round when barely anything new was said ("yeah" / "okay"). */
export const LIVE_ANALYSIS_MIN_NEW_CHARS = 200;

/**
 * Time leg of "every N chunks OR M seconds": if enough text has been waiting
 * this long without the chunk counter tripping, run anyway.
 */
export const LIVE_ANALYSIS_MAX_WAIT_MS = 90_000;

/**
 * End-of-recording flush floor — lower than the in-flight minimum because the
 * tail of a meeting is intentional, but a two-word goodbye still isn't worth
 * a model round-trip.
 */
export const LIVE_ANALYSIS_FLUSH_MIN_CHARS = 80;

export interface LiveAnalysisState {
  /** Accumulated not-yet-analyzed transcript characters. */
  pendingChars: number;
  /** Chunks accumulated since the last run. */
  chunkCount: number;
  /** Epoch ms of the last run start; 0 = never ran. */
  lastRunAt: number;
  /** Epoch ms when the oldest pending chunk arrived; 0 = nothing pending. */
  oldestPendingAt: number;
  /** A run is currently in flight. */
  inFlight: boolean;
}

/**
 * The whole trigger decision. Both legs (chunk count, wait time) still
 * respect the in-flight guard, the minimum-new-chars guard, and the cooldown.
 */
export function shouldRunLiveAnalysis(
  state: LiveAnalysisState,
  now: number,
): boolean {
  if (state.inFlight) return false;
  if (state.pendingChars < LIVE_ANALYSIS_MIN_NEW_CHARS) return false;
  if (now - state.lastRunAt < LIVE_ANALYSIS_COOLDOWN_MS) return false;

  const chunkLeg = state.chunkCount >= LIVE_ANALYSIS_EVERY;
  const timeLeg = state.oldestPendingAt > 0 &&
    now - state.oldestPendingAt >= LIVE_ANALYSIS_MAX_WAIT_MS;
  return chunkLeg || timeLeg;
}

/**
 * Should stopping the recording flush the remaining tail? Intentional stops
 * bypass the cooldown and chunk counter — only the floor and in-flight guard
 * apply.
 */
export function shouldFlushLiveAnalysis(state: LiveAnalysisState): boolean {
  if (state.inFlight) return false;
  return state.pendingChars >= LIVE_ANALYSIS_FLUSH_MIN_CHARS;
}
