/**
 * Vendored from the 'weightless' experiment (MIT © pibulus).
 * Source: Projects/active/experiments/weightless/src/Weightless.js
 * Copied in (not imported) to keep this Deno/Fresh app self-contained.
 * Do not edit here for behavior changes — change upstream + re-vendor.
 */

/**
 * 🪶 WEIGHTLESS
 * The Gold Standard of Procedural Audio for Web Interfaces.
 * 0kb assets. 100% Soul.
 *
 * Modular, independent, and organic.
 */

const MASTER_LEVEL = 0.65;
const MIN_GAIN = 0.0001;

// Utility: Convert cents to frequency ratio
const centsToRatio = (cents) => Math.pow(2, cents / 1200);

/**
 * Default Voice Presets
 */
export const WEIGHTLESS_VOICES = {
  tap: {
    type: "triangle",
    lowpass: 2800,
    attack: 0.006,
    partials: [{ ratio: 2.01, gain: 0.2, type: "sine" }],
  },
  bloom: {
    type: "sine",
    lowpass: 3800,
    attack: 0.01,
    partials: [{ ratio: 1.5, gain: 0.12, type: "triangle" }],
  },
  knock: {
    type: "sine",
    lowpass: 1400,
    attack: 0.005,
    bendCents: -60,
  },
  sparkle: {
    type: "sine",
    lowpass: 4300,
    attack: 0.004,
    partials: [{ ratio: 2, gain: 0.15, type: "sine" }],
  },
  warn: {
    type: "sine",
    lowpass: 1200,
    attack: 0.007,
    bendCents: -45,
  },
};

/**
 * Default Sound Cues
 */
export const WEIGHTLESS_CUES = {
  select: {
    cooldownMs: 45,
    detuneCents: 7,
    variants: [
      [{ frequency: 620, duration: 0.046, gain: 0.022, voice: "tap" }],
      [{ frequency: 700, duration: 0.04, gain: 0.019, voice: "bloom" }],
    ],
  },
  success: {
    cooldownMs: 200,
    detuneCents: 10,
    variants: [
      [
        { frequency: 523.25, duration: 0.07, gain: 0.03, voice: "tap" },
        {
          frequency: 659.25,
          offset: 0.06,
          duration: 0.08,
          gain: 0.025,
          voice: "bloom",
        },
        {
          frequency: 783.99,
          offset: 0.12,
          duration: 0.14,
          gain: 0.02,
          voice: "sparkle",
        },
      ],
    ],
  },
  error: {
    cooldownMs: 150,
    variants: [
      [
        { frequency: 220, duration: 0.12, gain: 0.03, voice: "warn" },
        {
          frequency: 180,
          offset: 0.08,
          duration: 0.15,
          gain: 0.025,
          voice: "warn",
        },
      ],
    ],
  },
};

