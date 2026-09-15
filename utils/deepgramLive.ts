/**
 * Deepgram Live Transcription Client
 *
 * Realtime browser WebSocket streaming to Deepgram Nova-3.
 * Connects via short-lived ephemeral tokens from /api/deepgram/token.
 */

import { signal } from "@preact/signals";
import { cleanTranscriptText } from "@core/ai/helpers.ts";

const DEEPGRAM_LIVE_URL = "wss://api.deepgram.com/v1/listen";
export const DEEPGRAM_TOKEN_PROTOCOL = "bearer";
const DEFAULT_FINISH_GRACE_MS = 1500;
const MAX_BUFFERED_CHUNKS = 60;

export function buildDeepgramLiveUrl(): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "multi",
    smart_format: "true",
    interim_results: "true",
    punctuate: "true",
    endpointing: "400",
    utterance_end_ms: "1000",
    vad_events: "true",
    numerals: "true",
    filler_words: "false",
  });
  return `${DEEPGRAM_LIVE_URL}?${params.toString()}`;
}

export function appendTranscript(current: string, next: string): string {
  const cleanNext = next.trim();
  if (!cleanNext) return current || "";
  if (!current) return cleanNext;
  return `${current} ${cleanNext}`;
}

export interface DeepgramLiveState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  transcript: string;
  interim: string;
}

export interface DeepgramLiveClient {
  state: {
    connected: ReturnType<typeof signal<boolean>>;
    connecting: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    transcript: ReturnType<typeof signal<string>>;
    interim: ReturnType<typeof signal<string>>;
  };
  connect: () => Promise<boolean>;
  send: (data: Blob | ArrayBuffer) => void;
  finish: (graceMs?: number) => Promise<string>;
  disconnect: () => void;
  reset: () => void;
}

