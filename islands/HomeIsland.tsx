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
  deleteConversation,
  flushPendingSave,
  getActiveConversationId,
  getAllConversations,
  loadConversation,
} from "../core/storage/localStorage.ts";
import { sweepOrphanSnapshots } from "@core/storage/exportSnapshots.ts";
import { sweepOrphans } from "@core/storage/recordingsDB.ts";
import { sweepOrphanTints } from "@utils/actionTags.ts";
import { showActionToast, showToast } from "@utils/toast.ts";
import {
  liveSession,
  startLiveMode,
  stopLiveMode,
} from "@signals/liveSessionStore.ts";
import {
  chatMessages,
  connectedRoomId,
  partyConnected,
  unreadChatCount,
} from "@signals/partyConnectionStore.ts";
import { getLocalIdentity, remoteUsers } from "@signals/presenceStore.ts";
import {
  sendChatMessage,
  startLiveSync,
  stopLiveSync,
} from "@signals/liveSync.ts";
import ChatPanel from "../components/ChatPanel.tsx";
import { sendTranscriptChunk } from "@signals/partyService.ts";
import {
  flushLiveAnalysis,
  noteLiveChunk,
  resetLiveAnalysis,
} from "@signals/liveAnalysis.ts";
import { processingConversation } from "@signals/conversationStore.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { soundBloom, soundChime, soundPortal, soundTick } from "@utils/sound.ts";
import { formatTime, useRecorder } from "./useRecorder.ts";
import UploadIsland from "./UploadIsland.tsx";
import DashboardIsland from "./DashboardIsland.tsx";
import MobileHistoryMenu from "./MobileHistoryMenu.tsx";
import ShareButton from "./ShareButton.tsx";
import MarkdownMakerDrawer from "./MarkdownMakerDrawer.tsx";
import AudioRecorder from "./AudioRecorder.tsx";
import ThemeSwitcher from "./ThemeSwitcher.tsx";
import SoundToggle from "./SoundToggle.tsx";
import ShortcutsModal from "../components/ShortcutsModal.tsx";
import KeysModal from "../components/KeysModal.tsx";
import AuthModalIsland from "./AuthModalIsland.tsx";
import VoicePanel from "./VoicePanel.tsx";

const SILENCE_FLUSH_MS = 2_000;
const MAX_CHUNK_MS = 30_000;
/** Ceiling on complete recordings held back for retry when the transcription
 * endpoint is failing. Each is one flush interval of audio. */
const MAX_PENDING_CHUNKS = 20;
/** RMS amplitude threshold — values below this are treated as silence.
 *  Typical speech lands between 0.02–0.20 at comfortable mic distance.
 *  0.008 is generous to catch quiet/soft speakers. */
const SPEAKING_THRESHOLD = 0.008;

