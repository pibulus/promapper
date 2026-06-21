/**
 * Sound — warm, organic UI audio via the vendored Weightless engine.
 *
 * Taste rules: sparse + warm, never chirpy. Reward moments (task done, AI result
 * lands, reorder drop) get fuller cues; light UI ticks (clicks, tabs, checkbox)
 * are deliberately QUIET so they texture without nagging. On by default, with a
 * persisted mute, and silent under prefers-reduced-motion. The AudioContext
 * resumes lazily on the first real gesture (browser autoplay rules), so early
 * calls are no-ops rather than errors.
 *
 * Pairs with utils/haptics.ts — together they're the app's feedback layer.
 */

import { Weightless } from "./weightless.js";

const MUTE_KEY = "promapper-sound-muted";

function prefersReducedMotion(): boolean {
  return typeof globalThis.matchMedia !== "undefined" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ProMapper's voice: warm, low, a little soft. Reward cues are musical
// (pentatonic-ish), ticks are single quiet taps. Gains are intentionally small.
const engine = typeof window === "undefined" ? null : new Weightless({
  volume: 0.7,
  cues: {
    // --- light UI ticks (very quiet) ---
    tick: {
      cooldownMs: 30,
      detuneCents: 8,
      variants: [
        [{ frequency: 540, duration: 0.03, gain: 0.012, voice: "tap" }],
        [{ frequency: 590, duration: 0.028, gain: 0.011, voice: "tap" }],
      ],
    },
    toggleOn: {
      cooldownMs: 40,
      variants: [[{
        frequency: 660,
        duration: 0.05,
        gain: 0.018,
        voice: "bloom",
      }]],
    },
    toggleOff: {
      cooldownMs: 40,
      variants: [[{
        frequency: 440,
        duration: 0.05,
        gain: 0.016,
        voice: "knock",
      }]],
    },
    // --- reward moments (fuller, warm, musical) ---
    checkoff: {
      cooldownMs: 90,
      detuneCents: 10,
      variants: [
        [
          { frequency: 587.33, duration: 0.06, gain: 0.03, voice: "tap" },
          {
            frequency: 880.0,
            offset: 0.05,
            duration: 0.12,
            gain: 0.024,
            voice: "sparkle",
          },
        ],
      ],
    },
    settle: { // reorder drop — a soft warm thunk
      cooldownMs: 80,
      variants: [[{
        frequency: 330,
        duration: 0.08,
        gain: 0.026,
        voice: "knock",
      }]],
    },
    bloom: { // AI result lands / topic map renders
      cooldownMs: 400,
      detuneCents: 12,
      variants: [
        [
          { frequency: 523.25, duration: 0.08, gain: 0.026, voice: "bloom" },
          {
            frequency: 659.25,
            offset: 0.07,
            duration: 0.1,
            gain: 0.022,
            voice: "bloom",
          },
          {
            frequency: 783.99,
            offset: 0.15,
            duration: 0.16,
            gain: 0.02,
            voice: "sparkle",
          },
        ],
      ],
    },
    chime: { // chat send / peer joins — gentle
      cooldownMs: 60,
      detuneCents: 9,
      variants: [[{
        frequency: 698.46,
        duration: 0.06,
        gain: 0.02,
        voice: "bloom",
      }]],
    },
    portal: { // go-live connect — a warm "you're in" rise
      cooldownMs: 500,
      variants: [
        [
          { frequency: 440, duration: 0.1, gain: 0.024, voice: "bloom" },
          {
            frequency: 660,
            offset: 0.09,
            duration: 0.14,
            gain: 0.022,
            voice: "sparkle",
          },
        ],
      ],
    },
    // success/error reuse weightless defaults but are referenced by name below
  },
});

let muted = false;
if (typeof localStorage !== "undefined") {
  muted = localStorage.getItem(MUTE_KEY) === "1";
}
// Reduced-motion users start silent regardless of stored pref.
if (prefersReducedMotion()) muted = true;

function canPlay(): boolean {
  return Boolean(engine) && !muted;
}

function play(cue: string): void {
  if (!canPlay()) return;
  // engine is a Proxy: engine.cueName() === engine.play(cueName)
  (engine as unknown as Record<string, () => void>)[cue]?.();
}

// ===================================================================
// SEMANTIC API — call sites read clearly
// ===================================================================

/** Quiet tick: button clicks, tab/filter switches. */
export function soundTick(): void {
  play("tick");
}
/** Toggle a control on/off (checkbox, filter pill). */
export function soundToggle(on: boolean): void {
  play(on ? "toggleOn" : "toggleOff");
}
/** Completing an action item — the satisfying one. */
export function soundCheckoff(): void {
  play("checkoff");
}
/** A drag-reorder landed in its slot. */
export function soundSettle(): void {
  play("settle");
}
/** An AI result / topic map arrived. */
export function soundBloom(): void {
  play("bloom");
}
/** Sent a chat message / a collaborator joined. */
export function soundChime(): void {
  play("chime");
}
/** Connected to a live room. */
export function soundPortal(): void {
  play("portal");
}
/** Something went wrong. */
export function soundError(): void {
  play("error");
}

// ===================================================================
// MUTE CONTROL (persisted)
// ===================================================================

export function isSoundMuted(): boolean {
  return muted;
}

/** Toggle mute, persist, and give immediate audible confirmation when enabling. */
export function setSoundMuted(next: boolean): void {
  muted = next;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
  engine?.setEnabled(!next);
  if (!next) play("toggleOn"); // confirm un-mute with a soft cue
}