export function createDeepgramLiveClient(): DeepgramLiveClient {
  const connected = signal(false);
  const connecting = signal(false);
  const error = signal<string | null>(null);
  const transcript = signal("");
  const interim = signal("");

  let socket: WebSocket | null = null;
  let audioBuffer: (Blob | ArrayBuffer)[] = [];
  let isConnectionOpen = false;
  let isConnecting = false;
  let keepAliveInterval: number | null = null;
  let pendingFinalizeResolve: ((value: string) => void) | null = null;
  let finalizeTimeout: number | null = null;

  function clearKeepAlive() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  }

  function resolveFinalize() {
    if (finalizeTimeout) {
      clearTimeout(finalizeTimeout);
      finalizeTimeout = null;
    }
    if (pendingFinalizeResolve) {
      const fullText = [transcript.value.trim(), interim.value.trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      const cleaned = cleanTranscriptText(fullText);
      const resolve = pendingFinalizeResolve;
      pendingFinalizeResolve = null;
      resolve(cleaned);
    }
  }

  function closeSocket(reason = "Normal closure") {
    clearKeepAlive();
    isConnectionOpen = false;
    isConnecting = false;
    connected.value = false;
    connecting.value = false;

    if (socket) {
      const s = socket;
      socket = null;
      s.onopen = null;
      s.onmessage = null;
      s.onerror = null;
      s.onclose = null;
      if (
        s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING
      ) {
        try {
          s.close(1000, reason);
        } catch {
          // Ignore close errors
        }
      }
    }
    resolveFinalize();
  }

  async function connect(): Promise<boolean> {
    closeSocket("Reconnecting");
    connecting.value = true;
    isConnecting = true;
    error.value = null;

    try {
      // 1. Obtain ephemeral token from server
      const tokenRes = await fetch("/api/deepgram/token");
      if (!tokenRes.ok) {
        throw new Error("Live transcription not available");
      }
      const data = await tokenRes.json();
      const token = data.token;
      if (!token) {
        throw new Error("No token returned");
      }

      if (!isConnecting) return false;

      // 2. Open WebSocket
      const wsUrl = buildDeepgramLiveUrl();
      const ws = new WebSocket(wsUrl, [DEEPGRAM_TOKEN_PROTOCOL, token]);
      socket = ws;

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          if (isConnecting) {
            console.warn("[DeepgramLive] Connection timeout");
            closeSocket("Timeout");
            error.value = "Connection timeout";
            resolve(false);
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          if (socket !== ws) {
            ws.close();
            return;
          }
          isConnectionOpen = true;
          isConnecting = false;
          connected.value = true;
          connecting.value = false;
          error.value = null;

          // Flush buffer
          while (audioBuffer.length > 0) {
            const chunk = audioBuffer.shift();
            if (chunk) {
              try {
                ws.send(chunk);
              } catch (e) {
                console.warn("[DeepgramLive] Buffer send failed:", e);
              }
            }
          }

          // Keep alive
          clearKeepAlive();
          keepAliveInterval = setInterval(() => {
            if (socket === ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: "KeepAlive" }));
              } catch {
                // Ignore
              }
            }
          }, 6000) as unknown as number;

          resolve(true);
        };

        ws.onmessage = (event) => {
          if (socket !== ws) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "Results") {
              const text = msg.channel?.alternatives?.[0]?.transcript ?? "";
              if (text && msg.is_final) {
                const cleaned = cleanTranscriptText(text);
                if (cleaned) {
                  transcript.value = appendTranscript(
                    transcript.value,
                    cleaned,
                  );
                }
                interim.value = "";
              } else if (text) {
                interim.value = text;
              }
            }
            if (msg.from_finalize === true) {
              resolveFinalize();
            }
          } catch (err) {
            console.warn("[DeepgramLive] Message parse error:", err);
          }
        };

        ws.onerror = (evt) => {
          clearTimeout(timeout);
          console.warn("[DeepgramLive] Socket error:", evt);
          if (isConnecting) {
            isConnecting = false;
            connecting.value = false;
            error.value = "Live connection failed";
            resolve(false);
          }
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          clearKeepAlive();
          isConnectionOpen = false;
          isConnecting = false;
          connected.value = false;
          connecting.value = false;
          resolveFinalize();
        };
      });
    } catch (err) {
      console.warn("[DeepgramLive] Connect error:", err);
      isConnecting = false;
      connecting.value = false;
      error.value = (err as Error)?.message || "Live connection error";
      return false;
    }
  }

  function send(data: Blob | ArrayBuffer) {
    if (isConnectionOpen && socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(data);
      } catch (err) {
        console.warn("[DeepgramLive] Send failed:", err);
      }
    } else if (isConnecting) {
      audioBuffer.push(data);
      if (audioBuffer.length > MAX_BUFFERED_CHUNKS) {
        audioBuffer.shift();
      }
    }
  }

  function finish(graceMs = DEFAULT_FINISH_GRACE_MS): Promise<string> {
    return new Promise<string>((resolve) => {
      const fullCurrentText = [transcript.value.trim(), interim.value.trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      const fallbackCleaned = cleanTranscriptText(fullCurrentText);

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        closeSocket("Finished (not open)");
        resolve(fallbackCleaned);
        return;
      }

      pendingFinalizeResolve = resolve;
      finalizeTimeout = setTimeout(() => {
        resolveFinalize();
        closeSocket("Finalize timeout");
      }, graceMs) as unknown as number;

      try {
        socket.send(JSON.stringify({ type: "Finalize" }));
      } catch (err) {
        console.warn("[DeepgramLive] Finalize send error:", err);
        resolveFinalize();
        closeSocket("Finalize send error");
      }
    });
  }

  function disconnect() {
    audioBuffer = [];
    closeSocket("Disconnect called");
  }

  function reset() {
    disconnect();
    transcript.value = "";
    interim.value = "";
    error.value = null;
  }

  return {
    state: {
      connected,
      connecting,
      error,
      transcript,
      interim,
    },
    connect,
    send,
    finish,
    disconnect,
    reset,
  };
}