export default function HomeIsland() {
  // Per-instance UI state. These MUST be useSignal (not module-level signal())
  // — module scope is shared across concurrent SSR requests, so one visitor's
  // in-flight state would render into another visitor's HTML.
  const drawerOpen = useSignal(false);
  const voiceDrawerOpen = useSignal(false);
  const shortcutsOpen = useSignal(false);
  const keysOpen = useSignal(false);
  const brewNoteIndex = useSignal(0);
  // A history button with nothing behind it is a mystery door — only show
  // it once there's actually something saved to reopen.
  const hasHistory = useSignal(false);

  // Plain consts for hook dependency arrays — ternaries/optional chains
  // inside a deps array trip deno lint's react-rules-of-hooks CFG and mark
  // every later hook "conditional".
  const liveRoomId = liveSession.value?.roomId;
  const livePartyHost = liveSession.value?.partyHost;
  const hasConversation = conversationData.value ? 1 : 0;

  // Auto-start live mode if arriving via /live/:roomId link
  useEffect(() => {
    if (!IS_BROWSER) return;
    const preset = (globalThis as unknown as {
      __LIVE_ROOM__?: { roomId: string; partyHost: string };
    })
      .__LIVE_ROOM__;
    if (preset?.roomId && preset?.partyHost && !liveSession.value) {
      // Arrived via a /live/:roomId link — a guest, not the host.
      startLiveMode(preset.roomId, preset.partyHost, false);
      // Load the shared conversation from the PartyKit room
      conversationData.value = null; // will be set by live sync onInit
    }
  }, []);

  // Restore last conversation on mount
  useEffect(() => {
    const conversationIds = Object.keys(getAllConversations());
    hasHistory.value = conversationIds.length > 0;

    // Orphan sweeps, once per page load. Both were strays: the takes sweep
    // lived in AudioRecorder, which only mounts once a conversation is OPEN —
    // so deleting from the drawer and closing the tab never swept anything —
    // and the snapshot sweep had no production caller at all, a garbage
    // collector that was written, tested and never wired up. Tints joined
    // them. Each refuses an empty live set, so a corrupt store sweeps nothing.
    const liveIds = new Set(conversationIds);
    sweepOrphans(conversationIds).catch(() => {/* best-effort */});
    sweepOrphanSnapshots(liveIds);
    sweepOrphanTints(liveIds);

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

  // The header action cluster scrolls horizontally on phones once a live
  // session stacks up controls. CSS can't see overflow, so this watcher
  // toggles the fade-hint class (.has-overflow-right) that tells thumbs
  // there's more to the right.
  useEffect(() => {
    if (!IS_BROWSER) return;
    const update = () => {
      document.querySelectorAll<HTMLElement>(".app-header__actions").forEach(
        (el) => {
          const overflowsRight = el.scrollWidth - el.clientWidth >
            Math.max(1, el.scrollLeft + 1);
          el.classList.toggle("has-overflow-right", overflowsRight);
        },
      );
    };
    update();
    globalThis.addEventListener("resize", update);
    const el = document.querySelector<HTMLElement>(".app-header__actions");
    el?.addEventListener("scroll", update, { passive: true });
    return () => {
      globalThis.removeEventListener("resize", update);
      el?.removeEventListener("scroll", update);
    };
  }, [liveRoomId, hasConversation]);

  // Hero heading entrance is CSS-only (.mapper-hero-line / mapperLineIn in
  // styles.css) — full text is server-rendered immediately, no JS retype.

  // ✨ anime.js — spring card entrance when conversation data appears
  useEffect(() => {
    if (!IS_BROWSER || !conversationData.value) return;
    const timer = setTimeout(() => {
      import("animejs").then(({ default: anime }) => {
        anime({
          // Dashboard CARDS only — a bare ".grid > *" also matched the inner
          // row grids (action-item rows etc.) and left stale inline
          // opacity/transform on their children, breaking hover-reveals.
          targets: ".dashboard-skeleton-grid > *, .dashboard-grid > *",
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
    // PRESENCE, not identity: keyed on the object, this replayed the whole
    // entrance (every card from opacity 0) on EVERY store write — ticking one
    // action item blinked the entire dashboard (Pablo's 2026-08-13 dogfood
    // find). The entrance belongs to the none→some transition only.
  }, [Boolean(conversationData.value)]);

  // ═══════════════════════════════════════════════════════════════
  // LIVE MODE — activates on the current dashboard
  // ═══════════════════════════════════════════════════════════════

  const session = liveSession.value;
  const connected = session
    ? (partyConnected.value && connectedRoomId.value === session.roomId)
    : false;
  const users = remoteUsers.value;
  const seenUsers = useRef<typeof users | null>(null);
  const chatOpen = useSignal(false);

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
  }, [liveRoomId, connected]);

  // Live recording — shared hook handles MediaRecorder lifecycle.
  const liveTranscript = useSignal<
    Array<{ id: number; text: string; speakers?: string[] }>
  >([]);

  const {
    isRecording,
    recordingTime,
    isProcessing,
    streamRef,
    chunksRef,
    startRecording: _startRecording,
    stopRecording: _stopRecording,
    rotateRecording,
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
    mimeTypes: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""],
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
  // The in-flight chunk request, or null. Serialises sends — see sendChunk.
  const chunkInFlightRef = useRef<Promise<void> | null>(null);
  // Complete recordings awaiting upload (oldest first) — the retry queue.
  const pendingChunksRef = useRef<Blob[]>([]);
  // "We already said the allowance is out" — one toast per session, not one
  // per rejected chunk.
  const chunkLimitNotified = useRef(false);

  // Belt: recording is live-session-gated today, and the session effect's
  // cleanup stops it on unmount — but if a record path ever appears outside
  // a session, don't strand the silence monitor + its AudioContext.
  useEffect(() => () => {
    if (silenceMonitorRef.current) clearInterval(silenceMonitorRef.current);
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  // Start/stop PartyKit live sync when liveSession changes
  useEffect(() => {
    if (!session) {
      stopLiveSync();
      return;
    }
    // A live room never sets isViewingShared. That flag means one thing now —
    // a read-only /shared/<id> snapshot — and SharedConversationLoader owns it.
    // Everyone in a room keeps their own copy of the map, host and guest alike:
    // you were IN the meeting, so it's yours, and it saves as you go rather
    // than only if you leave by the right door. (It cost the host their
    // autosave and board layout for the whole session, and handed guests a
    // copy or not depending on how they closed the tab.)
    startLiveSync({
      host: session.partyHost,
      roomId: session.roomId,
      avatar: getLocalIdentity(),
    }, {
      onRoomExpired: () => {
        // Without this the socket retried forever against a dead room and the
        // header sat on "Reconnecting…" until the tab closed.
        showToast(
          "This live room has expired — you're back to solo editing",
          "warning",
        );
        stopLiveMode();
      },
      onChat: () => {
        // liveSync already appended the message; we just track unread while
        // the panel is closed (own echoes land with it open, so they don't
        // inflate the badge).
        if (!chatOpen.value) unreadChatCount.value++;
      },
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
      // A guest's copy saves as they go (see the note above — saving only on a
      // clean exit handed people a copy or not depending on how they closed the
      // tab). But "saved reliably" and "wanted" are different things: this is
      // somebody else's meeting landing in your drawer next to your own
      // projects, unasked for, on your storage.
      //
      // So keep the reliable default and make the exit ACTIONABLE. Doing
      // nothing keeps the map — the safe direction for something you sat
      // through and may have contributed to — and one tap removes it for the
      // guest who never wanted it. The earlier design had this backwards:
      // its default was "evaporate", so closing the tab silently binned a
      // meeting you attended.
      if (!session.isHost && conversationData.value) {
        const guestCopyId = getActiveConversationId();
        showActionToast(
          "That map is yours too — it's in your history",
          "Remove",
          () => {
            if (!guestCopyId) return;
            const { ok } = deleteConversation(guestCopyId);
            if (!ok) {
              showToast(
                "Couldn't remove that one — try the history drawer",
                "warning",
              );
              return;
            }
            // Leaving a deleted record on screen is worse than an empty desk.
            conversationData.value = null;
            showToast("Removed from your history", "info");
          },
        );
      }
      if (isRecording.value) stopRecording();
      // Drop the analysis buffer with the session (an already in-flight
      // round still lands — it's the host's own conversation).
      resetLiveAnalysis();
    };
  }, [liveRoomId, livePartyHost]);

  // Join/leave toasts. Keep the previous roster (not just ids) so leavers get
  // named too — "Someone left" while everyone's avatar is right there read
  // like the app wasn't paying attention.
  useEffect(() => {
    if (!session) return;
    const current = new Set(users.map((u) => u.id));
    if (seenUsers.current === null) {
      seenUsers.current = users;
      return;
    }
    const previousIds = new Set(seenUsers.current.map((u) => u.id));
    for (const u of users) {
      if (!previousIds.has(u.id)) {
        showToast(`${u.alias || u.avatar} joined`, "info");
        soundChime();
      }
    }
    for (const u of seenUsers.current) {
      if (!current.has(u.id)) {
        showToast(`${u.alias || u.avatar} left`, "info");
      }
    }
    seenUsers.current = users;
  }, [users]);

  // Wrapped startRecording — hooks silence detection onto the shared stream.
  async function startRecording() {
    // Undelivered audio belongs to the room it was spoken in. The ref outlives
    // a session (Go Live → leave → Go Live again never remounts this island),
    // so a failing endpoint could hand the NEXT room the previous meeting's
    // words. Cost of clearing here: a stop/start inside one meeting drops
    // chunks that were already failing to send.
    pendingChunksRef.current = [];
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
          // Latch the silence too. Without this, silenceDuration keeps
          // growing through a quiet room: each new 500ms blob re-satisfies
          // the condition on the very next 200ms tick, so a pause billed a
          // transcription request roughly twice a second. Thirty seconds of
          // quiet was enough to hit the 60/min rate limit on its own.
          lastSpeechRef.current = now;
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

  /**
   * Flush the live audio to the transcription endpoint.
   *
   * ONE request at a time. The silence monitor ticks every 200ms, so without
   * a latch a single slow transcription turn had a dozen more requests piling
   * up behind it — and since each response was applied on arrival, a slow
   * chunk could land its text AFTER a later, faster one and scramble the
   * transcript. Serialising fixes the storm and the ordering together.
   *
   * Returns the in-flight promise when one exists, so stopRecording can wait
   * it out instead of silently no-oping on the meeting's last words.
   */
  function sendChunk(): Promise<void> {
    if (chunkInFlightRef.current) return chunkInFlightRef.current;
    const p = flushPending().finally(() => {
      chunkInFlightRef.current = null;
    });
    chunkInFlightRef.current = p;
    return p;
  }

  /**
   * Rotate the recorder into a complete file, then drain the queue oldest
   * first — stopping at the first failure so nothing jumps the line and
   * nothing is dropped.
   *
   * Retry used to mean splicing raw chunks back into the recorder's shared
   * buffer, which was both fragile (useRecorder swaps that array on
   * start/stop, so a late failure could bleed one session's audio into the
   * next) and pointless (the fragments were undecodable anyway). A rotation
   * hands back a self-contained file, so a retry is just: POST it again.
   */
  async function flushPending() {
    const blob = await rotateRecording();
    if (blob && blob.size > 0) pendingChunksRef.current.push(blob);

    while (pendingChunksRef.current.length > 0) {
      const ok = await deliverChunk(pendingChunksRef.current[0]);
      if (!ok) break;
      pendingChunksRef.current.shift();
    }

    // A persistently failing endpoint must not grow this without bound. Past
    // the cap the OLDEST audio goes — in a live transcript the most recent
    // words are the ones still worth catching up on.
    if (pendingChunksRef.current.length > MAX_PENDING_CHUNKS) {
      pendingChunksRef.current = pendingChunksRef.current.slice(
        -MAX_PENDING_CHUNKS,
      );
    }
  }

  /** POST one complete recording. Returns false if it should be retried. */
  async function deliverChunk(blob: Blob): Promise<boolean> {
    isProcessing.value = true;
    try {
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
      if (!res.ok) {
        // A non-OK response is a lost chunk too — this branch didn't exist,
        // so a 429 or a 500 dropped the audio as quietly as a thrown error.
        console.error("Chunk send rejected:", res.status);
        // A rail closing mid-meeting used to be console-only: the transcript
        // simply stopped growing and nothing said why. Say it once (the chunk
        // loop fires every few seconds — a toast per chunk would be a siren),
        // in the server's own warm words.
        if (res.status === 429 && !chunkLimitNotified.current) {
          chunkLimitNotified.current = true;
          const said = await res.json().catch(() => null);
          showToast(
            typeof said?.error === "string" && said.error.trim()
              ? said.error
              : "That's a lot of listening for one day — the map keeps everything so far.",
            "warning",
            7000,
          );
        }
        return false;
      }
      // Re-arm the notice: the ref meant "once per page" rather than "once
      // per limit", so a long meeting that tripped a rail, recovered, and
      // tripped again hours later went silent the second time.
      chunkLimitNotified.current = false;
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
        // liveSession.value, not the render-time `session`: this lands seconds
        // after the POST, and the session teardown calls stopRecording without
        // awaiting it. On the stale closure the tail chunk kept feeding the
        // analysis loop after resetLiveAnalysis — restarting its ticker and
        // folding the old meeting's words into whatever map was open by then.
        if (liveSession.value) {
          sendTranscriptChunk(text, speakers);
          // Host-only by construction (the record button is host-gated):
          // feed the live-analysis loop so nodes/actions/summary keep up
          // with the meeting instead of waiting for an explicit append.
          noteLiveChunk(text, speakers);
        }
      }
      return true;
    } catch (err) {
      console.error("Chunk send failed:", err);
      return false;
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
    // Wait out any in-flight chunk FIRST, then flush the tail. Without this
    // the new one-at-a-time latch would hand this call the in-flight promise
    // and return, leaving the meeting's last words sitting in the buffer.
    if (chunkInFlightRef.current) {
      await chunkInFlightRef.current.catch(() => {});
    }
    // Always flush, even with an empty chunk buffer: the rotation is what
    // captures everything spoken since the last flush. That tail used to be
    // dropped outright — HomeIsland never gives the hook an onStop, so the
    // final blob _stopRecording assembles went nowhere.
    await sendChunk();
    await _stopRecording();
    // Analyze the meaningful tail without delaying the stop UX — the result
    // lands in the dashboard (and the room) when it's ready.
    void flushLiveAnalysis();
    if (liveTranscript.value.length > 0) soundBloom();
  }

  const transcript = conversationData.value?.transcript?.text || "";

  const heroLines = ["See what you're", "really saying"];

  // While the first process brews, loading lives where the result will land:
  // the dashboard skeleton plus a LEDGER of stages. One rotating line read as
  // "blank screen, is anything happening?" (Pablo, 2026-08-13) — done stages
  // now stay on screen with a tick, so progress visibly ACCUMULATES. The
  // pacing is time-based (like the rotating line always was); the last stage
  // holds its pulse until the real result lands.
  const brewNotes = [
    "reading it through…",
    "pulling out the to-dos…",
    "sketching the topic map…",
    "noticing what connects…",
    "setting the table…",
  ];
  // Appending to a live map is a different story than the first brew.
  const appendNotes = [
    "listening back…",
    "weaving it into the map…",
    "checking off what you said you did…",
  ];
  const isBrewing = processingConversation.value && !conversationData.value
    ? 1
    : 0;
  const isAppending = processingConversation.value && conversationData.value
    ? 1
    : 0;
  useEffect(() => {
    if (!isBrewing && !isAppending) return;
    const notes = isBrewing ? brewNotes : appendNotes;
    brewNoteIndex.value = 0;
    const timer = setInterval(() => {
      // Hold on the final stage instead of looping back — a loop reads as
      // "stuck starting over"; a held last stage reads as "almost there".
      const nextIndex = Math.min(
        brewNoteIndex.value + 1,
        notes.length - 1,
      );
      if (brewNoteIndex.value !== nextIndex) {
        brewNoteIndex.value = nextIndex;
        soundTick();
      }
    }, 2200);
    return () => clearInterval(timer);
  }, [isBrewing, isAppending]);

  return (
    <div class="mapper-scene flex min-h-screen flex-col">
      {/* Top Bar - Brand presence */}
      <header class="app-header-glass">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 w-full app-header__container">
          {conversationData.value
            ? (
              // Conversation header — wordmark (= home) · project title · actions.
              // On mobile the lockup unwraps (display:contents): wordmark +
              // icons share row one, the conversation title gets row two.
              <>
                <div class="app-header__lockup flex items-center gap-2 flex-1 min-w-0">
                  {/* ProMapper stays for branding; clicking it returns home. */}
                  <a
                    href="/"
                    class="app-header__brand"
                    data-tip="Back to home"
                    aria-label="ProMapper — back to home"
                    onClick={(e) => {
                      e.preventDefault();
                      // Leaving for home nulls the signal, which makes the
                      // autosave effect cancel the pending write — land it first.
                      flushPendingSave();
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
                  {
                    /* THE LOOP, IN ORDER: Add (say more) → Share (bring people
                      in) → Export (take it away). These three ARE the product,
                      so they read as one family of labelled plates — Export
                      solid because it's the payoff, the other two outlined.
                      Two of the three used to be bare ghost icons, which made
                      "you can keep adding to this" the quietest thing in the
                      bar. History stays a ghost: it's navigation, not an
                      action on the thing in front of you. */
                  }
                  {conversationData.value && (
                    <AudioRecorder
                      conversationId={conversationData.value.conversation.id ??
                        ""}
                    />
                  )}
                  <ShareButton />

                  <button
                    onClick={() => {
                      // One drawer at a time — the header stays tappable
                      // above both, so without this Export + History could
                      // stack into an inescapable sandwich on a phone.
                      if (!drawerOpen.value) historyDrawerOpen.value = false;
                      drawerOpen.value = !drawerOpen.value;
                    }}
                    class="header-export-btn"
                    data-tip="Turn this into a document"
                    aria-label="Export conversation"
                  >
                    <i class="fa fa-file-export" aria-hidden="true"></i>
                    <span>Export</span>
                  </button>

                  {/* History — a ghost icon; navigation, not an action */}
                  <button
                    onClick={() => {
                      if (!historyDrawerOpen.value) drawerOpen.value = false;
                      historyDrawerOpen.value = !historyDrawerOpen.value;
                    }}
                    class="header-icon-btn"
                    data-tip="History"
                    aria-label="View history"
                  >
                    <i class="fa fa-history" aria-hidden="true"></i>
                  </button>

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

                      {
                        /* Recording — HOST ONLY (one room, one mic: guests'
                          voices come through the room; a second open mic
                          would double-transcribe). Guests simply don't see
                          it — show, don't say. */
                      }
                      {session.isHost && (
                        <button
                          onClick={isRecording.value
                            ? stopRecording
                            : startRecording}
                          // Guard STARTING while busy, never STOPPING. This
                          // was `isProcessing && isRecording` — the exact case
                          // where the button says "Stop", so the one control
                          // that ends a meeting went dead during every chunk
                          // upload. Stop must always be reachable.
                          disabled={isProcessing.value && !isRecording.value}
                          class={`header-icon-btn${
                            isRecording.value ? " is-recording" : ""
                          }`}
                          aria-label={isRecording.value
                            ? "Stop recording"
                            : "Record meeting"}
                          data-tip={isRecording.value ? "Stop" : "Record"}
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
                      )}

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
              // Default header — wordmark, plus history only when something
              // is saved (an icon with nothing behind it is a mystery door).
              <>
                <a href="/" class="app-header__brand flex-1">
                  ProMapper<span class="app-header__brand-dot">.</span>
                </a>
                {hasHistory.value && (
                  <div class="app-header__actions">
                    <button
                      onClick={() =>
                        historyDrawerOpen.value = !historyDrawerOpen.value}
                      class="header-icon-btn"
                      data-tip="History"
                      data-tip-align="right"
                      aria-label="View history"
                    >
                      <i class="fa fa-history" aria-hidden="true"></i>
                    </button>
                  </div>
                )}
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

      {
        /* Main Layout - No sidebar, centered content. flex-1 fills the space
          between the sticky header and the locked footer chrome. */
      }
      <div class="flex flex-1">
        {/* Mobile History Menu - Rendered always to be triggerable via header or floating button */}
        <MobileHistoryMenu />

        {/* Content Area - Full width, centered */}
        {
          /* Dock protection (pb-36) lives on the CONTENT grid, not <main> —
            padding under the footer read as a giant dead band at page end. */
        }
        {
          /* Horizontal gutter matches header/footer exactly (px-4 sm:px-6,
            no extra lg:px-8) — .mapper-stage used to stack its OWN padding
            on top of this, so the card's edge gutter drifted to ~96px
            while header/footer chrome sat at ~24px. */
        }
        <main class="app-scroll flex-1 overflow-y-auto px-4 pt-4 sm:px-6">
          <div
            class={`max-w-7xl mx-auto grid gap-4 sm:gap-6 ${
              conversationData.value ? "pb-28" : "pb-8"
            }`}
          >
            {/* Hero Section - Only show when NO data and nothing brewing */}
            {!conversationData.value && !processingConversation.value && (
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
                        Drop in a thought, a meeting, a scene, or a whole court
                        case.
                      </p>
                      <p class="mapper-hero-caption">
                        A friendly project map you can keep adding to, share
                        around, and turn into documents.
                      </p>
                    </div>
                    <div class="mapper-card__panel">
                      <UploadIsland />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {
              /* Dashboard — also rendered while the first process brews:
              DashboardIsland's no-data branch is the skeleton, so loading
              happens on the table where the result will land. */
            }
            {(conversationData.value || processingConversation.value) && (
              <section class="dashboard-section">
                {(isBrewing === 1 || isAppending === 1) && (
                  <div class="brew-ledger" aria-live="polite">
                    {(isBrewing ? brewNotes : appendNotes).map((note, i) =>
                      i < brewNoteIndex.value
                        ? (
                          <p key={note} class="brew-ledger__done">
                            <i class="fa fa-check" aria-hidden="true"></i>
                            {note.replace(/…$/, "")}
                          </p>
                        )
                        : i === brewNoteIndex.value
                        ? (
                          <p key={note} class="dashboard-brew-note">
                            {note}
                          </p>
                        )
                        : null
                    )}
                  </div>
                )}
                <DashboardIsland />
              </section>
            )}
          </div>
        </main>
      </div>

      {
        /* Locked footer chrome — a slim always-visible bar at the viewport
          bottom (sticky), full-bleed, holding the dials. */
      }
      <footer class="app-footer">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 w-full app-footer__container">
          {
            /* Phones only (CSS-gated): the conversation title docks here in the
              thumb zone — the h1 stays in the header for screen readers and
              desktop, so this copy is decorative. */
          }
          {conversationData.value?.conversation.title && (
            <span class="app-footer__title" aria-hidden="true">
              {conversationData.value.conversation.title}
            </span>
          )}
          <span class="app-footer__brand">
            © 2026 ProMapper
            <i class="fa fa-heart" aria-hidden="true"></i>
            <span class="app-footer__tagline">
              made in Melbourne
            </span>
          </span>
          {
            /* The dials are workshop tools — they appear with the dashboard.
            On the porch (no conversation yet) three mystery icons read as
            intimidation, not invitation. */
          }
          {conversationData.value && (
            <span class="app-footer__controls">
              <ThemeSwitcher />
              <SoundToggle />
              <button
                type="button"
                class="header-icon-btn"
                onClick={() => keysOpen.value = true}
                aria-label="Bring your own key"
                data-tip="Your key"
                data-tip-align="right"
              >
                <i class="fa fa-key" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="header-icon-btn footer-shortcuts-btn"
                onClick={() => shortcutsOpen.value = true}
                aria-label="Keyboard shortcuts"
                data-tip="Shortcuts"
                data-tip-align="right"
              >
                <i class="fa fa-keyboard" aria-hidden="true"></i>
              </button>
            </span>
          )}
        </div>
      </footer>

      {/* Auth modal — triggered by requestAuthToken() from anywhere */}
      {/* In-session chat — FAB bottom-right, only while live */}
      {session && (
        <ChatPanel
          open={chatOpen.value}
          messages={chatMessages.value}
          unread={unreadChatCount.value}
          onToggle={() => {
            chatOpen.value = !chatOpen.value;
            if (chatOpen.value) unreadChatCount.value = 0;
          }}
          onSend={sendChatMessage}
        />
      )}

      <AuthModalIsland />

      {/* Keyboard shortcuts cheat sheet */}
      <ShortcutsModal
        open={shortcutsOpen.value}
        onClose={() => shortcutsOpen.value = false}
      />

      {/* The Keys door — BYO OpenRouter key */}
      <KeysModal
        open={keysOpen.value}
        onClose={() => keysOpen.value = false}
      />
    </div>
  );
}
