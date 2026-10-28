/**
 * ProMapper On-Device Whisper Web Worker (Browser-Only ESM)
 *
 * Supports three model tiers (matching TalkType's model registry):
 * - "tiny"  (~75 MB q4 WASM): Fast, mobile-safe, universal default
 * - "base"  (~140 MB q4 WASM): Balanced speed & terminology accuracy
 * - "small" (~250 MB q4 WebGPU/WASM): HD Studio accuracy for D&D lore,
 *           clinical terminology, and academic sessions
 *
 * Loaded from static/ so Fresh's server-side Deno Deploy isolate (128MB cap)
 * never bundles @huggingface/transformers.
 */

import {
  env,
  pipeline,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;
let loadedModelId = null;
let loadingPromise = null;

function resolveModelId(modelTier, isMultilingual) {
  if (modelTier === "small") {
    return isMultilingual
      ? "onnx-community/whisper-small"
      : "onnx-community/whisper-small.en";
  }
  if (modelTier === "base") {
    return isMultilingual
      ? "onnx-community/whisper-base"
      : "onnx-community/whisper-base.en";
  }
  return isMultilingual
    ? "onnx-community/whisper-tiny"
    : "onnx-community/whisper-tiny.en";
}

async function hasWebGPU() {
  try {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      return false;
    }
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function createPipelineWithFallback(modelId, modelTier, onProgress) {
  const progressCallback = (info) => {
    if (onProgress && info && typeof info.progress === "number") {
      onProgress(Math.round(info.progress));
    }
  };

  // For HD Studio ("small"), prefer WebGPU when the browser supports it,
  // falling back automatically to quantized WASM if WebGPU init fails.
  if (modelTier === "small" && (await hasWebGPU())) {
    try {
      return await pipeline("automatic-speech-recognition", modelId, {
        dtype: {
          encoder_model: "fp32",
          decoder_model_merged: "q4",
        },
        device: "webgpu",
        progress_callback: progressCallback,
      });
    } catch (err) {
      console.warn(
        "[OfflineWhisper] WebGPU init failed for small model, falling back to WASM:",
        err,
      );
    }
  }

  return await pipeline("automatic-speech-recognition", modelId, {
    dtype: {
      encoder_model: "fp32",
      decoder_model_merged: "q4",
    },
    device: "wasm",
    progress_callback: progressCallback,
  });
}

async function getTranscriber(modelId, modelTier, onProgress) {
  if (transcriber && loadedModelId === modelId) {
    return transcriber;
  }
  if (loadingPromise && loadedModelId === modelId) {
    return loadingPromise;
  }

  loadedModelId = modelId;
  loadingPromise = createPipelineWithFallback(modelId, modelTier, onProgress);

  try {
    transcriber = await loadingPromise;
    return transcriber;
  } catch (err) {
    transcriber = null;
    loadedModelId = null;
    throw err;
  } finally {
    loadingPromise = null;
  }
}

self.onmessage = async (event) => {
  const { id, type, audio, lang, modelTier = "tiny" } = event.data || {};
  const isMultilingual = lang === "es";
  const modelId = resolveModelId(modelTier, isMultilingual);

  try {
    if (type === "preload") {
      await getTranscriber(modelId, modelTier, (pct) => {
        self.postMessage({ id, type: "progress", progress: pct });
      });
      self.postMessage({ id, type: "ready", modelId, modelTier });
      return;
    }

    if (type === "transcribe") {
      const asr = await getTranscriber(modelId, modelTier, (pct) => {
        self.postMessage({ id, type: "progress", progress: pct });
      });

      const options = {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      };
      if (isMultilingual) {
        options.language = "spanish";
        options.task = "transcribe";
      }

      const output = await asr(audio, options);
      const text = Array.isArray(output)
        ? output.map((o) => o.text || "").join(" ").trim()
        : String(output?.text || "").trim();

      self.postMessage({ id, type: "result", text, modelId, modelTier });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
