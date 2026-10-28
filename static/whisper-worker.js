/**
 * ProMapper On-Device Whisper Web Worker (Browser-Only ESM)
 *
 * Runs Whisper Tiny (~40MB quantized q4 ONNX) directly inside the user's
 * browser via WebAssembly / WebGPU. Loaded from static/ so Fresh's server-side
 * Deno Deploy isolate (128MB cap) never bundles @huggingface/transformers.
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

async function getTranscriber(modelId, onProgress) {
  if (transcriber && loadedModelId === modelId) {
    return transcriber;
  }
  if (loadingPromise && loadedModelId === modelId) {
    return loadingPromise;
  }

  loadedModelId = modelId;
  loadingPromise = pipeline("automatic-speech-recognition", modelId, {
    dtype: {
      encoder_model: "fp32",
      decoder_model_merged: "q4",
    },
    device: "wasm",
    progress_callback: (info) => {
      if (onProgress && info && typeof info.progress === "number") {
        onProgress(Math.round(info.progress));
      }
    },
  });

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
  const { id, type, audio, lang } = event.data || {};
  const isMultilingual = lang === "es";
  const modelId = isMultilingual
    ? "onnx-community/whisper-tiny"
    : "onnx-community/whisper-tiny.en";

  try {
    if (type === "preload") {
      await getTranscriber(modelId, (pct) => {
        self.postMessage({ id, type: "progress", progress: pct });
      });
      self.postMessage({ id, type: "ready", modelId });
      return;
    }

    if (type === "transcribe") {
      const asr = await getTranscriber(modelId, (pct) => {
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

      self.postMessage({ id, type: "result", text });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
