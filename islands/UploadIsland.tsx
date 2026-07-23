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
import { showToast } from "../utils/toast.ts";

// The loaded spring: on desktop the textarea arrives holding a real example,
// one press of "Map it" from the full wow — a cold visitor has nothing to
// paste yet, so we hand them something. Mobile keeps record-first.
const SAMPLE_TEXT =
  "Band practice, Tuesday night. We finally nailed the bridge on Silver Static but the chorus still drags — Mel reckons it wants to sit two bpm faster, I think the drums are just late. Jess is re-recording the chorus stems before Friday so we can A/B both. The Tote gig is locked for the 14th but there's still no poster — Danny knows a screenprinter who owes him a favour, he's chasing it this week. Merch: no shirts, too dear, but yes to stickers — Mel's sketching the octopus design. The van rego is due and nobody wants to pay it, so we're splitting it three ways. Next practice we start the new one, the voice-memo song with the weird 7/8 riff.";

// Module-level so pasted text survives the hero unmounting during processing
// (an error remounts the hero — losing the paste would sting).
const textInput = signal("");
let seededExample = false;

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
  const isSample = useComputed(() => textInput.value === SAMPLE_TEXT);
  const primaryLabel = useComputed(() => {
    if (isRecording.value) return "Stop recording";
    if (hasText.value) return "Map it";
    if (selectedFile.value) return "Map audio";
    return "Start recording";
  });
  const primaryDisabled = useComputed(() =>
    isProcessing.value && !isRecording.value
  );

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        await processRecordedAudio(audioBlob);
        resolve();
      };

      mediaRecorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      cleanup();
    });
  }

  function cleanup() {
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
      showToast(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
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
      showToast(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      isProcessing.value = false;
    }
  }

  const stageFile = (file: File) => {
    selectedFile.value = file;
    textInput.value = "";
    isDragActive.value = false;
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
      showToast(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
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

  // Seed the example once per page load, desktop only (mobile's natural
  // first move is recording — don't bury the mic behind a clear-click).
  useEffect(() => {
    if (seededExample) return;
    seededExample = true;
    if (
      !textInput.value &&
      globalThis.matchMedia?.("(min-width: 768px)").matches
    ) {
      textInput.value = SAMPLE_TEXT;
    }
  }, []);

  useEffect(() => () => cleanup(), []);

  return (
    <div class="mapper-input-lab">
      <section
        class="mapper-capture-block mapper-capture-unified"
        aria-label="Conversation input"
      >
        <div
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
              <div class="mapper-record-visual">
                <div class="mapper-record-visual__top">
                  <div class="mapper-record-label">Recording</div>
                  <div class="mapper-record-time">
                    {formatTime(recordingTime.value)}
                  </div>
                </div>
                <div class="mapper-record-bar">
                  <div
                    style={{
                      width: `${
                        (recordingTime.value / MAX_RECORDING_TIME) * 100
                      }%`,
                      background: showTimeWarning.value
                        ? "var(--status-amber-ink)"
                        : "var(--accent-fill)",
                    }}
                  >
                  </div>
                </div>
                {showTimeWarning.value && (
                  <p class="mapper-record-warning">
                    Auto-stop in {formatTime(timeRemaining.value)} — wrap it up.
                  </p>
                )}
                <div class="mapper-record-visualizer">
                  <AudioVisualizer analyser={analyserRef.current} />
                </div>
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
                  placeholder="Talk it out, paste what you've got, or drop a recording."
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
                  <div class="mapper-input-hint" aria-hidden="true">
                    <div class="mapper-file-chip">
                      <span>{selectedFile.value.name}</span>
                      <button
                        type="button"
                        aria-label="Remove file"
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
                  aria-label="Add an audio file"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <span aria-hidden="true">+</span>
                  <span>audio</span>
                </button>
              </>
            )}
        </div>

        {isSample.value && !isRecording.value && (
          <div class="mapper-sample-note">
            just an example —{" "}
            <button
              type="button"
              onClick={() => {
                textInput.value = "";
                textAreaRef.current?.focus();
              }}
            >
              clear it, use yours
            </button>
          </div>
        )}

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
        </div>
      </section>

      <input
        type="file"
        accept="audio/*"
        ref={fileInputRef}
        onChange={handleAudioUpload}
        style={{ display: "none" }}
      />
    </div>
  );
}
