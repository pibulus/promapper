/**
 * Recording Dock — the heartbeat of the app.
 *
 * A floating bottom-center dock on the dashboard: tap to record another take,
 * tap the count to relive previous takes. Each take is persisted to IndexedDB
 * BEFORE the AI pipeline runs (audio survives a failed append), then stamped
 * with a receipt of what it changed (+topics · new tasks · ✓ done).
 *
 * Mount rules (see HomeIsland): stays mounted while a conversation exists —
 * unmounting mid-recording kills the take without onStop. Hidden via CSS
 * during a live session (live mode has its own mic flow; two recorders would
 * fight over getUserMedia) — an effect stops any active take when live starts.
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import { reconcileAppendResult } from "@core/orchestration/append-reconcile.ts";
import {
  computeAppendReceipt,
  formatAppendReceipt,
} from "@core/orchestration/append-receipt.ts";
import {
  deleteRecording as deleteStoredRecording,
  listRecordings,
  saveRecording,
  type StoredRecording,
  sweepOrphans,
  updateRecording,
} from "@core/storage/recordingsDB.ts";
import { getAllConversations } from "@core/storage/localStorage.ts";
import { showToast, showUndoToast } from "../utils/toast.ts";
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

// Run the orphan sweep once per page load, not per mount.
let sweptThisLoad = false;

export default function AudioRecorder(
  { conversationId, onRecordingComplete }: AudioRecorderProps,
) {
  const takesOpen = useSignal(false);
  const retryRecordingReady = useSignal(false);
  const takes = useSignal<StoredRecording[]>([]);
  const playingTakeId = useSignal<string | null>(null);

  const lastRecordingBlobRef = useRef<Blob | null>(null);
  const lastTakeIdRef = useRef<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const currentObjectURLRef = useRef<string | null>(null);

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
  } = useRecorder({
    maxDurationSeconds: MAX_RECORDING_TIME,
    warnAtSecondsLeft: WARNING_TIME,
    blockNavigation: true,
    mimeTypes: ["audio/webm", "audio/ogg", "audio/mp4", ""],
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
      }
      await processAudioAppend(blob, take.id);
    },
  });

  const timeRemaining = useComputed(() =>
    MAX_RECORDING_TIME - recordingTime.value
  );

  // Hydrate takes from IndexedDB whenever the conversation changes; sweep
  // orphaned takes once per load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sweptThisLoad) {
        sweptThisLoad = true;
        try {
          await sweepOrphans(Object.keys(getAllConversations()));
        } catch { /* best-effort */ }
      }
      const stored = await listRecordings(conversationId);
      if (!cancelled) takes.value = stored;
    })();
    return () => {
      cancelled = true;
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

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Process audio and append to conversation. `takeId` is the take this blob
  // was captured as — the receipt is stamped onto exactly that take.
  async function processAudioAppend(audioBlob: Blob, takeId: string | null) {
    // Prevent concurrent appends within the same tab.
    if (isProcessing.value) return;
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
      retryRecordingReady.value = false;
      soundBloom();

      // Stamp the take with its receipt — what this recording actually changed.
      const receipt = computeAppendReceipt(base, reconciled);
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
      isProcessing.value = false;
    }
  }

  function stopPlayback() {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = "";
      audioElementRef.current = null;
    }
    if (currentObjectURLRef.current) {
      URL.revokeObjectURL(currentObjectURLRef.current);
      currentObjectURLRef.current = null;
    }
    playingTakeId.value = null;
  }

  // Exclusive play/pause — starting one take pauses any other.
  function togglePlayback(take: StoredRecording) {
    if (playingTakeId.value === take.id) {
      stopPlayback();
      return;
    }
    stopPlayback();

    const objectURL = URL.createObjectURL(take.data);
    currentObjectURLRef.current = objectURL;
    const audio = new Audio(objectURL);

    audio.onended = stopPlayback;
    audio.onerror = () => {
      stopPlayback();
      showToast("Error playing audio. The file may be corrupted.", "error");
    };
    audio.play().catch((error) => {
      console.error("Failed to play audio:", error);
      stopPlayback();
      showToast(
        "Failed to play audio. Please check your browser settings.",
        "error",
      );
    });

    audioElementRef.current = audio;
    playingTakeId.value = take.id;
  }

  function downloadTake(take: StoredRecording) {
    const url = URL.createObjectURL(take.data);
    const a = document.createElement("a");
    a.href = url;

    let extension = "webm";
    if (take.mimeType.includes("ogg")) extension = "ogg";
    else if (take.mimeType.includes("mp4")) extension = "m4a";
    else if (take.mimeType.includes("wav")) extension = "wav";

    a.download = `${
      take.fileName.replace(/\s+/g, "-").toLowerCase()
    }.${extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function deleteTake(take: StoredRecording) {
    if (playingTakeId.value === take.id) stopPlayback();
    deleteStoredRecording(take.id);
    takes.value = takes.value.filter((t) => t.id !== take.id);
    showUndoToast(`Deleted ${take.fileName}`, () => {
      saveRecording(take);
      takes.value = [...takes.value, take].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
    });
  }

  // Playback cleanup on unmount
  useEffect(() => {
    return () => stopPlayback();
  }, []);

  // ESC closes the takes sheet (not while recording — Stop stays primary).
  useEffect(() => {
    if (!takesOpen.value) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isRecording.value) {
        takesOpen.value = false;
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [takesOpen.value, isRecording.value]);

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
            <span class="recording-hub__pulse" aria-hidden="true" />
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
            class="header-icon-btn"
            onClick={startRecording}
            aria-label="Record a new take"
            data-tip="New take"
            data-tip-align="right"
          >
            <i class="fa fa-microphone" aria-hidden="true" />
          </button>
        )}

      {/* Takes pulldown — listen back, download, delete */}
      <button
        type="button"
        class="header-icon-btn"
        onClick={() => takesOpen.value = !takesOpen.value}
        aria-expanded={takesOpen.value}
        aria-label={`${takes.value.length} recorded take${
          takes.value.length === 1 ? "" : "s"
        }`}
        data-tip="Takes"
        data-tip-align="right"
      >
        <i class="fa fa-headphones" aria-hidden="true" />
        {takes.value.length > 0 && (
          <span class="recording-hub__count">{takes.value.length}</span>
        )}
      </button>

      {takesOpen.value && (
        <div
          class="recording-dock__sheet recording-hub__panel"
          role="dialog"
          aria-label="Recorded takes"
        >
          <div class="recording-dock__sheet-header">
            <h3>Takes</h3>
            <button
              type="button"
              class="recording-dock__sheet-close"
              aria-label="Close takes"
              onClick={() => takesOpen.value = false}
            >
              <i class="fa fa-times" aria-hidden="true" />
            </button>
          </div>
          <div class="recording-dock__sheet-body">
            {retryRecordingReady.value && (
              <button
                type="button"
                class="recording-hub__retry"
                onClick={retryLastRecording}
                disabled={isProcessing.value}
              >
                <i class="fa fa-rotate-left" aria-hidden="true" />{" "}
                Retry mapping the last take
              </button>
            )}
            {takes.value.length === 0
              ? (
                <p class="recording-dock__empty">
                  No takes yet — hit the mic and keep talking. Each take lands
                  here so you can listen back.
                </p>
              )
              : (
                [...takes.value].reverse().map((take) => (
                  <div key={take.id} class="recording-dock__take">
                    <div class="recording-dock__take-info">
                      <p class="recording-dock__take-name">
                        {take.fileName}
                        {take.durationSec
                          ? (
                            <span class="recording-dock__take-duration">
                              {formatTime(take.durationSec)}
                            </span>
                          )
                          : null}
                      </p>
                      <p class="recording-dock__take-date">
                        {formatDate(take.createdAt)}
                      </p>
                      {take.receipt && formatAppendReceipt(take.receipt) && (
                        <p class="recording-dock__take-receipt">
                          {formatAppendReceipt(take.receipt)}
                        </p>
                      )}
                    </div>
                    <div class="recording-dock__take-actions">
                      <button
                        type="button"
                        onClick={() =>
                          togglePlayback(take)}
                        aria-label={playingTakeId.value === take.id
                          ? `Pause ${take.fileName}`
                          : `Play ${take.fileName}`}
                      >
                        <i
                          class={`fa ${
                            playingTakeId.value === take.id
                              ? "fa-pause animate-pulse"
                              : "fa-play"
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTake(take)}
                        aria-label={`Download ${take.fileName}`}
                      >
                        <i class="fa fa-download" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="is-delete"
                        onClick={() => deleteTake(take)}
                        aria-label={`Delete ${take.fileName}`}
                      >
                        <i class="fa fa-times" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
          </div>
        </div>
      )}
    </div>
  );
}
