/**
 * Home Island - Main Layout with Conditional Visibility
 *
 * Shows upload panel + sidebar when NO data
 * Shows only dashboard when data exists
 */

import { IS_BROWSER } from "$fresh/runtime.ts";
import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  canUndo,
  conversationData,
  undoLastMutation,
} from "@signals/conversationStore.ts";
import {
  getActiveConversationId,
  loadConversation,
} from "../core/storage/localStorage.ts";
import { showToast } from "@utils/toast.ts";
import {
  liveSession,
  startLiveMode,
  stopLiveMode,
} from "@signals/liveSessionStore.ts";
import {
  connectedRoomId,
  partyConnected,
} from "@signals/partyConnectionStore.ts";
import { getLocalIdentity, remoteUsers } from "@signals/presenceStore.ts";
import { startLiveSync, stopLiveSync } from "@signals/liveSync.ts";
import { isViewingShared } from "@signals/conversationStore.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { soundBloom, soundChime, soundPortal } from "@utils/sound.ts";
import UploadIsland from "./UploadIsland.tsx";
import DashboardIsland from "./DashboardIsland.tsx";
import MobileHistoryMenu from "./MobileHistoryMenu.tsx";
import ShareButton from "./ShareButton.tsx";
import GoLiveButton from "./GoLiveButton.tsx";
import MarkdownMakerDrawer from "./MarkdownMakerDrawer.tsx";
import AudioRecorder from "./AudioRecorder.tsx";
import ThemeSwitcher from "./ThemeSwitcher.tsx";
import SoundToggle from "./SoundToggle.tsx";
import ShortcutsModal from "../components/ShortcutsModal.tsx";
import AuthModalIsland from "./AuthModalIsland.tsx";
import VoicePanel from "./VoicePanel.tsx";
import { createDemoConversation } from "../utils/demoData.ts";
import LoadingModal from "../components/LoadingModal.tsx";

const drawerOpen = signal(false);
const voiceDrawerOpen = signal(false);
const shortcutsOpen = signal(false);
const demoLoading = signal(false);

const SILENCE_FLUSH_MS = 2_000;
const MAX_CHUNK_MS = 30_000;
const SPEAKING_THRESHOLD = 15; // 0-255 AnalyserNode level

