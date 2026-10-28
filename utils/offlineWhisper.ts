/**
 * On-Device Whisper Client Bridge for ProMapper
 *
 * Decodes browser audio Blobs into 16kHz mono Float32 PCM and dispatches them
 * to `/whisper-worker.js` (which loads @huggingface/transformers from CDN in
 * a Web Worker so 0 bytes are added to Deno Deploy's server isolate).
 *
 * Supports three user-selectable model sizes (matching TalkType):
 * - "tiny"  (~75 MB): Fast, mobile-safe, universal default
 * - "base"  (~140 MB): Sharper names & everyday phrasing
 * - "small" (~250 MB): HD Studio accuracy (WebGPU / WASM) for D&D lore,
 *           clinical terminology, and academic research
 */

import { getLocale } from "./i18n.ts";

const LOCAL_WHISPER_STORAGE_KEY = "pm_local_whisper";
const LOCAL_WHISPER_MODEL_KEY = "pm_local_whisper_model";
const TARGET_SAMPLE_RATE = 16000;

export type WhisperModelTier = "tiny" | "base" | "small";

export interface WhisperModelOption {
  tier: WhisperModelTier;
  badgeEn: string;
  badgeEs: string;
  sizeLabel: string;
  descEn: string;
  descEs: string;
}

export const WHISPER_MODEL_OPTIONS: readonly WhisperModelOption[] = [
  {
    tier: "tiny",
    badgeEn: "Standard · Fast",
    badgeEs: "Estándar · Rápido",
    sizeLabel: "~75 MB",
    descEn: "Phone-friendly & fast on any device",
    descEs: "Ligero y veloz en celulares y laptops",
  },
  {
    tier: "base",
    badgeEn: "Balanced",
    badgeEs: "Equilibrado",
    sizeLabel: "~140 MB",
    descEn: "Sharper names & everyday phrasing",
    descEs: "Mayor precisión en nombres y términos",
  },
  {
    tier: "small",
    badgeEn: "HD Studio",
    badgeEs: "Estudio HD",
    sizeLabel: "~250 MB",
    descEn: "Studio accuracy (WebGPU / Desktop) for D&D, clinical & lab notes",
    descEs: "Máxima precisión (WebGPU / Escritorio) para rol, clínica y lab",
  },
] as const;

let workerInstance: Worker | null = null;
let requestCounter = 0;

const pendingRequests = new Map<
  number,
  {
    resolve: (text: string) => void;
    reject: (err: Error) => void;
    onProgress?: (pct: number) => void;
  }
>();

export function getLocalWhisperPreference(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(LOCAL_WHISPER_STORAGE_KEY) === "1";
}

export function setLocalWhisperPreference(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (enabled) {
    localStorage.setItem(LOCAL_WHISPER_STORAGE_KEY, "1");
  } else {
    localStorage.removeItem(LOCAL_WHISPER_STORAGE_KEY);
  }
}

export function getLocalWhisperModel(): WhisperModelTier {
  if (typeof localStorage === "undefined") return "tiny";
  const raw = localStorage.getItem(LOCAL_WHISPER_MODEL_KEY);
  if (raw === "base" || raw === "small") return raw;
  return "tiny";
}

export function setLocalWhisperModel(tier: WhisperModelTier): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_WHISPER_MODEL_KEY, tier);
}

function getWorker(): Worker {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker("/whisper-worker.js", { type: "module" });
  workerInstance.onmessage = (event: MessageEvent) => {
    const { id, type, text, error, progress } = event.data || {};
    const entry = pendingRequests.get(id);
    if (!entry) return;

    if (type === "progress" && typeof progress === "number") {
      entry.onProgress?.(progress);
      return;
    }
    if (type === "result" || type === "ready") {
      pendingRequests.delete(id);
      entry.resolve(text || "");
      return;
    }
    if (type === "error") {
      pendingRequests.delete(id);
      entry.reject(
        new Error(error || "On-device Whisper transcription failed"),
      );
    }
  };
  workerInstance.onerror = (err) => {
    console.error("[OfflineWhisper] Worker error:", err);
  };
  return workerInstance;
}

/**
 * Decode any browser-supported audio Blob (webm/opus, mp4, wav, ogg) into a
 * 16kHz mono Float32Array ready for Whisper.
 */
export async function decodeAudioBlobTo16kMono(
  blob: Blob,
): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = globalThis.AudioContext ||
    (globalThis as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const targetLength = Math.max(
      1,
      Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
    );
    const offlineCtx = new OfflineAudioContext(
      1,
      targetLength,
      TARGET_SAMPLE_RATE,
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);
    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void audioCtx.close().catch(() => {});
  }
}

/**
 * Preload the selected On-Device Whisper model into the browser's Cache API
 * so the first recording take doesn't wait on model download.
 */
export async function preloadOfflineWhisper(
  modelTier: WhisperModelTier = getLocalWhisperModel(),
  onProgress?: (pct: number) => void,
): Promise<void> {
  const worker = getWorker();
  const id = ++requestCounter;
  const lang = getLocale();

  await new Promise<string>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onProgress });
    worker.postMessage({
      id,
      type: "preload",
      lang,
      modelTier,
    });
  });
}

/**
 * Transcribe an audio Blob locally in the browser using On-Device Whisper.
 */
export async function transcribeWithOfflineWhisper(
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const pcm = await decodeAudioBlobTo16kMono(blob);
  const worker = getWorker();
  const id = ++requestCounter;
  const lang = getLocale();
  const modelTier = getLocalWhisperModel();

  return await new Promise<string>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onProgress });
    worker.postMessage(
      {
        id,
        type: "transcribe",
        audio: pcm,
        lang,
        modelTier,
      },
      [pcm.buffer],
    );
  });
}
