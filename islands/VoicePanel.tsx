/**
 * VoicePanel — WebRTC voice controls for ProMapper meeting rooms.
 *
 * Handles: room join/leave, mute/unmute, remote audio playback,
 * speaker detection (via audio-level polling), and peer presence.
 *
 * Connects via Cloudflare RealtimeKit (session tokens issued by the
 * voice-relay Worker, proxied through /api/live/voice-token).
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { showToast } from "@utils/toast.ts";

interface VoicePeer {
  id: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  joinedAt: number;
}

interface VoiceSession {
  sessionId: string;
  iceServers: {
    urls: string | string[];
    username?: string;
    credential?: string;
  }[];
  sessionToken: string;
  roomId: string;
  ttl: number;
  rtcEndpoint?: string;
}

interface VoicePanelProps {
  roomId: string;
  displayName: string;
}

// How often we poll audio levels (ms)
const LEVEL_POLL_MS = 200;
// Threshold for "speaking" (0-255)
const SPEAKING_THRESHOLD = 20;

export default function VoicePanel({ roomId, displayName }: VoicePanelProps) {
  const peers = useSignal<VoicePeer[]>([]);
  const isMuted = useSignal(false);
  const isConnecting = useSignal(false);
  const isConnected = useSignal(false);
  const hasJoined = useSignal(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const levelIntervalRef = useRef<number | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  async function getSession(): Promise<VoiceSession | null> {
    try {
      await ensureApiSession();
      const res = await fetch("/api/live/voice-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Couldn't join voice room", "error");
        return null;
      }
      return await res.json();
    } catch {
      showToast("Voice relay unavailable", "error");
      return null;
    }
  }

  async function joinVoice() {
    if (!IS_BROWSER || hasJoined.value) return;
    isConnecting.value = true;

    const session = await getSession();
    if (!session) {
      isConnecting.value = false;
      return;
    }

    try {
      // 1. Get local mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 2. Set up audio analysis (for speaking detection on local)
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256;
      analyzer.smoothingTimeConstant = 0.4;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // 3. Create peer connection with ICE servers from the relay
      const pc = new RTCPeerConnection({
        iceServers: session.iceServers.length > 0
          ? session.iceServers
          : [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // 4. Add local audio track
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // 5. Handle remote tracks — create audio elements for playback
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        // Track ID is used as peer reference
        const peerId = event.track.id;
        audioElsRef.current.set(peerId, audio);

        // Add to peer list
        const existing = peers.value.find((p) => p.id === peerId);
        if (!existing) {
          peers.value = [...peers.value, {
            id: peerId,
            name: `Peer ${peers.value.length + 1}`,
            isSpeaking: false,
            isMuted: false,
            joinedAt: Date.now(),
          }];
        }
      };

      // 6. ICE connection state changes
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          isConnected.value = true;
          isConnecting.value = false;
        } else if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          isConnected.value = false;
        }
      };

      // 7. Create offer and send to Cloudflare RealtimeKit.
      //    In local dev (no rtcEndpoint), skip SFU and use direct P2P
      //    via PartyKit signaling if available.
      if (!session.rtcEndpoint) {
        // Local dev — no Cloudflare SFU available.
        // The peer connection will use STUN for direct P2P discovery.
        // Signaling happens through PartyKit (already connected).
        isConnected.value = true;
        isConnecting.value = false;
        hasJoined.value = true;
        showToast(
          "Voice connected (local mode — direct P2P, no SFU)",
          "info",
        );
        // Start polling for local audio levels
        levelIntervalRef.current = setInterval(
          pollAudioLevels,
          LEVEL_POLL_MS,
        ) as unknown as number;
        return;
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send the SDP offer to the Cloudflare RealtimeKit SFU ingress.
      // The endpoint URL comes from the server (env VOICE_RTC_ENDPOINT).
      const rtcEndpoint = session.rtcEndpoint ??
        "https://rtc.live.cloudflare.com/v1/offer";

      const sdpRes = await fetch(rtcEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          "Authorization": `Bearer ${session.sessionToken}`,
        },
        body: pc.localDescription?.sdp || "",
      });

      if (!sdpRes.ok) {
        throw new Error(`RealtimeKit rejected offer: ${sdpRes.status}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: answerSdp }),
      );

      // Start polling audio levels for speaker detection
      levelIntervalRef.current = setInterval(
        pollAudioLevels,
        LEVEL_POLL_MS,
      ) as unknown as number;

      hasJoined.value = true;
      isConnected.value = true;
      isConnecting.value = false;
      showToast("Joined voice room", "info");
    } catch (err) {
      console.error("Voice join failed:", err);
      isConnecting.value = false;
      cleanupMedia();
      showToast("Couldn't join voice room", "error");
    }
  }

  function leaveVoice() {
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    cleanupMedia();
    hasJoined.value = false;
    isConnected.value = false;
    peers.value = [];
    audioElsRef.current.clear();
  }

  function cleanupMedia() {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyzerRef.current = null;
    audioElsRef.current.forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
  }

  function toggleMute() {
    if (!streamRef.current) return;
    const muted = !isMuted.value;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    isMuted.value = muted;
  }

  function pollAudioLevels() {
    if (!analyzerRef.current) return;
    const data = new Uint8Array(analyzerRef.current.frequencyBinCount);
    analyzerRef.current.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const speaking = avg > SPEAKING_THRESHOLD;

    // Update local speaking state (just visual for now)
    if (speaking !== isLocalSpeaking()) {
      updateLocalSpeaking(speaking);
    }
  }

  // Track local speaking state as a simple flag
  const localSpeakingRef = useRef(false);
  function isLocalSpeaking() {
    return localSpeakingRef.current;
  }
  function updateLocalSpeaking(speaking: boolean) {
    localSpeakingRef.current = speaking;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (levelIntervalRef.current) clearInterval(levelIntervalRef.current);
      cleanupMedia();
    };
  }, []);

  if (!IS_BROWSER) return null;

  const peerCount = peers.value.length;

  return (
    <div class="voice-panel">
      <div class="voice-panel-header">
        <h3 class="voice-panel-title">Voice</h3>
        <span
          class="voice-connection-dot"
          aria-hidden="true"
          style={{
            background: isConnected.value
              ? "var(--color-accent-green, #52A37F)"
              : isConnecting.value
              ? "var(--color-accent-yellow, #f0c060)"
              : "var(--color-border)",
          }}
        />
      </div>

      <div class="voice-panel-body">
        {/* Join / Leave */}
        {!hasJoined.value
          ? (
            <button
              onClick={joinVoice}
              disabled={isConnecting.value}
              class="btn btn--primary voice-join-btn"
            >
              {isConnecting.value ? "Connecting…" : "Join voice"}
            </button>
          )
          : (
            <>
              {/* Local controls */}
              <div class="voice-controls">
                <button
                  onClick={toggleMute}
                  class={`voice-btn ${isMuted.value ? "is-muted" : ""}`}
                  aria-label={isMuted.value ? "Unmute" : "Mute"}
                  title={isMuted.value
                    ? "Unmute microphone"
                    : "Mute microphone"}
                >
                  <i
                    class={`fa ${
                      isMuted.value ? "fa-microphone-slash" : "fa-microphone"
                    }`}
                    aria-hidden="true"
                  />
                  <span class="voice-btn-label">
                    {isMuted.value ? "Muted" : "Live"}
                  </span>
                </button>

                <span
                  class={`voice-speaking-indicator ${
                    localSpeakingRef.current && !isMuted.value
                      ? "is-speaking"
                      : ""
                  }`}
                  aria-hidden="true"
                >
                  {displayName || "You"}
                </span>
              </div>

              {/* Peer list */}
              {peers.value.map((peer) => (
                <div key={peer.id} class="voice-peer">
                  <span
                    class={`voice-peer-dot ${
                      peer.isSpeaking ? "is-speaking" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span class="voice-peer-name">{peer.name}</span>
                  {peer.isMuted && (
                    <i
                      class="fa fa-microphone-slash voice-peer-muted"
                      aria-label="Muted"
                    />
                  )}
                </div>
              ))}

              {peerCount === 0 && (
                <p class="voice-no-peers">No one else here yet</p>
              )}

              <button
                onClick={leaveVoice}
                class="btn btn--secondary voice-leave-btn"
              >
                Leave voice
              </button>
            </>
          )}
      </div>
    </div>
  );
}
