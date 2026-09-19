import { signal, useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  conversationData,
  processingConversation,
} from "@signals/conversationStore.ts";
import { resetModules } from "@signals/moduleStore.ts";
import { ensureApiSession } from "../utils/apiAuth.ts";
import { enqueueApiRequest } from "../utils/requestQueue.ts";
import { coerceFlowResult } from "../utils/coerceFlowResult.ts";
import { soundBloom } from "@utils/sound.ts";
import AudioVisualizer from "./AudioVisualizer.tsx";
import { showErrorToast, showToast } from "../utils/toast.ts";
import { formatTime } from "./useRecorder.ts";
import {
  createDeepgramLiveClient,
  type DeepgramLiveClient,
} from "../utils/deepgramLive.ts";
import { t } from "../utils/i18n.ts";

// Module-level so pasted text survives the hero unmounting during processing
// (an error remounts the hero — losing the paste would sting).
const textInput = signal("");
// Same reason, for the FIRST recording. The append path persists every take to
// IndexedDB before the AI runs ("the audio must survive a failed AI pipeline")
// — but the first one had no such net: it was POSTed straight from memory, so
// a failed process meant the recording was simply gone and the only option was
// to say the whole thing again.
const pendingAudio = signal<Blob | null>(null);

export default function UploadIsland() {
  const i18n = t();
  const isProcessing = processingConversation;
  const isRecording = useSignal(false);
  const recordingTime = useSignal(0);
  const showTimeWarning = useSignal(false);
  const lastUploadName = useSignal("");
  const selectedFile = useSignal<File | null>(null);
  const isDragActive = useSignal(false);

  // Live Deepgram transcription signals
  const liveTranscript = useSignal("");
  const liveInterim = useSignal("");
  const isLiveConnected = useSignal(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamBoxRef = useRef<HTMLDivElement | null>(null);
  const deepgramClientRef = useRef<DeepgramLiveClient | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  const MAX_RECORDING_TIME = 10 * 60;
  const WARNING_TIME = 30;

  const timeRemaining = useComputed(() =>
    MAX_RECORDING_TIME - recordingTime.value
  );
  const hasText = useComputed(() => textInput.value.trim().length > 0);
  const primaryLabel = useComputed(() => {
    if (isRecording.value) return i18n.btnStopAndMap;
    if (hasText.value) return i18n.btnMapIt;
    if (selectedFile.value) return i18n.btnMapAudio;
    if (pendingAudio.value) return i18n.btnTryAgain;
    return i18n.btnStartRecording;
  });
  const primaryDisabled = useComputed(() =>
    isProcessing.value && !isRecording.value
  );

  // Auto-scroll the live stream box as words come in
  useEffect(() => {
    if (streamBoxRef.current && (liveTranscript.value || liveInterim.value)) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [liveTranscript.value, liveInterim.value]);

  async function startRecording() {
    if (deepgramClientRef.current) {
      deepgramClientRef.current.disconnect();
      deepgramClientRef.current = null;
    }
    cleanup();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "",
      ];
      let mediaRecorderOptions: MediaRecorderOptions | undefined;

      for (const mimeType of mimeTypes) {
        if (!mimeType || MediaRecorder.isTypeSupported(mimeType)) {
          mediaRecorderOptions = mimeType ? { mimeType } : undefined;
          break;
        }
      }

      // Initialize Deepgram live streaming client
      const liveClient = createDeepgramLiveClient();
      deepgramClientRef.current = liveClient;
      liveTranscript.value = "";
      liveInterim.value = "";
      isLiveConnected.value = false;

      // Subscribe to live client state updates
      const unsubTranscript = liveClient.state.transcript.subscribe((val) => {
        liveTranscript.value = val;
      });
      const unsubInterim = liveClient.state.interim.subscribe((val) => {
        liveInterim.value = val;
      });
      const unsubConnected = liveClient.state.connected.subscribe((val) => {
        isLiveConnected.value = val;
      });
      unsubsRef.current = [unsubTranscript, unsubInterim, unsubConnected];

      // Start Deepgram live connection in background
      liveClient.connect().catch((err) => {
        console.warn("Live transcription fallback to batch:", err);
      });

      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          liveClient.send(event.data);
        }
      };

      try {
        if (
          audioContextRef.current && audioContextRef.current.state !== "closed"
        ) {
          audioContextRef.current.close();
        }
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

      // Stream chunks every 250ms for snappy live display
      mediaRecorder.start(250);
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
      showToast(i18n.micError, "error");
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      mediaRecorderRef.current = null;

      mediaRecorder.onstop = async () => {
        let finalLiveText = "";
        const client = deepgramClientRef.current;
        const wasConnected = isLiveConnected.value;
        const hadError = client ? client.state.error.value !== null : false;

        if (client) {
          try {
            finalLiveText = await client.finish(1200);
          } catch (e) {
            console.warn("Error finalizing live stream:", e);
          } finally {
            client.disconnect();
            if (deepgramClientRef.current === client) {
              deepgramClientRef.current = null;
            }
          }
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        // If we captured live transcript words AND client was healthy throughout, process directly via text for instant mapping!
        // If connection dropped mid-way or errored, fall back to the full recorded audio blob so no words are lost.
        if (
          wasConnected && !hadError && finalLiveText &&
          finalLiveText.trim().length > 0
        ) {
          await processLiveTranscript(finalLiveText.trim(), audioBlob);
        } else if (audioBlob.size > 0) {
          await processRecordedAudio(audioBlob);
        } else {
          showToast(i18n.noSpeechWarning, "warning");
        }
        resolve();
      };

      mediaRecorder.stop();
      cleanup();
    });
  }

  function cancelRecording() {
    if (deepgramClientRef.current) {
      deepgramClientRef.current.disconnect();
      deepgramClientRef.current = null;
    }
    liveTranscript.value = "";
    liveInterim.value = "";
    isLiveConnected.value = false;
    audioChunksRef.current = [];
    cleanup();
    showToast(i18n.cancelledToast, "info");
  }

  function cleanup() {
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
    unsubsRef.current.forEach((fn) => fn());
    unsubsRef.current = [];
  }

  async function processLiveTranscript(text: string, audioBlob?: Blob) {
    if (isProcessing.value) return;
    isProcessing.value = true;
    if (audioBlob) pendingAudio.value = audioBlob;

    try {
      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
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

      // If no speech/topics came out of the text
      if (!flowResult.transcript?.text && flowResult.nodes.length === 0) {
        showToast(i18n.noSpeechWarning, "warning");
        pendingAudio.value = null;
        return;
      }

      resetModules();
      conversationData.value = flowResult;
      pendingAudio.value = null;
      liveTranscript.value = "";
      liveInterim.value = "";

      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      showToast(
        i18n.mappedSuccess(
          flowResult.actionItems.length,
          flowResult.nodes.length,
        ),
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing live transcript:", error);
      showErrorToast(error, i18n.processFailed);
    } finally {
      isProcessing.value = false;
    }
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

      // Check if it was empty / silence
      if (!flowResult.transcript?.text && flowResult.nodes.length === 0) {
        showToast(i18n.noSpeechWarning, "warning");
        pendingAudio.value = null;
        return;
      }

      resetModules();
      conversationData.value = flowResult;
      pendingAudio.value = null; // it landed — the net can let go
      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      showToast(
        i18n.mappedSuccess(
          flowResult.actionItems.length,
          flowResult.nodes.length,
        ),
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing audio:", error);
      showErrorToast(error, i18n.processFailed);
    } finally {
      isProcessing.value = false;
    }
  }

  async function handleTextSubmit() {
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
      resetModules();
      conversationData.value = flowResult;
      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      textInput.value = "";
      showToast(
        i18n.mappedSuccess(
          flowResult.actionItems.length,
          flowResult.nodes.length,
        ),
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing text:", error);
      showErrorToast(error, i18n.processFailed);
    } finally {
      isProcessing.value = false;
    }
  }

  const TEXT_FILE = /\.(txt|md|markdown|srt|vtt)$/i;

  const stageFile = (file: File) => {
    isDragActive.value = false;
    if (file.type === "application/pdf") {
      showToast(i18n.pdfWarning, "warning");
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
      showToast(i18n.unsupportedFile, "warning");
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

      if (!flowResult.transcript?.text && flowResult.nodes.length === 0) {
        showToast(i18n.noSpeechInFile, "warning");
        return;
      }

      resetModules();
      conversationData.value = flowResult;
      if (flowResult.warnings.length) {
        for (const warning of flowResult.warnings) {
          showToast(warning, "warning");
        }
      }
      soundBloom();
      lastUploadName.value = file.name;
      showToast(
        i18n.mappedSuccess(
          flowResult.actionItems.length,
          flowResult.nodes.length,
        ),
        "success",
      );
    } catch (error) {
      console.error("❌ Error processing audio:", error);
      showErrorToast(error, i18n.processFailed);
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

  useEffect(() => {
    return () => {
      cleanup();
      if (deepgramClientRef.current) {
        deepgramClientRef.current.disconnect();
        deepgramClientRef.current = null;
      }
    };
  }, []);

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
              <div class="mapper-record-visual" aria-live="polite">
                <div class="mapper-record-header">
                  <div class="mapper-record-status-group">
                    <span class="mapper-record-dot" aria-hidden="true"></span>
                    <span class="mapper-record-label">
                      {isLiveConnected.value
                        ? i18n.listeningLive
                        : i18n.listening}
                    </span>
                    <span class="mapper-record-timer">
                      {formatTime(recordingTime.value)}
                    </span>
                    {isLiveConnected.value && (
                      <span
                        class="mapper-live-pill"
                        title="Live text stream active"
                      >
                        {i18n.livePill}
                      </span>
                    )}
                  </div>
                  <div class="mapper-record-mini-viz">
                    <AudioVisualizer
                      analyser={analyserRef.current}
                      height="24px"
                    />
                  </div>
                </div>

                <div class="mapper-live-stream-box" ref={streamBoxRef}>
                  {liveTranscript.value || liveInterim.value
                    ? (
                      <div>
                        <span class="mapper-live-final">
                          {liveTranscript.value}
                        </span>
                        {liveInterim.value && (
                          <span class="mapper-live-interim">
                            {liveTranscript.value ? " " : ""}
                            {liveInterim.value}
                          </span>
                        )}
                        <span
                          class="mapper-live-cursor"
                          aria-hidden="true"
                        >
                        </span>
                      </div>
                    )
                    : (
                      <div class="mapper-live-empty-prompt">
                        <span
                          class="mapper-live-empty-icon"
                          aria-hidden="true"
                        >
                          🎙️
                        </span>
                        <span>
                          {i18n.livePrompt}
                        </span>
                      </div>
                    )}
                </div>

                {showTimeWarning.value && (
                  <p class="mapper-record-warning">
                    {i18n.timeWarning}
                  </p>
                )}
              </div>
            )
            : (
              <>
                <div class="mapper-capture-badge-row" aria-hidden="true">
                  <span class="mapper-capture-badge" data-tone="0">
                    {i18n.badgeRecord}
                  </span>
                  <span class="mapper-capture-badge" data-tone="1">
                    {i18n.badgePaste}
                  </span>
                  <span class="mapper-capture-badge" data-tone="2">
                    {i18n.badgeUpload}
                  </span>
                </div>
                <textarea
                  ref={textAreaRef}
                  class="mapper-textarea w-full resize-none"
                  rows={6}
                  placeholder={i18n.dropPrompt}
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
                  <span>{i18n.addFile}</span>
                </button>
              </>
            )}
        </div>

        <div class="mapper-capture-actions">
          {isRecording.value
            ? (
              <div class="mapper-record-actions-row">
                <button
                  type="button"
                  class="mapper-cancel-btn"
                  onClick={cancelRecording}
                >
                  {i18n.btnCancel}
                </button>
                <button
                  class="mapper-slab-button mapper-slab-button--record flex-1"
                  disabled={primaryDisabled.value}
                  onClick={handlePrimaryAction}
                >
                  <i
                    class="fa fa-check"
                    aria-hidden="true"
                    style={{ marginRight: "0.45rem" }}
                  >
                  </i>
                  {i18n.btnStopAndMap}
                </button>
              </div>
            )
            : (
              <>
                <button
                  class="mapper-slab-button mapper-slab-button--record"
                  disabled={primaryDisabled.value}
                  onClick={handlePrimaryAction}
                >
                  {primaryLabel.value === i18n.btnStartRecording && (
                    <i
                      class="fa fa-microphone"
                      aria-hidden="true"
                      style={{ marginRight: "0.45rem" }}
                    >
                    </i>
                  )}
                  {primaryLabel.value}
                </button>

                {lastUploadName.value && !selectedFile.value &&
                  !isRecording.value &&
                  !hasText.value && (
                  <span class="mapper-block-meta">
                    {i18n.lastUpload} {lastUploadName.value}
                  </span>
                )}

                {!lastUploadName.value && !selectedFile.value &&
                  !isRecording.value &&
                  !hasText.value && (
                  <a
                    href="/example"
                    class="mapper-block-meta mapper-example-link"
                  >
                    {i18n.exampleLink}
                  </a>
                )}
              </>
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