export default function HomeIsland() {
  // Auto-start live mode if arriving via /live/:roomId link
  useEffect(() => {
    if (!IS_BROWSER) return;
    const preset = (globalThis as unknown as {
      __LIVE_ROOM__?: { roomId: string; partyHost: string };
    })
      .__LIVE_ROOM__;
    if (preset?.roomId && preset?.partyHost && !liveSession.value) {
      startLiveMode(preset.roomId, preset.partyHost);
      // Load the shared conversation from the PartyKit room
      conversationData.value = null; // will be set by live sync onInit
    }
  }, []);

  // Restore last conversation on mount
  useEffect(() => {
    // Auto-restore last active conversation from localStorage
    const activeId = getActiveConversationId();
    if (activeId && !conversationData.value) {
      const stored = loadConversation(activeId);
      if (stored) {
        conversationData.value = stored;
        console.log(
          "✅ Restored conversation from localStorage:",
          stored.conversation.title || activeId,
        );
      }
    }
  }, []);

  // Cmd/Ctrl+Z → undo the last destructive map/action-item mutation. Skipped
  // while typing in a field so native text-undo still works there.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey &&
        e.key.toLowerCase() === "z";
      if (!isUndo) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) {
        return;
      }
      if (!canUndo()) return;
      e.preventDefault();
      if (undoLastMutation()) showToast("Undone", "info");
    }
    globalThis.addEventListener("keydown", onKeydown);
    return () => globalThis.removeEventListener("keydown", onKeydown);
  }, []);

  // ? → keyboard shortcuts cheat sheet
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) {
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        shortcutsOpen.value = !shortcutsOpen.value;
      }
    }
    globalThis.addEventListener("keydown", onKeydown);
    return () => globalThis.removeEventListener("keydown", onKeydown);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // LIVE MODE — activates on the current dashboard
  // ═══════════════════════════════════════════════════════════════

  const session = liveSession.value;
  const connected = session
    ? (partyConnected.value && connectedRoomId.value === session.roomId)
    : false;
  const users = remoteUsers.value;
  const seenIds = useRef<Set<string> | null>(null);

  // Live recording state
  const isRecording = signal(false);
  const recordingTime = signal(0);
  const isProcessing = signal(false);
  const liveTranscript = signal<string[]>([]);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Silence-aware refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceMonitorRef = useRef<number | null>(null);
  const lastSpeechRef = useRef<number>(0);
  const chunkStartRef = useRef<number>(0);

  // Start/stop PartyKit live sync when liveSession changes
  useEffect(() => {
    if (!session) {
      stopLiveSync();
      isViewingShared.value = false;
      return;
    }
    isViewingShared.value = true;
    startLiveSync({
      host: session.partyHost,
      roomId: session.roomId,
      avatar: getLocalIdentity(),
    });
    soundPortal();
    return () => {
      stopLiveSync();
      isViewingShared.value = false;
    };
  }, [session?.roomId, session?.partyHost]);

  // Join/leave toasts
  useEffect(() => {
    if (!session) return;
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

  // Recording helpers
  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  async function startRecording() {
    try {
      await ensureApiSession();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      streamRef.current = stream;

      // Set up silence detection via AnalyserNode
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      chunkStartRef.current = Date.now();
      lastSpeechRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(500); // collect every 500ms for finer silence gaps
      isRecording.value = true;
      recordingTime.value = 0;

      timerRef.current = setInterval(
        () => recordingTime.value++,
        1000,
      ) as unknown as number;

      // Poll audio levels — send accumulated chunk when silence is long enough
      silenceMonitorRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const level = data.reduce((a, b) => a + b, 0) / data.length;
        const now = Date.now();
        const chunkAge = now - chunkStartRef.current;

        if (level > SPEAKING_THRESHOLD) {
          lastSpeechRef.current = now;
        }

        const silenceDuration = now - lastSpeechRef.current;

        // Flush chunk when:
        // - silence > 2s AND we have audio accumulated, OR
        // - chunk has been accumulating > 30s (prevents huge chunks)
        if (
          chunksRef.current.length > 0 && (
            (silenceDuration > SILENCE_FLUSH_MS) ||
            (chunkAge > MAX_CHUNK_MS)
          )
        ) {
          sendChunk();
          chunkStartRef.current = now;
        }
      }, 250) as unknown as number;

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
    if (silenceMonitorRef.current) {
      clearInterval(silenceMonitorRef.current);
      silenceMonitorRef.current = null;
    }

    if (
      mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive"
    ) {
      await new Promise<void>((resolve) => {
        mediaRecorderRef.current!.onstop = () => resolve();
        mediaRecorderRef.current!.stop();
      });
    }
    await sendChunk();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    mediaRecorderRef.current = null;
    isRecording.value = false;
    recordingTime.value = 0;
    if (liveTranscript.value.length > 0) soundBloom();
  }

  const transcript = conversationData.value?.transcript?.text || "";

  const heroLines = ["See what you're", "really saying"];

  async function loadDemo() {
    if (demoLoading.value) return;
    demoLoading.value = true;
    // Brief delay so the loading modal gets its moment
    await new Promise((r) => setTimeout(r, 800));
    conversationData.value = createDemoConversation();
    demoLoading.value = false;
  }

  return (
    <div class="mapper-scene min-h-screen">
      {/* Top Bar - Brand presence */}
      <header
        class="app-header-glass"
        style={{
          borderBottom: "2px solid rgba(0, 0, 0, 0.08)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: "var(--z-header)",
        }}
      >
        <div
          class="max-w-7xl mx-auto px-4 sm:px-6 w-full"
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            // Nudge contents down a touch so they read as optically centered
            // BELOW the warm rainbow band that bleeds through the top edge.
            paddingTop: "3px",
          }}
        >
          {conversationData.value
            ? (
              // Conversation header — wordmark (= home) · project title · actions.
              <>
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  {/* ProMapper stays for branding; clicking it returns home. */}
                  <a
                    href="/"
                    class="app-header__brand"
                    data-tip="Back to home"
                    aria-label="ProMapper — back to home"
                    onClick={(e) => {
                      e.preventDefault();
                      conversationData.value = null;
                      stopLiveMode();
                      window.history.pushState({}, "", "/");
                    }}
                  >
                    ProMapper<span class="app-header__brand-dot">.</span>
                  </a>
                  <span class="app-header__divider" aria-hidden="true"></span>
                  <h1 class="app-header__title">
                    {conversationData.value.conversation.title}
                  </h1>
                </div>
                <div class="app-header__actions">
                  {/* Audio Recorder */}
                  <AudioRecorder
                    conversationId={conversationData.value.conversation.id ||
                      ""}
                  />

                  {/* Export — icon only */}
                  <button
                    onClick={() => drawerOpen.value = !drawerOpen.value}
                    class="header-icon-btn"
                    data-tip="Export"
                    aria-label="Export conversation"
                  >
                    <i class="fa fa-file-export" aria-hidden="true"></i>
                  </button>

                  {/* Go Live + Share + sound mute */}
                  <GoLiveButton />
                  <ShareButton />
                  <SoundToggle />

                  {/* Live session controls — shown when a meeting is active */}
                  {session && (
                    <>
                      {connected
                        ? (
                          <span
                            class="inline-flex items-center gap-1.5 shrink-0"
                            style={{
                              fontSize: "var(--tiny-size)",
                              color: "var(--color-accent-green, #52A37F)",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: "7px",
                                height: "7px",
                                borderRadius: "50%",
                                background:
                                  "var(--color-accent-green, #52A37F)",
                                display: "inline-block",
                              }}
                            />
                            Live · {users.length} here
                          </span>
                        )
                        : (
                          <span
                            style={{
                              fontSize: "var(--tiny-size)",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            Connecting…
                          </span>
                        )}

                      {/* Recording */}
                      <button
                        onClick={isRecording.value
                          ? stopRecording
                          : startRecording}
                        disabled={isProcessing.value && isRecording.value}
                        class={`header-icon-btn${
                          isRecording.value ? " is-recording" : ""
                        }`}
                        aria-label={isRecording.value
                          ? "Stop recording"
                          : "Record meeting"}
                      >
                        <i
                          class={`fa ${
                            isRecording.value ? "fa-stop" : "fa-microphone"
                          }`}
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

                      {/* Voice drawer toggle */}
                      <button
                        onClick={() =>
                          voiceDrawerOpen.value = !voiceDrawerOpen.value}
                        class="header-icon-btn"
                        data-tip="Voice"
                        aria-label="Toggle voice panel"
                      >
                        <i class="fa fa-headphones" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </>
            )
            : (
              // Default header — wordmark + quiet actions.
              <>
                <a href="/" class="app-header__brand flex-1">
                  ProMapper<span class="app-header__brand-dot">.</span>
                </a>
                <div class="app-header__actions">
                  <ThemeSwitcher />
                </div>
              </>
            )}
        </div>
      </header>

      {/* MarkdownMaker Drawer */}
      {conversationData.value && (
        <MarkdownMakerDrawer
          isOpen={drawerOpen.value}
          onClose={() => drawerOpen.value = false}
          transcript={transcript}
          conversationId={conversationData.value.conversation.id}
        />
      )}

      {/* Voice Drawer — slide-out when live session is active */}
      {session && (
        <div
          class={`voice-drawer${voiceDrawerOpen.value ? " is-open" : ""}`}
          aria-hidden={!voiceDrawerOpen.value}
        >
          <VoicePanel
            roomId={session.roomId}
            displayName={getLocalIdentity()}
          />
        </div>
      )}

      {/* Live transcript stream — appears during recording */}
      {session && liveTranscript.value.length > 0 && (
        <div
          style={{
            padding: "0.75rem var(--card-padding)",
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

      {/* Main Layout - No sidebar, centered content */}
      <div
        class="flex"
        style={{ minHeight: "calc(100vh - var(--header-height))" }}
      >
        {/* Mobile History Menu - Only show when NO data */}
        {!conversationData.value && <MobileHistoryMenu />}

        {/* Content Area - Full width, centered */}
        <main class="app-scroll flex-1 overflow-y-auto px-4 pb-12 pt-4 sm:px-6 lg:px-8">
          <div class="max-w-7xl mx-auto grid gap-4 sm:gap-6">
            {/* Hero Section - Only show when NO data */}
            {!conversationData.value && (
              <section class="mapper-stage">
                <div class="mapper-card" data-tilt>
                  <div class="mapper-card__inner">
                    <div class="mapper-hero-copy">
                      <h1 class="mapper-hero-title">
                        {heroLines.map((line, lineIndex) => (
                          <span
                            class="mapper-hero-line"
                            key={line}
                            style={{ animationDelay: `${lineIndex * 140}ms` }}
                          >
                            {line}
                          </span>
                        ))}
                      </h1>
                      <p class="mapper-hero-desc">
                        Drop in a thought, a meeting, a scene, or a weekly
                        check-in.
                      </p>
                      <p class="mapper-hero-caption">
                        A friendly project map you can keep adding to.
                      </p>
                    </div>
                    <div class="mapper-card__panel">
                      <UploadIsland />
                      <div
                        style={{
                          marginTop: "1rem",
                          textAlign: "center",
                        }}
                      >
                        <button
                          onClick={loadDemo}
                          disabled={demoLoading.value}
                          class="btn btn--secondary"
                          style={{
                            fontSize: "var(--small-size)",
                            padding: "0.5rem 1.25rem",
                          }}
                        >
                          {demoLoading.value
                            ? "Loading demo…"
                            : "✨ Try a demo"}
                        </button>
                        <p
                          style={{
                            fontSize: "var(--tiny-size)",
                            color: "var(--color-text-secondary)",
                            marginTop: "0.4rem",
                          }}
                        >
                          See the dashboard in action — no AI cost
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Dashboard - Always rendered, shows its own empty state */}
            {conversationData.value && (
              <section style={{ paddingTop: "clamp(1rem, 3vh, 2rem)" }}>
                <DashboardIsland />
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Auth modal — triggered by requestAuthToken() from anywhere */}
      <AuthModalIsland />

      {/* Keyboard shortcuts cheat sheet */}
      <ShortcutsModal
        open={shortcutsOpen.value}
        onClose={() => shortcutsOpen.value = false}
      />

      {/* Demo loading modal */}
      <LoadingModal isOpen={demoLoading.value} />
    </div>
  );
}
