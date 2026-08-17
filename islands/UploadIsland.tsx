import { signal, useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  conversationData,
  processingConversation,
} from "@signals/conversationStore.ts";
import { ensureApiSession } from "../utils/apiAuth.ts";
import { enqueueApiRequest } from "../utils/requestQueue.ts";
import { coerceFlowResult } from "../utils/coerceFlowResult.ts";
import { soundBloom } from "@utils/sound.ts";
import AudioVisualizer from "./AudioVisualizer.tsx";
import { showErrorToast, showToast } from "../utils/toast.ts";

// Module-level so pasted text survives the hero unmounting during processing
// (an error remounts the hero — losing the paste would sting).
const textInput = signal("");
// Same reason, for the FIRST recording. The append path persists every take to
// IndexedDB before the AI runs ("the audio must survive a failed AI pipeline")
// — but the first one had no such net: it was POSTed straight from memory, so
// a failed process meant the recording was simply gone and the only option was
// to say the whole thing again. IndexedDB isn't usable here (StoredRecording
// needs a conversationId that doesn't exist yet), so the blob is latched until
// a process actually succeeds.
const pendingAudio = signal<Blob | null>(null);

export default function UploadIsland() {
  const isProcessing = processingConversation;
  const isRecording = useSignal(false);
  const recordingTime = useSignal(0);
  const showTimeWarning = useSignal(false);
  const lastUploadName = useSignal("");
  const selectedFile = useSignal<File | null>(null);
  const isDragActive = useSignal(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const MAX_RECORDING_TIME = 10 * 60;
  const WARNING_TIME = 30;

  const timeRemaining = useComputed(() =>
    MAX_RECORDING_TIME - recordingTime.value
  );
  const hasText = useComputed(() => textInput.value.trim().length > 0);
  const primaryLabel = useComputed(() => {
    if (isRecording.value) return "Stop recording";
    if (hasText.value) return "Map it";
    if (selectedFile.value) return "Map audio";
    if (pendingAudio.value) return "Try that again";
    return "Start recording";
  });
  const primaryDisabled = useComputed(() =>
    isProcessing.value && !isRecording.value
  );

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeTypes = ["audio/webm", "audio/ogg", "audio/mp4", ""];
      let mediaRecorderOptions: MediaRecorderOptions | undefined;

      for (const mimeType of mimeTypes) {
        if (!mimeType || MediaRecorder.isTypeSupported(mimeType)) {
          mediaRecorderOptions = mimeType ? { mimeType } : undefined;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      try {
        if (
          audioContextRef.current && audioContextRef.current.state !== "closed"
        ) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        const AudioContext = (window as any).AudioContext ||
          (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
      } catch (error) {
        console.warn("Failed to initialize Web Audio API:", error);
      }

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      streamRef.current = stream;
      isRecording.value = true;
      recordingTime.value = 0;
      showTimeWarning.value = false;

      recordingTimerRef.current = setInterval(() => {
        recordingTime.value++;

        if (timeRemaining.value <= WARNING_TIME && !showTimeWarning.value) {
          showTimeWarning.value = true;
        }

        if (recordingTime.value >= MAX_RECORDING_TIME) {
          stopRecording();
        }
      }, 1000) as unknown as number;
    } catch (error) {
      console.error("Error starting recording:", error);
      showToast(
        "Could not access microphone. Please grant permission and try again.",
        "error",
      );
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      // Detach from the ref BEFORE cleanup(): the stop event arrives on a
      // LATER task, and cleanup nulls .onstop on whatever the ref points to —
      // stripping the handler synchronously silently dropped the whole
      // recording (rex audit, July 23).
      mediaRecorderRef.current = null;

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        await processRecordedAudio(audioBlob);
        resolve();
      };

      mediaRecorder.stop();
      cleanup();
    });
  }

  function cleanup() {
    // Every recording exit path (manual stop, 10-min auto-stop, unmount)
    // funnels here — the flag must reset HERE or an error remounts the hero
    // stuck in a dead "listening…" state with no way back (rex audit).
    isRecording.value = false;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }

  async function processRecordedAudio(audioBlob: Blob) {
    if (isProcessing.value) return; // guard double-submit
    isProcessing.value = true;
    pendingAudio.value = audioBlob;

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
          signal,
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("❌ API error:", error);
          throw new Error(error.error || "Processing failed");
        }

        return response.json();
      });

      const flowResult = coerceFlowResult(result);
      if (!flowResult) {
        throw new Error("Server returned an unexpected response — try again.");
      }
      conversationData.value = flowResult;
      pendingAudio.value = null; // it landed — the net can let go
      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      showToast(
        `Processed! Found ${flowResult.actionItems.length} action items, ${flowResult.nodes.length} topics`,
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing audio:", error);
      showErrorToast(error, "That didn't go through — give it another go.");
    } finally {
      isProcessing.value = false;
    }
  }

  async function handleTextSubmit() {
    // Guard re-entry: a double-click would otherwise fire a second request
    // (often empty after the first clears the input → "No text provided").
    if (!hasText.value || isProcessing.value) return;

    isProcessing.value = true;

    try {
      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textInput.value }),
          signal,
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("❌ API error:", error);
          throw new Error(error.error || "Processing failed");
        }

        return response.json();
      });
      const flowResult = coerceFlowResult(result);
      if (!flowResult) {
        throw new Error("Server returned an unexpected response — try again.");
      }
      conversationData.value = flowResult;
      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      textInput.value = "";
      showToast(
        `Processed! Found ${flowResult.actionItems.length} action items, ${flowResult.nodes.length} topics`,
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing text:", error);
      showErrorToast(error, "That didn't go through — give it another go.");
    } finally {
      isProcessing.value = false;
    }
  }

  // Not just audio: text-ish files (notes, transcripts, subtitles) pour
  // straight into the textarea — one press of Map it from there. PDFs get
  // an honest no rather than a silent shrug.
  const TEXT_FILE = /\.(txt|md|markdown|srt|vtt)$/i;

  const stageFile = (file: File) => {
    isDragActive.value = false;
    if (file.type === "application/pdf") {
      showToast(
        "PDFs can't come in yet — audio or text files for now.",
        "warning",
      );
      return;
    }
    if (file.type.startsWith("text/") || TEXT_FILE.test(file.name)) {
      file.text().then((content) => {
        textInput.value = content;
        selectedFile.value = null;
      });
      return;
    }
    if (!file.type.startsWith("audio/")) {
      showToast(
        "That file type isn't supported yet — audio or text files for now.",
        "warning",
      );
      return;
    }
    selectedFile.value = file;
    textInput.value = "";
  };

  const handleAudioUpload = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    stageFile(file);
    input.value = "";
  };

  async function processAudioFile(file: File) {
    if (isProcessing.value) return; // guard double-submit
    isProcessing.value = true;

    try {
      const formData = new FormData();
      formData.append("audio", file);

      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
          signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Processing failed");
        }

        return response.json();
      });
      const flowResult = coerceFlowResult(result);
      if (!flowResult) {
        throw new Error("Server returned an unexpected response — try again.");
      }
      conversationData.value = flowResult;
      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      lastUploadName.value = file.name;
      showToast(
        `Processed! Found ${flowResult.actionItems.length} action items, ${flowResult.nodes.length} topics`,
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing audio:", error);
      showErrorToast(error, "That didn't go through — give it another go.");
    } finally {
      isProcessing.value = false;
      selectedFile.value = null;
    }
  }

  const handlePrimaryAction = async () => {
    if (isRecording.value) {
      await stopRecording();
      return;
    }

    if (hasText.value) {
      await handleTextSubmit();
      return;
    }

    if (selectedFile.value) {
      await processAudioFile(selectedFile.value);
      return;
    }

    // A recording that never made it through — send the same blob rather than
    // asking them to say it all again.
    if (pendingAudio.value) {
      await processRecordedAudio(pendingAudio.value);
      return;
    }

    if (!isProcessing.value) {
      await startRecording();
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    isDragActive.value = true;
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    if (
      !(event.currentTarget as HTMLElement).contains(
        event.relatedTarget as Node,
      )
    ) {
      isDragActive.value = false;
    }
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    isDragActive.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      stageFile(file);
    }
  };

  const clearSelectedFile = () => {
    selectedFile.value = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => () => cleanup(), []);

  return (
    <div class="mapper-input-lab">
      <section
        class="mapper-capture-block mapper-capture-unified"
        aria-label="Conversation input"
      >
        <div
          data-dropzone
          class={`mapper-unified-input${isDragActive.value ? " is-drop" : ""}${
            selectedFile.value ? " has-file" : ""
          }${isRecording.value ? " is-recording" : ""}`}
          onDragOver={isRecording.value ? undefined : handleDragOver}
          onDragEnter={isRecording.value ? undefined : handleDragOver}
          onDragLeave={isRecording.value ? undefined : handleDragLeave}
          onDrop={isRecording.value ? undefined : handleDrop}
          onClick={() => !isRecording.value && textAreaRef.current?.focus()}
        >
          {isRecording.value
            ? (
              // No timer, no progress bar — numbers make it a stopwatch. A
              // breathing dot, a soft word, and the bars dancing to your
              // voice. Words-only nudge near the ten-minute auto-stop.
              // aria-live on the wrapper (which mounts when recording starts)
              // so the ten-minute nudge below is actually SPOKEN when it
              // appears — it was a silent visual-only warning. "listening…"
              // itself is covered by the button relabelling to "Stop
              // recording" under the user's own focus.
              <div class="mapper-record-visual" aria-live="polite">
                <div class="mapper-record-visual__top">
                  <span class="mapper-record-dot" aria-hidden="true"></span>
                  <div class="mapper-record-label">listening…</div>
                </div>
                <div class="mapper-record-visualizer">
                  <AudioVisualizer analyser={analyserRef.current} />
                </div>
                {showTimeWarning.value && (
                  <p class="mapper-record-warning">
                    coming up on ten minutes — wrap it up soon.
                  </p>
                )}
              </div>
            )
            : (
              <>
                <div class="mapper-capture-badge-row" aria-hidden="true">
                  <span class="mapper-capture-badge" data-tone="0">
                    record
                  </span>
                  <span class="mapper-capture-badge" data-tone="1">
                    paste
                  </span>
                  <span class="mapper-capture-badge" data-tone="2">
                    upload
                  </span>
                </div>
                <textarea
                  ref={textAreaRef}
                  class="mapper-textarea w-full resize-none"
                  rows={6}
                  placeholder="Talk it out, catch it live, or drop in what you've got."
                  aria-label="Conversation content or transcription input"
                  value={textInput.value}
                  onInput={(e) => {
                    textInput.value = (e.target as HTMLTextAreaElement).value;
                    if (selectedFile.value) {
                      selectedFile.value = null;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      (e.ctrlKey || e.metaKey) && e.key === "Enter" &&
                      hasText.value
                    ) {
                      e.preventDefault();
                      handleTextSubmit();
                    }
                  }}
                  onFocus={() => isDragActive.value = false}
                />

                {selectedFile.value && (
                  // NOT aria-hidden: this used to hide the whole chip from
                  // assistive tech — so the staged filename was never
                  // announced AND its Remove button stayed keyboard-focusable
                  // inside a hidden subtree (the classic aria-hidden trap: a
                  // tab stop that reads as nothing). role=status announces the
                  // staged file the moment it lands.
                  <div class="mapper-input-hint" role="status">
                    <div class="mapper-file-chip">
                      <span>{selectedFile.value.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${selectedFile.value.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          clearSelectedFile();
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  class="mapper-clip-btn"
                  aria-label="Add a file"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <span aria-hidden="true">+</span>
                  <span>file</span>
                </button>
              </>
            )}
        </div>

        <div class="mapper-capture-actions">
          <button
            class="mapper-slab-button mapper-slab-button--record"
            disabled={primaryDisabled.value}
            onClick={handlePrimaryAction}
          >
            {primaryLabel.value === "Start recording" && (
              <i
                class="fa fa-microphone"
                aria-hidden="true"
                style={{ marginRight: "0.45rem" }}
              >
              </i>
            )}
            {primaryLabel.value}
          </button>

          {lastUploadName.value && !selectedFile.value && !isRecording.value &&
            !hasText.value && (
            <span class="mapper-block-meta">Last: {lastUploadName.value}</span>
          )}

          {
            /* The cold-start half of the hero: it asks for effort before showing
              anything, so offer the finished thing too. Plain anchor — works
              with JS off, and it's a navigation, not an action. */
          }
          {!lastUploadName.value && !selectedFile.value && !isRecording.value &&
            !hasText.value && (
            <a href="/example" class="mapper-block-meta mapper-example-link">
              or open one someone already made
            </a>
          )}
        </div>
      </section>

      <input
        type="file"
        accept="audio/*,.txt,.md,.markdown,.srt,.vtt,text/plain,text/markdown"
        ref={fileInputRef}
        onChange={handleAudioUpload}
        style={{ display: "none" }}
      />
    </div>
  );
}
