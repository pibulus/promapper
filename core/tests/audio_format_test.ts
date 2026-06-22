/**
 * Tests for services/audio.ts format inference + size constants.
 *
 * inferOpenRouterAudioFormat is the cross-device correctness surface: different
 * browsers record different containers (Chrome → audio/webm, iOS Safari →
 * audio/mp4) and MediaRecorder mime types can carry a `;codecs=` suffix. These
 * pin the mappings that matter for real-device audio.
 */

import { assertEquals } from "./_assert.ts";
import {
  inferOpenRouterAudioFormat,
  MAX_AUDIO_SIZE,
  MIN_AUDIO_SIZE,
} from "../../services/audio.ts";

// ===================================================================
// FORMAT INFERENCE — by mime type
// ===================================================================

Deno.test("inferOpenRouterAudioFormat maps Chrome's audio/webm", () => {
  assertEquals(inferOpenRouterAudioFormat("audio/webm"), "webm");
});

Deno.test("inferOpenRouterAudioFormat maps iOS Safari's audio/mp4 to m4a", () => {
  assertEquals(inferOpenRouterAudioFormat("audio/mp4"), "m4a");
});

Deno.test("inferOpenRouterAudioFormat strips a ;codecs= suffix", () => {
  // MediaRecorder commonly reports e.g. "audio/webm;codecs=opus".
  assertEquals(inferOpenRouterAudioFormat("audio/webm;codecs=opus"), "webm");
  assertEquals(
    inferOpenRouterAudioFormat("audio/mp4; codecs=mp4a.40.2"),
    "m4a",
  );
});

Deno.test("inferOpenRouterAudioFormat is case-insensitive on mime", () => {
  assertEquals(inferOpenRouterAudioFormat("AUDIO/WEBM"), "webm");
});

Deno.test("inferOpenRouterAudioFormat covers the common containers", () => {
  assertEquals(inferOpenRouterAudioFormat("audio/wav"), "wav");
  assertEquals(inferOpenRouterAudioFormat("audio/mpeg"), "mp3");
  assertEquals(inferOpenRouterAudioFormat("audio/x-aiff"), "aiff");
  assertEquals(inferOpenRouterAudioFormat("audio/ogg"), "ogg");
  assertEquals(inferOpenRouterAudioFormat("audio/flac"), "flac");
  assertEquals(inferOpenRouterAudioFormat("audio/x-m4a"), "m4a");
});

// ===================================================================
// FORMAT INFERENCE — extension fallback + default
// ===================================================================

Deno.test("inferOpenRouterAudioFormat falls back to filename extension", () => {
  // A FormData Blob arrives named "blob" with no type — but a real File upload
  // can still carry an extension. Empty mime => use the name.
  assertEquals(inferOpenRouterAudioFormat("", "interview.m4a"), "m4a");
  assertEquals(inferOpenRouterAudioFormat("", "note.wav"), "wav");
});

Deno.test("inferOpenRouterAudioFormat defaults to webm when nothing matches", () => {
  // Unknown mime + no usable extension => webm (Chrome's default container).
  assertEquals(inferOpenRouterAudioFormat("application/octet-stream"), "webm");
  assertEquals(inferOpenRouterAudioFormat("", "blob"), "webm");
});

Deno.test("inferOpenRouterAudioFormat prefers mime over extension", () => {
  // If both are present and disagree, mime wins (it's the authoritative source).
  assertEquals(inferOpenRouterAudioFormat("audio/mp4", "thing.webm"), "m4a");
});

// ===================================================================
// SIZE GUARDS
// ===================================================================

Deno.test("audio size constants are sane", () => {
  assertEquals(MIN_AUDIO_SIZE, 1024);
  assertEquals(MAX_AUDIO_SIZE, 50 * 1024 * 1024);
  // A real recording clears MIN; an empty container header does not.
  assertEquals(500 < MIN_AUDIO_SIZE, true);
  assertEquals(50_000 > MIN_AUDIO_SIZE, true);
});
