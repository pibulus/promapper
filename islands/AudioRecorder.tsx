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
import { hasProAccess, localWhisperSignal } from "@signals/supporterStore.ts";
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
import { showErrorToast, showToast } from "../utils/toast.ts";
import { ensureApiSession } from "../utils/apiAuth.ts";
import { saveAudioBackup } from "../utils/downloadBackup.ts";
import { enqueueApiRequest } from "../utils/requestQueue.ts";
import { coerceFlowResult } from "../utils/coerceFlowResult.ts";
import { soundBloom } from "@utils/sound.ts";
import { formatTime, useRecorder } from "./useRecorder.ts";
import { transcribeWithOfflineWhisper } from "../utils/offlineWhisper.ts";
import {
  clearTake,
  startJournal,
  type TakeJournal,
} from "@core/storage/takeJournal.ts";

interface AudioRecorderProps {
  conversationId: string;
  onRecordingComplete?: () => void;
}

// Cycling processing messages — change every few seconds to show progress.
function getProcessingMessage(seconds: number): string {
  const messages = [
    "Mapping your words…",
    "Finding the topics…",
    "Checking action items…",
    "Almost there…",
    "Wrapping it up…",
  ];
  const index = Math.floor(seconds / 3) % messages.length;
  return messages[index];
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
  const journalRef = useRef<TakeJournal | null>(null);
  const journalUnsafe = useSignal(false);
  // Re-entry guard for processAudioAppend — see the note at its definition.
  const appendingRef = useRef(false);

  // Processing feedback: elapsed time + cycling messages.
  const processingTime = useSignal(0);
  const processingStartRef = useRef<number | null>(null);
  const lastRotatedMinuteRef = useRef<number>(0);

  // Free tier caps single takes at 10 mins; Supporters & BYOK unlock 4-hour
  // marathon sessions with rolling 15-minute auto-appends.
  const MAX_RECORDING_TIME = hasProAccess.value ? 4 * 60 * 60 : 10 * 60;
  const MARATHON_CHUNK_SECONDS = 15 * 60;
  const WARNING_TIME = 30;
  const MIN_BACKUP_DURATION = 30;

  async function persistRecordedTake(
    blob: Blob,
    durationSec: number,
  ): Promise<StoredRecording> {
    lastRecordingBlobRef.current = blob;
    retryRecordingReady.value = true;
    const nextTakeNumber = takes.value.reduce((max, t) => {
      const m = /^Take (\d+)$/.exec(t.fileName ?? "");
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0) + 1;
    const take: StoredRecording = {
      id: journalRef.current?.takeId ?? crypto.randomUUID(),
      conversationId,
      data: blob,
      mimeType: blob.type || "audio/webm",
      fileName: `Take ${nextTakeNumber}`,
      createdAt: new Date().toISOString(),
      durationSec,
    };
    lastTakeIdRef.current = take.id;
    const persisted = await saveRecording(take);
    if (persisted) void clearTake(take.id);
    takes.value = [...takes.value, take];
    if (
      !persisted &&
      (journalUnsafe.value || durationSec >= MIN_BACKUP_DURATION)
    ) {
      try {
        saveAudioBackup(blob, conversationId);
        showToast("Saved a backup copy to your Downloads folder", "info");
      } catch (error) {
        console.warn("Failed to auto-save recording backup:", error);
      }
    } else if (!persisted) {
      showToast(
        "This take couldn't be kept on this device — it'll fade when you leave.",
        "warning",
      );
    }
    if (persisted) journalUnsafe.value = false;
    return take;
  }

  const {
    isRecording,
    recordingTime,
    isProcessing,
    showTimeWarning,
    startRecording,
    stopRecording,
    rotateRecording,
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
    // Journal the take as it records, so a crash mid-take leaves something
    // to hand back (utils/takeRecovery.ts). The take keeps the journal's id
    // below, which is what lets recovery tell a saved take from a lost one.
    onTakeStart: (recorder) => {
      journalUnsafe.value = false;
      journalRef.current = startJournal(recorder, {
        conversationId,
        title: conversationData.value?.conversation?.title,
      }, () => {
        journalUnsafe.value = true;
        showToast(
          "This take isn't backed up while recording. Stop and save it soon.",
          "warning",
          7000,
        );
      });
    },
    onStop: async (blob) => {
      lastRotatedMinuteRef.current = 0;
      const take = await persistRecordedTake(blob, recordingTime.value);
      await processAudioAppend(blob, take.id);
    },
  });

  /**
   * Slice the current recording into a self-contained Take, save it to
   * IndexedDB, and map it in the background while keeping the microphone open.
   */
  async function rotateAndMapChunk(isAutoMarathon = false) {
    if (!isRecording.value || appendingRef.current) return;
    const chunkDuration = recordingTime.value;
    const blob = await rotateRecording();
    if (!blob || blob.size < 1024) return;
    const take = await persistRecordedTake(blob, chunkDuration);
    showToast(
      isAutoMarathon
        ? "15-min marathon chunk saved — mapping in background while mic stays live…"
        : "Chunk saved — mapping in background while mic stays live…",
      "info",
    );
    void processAudioAppend(blob, take.id);
  }

  // Rolling 15-minute marathon auto-append for Supporters & BYOK.
  useEffect(() => {
    if (!isRecording.value) {
      lastRotatedMinuteRef.current = 0;
      return;
    }
    const elapsed = recordingTime.value;
    if (
      elapsed > 0 &&
      elapsed % MARATHON_CHUNK_SECONDS === 0 &&
      lastRotatedMinuteRef.current !== elapsed
    ) {
      lastRotatedMinuteRef.current = elapsed;
      void rotateAndMapChunk(true);
    }
  }, [recordingTime.value, isRecording.value]);

  const timeRemaining = useComputed(() =>
    MAX_RECORDING_TIME - recordingTime.value
  );

  // Track processing time for feedback (elapsed seconds).
  useEffect(() => {
    if (!isProcessing.value) {
      processingTime.value = 0;
      processingStartRef.current = null;
      return;
    }
    processingStartRef.current = Date.now();
    const interval = setInterval(() => {
      if (processingStartRef.current) {
        processingTime.value = Math.floor(
          (Date.now() - processingStartRef.current) / 1000,
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isProcessing.value]);

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

      const buildFormData = (
        payload: { audio?: Blob; transcriptText?: string },
      ) => {
        const fd = new FormData();
        if (payload.audio) fd.append("audio", payload.audio);
        if (payload.transcriptText) {
          fd.append("transcriptText", payload.transcriptText);
        }
        fd.append("conversationId", conversationId);

        if (base) {
          if (base.transcript?.text) {
            fd.append("existingTranscript", base.transcript.text);
          }
          if (base.conversation?.title) {
            fd.append("existingTitle", base.conversation.title);
          }
          if (base.actionItems) {
            fd.append(
              "existingActionItems",
              JSON.stringify(base.actionItems),
            );
          }
          if (base.summary) {
            fd.append("existingSummary", base.summary);
          }
          if (base.nodes) {
            fd.append("existingNodes", JSON.stringify(base.nodes));
          }
          if (base.edges) {
            fd.append("existingEdges", JSON.stringify(base.edges));
          }
        }
        return fd;
      };

      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        if (localWhisperSignal.value) {
          showToast("Transcribing locally with On-Device Whisper…", "info");
          const localText = await transcribeWithOfflineWhisper(audioBlob);
          if (!localText.trim()) {
            throw new Error(
              "No clear speech detected by On-Device Whisper. Check your mic and give it another go.",
            );
          }
          const localRes = await fetch("/api/append", {
            method: "POST",
            body: buildFormData({ transcriptText: localText }),
            signal,
          });
          if (!localRes.ok) {
            const err = await localRes.json();
            throw new Error(err.error || "Failed to process");
          }
          return localRes.json();
        }

        const response = await fetch("/api/append", {
          method: "POST",
          body: buildFormData({ audio: audioBlob }),
          signal,
        });

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 429 && error.use_local_whisper) {
            showToast(
              "Cloud audio allowance reached — finishing take with On-Device Whisper…",
              "info",
            );
            const localText = await transcribeWithOfflineWhisper(audioBlob);
            if (!localText.trim()) {
              throw new Error(
                "No clear speech detected by On-Device Whisper.",
              );
            }
            const fallbackRes = await fetch("/api/append", {
              method: "POST",
              body: buildFormData({ transcriptText: localText }),
              signal,
            });
            if (!fallbackRes.ok) {
              const fallbackErr = await fallbackRes.json();
              throw new Error(fallbackErr.error || "Failed to process");
            }
            return fallbackRes.json();
          }
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
      showErrorToast(error, "That take didn't land — give it another go.");
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
          <div class="inline-flex items-center gap-1.5">
            {recordingTime.value >= 15 && !appendingRef.current && (
              <button
                type="button"
                class="header-icon-btn"
                onClick={() => void rotateAndMapChunk(false)}
                aria-label="Map current chunk and keep recording"
                title="Map current chunk in background & keep mic rolling"
                data-tip="Map chunk & keep rolling"
                data-tip-align="right"
              >
                <i class="fa fa-layer-group" aria-hidden="true" />
              </button>
            )}
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
          </div>
        )
        : isProcessing.value
        ? (
          <button
            type="button"
            class="header-icon-btn is-processing"
            disabled
            aria-label={`Mapping your words (${processingTime.value}s)`}
            data-tip={getProcessingMessage(processingTime.value)}
            data-tip-align="right"
          >
            <i class="fa fa-spinner fa-spin" aria-hidden="true" />
            <span class="processing-time" aria-hidden="true">
              {processingTime.value}s
            </span>
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
      {isRecording.value && journalUnsafe.value && (
        <span class="recording-hub__safety" role="status">
          Not backed up yet — stop to save this take
        </span>
      )}
    </div>
  );
}