export class Weightless {
  constructor(options = {}) {
    this.context = null;
    this.masterGain = null;
    this.enabled = options.enabled ?? true;
    this.volume = options.volume ?? 0.8;
    this.randomness = options.randomness ?? 1.0;
    this.cues = { ...WEIGHTLESS_CUES, ...options.cues };
    this.voices = { ...WEIGHTLESS_VOICES, ...options.voices };
    this.scale = options.scale || [
      392.00,
      440.00,
      523.25,
      587.33,
      659.25,
      783.99,
      880.00,
      1046.50,
      1174.66,
      1318.51,
    ];
    this.lastPlayed = new Map();

    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        if (typeof prop === "string") {
          return (opts) => target.play(prop, opts);
        }
        return undefined;
      },
    });
  }

  async getContext() {
    if (typeof window === "undefined") return null;
    if (!this.context || this.context.state === "closed") {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.context;
  }

  ensureMasterChain(context) {
    if (this.masterGain && this.context === context) {
      this.masterGain.gain.setTargetAtTime(
        MASTER_LEVEL * this.volume,
        context.currentTime,
        0.01,
      );
      return this.masterGain;
    }

    const masterGain = context.createGain();
    masterGain.gain.value = MASTER_LEVEL * this.volume;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-20, context.currentTime);
    compressor.knee.setValueAtTime(18, context.currentTime);
    compressor.ratio.setValueAtTime(4, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.08, context.currentTime);

    masterGain.connect(compressor);
    compressor.connect(context.destination);

    this.masterGain = masterGain;
    this.context = context;
    return masterGain;
  }

  randomBetween(min, max) {
    return min + Math.random() * (max - min) * this.randomness;
  }

  play(cueName, options = {}) {
    if (!this.enabled) return false;

    const cue = this.cues[cueName] || this.cues.select;
    const now = Date.now();
    const lastTime = this.lastPlayed.get(cueName) || 0;

    if (now - lastTime < (cue.cooldownMs || 0) && !options.force) {
      return false;
    }

    this.lastPlayed.set(cueName, now);
    this._executePlay(cue, options);
    return true;
  }

  async _executePlay(cue, options = {}) {
    const context = await this.getContext();
    if (!context) return;

    const masterNode = this.ensureMasterChain(context);
    const variants = cue.variants || [];
    const variant = variants[Math.floor(Math.random() * variants.length)] ||
      variants[0];
    if (!variant) return;

    variant.forEach((note) =>
      this.scheduleTone(context, cue, note, masterNode, options)
    );
  }

  scheduleTone(context, cue, note, masterNode, options = {}) {
    const voice = this.voices[note.voice] || this.voices.tap;
    const delay = (note.offset || 0) + (options.delay || 0) +
      this.randomBetween(-0.005, 0.005);
    // Negative jitter near t=0 can push startAt below currentTime, which makes
    // the Web Audio param setters throw "Time must be finite non-negative".
    const startAt = Math.max(context.currentTime, context.currentTime + delay);
    const duration = note.duration || 0.05;

    const detuneRatio = centsToRatio(
      this.randomBetween(-(cue.detuneCents || 0), cue.detuneCents || 0),
    );
    const frequency = (options.frequency || note.frequency || 440) *
      detuneRatio;
    const gainValue = (options.gain || note.gain || 0.02) *
      this.randomBetween(0.9, 1.1);

    const noteGain = context.createGain();
    const panner = context.createStereoPanner
      ? context.createStereoPanner()
      : null;

    let lastNode = noteGain;

    if (voice.lowpass) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(voice.lowpass, startAt);
      filter.Q.setValueAtTime(0.7, startAt);
      lastNode.connect(filter);
      lastNode = filter;
    }

    if (panner) {
      panner.pan.value = this.randomBetween(-0.15, 0.15);
      lastNode.connect(panner);
      lastNode = panner;
    }

    lastNode.connect(masterNode);

    noteGain.gain.setValueAtTime(MIN_GAIN, startAt);
    noteGain.gain.exponentialRampToValueAtTime(
      gainValue,
      startAt + (voice.attack || 0.005),
    );
    noteGain.gain.exponentialRampToValueAtTime(MIN_GAIN, startAt + duration);

    const partials = [
      { ratio: 1, gain: 1, type: voice.type },
      ...(voice.partials || []),
    ];

    partials.forEach((partial) => {
      const osc = context.createOscillator();
      const pGain = context.createGain();

      osc.type = partial.type || "sine";
      osc.frequency.setValueAtTime(frequency * (partial.ratio || 1), startAt);

      if (voice.bendCents) {
        osc.frequency.exponentialRampToValueAtTime(
          frequency * centsToRatio(voice.bendCents),
          startAt + duration,
        );
      }

      pGain.gain.value = partial.gain || 1;
      osc.connect(pGain);
      pGain.connect(noteGain);

      osc.start(startAt);
      osc.stop(startAt + duration + 0.1);

      osc.onended = () => {
        osc.disconnect();
        pGain.disconnect();
      };
    });

    setTimeout(() => {
      noteGain.disconnect();
      try {
        lastNode.disconnect();
      } catch {
        // already disconnected — fine
      }
    }, (delay + duration + 0.2) * 1000);
  }

  getSparkleNote(offset = 0) {
    const index = Math.floor(Math.random() * this.scale.length);
    return this.scale[(index + offset + this.scale.length) % this.scale.length];
  }

  /**
   * Sequence a melody
   */
  async sequence(notes, interval = 0.15) {
    const context = await this.getContext();
    if (!context) return;

    notes.forEach((note, i) => {
      const freq = typeof note === "number" ? note : note.frequency;
      this.play("select", {
        frequency: freq,
        delay: i * interval,
        force: true,
      });
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.context) {
      this.context.suspend().catch(() => {});
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(
        MASTER_LEVEL * this.volume,
        this.context.currentTime,
        0.01,
      );
    }
  }

  panic() {
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
      this.masterGain = null;
    }
  }
}

export const weightless = new Weightless();
