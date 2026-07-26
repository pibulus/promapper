/**
 * Recording Dock — the heartbeat of the app.
 *
 * The header mic: tap to record another take. Each take is persisted to
 * IndexedDB BEFORE the AI pipeline runs (audio survives a failed append),
 * then stamped with a receipt of what it changed (+topics · new tasks ·
 * ✓ done). Listening back / download / delete live in the Takes card on the
 * dashboard (the header takes sheet was retired in the July 23 icon audit —
 * one surface, not two). A retry chip appears here only when the last take
 * failed to map.
 *
 * Mount rules (see HomeIsland): stays mounted while a conversation exists —
 * unmounting mid-recording kills the take without onStop. Hidden via CSS
 * during a live session (live mode has its own mic flow; two recorders would
 * fight over getUserMedia) — an effect stops any active take when live starts.
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import LevelBars from "../components/LevelBars.tsx";

import { liveSession } from "@signals/liveSessionStore.ts";
import { reconcileAppendResult } from "@core/orchestration/append-reconcile.ts";
import { clearUndo, conversationData } from "@signals/conversationStore.ts";
import {
  computeAppendReceipt,
  formatAppendReceipt,
} from "@core/orchestration/append-receipt.ts";
import { showActionToast } from "@utils/toast.ts";
import {
  listRecordings,
  saveRecording,
  type StoredRecording,
  updateRecording,
} from "@core/storage/recordingsDB.ts";
import { showToast } from "../utils/toast.ts";
import { ensureApiSession } from "../utils/apiAuth.ts";
import { saveAudioBackup } from "../utils/downloadBackup.ts";
import { enqueueApiRequest } from "../utils/requestQueue.ts";
import { coerceFlowResult } from "../utils/coerceFlowResult.ts";
import { soundBloom } from "@utils/sound.ts";
import { formatTime, useRecorder } from "./useRecorder.ts";

interface AudioRecorderProps {
  conversationId: string;
  onRecordingComplete?: () => void;
}

export default function AudioRecorder(
  { conversationId, onRecordingComplete }: AudioRecorderProps,
) {
  const retryRecordingReady = useSignal(false);
  // Takes are still tracked here for numbering, receipts, and the unmapped
  // nudge — the browsing UI lives in the dashboard Takes card.
  const takes = useSignal<StoredRecording[]>([]);

  const lastRecordingBlobRef = useRef<Blob | null>(null);
  const lastTakeIdRef = useRef<string | null>(null);
  // Re-entry guard for processAudioAppend — see the note at its definition.
  const appendingRef = useRef(false);

  const MAX_RECORDING_TIME = 10 * 60;
  const WARNING_TIME = 30;
  const MIN_BACKUP_DURATION = 30;

  const {
    isRecording,
    recordingTime,
    isProcessing,
    showTimeWarning,
    startRecording,
    stopRecording,
    streamRef,
  } = useRecorder({
    maxDurationSeconds: MAX_RECORDING_TIME,
    warnAtSecondsLeft: WARNING_TIME,
    blockNavigation: true,
    mimeTypes: [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "",
    ],
    // Matches the server's MIN_AUDIO_SIZE — blink-taps bail kindly without
    // the upload round-trip.
    minBlobBytes: 1024,
    onStop: async (blob) => {
      lastRecordingBlobRef.current = blob;
      retryRecordingReady.value = true;
      // Number from the highest existing "Take N", not the list length —
      // after deleting a take, length+1 minted duplicate names.
      const nextTakeNumber = takes.value.reduce((max, t) => {
        const m = /^Take (\d+)$/.exec(t.fileName ?? "");
        return m ? Math.max(max, Number(m[1])) : max;
      }, 0) + 1;
      // Persist the take FIRST — the audio must survive a failed AI pipeline.
      const take: StoredRecording = {
        id: crypto.randomUUID(),
        conversationId,
        data: blob,
        mimeType: blob.type || "audio/webm",
        fileName: `Take ${nextTakeNumber}`,
        createdAt: new Date().toISOString(),
        durationSec: recordingTime.value,
      };
      lastTakeIdRef.current = take.id;
      const persisted = await saveRecording(take);
      takes.value = [...takes.value, take];
      if (!persisted && recordingTime.value >= MIN_BACKUP_DURATION) {
        // No IndexedDB (private mode) — long takes still get a file backup.
        try {
          saveAudioBackup(blob, conversationId);
          showToast("Saved a backup copy to your Downloads folder", "info");
        } catch (error) {
          console.warn("Failed to auto-save recording backup:", error);
        }
      } else if (!persisted) {
        // Short take, no file fallback — say so instead of showing a take
        // that silently vanishes on the next visit (Safari private mode).
        showToast(
          "This take couldn't be kept on this device — it'll fade when you leave.",
          "warning",
        );
      }
      await processAudioAppend(blob, take.id);
    },
  });

  const timeRemaining = useComputed(() =>
    MAX_RECORDING_TIME - recordingTime.value
  );

  // Hydrate takes from IndexedDB whenever the conversation changes. (The orphan
  // sweep moved to HomeIsland's mount — here it only ran once a conversation
  // was already open, which is the one case where nothing needs sweeping.)
  useEffect(() => {
    // A pending retry belongs to the conversation it was recorded in. This
    // component has no key (HomeIsland renders it with a changing prop), so
    // without this reset the chip stayed on screen across a History switch
    // holding the OLD map's audio — and tapping it merged that recording into
    // the new map, then stamped the receipt onto the old map's take so the
    // "not mapped yet" nudge would never offer it again either. The mid-flight
    // id guard can't catch this one: at retry time both ids are the new
    // conversation. The stale blob is the thing that has to go.
    retryRecordingReady.value = false;
    lastRecordingBlobRef.current = null;
    lastTakeIdRef.current = null;

    let cancelled = false;
    (async () => {
      const stored = await listRecordings(conversationId);
      if (!cancelled) takes.value = stored;
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Offline-first rescue: a take saved while the AI was unreachable has no
  // receipt — it's audio the map never absorbed. Nudge ONCE per conversation
  // (and again if connectivity returns) with a consent-ful action toast; the
  // takes panel also gets a per-take map button. Never auto-spends AI calls.
  const nudgedUnmappedRef = useRef<string | null>(null);
  async function mapStoredTake(take: StoredRecording) {
    await processAudioAppend(take.data, take.id);
  }
  async function mapAllUnmapped() {
    for (const take of takes.value.filter((t) => !t.receipt)) {
      // Each take is a full 5–15s round trip, and the id guard inside
      // processAudioAppend discards a result that lands after a History switch.
      // Without this the loop kept paying for appends it would then throw away.
      if (conversationData.value?.conversation.id !== conversationId) break;
      await mapStoredTake(take);
    }
  }
  function nudgeUnmapped() {
    const unmapped = takes.value.filter((t) => !t.receipt).length;
    if (unmapped === 0 || isProcessing.value) return;
    if (nudgedUnmappedRef.current === conversationId) return;
    nudgedUnmappedRef.current = conversationId;
    showActionToast(
      `${unmapped} take${unmapped === 1 ? "" : "s"} not mapped yet`,
      "Map now",
      () => void mapAllUnmapped(),
    );
  }
  useEffect(() => {
    // After takes hydrate, offer to map strays; re-offer when we come back
    // online (the classic case: recorded in a dead spot).
    const timer = setTimeout(nudgeUnmapped, 1_500);
    const onOnline = () => {
      nudgedUnmappedRef.current = null;
      nudgeUnmapped();
    };
    globalThis.addEventListener("online", onOnline);
    return () => {
      clearTimeout(timer);
      globalThis.removeEventListener("online", onOnline);
    };
  }, [conversationId]);

  // Going live mid-take: stop gracefully (flush + append) so the live-mode
  // recorder can have the mic. The dock hides via CSS while live.
  useEffect(() => {
    if (liveSession.value && isRecording.value) {
      stopRecording();
    }
  }, [liveSession.value]);

  async function retryLastRecording() {
    if (!lastRecordingBlobRef.current) return;
    // Pass the take id PAIRED with this blob — reading lastTakeIdRef at
    // completion time could stamp the receipt onto a different take if the
    // user recorded another one between the failure and the retry.
    await processAudioAppend(
      lastRecordingBlobRef.current,
      lastTakeIdRef.current,
    );
  }

  // Process audio and append to conversation. `takeId` is the take this blob
  // was captured as — the receipt is stamped onto exactly that take.
  async function processAudioAppend(audioBlob: Blob, takeId: string | null) {
    // Prevent concurrent appends within the same tab.
    //
    // This guard is deliberately NOT `isProcessing`. That signal belongs to
    // useRecorder, which raises it in stopRecording() BEFORE awaiting onStop —
    // and onStop is what calls us. Guarding on it meant every recorded take
    // returned here before ever reaching /api/append: the take landed in
    // IndexedDB, no request was sent, no receipt stamped, no error shown. The
    // append loop was dead on its primary path and only the rescue routes
    // (retry chip, "N takes not mapped yet") still worked, because those fire
    // after stopRecording's finally has lowered the flag. Regression from
    // d8938af, where the hook extraction moved isProcessing out from under
    // this function. `isProcessing` stays as the recorder's UI state.
    if (appendingRef.current) {
      // Reachable for real: record a new take while "Map now" is working
      // through the unmapped ones. The blob is safe in IndexedDB and the retry
      // chip is showing, but bailing mutely looked exactly like a successful
      // append that found nothing — say what happened.
      showToast(
        "Still mapping the last take — this one's saved, give it a moment.",
        "info",
      );
      return;
    }
    appendingRef.current = true;
    isProcessing.value = true;

    try {
      // Snapshot the conversation at request-send time. The server merges its
      // AI extraction against EXACTLY this snapshot, so it's also the BASE we
      // diff the user's in-flight edits against when the result returns. Build
      // the FormData FROM `base` (not re-reading the live signal) so the server's
      // merge baseline and our reconcile baseline are provably identical.
      const base = conversationData.value;

      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append("conversationId", conversationId);

      // Pass existing transcript, action items, summary, and nodes for smart appending
      if (base) {
        if (base.transcript?.text) {
          formData.append("existingTranscript", base.transcript.text);
        }

        // The title is settled — passing it through stops the server
        // regenerating (and re-billing) it on every append.
        if (base.conversation?.title) {
          formData.append("existingTitle", base.conversation.title);
        }

        if (base.actionItems) {
          formData.append(
            "existingActionItems",
            JSON.stringify(base.actionItems),
          );
        }

        if (base.summary) {
          formData.append("existingSummary", base.summary);
        }

        if (base.nodes) {
          formData.append("existingNodes", JSON.stringify(base.nodes));
        }
        if (base.edges) {
          // Feed existing edges so the topic prompt's relationship-preservation
          // hint isn't empty on appends (the append route already parses this).
          formData.append("existingEdges", JSON.stringify(base.edges));
        }
      }
      // NOTE: roomId is deliberately NOT sent. /api/append's pushResultToRoom
      // only echoes when roomId is present; keeping it absent means an append
      // produces exactly ONE write to the initiator (the reconcile below) and
      // ONE outbound liveSync broadcast — no second clobber window, no echo
      // storm (audit Finding 3). The peer receives the reconciled snapshot via
      // the normal outbound effect.

      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/append", {
          method: "POST",
          body: formData,
          signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to process");
        }

        return response.json();
      });

      const flowResult = coerceFlowResult(result);
      if (!flowResult) {
        throw new Error("Server returned an unexpected response — try again.");
      }

      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }

      // The append takes 5–15s, and nothing stops the user opening a different
      // conversation from History while it runs (MobileHistoryMenu.handleLoad
      // swaps the signal unconditionally). If that happened, `base` is no
      // longer an ancestor of what's on screen — reconciling would splice the
      // NEW map into the OLD one and autosave the mash-up under the old id.
      // Drop the result instead: the take is still in IndexedDB without a
      // receipt, so the "N takes not mapped yet" nudge offers it again once
      // the right conversation is open. Same guard AskModule already uses.
      if (conversationData.value?.conversation.id !== conversationId) {
        console.warn("Append discarded — conversation switched mid-flight");
        return;
      }

      // Reconcile: layer any edits the user made DURING the round-trip (toggle,
      // delete, drag, rename) back on top of the server's AI-growth result so
      // they aren't clobbered (audit Findings 2/3/5). `base` is the request-time
      // snapshot; conversationData.value is the current (possibly-edited) signal.
      // Passthrough when nothing changed (base null, or unchanged by reference).
      const reconciled = reconcileAppendResult(
        base,
        conversationData.value,
        flowResult,
      );
      conversationData.value = reconciled;
      // The append is a NEW BASELINE, so any undo armed before it is now a
      // trap: an in-flight edit (the exact case reconcile exists for) leaves
      // an undo snapshot from BEFORE this take, and Cmd+Z has no expiry. One
      // press would roll back past the whole mapping — and since the take was
      // just receipt-stamped, the "not mapped yet" nudge would never offer it
      // again. applyRemoteConversation already drops the snapshot for exactly
      // this reason; the server's own result deserves the same.
      clearUndo();
      retryRecordingReady.value = false;
      soundBloom();

      // Stamp the take with its receipt — what this recording actually changed.
      // flowResult (THEIRS) goes in so a topic/task the user added while this
      // was in flight isn't credited to the take.
      const receipt = computeAppendReceipt(base, reconciled, flowResult);
      if (takeId) {
        updateRecording(takeId, { receipt });
        takes.value = takes.value.map((t) =>
          t.id === takeId ? { ...t, receipt } : t
        );
      }

      if (onRecordingComplete) {
        onRecordingComplete();
      }

      const line = formatAppendReceipt(receipt);
      showToast(
        line ? `Take mapped — ${line}` : "Take mapped — no new items this time",
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing audio:", error);
      showToast(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      appendingRef.current = false;
      isProcessing.value = false;
      // The nudge timer runs 1500ms after a conversation opens and bails while
      // an append is in flight — and this component has no `key`, so an append
      // started in the PREVIOUS conversation is still flying when the new one's
      // timer fires. That swallowed the "N takes not mapped yet" offer for the
      // rest of the session (only an `online` event re-armed it). Re-offer here
      // instead of resetting the recorder's own isProcessing, which would lie
      // to the mic button mid-append. No-op once nudged for this conversation,
      // so "Map now" doesn't nudge itself on every take it maps.
      nudgeUnmapped();
    }
  }

  return (
    <div
      class={`recording-hub relative${liveSession.value ? " is-hidden" : ""}`}
    >
      {
        /* The mic — record/stop/processing states in one header button.
          While recording: pulsing dot + live mm:ss timer (amber when the
          10-minute cap is near); click again to stop. */
      }
      {isRecording.value
        ? (
          <button
            type="button"
            class="header-icon-btn is-live"
            onClick={stopRecording}
            aria-label={`Stop recording (${formatTime(recordingTime.value)})`}
            title={showTimeWarning.value
              ? `Auto-stop in ${formatTime(timeRemaining.value)}`
              : "Stop and map this take"}
          >
            {
              /* Live level meter — silence is visible, "is it hearing me?"
                answers itself. Pulse stays as the no-stream fallback. */
            }
            {streamRef.current
              ? <LevelBars stream={streamRef.current} />
              : <span class="recording-hub__pulse" aria-hidden="true" />}
            <span
              class={`recording-hub__time${
                showTimeWarning.value ? " is-warning" : ""
              }`}
            >
              {formatTime(recordingTime.value)}
            </span>
            <i class="fa fa-stop" aria-hidden="true" />
          </button>
        )
        : isProcessing.value
        ? (
          <button
            type="button"
            class="header-icon-btn"
            disabled
            aria-label="Mapping your words"
            data-tip="Mapping your words…"
            data-tip-align="right"
          >
            <i class="fa fa-spinner fa-spin" aria-hidden="true" />
          </button>
        )
        : (
          <button
            type="button"
            class="header-action-btn"
            onClick={startRecording}
            aria-label="Record a new take"
            data-tip="Say more — it folds into this map"
            data-tip-align="right"
            data-hint="record"
          >
            <i class="fa fa-microphone" aria-hidden="true" />
            <span>Add</span>
          </button>
        )}

      {
        /* Rescue chip — appears ONLY when the last take failed to map, so the
          retry path survives the takes sheet's retirement (browsing takes
          lives in the dashboard Takes card now). */
      }
      {retryRecordingReady.value && !isRecording.value &&
        !isProcessing.value && (
        <button
          type="button"
          class="header-icon-btn"
          onClick={retryLastRecording}
          aria-label="Retry mapping the last take"
          data-tip="Retry mapping the last take"
          data-tip-align="right"
        >
          <i class="fa fa-rotate-left" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
