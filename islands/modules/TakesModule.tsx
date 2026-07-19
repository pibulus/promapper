/**
 * Takes — the conversation's recordings, in the rack.
 *
 * Surfaces what recordingsDB already keeps (the dock saves every take
 * BEFORE analysis runs): listen back, download, and each take's receipt —
 * what that recording actually changed. Same rows as the dock's timeline
 * (shared .recording-dock__take* classes), same exclusive-playback rules.
 * conversation_mapper had this module; this is its ProMapper home.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import {
  deleteRecording,
  listRecordings,
  saveRecording,
  type StoredRecording,
} from "@core/storage/recordingsDB.ts";
import { formatAppendReceipt } from "@core/orchestration/append-receipt.ts";
import { formatTime } from "../useRecorder.ts";
import { showToast, showUndoToast } from "@utils/toast.ts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TakesModule() {
  const takes = useSignal<StoredRecording[]>([]);
  const playingTakeId = useSignal<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const currentObjectURLRef = useRef<string | null>(null);

  const conversationId = conversationData.value?.conversation.id ?? "";

  // Reload whenever the conversation changes — an append finishing stamps a
  // fresh receipt, and this picks it up (same trigger as the Pulse back).
  useEffect(() => {
    let cancelled = false;
    if (!conversationId) {
      takes.value = [];
      return;
    }
    listRecordings(conversationId).then((stored) => {
      if (!cancelled) {
        takes.value = stored.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversationData.value]);

  function stopPlayback() {
    if (audioElementRef.current) {
      // Detach handlers BEFORE clearing src — src = "" itself fires an
      // `error` event, which would toast "wouldn't play" after every
      // clip that simply finished.
      audioElementRef.current.onended = null;
      audioElementRef.current.onerror = null;
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
      showToast("That take wouldn't play — the file may be damaged", "error");
    };
    audio.play().catch(() => {
      stopPlayback();
      showToast("That take wouldn't play — check your sound settings", "error");
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
    deleteRecording(take.id).catch(() => {
      // IDB delete failed (quota weirdness, Safari private mode) — put the
      // row back so the list doesn't drift from storage.
      takes.value = [...takes.value, take].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      showToast("Couldn't delete that take", "warning");
    });
    takes.value = takes.value.filter((t) => t.id !== take.id);
    showUndoToast(`Deleted ${take.fileName}`, () => {
      saveRecording(take).catch(() => {
        showToast("Couldn't restore the take's audio", "warning");
      });
      takes.value = [...takes.value, take].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    });
  }

  // Playback cleanup on unmount — never leak an object URL or a live element.
  useEffect(() => stopPlayback, []);

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Takes</h3>
          <span class="card-header-tagline">every recording, kept</span>
        </div>
        <div class="dashboard-card-body takes-module-body">
          {takes.value.length === 0
            ? (
              <p class="takes-module-empty">
                Recordings land here as you make them — each take keeps its
                sound and a note of what it changed.
              </p>
            )
            : (
              <div class="takes-module-list">
                {takes.value.map((take) => (
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
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
