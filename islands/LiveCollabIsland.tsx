/**
 * @deprecated LiveCollaboration Island — NOT currently wired to any route.
 *
 * /live/[roomId] renders <HomeIsland /> which contains its own live-mode
 * recording, voice, and whiteboard logic. This island was the intended
 * three-pane meeting-room UI but was superseded by the consolidated
 * HomeIsland approach. Kept for reference; future meeting-room Phase 3
 * work may revive it as the dedicated room view.
 *
 * To re-activate: swap /routes/live/[roomId].tsx to render this instead
 * of HomeIsland, then reconcile the duplicate recording/voice/whiteboard
 * code between the two files.
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import {
  conversationData,
  isViewingShared,
} from "@signals/conversationStore.ts";
import {
  connectedRoomId,
  partyConnected,
} from "@signals/partyConnectionStore.ts";
import {
  getLocalIdentity,
  remoteUsers,
  setLocalIdentity,
} from "@signals/presenceStore.ts";
import { buildAvatar } from "@utils/avatar.ts";
import { startLiveSync, stopLiveSync } from "@signals/liveSync.ts";
import { sendRename, sendWhiteboardUpdate } from "@signals/partyService.ts";
import { showToast } from "@utils/toast.ts";
import { soundBloom, soundChime, soundPortal } from "@utils/sound.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import DashboardIsland from "./DashboardIsland.tsx";
import ChatSidebar from "./ChatSidebar.tsx";
import VoicePanel from "./VoicePanel.tsx";
import SharedWhiteboard from "./SharedWhiteboard.tsx";
import Modal from "../components/Modal.tsx";

interface LiveCollabIslandProps {
  roomId: string;
  partyHost: string;
}

const CHUNK_INTERVAL_MS = 15_000;

export default function LiveCollabIsland(
  { roomId, partyHost }: LiveCollabIslandProps,
) {
  const seenIds = useRef<Set<string> | null>(null);
  const showNameModal = useSignal(false);
  const nameModalValue = useSignal("");

  // Recording state
  const isRecording = useSignal(false);
  const recordingTime = useSignal(0);
  const isProcessing = useSignal(false);
  const liveTranscript = useSignal<string[]>([]);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<number | null>(null);

  // Whiteboard ref — for pushing remote scene updates from PartyKit
  const whiteboardContainerRef = useRef<HTMLDivElement | null>(null);

  // AI drawing state
  const isAiDrawing = useSignal(false);

  function handleSceneChange(scene: string) {
    sendWhiteboardUpdate(scene);
  }

  // Push a remote whiteboard scene into the Excalidraw instance
  function applyRemoteWhiteboard(scene: string) {
    const el = whiteboardContainerRef.current as
      | (HTMLElement & {
        excalidrawAPI?: {
          updateScene(opts: {
            elements: unknown[];
            appState: unknown;
            commitToHistory?: boolean;
          }): void;
        };
      })
      | null;
    if (!el?.excalidrawAPI) return;
    try {
      const { elements, appState } = JSON.parse(scene);
      el.excalidrawAPI.updateScene({
        elements,
        appState,
        commitToHistory: false,
      });
    } catch { /* malformed scene */ }
  }

  // Phase 2c: Ask the AI to draw on the whiteboard based on the current
  // transcript + scene.
  async function requestAiDraw() {
    if (isAiDrawing.value) return;
    const el = whiteboardContainerRef.current as
      | (HTMLElement & {
        excalidrawAPI?: { getSceneElements?: () => unknown[] };
      })
      | null;
    const sceneElements = el?.excalidrawAPI?.getSceneElements;
    if (!sceneElements) {
      showToast("Whiteboard not ready yet", "error");
      return;
    }

    const transcript = liveTranscript.value.join("\n").trim();
    if (!transcript) {
      showToast("No transcript to work from. Start recording first.", "error");
      return;
    }

    isAiDrawing.value = true;
    try {
      await ensureApiSession();
      const elements = sceneElements();
      const topicLabels = conversationData.value?.nodes
        ?.map((n: { label?: string }) => n.label)
        .filter(Boolean) ?? [];
      const res = await fetch("/api/live/whiteboard-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements, transcript, topicLabels }),
      });
      if (!res.ok) {
        showToast("AI couldn't draw right now", "error");
        return;
      }
      const { elements: updated } = await res.json();
      if (updated && Array.isArray(updated)) {
        // Apply locally
        (el as HTMLElement & {
          excalidrawAPI?: { updateScene(opts: unknown): void };
        })
          .excalidrawAPI
          ?.updateScene({ elements: updated, commitToHistory: false });
        // Broadcast to peers
        sendWhiteboardUpdate(JSON.stringify({
          elements: updated,
          appState: {},
        }));
        showToast("AI updated the whiteboard", "info");
      }
    } catch (err) {
      console.error("AI draw failed:", err);
      showToast("AI couldn't draw right now", "error");
    } finally {
      isAiDrawing.value = false;
    }
  }

  useEffect(() => {
    if (!IS_BROWSER || !partyHost) return;
    isViewingShared.value = true;
    startLiveSync({
      host: partyHost,
      roomId,
      avatar: getLocalIdentity(),
    }, {
      onWhiteboardUpdate: applyRemoteWhiteboard,
    });
    return () => {
      stopLiveSync();
      isViewingShared.value = false;
      conversationData.value = null;
      seenIds.current = null;
      stopRecording();
    };
  }, [roomId, partyHost]);

  const connected = partyConnected.value && connectedRoomId.value === roomId;
  const users = remoteUsers.value;
  const hasData = Boolean(conversationData.value);

  useEffect(() => {
    if (!IS_BROWSER) return;
    const current = new Set(users.map((u) => u.id));
    if (seenIds.current === null) {
      seenIds.current = current;
      return;
    }
    for (const u of users) {
      if (!seenIds.current.has(u.id)) {
        showToast(`${u.alias || u.avatar} joined`, "info");
        soundChime();
      }
    }
    for (const id of seenIds.current) {
      if (!current.has(id)) showToast("Someone left", "info");
    }
    seenIds.current = current;
  }, [users]);

  useEffect(() => {
    if (connected) soundPortal();
  }, [connected]);

  function renameSelf() {
    nameModalValue.value = getLocalIdentity();
    showNameModal.value = true;
  }

  // ═══════════════════════════════════════════════════════════════
  // RECORDING
  // ═══════════════════════════════════════════════════════════════

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  async function startRecording() {
    if (!IS_BROWSER) return;
    try {
      await ensureApiSession();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect data every 1s
      isRecording.value = true;
      recordingTime.value = 0;

      timerRef.current = setInterval(() => {
        recordingTime.value++;
      }, 1000) as unknown as number;

      // Send accumulated chunks every CHUNK_INTERVAL_MS
      chunkTimerRef.current = setInterval(() => {
        sendChunk();
      }, CHUNK_INTERVAL_MS) as unknown as number;

      showToast("Recording — live transcript starting…", "info");
    } catch (err) {
      console.error("Failed to start recording:", err);
      showToast("Couldn't access microphone. Check permissions.", "error");
    }
  }

  async function sendChunk() {
    const chunks = chunksRef.current.splice(0);
    if (chunks.length === 0) return;

    isProcessing.value = true;
    try {
      const blob = new Blob(chunks, {
        type: mediaRecorderRef.current?.mimeType || "audio/webm",
      });
      const form = new FormData();
      form.append("audio", blob, "chunk.webm");

      const res = await fetch("/api/live/chunk", {
        method: "POST",
        body: form,
      });

      if (res.ok) {
        const { text } = await res.json();
        liveTranscript.value = [...liveTranscript.value, text].slice(-20);
      }
    } catch (err) {
      console.error("Chunk send failed:", err);
    } finally {
      isProcessing.value = false;
    }
  }

  async function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (
      mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive"
    ) {
      await new Promise<void>((resolve) => {
        mediaRecorderRef.current!.onstop = () => resolve();
        mediaRecorderRef.current!.stop();
      });
    }

    // Send any remaining chunks
    await sendChunk();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    isRecording.value = false;
    recordingTime.value = 0;

    if (liveTranscript.value.length > 0) {
      soundBloom();
    }
  }

  return (
    <div>
      {/* Live bar */}
      <header
        class="app-header-glass flex items-center justify-between gap-3"
        style={{
          borderBottom: "2px solid var(--color-border)",
          padding: "0.75rem var(--card-padding)",
        }}
      >
        <div class="flex items-center gap-2 min-w-0">
          <a
            href="/"
            style={{ fontWeight: "800", color: "var(--color-text)" }}
            class="shrink-0"
          >
            ProMapper
          </a>
          <span
            class="inline-flex items-center gap-1.5 shrink-0"
            style={{
              fontSize: "var(--tiny-size)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span
              aria-hidden="true"
              class="live-status-dot"
              style={{
                background: connected ? "#52A37F" : "var(--color-border)",
              }}
            />
            <span class="sr-only">
              {connected ? "Connected" : partyHost ? "Connecting" : "Offline"}
            </span>
            {connected
              ? `Live · ${users.length} here`
              : partyHost
              ? "Connecting…"
              : "Live collab not configured"}
          </span>
        </div>

        <div class="flex items-center gap-2">
          {/* Recording controls */}
          <button
            onClick={isRecording.value ? stopRecording : startRecording}
            disabled={isProcessing.value && isRecording.value}
            class={`header-icon-btn${isRecording.value ? " is-recording" : ""}`}
            data-tip={isRecording.value ? "Stop recording" : "Record meeting"}
            aria-label={isRecording.value ? "Stop recording" : "Record meeting"}
          >
            <i
              class={`fa ${isRecording.value ? "fa-stop" : "fa-microphone"}`}
              aria-hidden="true"
            />
            {isRecording.value && (
              <span
                style={{
                  fontSize: "var(--tiny-size)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatTime(recordingTime.value)}
              </span>
            )}
          </button>

          {/* Collaborator avatars */}
          <div class="flex items-center -space-x-2">
            {users.slice(0, 6).map((u) => (
              <img
                key={u.id}
                src={buildAvatar(u.id)}
                alt={u.alias || u.avatar}
                title={u.alias || u.avatar}
                width={28}
                height={28}
                class="live-avatar"
              />
            ))}
          </div>

          <button
            onClick={renameSelf}
            class="action-header-btn live-rename-btn"
            title="Change your display name"
            aria-label="Change your display name"
          >
            ✎ Name
          </button>
        </div>
      </header>

      {/* Three-pane layout: voice | dashboard | whiteboard */}
      <div class="live-layout">
        {/* Left pane: Voice controls (show whenever connected) */}
        {connected && (
          <div class="live-layout-sidebar">
            <VoicePanel
              roomId={roomId}
              displayName={getLocalIdentity()}
            />
          </div>
        )}

        {/* Main content: transcript + dashboard */}
        <div class="live-layout-main">
          {/* Live transcript stream */}
          {isRecording.value && liveTranscript.value.length > 0 && (
            <div
              style={{
                padding: "var(--card-padding)",
                borderBottom: "2px solid var(--color-border)",
                background: "var(--surface-cream-dark)",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              <p
                style={{
                  fontSize: "var(--tiny-size)",
                  fontWeight: 700,
                  color: "var(--color-accent)",
                  marginBottom: "0.5rem",
                }}
              >
                ● Live transcript
              </p>
              {liveTranscript.value.map((chunk, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: "var(--small-size)",
                    color: "var(--color-text)",
                    marginBottom: "0.5rem",
                    lineHeight: 1.5,
                    padding: "0.25rem 0.5rem",
                    borderLeft: "3px solid var(--color-accent)",
                    opacity: i < liveTranscript.value.length - 1 ? 0.6 : 1,
                  }}
                >
                  {chunk}
                </p>
              ))}
            </div>
          )}

          {/* Dashboard (or waiting state) */}
          <div style={{ padding: "var(--card-padding)" }}>
            {hasData
              ? (
                <>
                  <DashboardIsland />
                  {/* Whiteboard card — shows when connected */}
                  {connected && (
                    <div
                      ref={whiteboardContainerRef}
                      style={{ marginTop: "var(--card-padding)" }}
                    >
                      <div class="whiteboard-toolbar">
                        <span
                          style={{
                            fontSize: "var(--tiny-size)",
                            fontWeight: 700,
                            color: "var(--color-text)",
                          }}
                        >
                          Whiteboard
                        </span>
                        <button
                          onClick={requestAiDraw}
                          disabled={isAiDrawing.value}
                          class="btn btn--secondary"
                          style={{
                            fontSize: "var(--tiny-size)",
                            padding: "0.2rem 0.6rem",
                          }}
                        >
                          {isAiDrawing.value ? "Drawing…" : "Ask AI to draw"}
                        </button>
                      </div>
                      <SharedWhiteboard
                        roomId={roomId}
                        onSceneChange={handleSceneChange}
                      />
                    </div>
                  )}
                </>
              )
              : (
                <div class="max-w-md mx-auto text-center live-waiting">
                  <div style={{ fontSize: "2rem" }} class="mb-2">🛰️</div>
                  <p style={{ fontWeight: "600", color: "var(--color-text)" }}>
                    Waiting for the conversation…
                  </p>
                  <p style={{ fontSize: "var(--small-size)" }} class="mt-1">
                    Start recording to build the project map live.
                  </p>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* In-session chat (only once connected) */}
      {connected && <ChatSidebar />}

      {/* Display name modal */}
      {showNameModal.value && (
        <Modal
          open
          onClose={() => showNameModal.value = false}
          titleId="display-name-modal-title"
        >
          <div class="modal-stack">
            <h3
              id="display-name-modal-title"
              class="modal-heading"
              style={{ marginBottom: 0 }}
            >
              Your display name
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "var(--small-size)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.5,
              }}
            >
              This is how others see you in the room.
            </p>
            <input
              value={nameModalValue.value}
              onInput={(e) =>
                nameModalValue.value = (e.target as HTMLInputElement).value}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const next = nameModalValue.value.trim();
                  if (next) {
                    setLocalIdentity(next);
                    sendRename(next);
                  }
                  showNameModal.value = false;
                }
              }}
              placeholder="Your name"
              autoFocus
              style={{
                minHeight: "2.75rem",
                border: "2px solid var(--color-border)",
                borderRadius: "8px",
                background: "var(--surface-cream)",
                padding: "0.55rem 0.7rem",
                fontSize: "var(--text-size)",
                color: "var(--color-text)",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <div class="modal-actions">
              <button
                class="btn btn--secondary"
                style={{ flex: 1 }}
                onClick={() => showNameModal.value = false}
                type="button"
              >
                Cancel
              </button>
              <button
                class="btn btn--primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const next = nameModalValue.value.trim();
                  if (next) {
                    setLocalIdentity(next);
                    sendRename(next);
                  }
                  showNameModal.value = false;
                }}
                disabled={!nameModalValue.value.trim()}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
