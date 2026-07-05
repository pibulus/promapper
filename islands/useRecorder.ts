/**
 * useRecorder — shared recording hook for HomeIsland (live) and AudioRecorder
 * (append). Consolidates the duplicated getUserMedia, MediaRecorder lifecycle,
 * chunk accumulation, timer, and cleanup logic. Divergent behaviour (chunk
 * destination, silence detection, max duration) plugs in via callbacks.
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { showToast } from "@utils/toast.ts";

export interface RecorderOptions {
  /** Audio constraints passed to getUserMedia. */
  audioConstraints?: MediaTrackConstraints;
  /** MediaRecorder timeslice (ms). */
  timesliceMs?: number;
  /** MIME type fallback chain (first supported wins). */
  mimeTypes?: string[];
  /** Called before getUserMedia (e.g., ensureApiSession). */
  onBeforeStart?: () => Promise<void>;
  /** Called on every dataavailable chunk. */
  onChunk?: (blob: Blob) => void;
  /** Called when recording stops, with the accumulated blob. */
  onStop?: (blob: Blob) => Promise<void>;
  /** Called after stream/recorder teardown (per-stop, not unmount). */
  onCleanup?: () => void;
  /** Max recording duration in seconds (0 = unlimited). */
  maxDurationSeconds?: number;
  /** Show a toast when max duration is approaching (seconds left). */
  warnAtSecondsLeft?: number;
  /** Prevent browser tab-close during active recording. */
  blockNavigation?: boolean;
  /** Silences the "Couldn't access microphone" toast (caller shows own). */
  silentMicError?: boolean;
}

export interface RecorderHandle {
  isRecording: ReturnType<typeof useSignal<boolean>>;
  recordingTime: ReturnType<typeof useSignal<number>>;
  isProcessing: ReturnType<typeof useSignal<boolean>>;
  showTimeWarning: ReturnType<typeof useSignal<boolean>>;
  /** Ref to the live MediaStream (for silence analysis, etc.). */
  streamRef: ReturnType<typeof useRef<MediaStream | null>>;
  /** Ref to the MediaRecorder (for mime type, error handlers). */
  mediaRecorderRef: ReturnType<typeof useRef<MediaRecorder | null>>;
  /** Ref to accumulated audio chunks (for mid-recording flushes). */
  chunksRef: ReturnType<typeof useRef<Blob[]>>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  /** Full teardown — stops stream tracks, closes recorder. */
  cleanup: () => void;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Turn a getUserMedia (or onBeforeStart) rejection into something the user
 * can act on — "grant permission", "close the other app", and "you're
 * offline" are three very different problems.
 */
export function describeMicError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access was denied — allow it in your browser settings.";
      case "NotFoundError":
        return "No microphone found. Plug one in or check your input settings.";
      case "NotReadableError":
        return "Your microphone is busy in another app. Close it and try again.";
    }
  }
  // onBeforeStart failures (auth ping, network) carry their own message.
  if (err instanceof Error && err.message && !(err instanceof TypeError)) {
    return err.message;
  }
  return "Couldn't access microphone. Check permissions.";
}

export function useRecorder(opts: RecorderOptions = {}): RecorderHandle {
  const {
    audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    timesliceMs = 1000,
    mimeTypes = ["audio/webm", "audio/ogg", "audio/mp4", ""],
    onBeforeStart,
    onChunk,
    onStop,
    onCleanup,
    maxDurationSeconds = 0,
    warnAtSecondsLeft = 30,
    blockNavigation = false,
    silentMicError = false,
  } = opts;

  const isRecording = useSignal(false);
  const recordingTime = useSignal(0);
  const isProcessing = useSignal(false);
  const showTimeWarning = useSignal(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const isStartingRecording = useRef(false);
  const silenced = useRef(false); // track if we've already shown the warning

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanupMedia() {
    clearTimer();
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    onCleanup?.();
  }

  async function startRecording(): Promise<void> {
    if (
      isRecording.value || mediaRecorderRef.current ||
      isStartingRecording.current
    ) return;

    isStartingRecording.current = true;
    try {
      await onBeforeStart?.();
      if (!isStartingRecording.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      if (!isStartingRecording.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // Pick best supported MIME type
      let mimeType = "";
      for (const candidate of mimeTypes) {
        if (!candidate || MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }
      const recorderOpts: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOpts);
      if (!isStartingRecording.current) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          onChunk?.(e.data);
        }
      };

      recorder.start(timesliceMs);

      isRecording.value = true;
      recordingTime.value = 0;
      showTimeWarning.value = false;
      silenced.current = false;
      isStartingRecording.current = false;

      timerRef.current = setInterval(() => {
        recordingTime.value++;
        const remaining = maxDurationSeconds
          ? maxDurationSeconds - recordingTime.value
          : Infinity;
        if (
          warnAtSecondsLeft > 0 && remaining <= warnAtSecondsLeft &&
          !showTimeWarning.value && maxDurationSeconds > 0
        ) {
          showTimeWarning.value = true;
        }
        if (
          maxDurationSeconds > 0 && recordingTime.value >= maxDurationSeconds
        ) {
          stopRecording();
        }
      }, 1000) as unknown as number;
    } catch (err) {
      isStartingRecording.current = false;
      console.error("useRecorder start failed:", err);
      if (!silentMicError) {
        showToast(describeMicError(err), "error");
      }
    }
  }

  async function stopRecording(): Promise<void> {
    isStartingRecording.current = false;
    clearTimer();
    if (!mediaRecorderRef.current || !isRecording.value) return;

    isProcessing.value = true;
    isRecording.value = false;

    const recorder = mediaRecorderRef.current;
    if (recorder.state !== "inactive") {
      await Promise.race([
        new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          recorder.stop();
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }

    const blob = new Blob(chunksRef.current, {
      type: recorder.mimeType || "audio/webm",
    });
    chunksRef.current = [];

    try {
      await onStop?.(blob);
    } catch (err) {
      console.error("useRecorder onStop failed:", err);
    } finally {
      cleanupMedia();
      isProcessing.value = false;
    }
  }

  function cleanup(): void {
    isStartingRecording.current = false;
    clearTimer();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  }

  // Teardown on unmount — even if component unmounts during recording.
  useEffect(() => {
    return () => cleanup();
  }, []);

  // Block tab-close during active recording.
  useEffect(() => {
    if (!IS_BROWSER || !blockNavigation) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (isRecording.value) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRecording.value]);

  return {
    isRecording,
    recordingTime,
    isProcessing,
    showTimeWarning,
    streamRef,
    mediaRecorderRef,
    chunksRef,
    startRecording,
    stopRecording,
    cleanup,
  };
}
