/**
 * Live Analysis Loop — the dashboard keeps up with the meeting.
 *
 * During a live session the host's mic chunks are transcribed by
 * /api/live/chunk and streamed to the room, but nothing re-ran the analysis
 * until an explicit append. This loop accumulates the chunk text and — per
 * the policy in core/orchestration/live-analysis-policy.ts (every N chunks OR
 * M seconds, cooldown, min-new-chars) — POSTs it to /api/live/analyze, then
 * reconciles the result into `conversationData`. The liveSync outbound effect
 * broadcasts the update to every viewer, so the node map, action items, and
 * summary grow for the whole room as the meeting is spoken.
 *
 * Only the host runs this (noteLiveChunk is called from the host-gated
 * recording path), and roomId is deliberately NOT sent — same as
 * AudioRecorder's append: the initiator applies the result locally and
 * liveSync emits ONE conversation_update. No echo storm, no clobber window.
 *
 * Runs are silent: the cards updating IS the feedback. Failures log to the
 * console and the text goes back in the buffer for the next round.
 */

import { conversationData } from "@signals/conversationStore.ts";
import { reconcileAppendResult } from "@core/orchestration/append-reconcile.ts";
import {
  type LiveAnalysisState,
  shouldFlushLiveAnalysis,
  shouldRunLiveAnalysis,
} from "@core/orchestration/live-analysis-policy.ts";
import { coerceFlowResult } from "@utils/coerceFlowResult.ts";
import { enqueueApiRequest } from "@utils/requestQueue.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";

/** How often the ticker re-checks the time leg of the policy. */
const TICK_MS = 5_000;

let pendingText = "";
let pendingSpeakers: string[] = [];
let chunkCount = 0;
let lastRunAt = 0;
let oldestPendingAt = 0;
let inFlight = false;
let ticker: ReturnType<typeof setInterval> | null = null;

function currentState(): LiveAnalysisState {
  return {
    pendingChars: pendingText.length,
    chunkCount,
    lastRunAt,
    oldestPendingAt,
    inFlight,
  };
}

/**
 * Feed one transcribed chunk into the loop. Called from the host's
 * sendChunk() success path — the same moment the chunk goes to the room.
 */
export function noteLiveChunk(text: string, speakers: string[] = []): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  pendingText = pendingText ? `${pendingText}\n${trimmed}` : trimmed;
  for (const s of speakers) {
    if (s && !pendingSpeakers.includes(s)) pendingSpeakers.push(s);
  }
  chunkCount++;
  if (!oldestPendingAt) oldestPendingAt = Date.now();

  // The ticker carries the "OR M seconds" leg for slow talkers.
  if (!ticker) {
    ticker = setInterval(() => {
      if (shouldRunLiveAnalysis(currentState(), Date.now())) {
        void runAnalysis();
      }
    }, TICK_MS);
  }

  if (shouldRunLiveAnalysis(currentState(), Date.now())) {
    void runAnalysis();
  }
}

/**
 * End-of-recording tail run. Fire-and-forget from stopRecording — stopping
 * is intentional, so the flush floor applies but the cooldown doesn't.
 */
export async function flushLiveAnalysis(): Promise<void> {
  if (!shouldFlushLiveAnalysis(currentState())) return;
  await runAnalysis();
}

/** Session teardown — drop the buffer and stop the ticker. */
export function resetLiveAnalysis(): void {
  pendingText = "";
  pendingSpeakers = [];
  chunkCount = 0;
  lastRunAt = 0;
  oldestPendingAt = 0;
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function runAnalysis(): Promise<void> {
  if (inFlight) return;
  // Snapshot the conversation at request-send time — it's both the server's
  // merge baseline and the base we reconcile in-flight edits against.
  const base = conversationData.value;
  if (!base) return;

  // Splice the buffer out; restore it on failure so nothing said is lost.
  const text = pendingText;
  const speakers = pendingSpeakers;
  pendingText = "";
  pendingSpeakers = [];
  chunkCount = 0;
  oldestPendingAt = 0;
  inFlight = true;
  lastRunAt = Date.now();

  try {
    await ensureApiSession();
    // enqueueApiRequest serializes against explicit appends/processes, so a
    // background round can never race a user-initiated one.
    const raw = await enqueueApiRequest(async ({ signal }) => {
      const response = await fetch("/api/live/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: base.conversation.id,
          newText: text,
          speakers,
          existingTranscript: base.transcript?.text ?? "",
          existingSummary: base.summary ?? "",
          existingTitle: base.conversation.title ?? "",
          existingActionItems: base.actionItems ?? [],
          existingNodes: base.nodes ?? [],
          existingEdges: base.edges ?? [],
          // No roomId on purpose — see the module comment.
        }),
        signal,
      });
      if (!response.ok) {
        throw new Error(`live analysis failed (${response.status})`);
      }
      return response.json();
    });

    const flowResult = coerceFlowResult(raw);
    if (!flowResult) {
      throw new Error("live analysis returned an unexpected shape");
    }

    // Layer any edits made during the round-trip back on top, same as append.
    conversationData.value = reconcileAppendResult(
      base,
      conversationData.value,
      flowResult,
    );
  } catch (error) {
    console.error("Live analysis round failed:", error);
    // Put the un-analyzed text back at the FRONT of the buffer so the next
    // round (or the flush) retries it in order.
    pendingText = pendingText ? `${text}\n${pendingText}` : text;
    for (const s of speakers) {
      if (s && !pendingSpeakers.includes(s)) pendingSpeakers.push(s);
    }
    if (!oldestPendingAt) oldestPendingAt = Date.now();
  } finally {
    inFlight = false;
  }
}
