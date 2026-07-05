/**
 * Home Island - Main Layout with Conditional Visibility
 *
 * Shows upload panel + sidebar when NO data
 * Shows only dashboard when data exists
 */

import { IS_BROWSER } from "$fresh/runtime.ts";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  canUndo,
  conversationData,
  historyDrawerOpen,
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
import { sendTranscriptChunk } from "@signals/partyService.ts";
import { isViewingShared } from "@signals/conversationStore.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { soundBloom, soundChime, soundPortal } from "@utils/sound.ts";
import { formatTime, useRecorder } from "./useRecorder.ts";
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
import Confetti from "../components/Confetti.tsx";

const SILENCE_FLUSH_MS = 2_000;
const MAX_CHUNK_MS = 30_000;
/** RMS amplitude threshold — values below this are treated as silence.
 *  Typical speech lands between 0.02–0.20 at comfortable mic distance.
 *  0.008 is generous to catch quiet/soft speakers. */
const SPEAKING_THRESHOLD = 0.008;

export default function HomeIsland() {
  // Per-instance UI state. These MUST be useSignal (not module-level signal())
  // — module scope is shared across concurrent SSR requests, so one visitor's
  // in-flight demo modal would render into another visitor's HTML.
  const drawerOpen = useSignal(false);
  const voiceDrawerOpen = useSignal(false);
  const shortcutsOpen = useSignal(false);
  const demoLoading = useSignal(false);
  const demoStage = useSignal("");
  const showConfetti = useSignal(false);

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
    // SKIP auto-restore if liveSession is active to prevent clobbering the live room's state
    if (activeId && !conversationData.value && !liveSession.value) {
      const stored = loadConversation(activeId);
      if (stored) {
        conversationData.value = stored;
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
      } else if (e.key === "Escape" && voiceDrawerOpen.value) {
        // Escape closes the voice drawer (parity with backdrop tap).
        voiceDrawerOpen.value = false;
      }
    }
    globalThis.addEventListener("keydown", onKeydown);
    return () => globalThis.removeEventListener("keydown", onKeydown);
  }, []);

  // ✨ typed.js — typewriter effect on the hero heading
  useEffect(() => {
    if (!IS_BROWSER || conversationData.value) return;
    const el = document.querySelector(".mapper-hero-title");
    if (!el) return;

    let cancelled = false;
    import("typed.js").then(({ default: Typed }) => {
      if (cancelled) return;
      new Typed(el, {
        strings: ["See what you're^500<br>really saying"],
        typeSpeed: 55,
        backSpeed: 20,
        startDelay: 400,
        smartBackspace: false,
        showCursor: true,
        cursorChar: "▌",
        contentType: "html",
        loop: false,
      });
    }).catch(() => {
      // Chunk failed to load (network blip) — restore the static heading so
      // the hero isn't left blank.
      el.innerHTML = "See what you're<br>really saying";
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ✨ anime.js — spring card entrance when conversation data appears
  useEffect(() => {
    if (!IS_BROWSER || !conversationData.value) return;
    const timer = setTimeout(() => {
      import("animejs").then(({ default: anime }) => {
        anime({
          targets: ".dashboard-skeleton-grid > *, .grid > *",
          translateY: [24, 0],
          opacity: [0, 1],
          scale: [0.96, 1],
          delay: anime.stagger(60, { start: 100 }),
          duration: 500,
          easing: "easeOutElastic(1, .6)",
        });
      }).catch(() => {/* entrance animation is optional */});
    }, 50);
    return () => clearTimeout(timer);
  }, [conversationData.value]);

  // ═══════════════════════════════════════════════════════════════
  // LIVE MODE — activates on the current dashboard
  // ═══════════════════════════════════════════════════════════════

  const session = liveSession.value;
  const connected = session
    ? (partyConnected.value && connectedRoomId.value === session.roomId)
    : false;
  const users = remoteUsers.value;
  const seenIds = useRef<Set<string> | null>(null);

  const connectionFailed = useSignal(false);

  useEffect(() => {
    if (!session) {
      connectionFailed.value = false;
      return;
    }
    if (connected) {
      connectionFailed.value = false;
      return;
    }
    const timer = setTimeout(() => {
      if (!connected) {
        connectionFailed.value = true;
        showToast(
          "Connection is taking longer than expected. Still retrying...",
          "warning",
        );
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [session?.roomId, connected]);

  // Live recording — shared hook handles MediaRecorder lifecycle.
  const liveTranscript = useSignal<
    Array<{ id: number; text: string; speakers?: string[] }>
  >([]);

  const {
    isRecording,
    recordingTime,
    isProcessing,
    streamRef,
    mediaRecorderRef,
    chunksRef,
    startRecording: _startRecording,
    stopRecording: _stopRecording,
    cleanup: _cleanupRecorder,
  } = useRecorder({
    // No sampleRate/channelCount — iOS rejects those constraints with
    // OverconstrainedError on some devices. The transcription model handles
    // whatever rate the browser gives us.
    audioConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    timesliceMs: 500,
    // "" trailing fallback = let the browser pick if neither type is supported.
    mimeTypes: ["audio/webm", "audio/mp4", ""],
    onBeforeStart: ensureApiSession,
    // Let the hook surface mic failures — silentMicError:true left the live
    // record button doing nothing on failure, with no explanation at all.
    silentMicError: false,
  });

  // Silence-aware refs (HomeIsland-specific)
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
    }, {
      onTranscriptChunk: (chunk) => {
        liveTranscript.value = [
          ...liveTranscript.value,
          {
            id: Number(chunk.chunkId) || Date.now(),
            text: chunk.text,
            speakers: chunk.speakers,
          },
        ].slice(-20);
        // Let the whiteboard notice and draw along too.
        (
          globalThis as typeof globalThis & {
            __onTranscriptChunk?: () => void;
          }
        ).__onTranscriptChunk?.();
      },
    });
    soundPortal();
    return () => {
      stopLiveSync();
      isViewingShared.value = false;
      if (isRecording.value) stopRecording();
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

  // Wrapped startRecording — hooks silence detection onto the shared stream.
  async function startRecording() {
    await _startRecording();
    // If recording didn't actually start (cancelled, permission denied), bail.
    if (!isRecording.value || !streamRef.current) return;

    // Set up silence detection on the hook's stream. If any of this throws
    // (context cap reached, stream already ended), fall back to a plain
    // max-interval flush — without SOME monitor, chunks would never leave the
    // buffer until the user hits stop.
    chunkStartRef.current = Date.now();
    lastSpeechRef.current = Date.now();
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      if (!isRecording.value) {
        audioCtx.close().catch(() => {});
        audioCtxRef.current = null;
        return;
      }
      const source = audioCtx.createMediaStreamSource(streamRef.current);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Poll audio levels — time-domain RMS for speech energy detection
      silenceMonitorRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        const bufferLength = analyserRef.current.fftSize;
        const data = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(data);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const now = Date.now();
        const chunkAge = now - chunkStartRef.current;

        if (rms > SPEAKING_THRESHOLD) lastSpeechRef.current = now;
        const silenceDuration = now - lastSpeechRef.current;

        if (
          chunksRef.current.length > 0 &&
          (silenceDuration > SILENCE_FLUSH_MS || chunkAge > MAX_CHUNK_MS)
        ) {
          sendChunk();
          chunkStartRef.current = now;
        }
      }, 200) as unknown as number;
    } catch (err) {
      console.error("Silence detection unavailable, using timed flush:", err);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      // Degraded mode: flush on a fixed cadence instead of on silence.
      silenceMonitorRef.current = setInterval(() => {
        if (chunksRef.current.length > 0) {
          sendChunk();
          chunkStartRef.current = Date.now();
        }
      }, MAX_CHUNK_MS) as unknown as number;
    }

    showToast("Recording — live transcript starting…", "info");
  }

  async function sendChunk() {
    const chunks = chunksRef.current.splice(0);
    if (chunks.length === 0) return;
    isProcessing.value = true;
    try {
      const blob = new Blob(chunks, {
        type: mediaRecorderRef.current?.mimeType || "audio/webm",
      });
      // Name the file to match the actual codec. iOS records audio/mp4, not
      // webm — a mismatched extension makes the server's format inference
      // fragile if the Content-Type is ever lost in transit.
      const ext = blob.type.includes("mp4")
        ? "m4a"
        : blob.type.includes("ogg")
        ? "ogg"
        : "webm";
      const form = new FormData();
      form.append("audio", blob, `chunk.${ext}`);
      const res = await fetch("/api/live/chunk", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const text = typeof payload?.text === "string" ? payload.text : "";
        const speakers = Array.isArray(payload?.speakers)
          ? payload.speakers.filter((s: unknown): s is string =>
            typeof s === "string"
          )
          : [];
        if (text) {
          const chunk = { id: Date.now(), text, speakers };
          liveTranscript.value = [...liveTranscript.value, chunk].slice(-20);
          if (session) sendTranscriptChunk(text, speakers);
        }
      }
    } catch (err) {
      console.error("Chunk send failed:", err);
    } finally {
      isProcessing.value = false;
    }
  }

  // Wrapped stopRecording — tears down silence detection, then delegates to hook.
  async function stopRecording() {
    if (silenceMonitorRef.current) {
      clearInterval(silenceMonitorRef.current);
      silenceMonitorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    // Flush remaining chunks before stopping
    if (chunksRef.current.length > 0) {
      await sendChunk();
    }
    await _stopRecording();
    if (liveTranscript.value.length > 0) soundBloom();
  }

  const transcript = conversationData.value?.transcript?.text || "";

  const heroLines = ["See what you're", "really saying"];

  const stages = [
    { msg: "reading the town records…", dur: 700 },
    { msg: "listening for bite incidents…", dur: 600 },
    { msg: "mapping the topic web…", dur: 500 },
    { msg: "extracting action items…", dur: 500 },
    { msg: "assembling the full picture…", dur: 400 },
  ];

  async function loadDemo() {
    if (demoLoading.value) return;
    demoLoading.value = true;
    showConfetti.value = false;

    // Theatrical staged loading — builds anticipation
    for (const stage of stages) {
      demoStage.value = stage.msg;
      await new Promise((r) => setTimeout(r, stage.dur));
    }

    conversationData.value = createDemoConversation();
    soundBloom();
    demoLoading.value = false;
    showConfetti.value = true;

    // Clear confetti after animation finishes
    setTimeout(() => showConfetti.value = false, 4000);
  }

  return (
    <div class="mapper-scene min-h-screen">
      {/* Top Bar - Brand presence */}
      <header class="app-header-glass">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 w-full app-header__container">
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
                  {/* Export — icon only */}
                  <button
                    onClick={() => drawerOpen.value = !drawerOpen.value}
                    class="header-icon-btn"
                    data-tip="Export"
                    aria-label="Export conversation"
                  >
                    <i class="fa fa-file-export" aria-hidden="true"></i>
                  </button>

                  {/* History — icon only */}
                  <button
                    onClick={() =>
                      historyDrawerOpen.value = !historyDrawerOpen.value}
                    class="header-icon-btn"
                    data-tip="History"
                    aria-label="View history"
                  >
                    <i class="fa fa-history" aria-hidden="true"></i>
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
                          <span class="live-badge">
                            <span aria-hidden="true" class="live-badge__dot" />
                            Live · {users.length} here
                          </span>
                        )
                        : connectionFailed.value
                        ? (
                          <span
                            class="live-badge--offline"
                            title="Connection is taking longer than expected. Still retrying..."
                          >
                            <span
                              aria-hidden="true"
                              class="live-badge__dot--offline"
                            />
                            Offline (Reconnecting…)
                          </span>
                        )
                        : (
                          <span class="live-status-connecting">
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
                          <span class="recording-timer">
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
        <>
          {/* Backdrop — tap to close so the drawer is never a thumb-trap. */}
          <div
            class={`voice-drawer-backdrop${
              voiceDrawerOpen.value ? " is-open" : ""
            }`}
            aria-hidden="true"
            onClick={() => voiceDrawerOpen.value = false}
          />
          <div
            class={`voice-drawer${voiceDrawerOpen.value ? " is-open" : ""}`}
            role="dialog"
            aria-label="Voice panel"
            aria-hidden={!voiceDrawerOpen.value}
            // @ts-ignore inert is valid HTML; Preact's types lag behind
            inert={!voiceDrawerOpen.value ? true : undefined}
          >
            <button
              type="button"
              class="voice-drawer-close"
              aria-label="Close voice panel"
              onClick={() => voiceDrawerOpen.value = false}
            >
              <i class="fa fa-times" aria-hidden="true" />
            </button>
            <VoicePanel
              roomId={session.roomId}
              displayName={getLocalIdentity()}
              peerDisplayNames={users
                .filter((u) => u.avatar !== getLocalIdentity())
                .map((u) => u.alias || u.avatar)
                .filter(Boolean)}
            />
          </div>
        </>
      )}

      {/* Live transcript stream — appears during recording */}
      {session && liveTranscript.value.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          class="live-transcript-stream"
        >
          <p class="live-transcript-title">
            ● Live transcript
          </p>
          {liveTranscript.value.map((chunk, i) => (
            <p
              key={chunk.id}
              class="live-transcript-item"
              style={{
                opacity: i < liveTranscript.value.length - 1 ? 0.6 : 1,
              }}
            >
              {chunk.text}
            </p>
          ))}
        </div>
      )}

      {/* Main Layout - No sidebar, centered content */}
      <div
        class="flex"
        style={{ minHeight: "calc(100vh - var(--header-height))" }}
      >
        {/* Mobile History Menu - Rendered always to be triggerable via header or floating button */}
        <MobileHistoryMenu />

        {/* Content Area - Full width, centered */}
        <main
          class={`app-scroll flex-1 overflow-y-auto px-4 pt-4 sm:px-6 lg:px-8 ${
            conversationData.value ? "pb-36" : "pb-12"
          }`}
        >
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
                      <UploadIsland
                        onTryDemo={loadDemo}
                        demoLoading={demoLoading.value}
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Dashboard - Always rendered, shows its own empty state */}
            {conversationData.value && (
              <section class="dashboard-section">
                <DashboardIsland />
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Auth modal — triggered by requestAuthToken() from anywhere */}
      {
        /* Recording dock — the "talk again" loop, front and center. Mounted
          whenever a conversation exists (NOT gated on liveSession: unmounting
          mid-recording would kill the take without onStop — the dock hides
          itself via CSS and stops gracefully when live mode starts). */
      }
      {conversationData.value && (
        <AudioRecorder
          conversationId={conversationData.value.conversation.id || ""}
        />
      )}

      <AuthModalIsland />

      {/* Keyboard shortcuts cheat sheet */}
      <ShortcutsModal
        open={shortcutsOpen.value}
        onClose={() => shortcutsOpen.value = false}
      />

      {/* Demo loading modal */}
      <LoadingModal isOpen={demoLoading.value} message={demoStage.value} />

      {/* Confetti on demo load */}
      <Confetti trigger={showConfetti.value} />
    </div>
  );
}
