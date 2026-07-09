/**
 * Tones — a hum for your head. Pablo asked for "a tone box for focus or
 * vibes" and the rack is a synth, so this one IS a synth: four moods
 * generated live with WebAudio (no streams, no network, nothing leaves the
 * machine). Mirrors Radio's tile layout so the two audio tiles read as
 * siblings.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

interface Mood {
  id: string;
  name: string;
  line: string;
  build: (ctx: AudioContext, out: GainNode) => AudioNode[];
}

/** 2s looped noise buffer; brown = integrated white (deeper, softer). */
function noiseSource(ctx: AudioContext, brown: boolean): AudioBufferSourceNode {
  const len = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function drone(
  ctx: AudioContext,
  out: GainNode,
  freqs: number[],
  type: OscillatorType,
  cutoff: number,
): AudioNode[] {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.connect(out);
  // A slow breath on the filter keeps the drone alive instead of static.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = cutoff * 0.25;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  const nodes: AudioNode[] = [filter, lfo, lfoGain];
  for (const [i, f] of freqs.entries()) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = i * 3; // gentle chorus between voices
    const g = ctx.createGain();
    g.gain.value = 0.22 / freqs.length;
    osc.connect(g).connect(filter);
    osc.start();
    nodes.push(osc, g);
  }
  return nodes;
}

function noiseBed(
  ctx: AudioContext,
  out: GainNode,
  brown: boolean,
  low: number,
  high: number,
  level: number,
): AudioNode[] {
  const src = noiseSource(ctx, brown);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = low;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = high;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(hp).connect(lp).connect(g).connect(out);
  src.start();
  return [src, hp, lp, g];
}

const MOODS: Mood[] = [
  {
    id: "focus",
    name: "Focus",
    line: "A soft brown hush that holds the room still.",
    build: (ctx, out) => noiseBed(ctx, out, true, 30, 500, 0.5),
  },
  {
    id: "rain",
    name: "Rain",
    line: "Patter without the wet.",
    build: (ctx, out) => noiseBed(ctx, out, false, 500, 4200, 0.12),
  },
  {
    id: "warm",
    name: "Warm",
    line: "A slow triangle chord, breathing.",
    build: (ctx, out) => drone(ctx, out, [110, 165, 220], "triangle", 700),
  },
  {
    id: "deep",
    name: "Deep",
    line: "Low sines for the bottom of the night.",
    build: (ctx, out) => drone(ctx, out, [55, 82.5], "sine", 280),
  },
];

const STORE_KEY = "promapper-tones";

function loadMoodIndex(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    const i = MOODS.findIndex((m) => m.id === saved.mood);
    return i >= 0 ? i : 0;
  } catch {
    return 0;
  }
}

export default function TonesModule() {
  const playing = useSignal(false);
  const moodIdx = useSignal(loadMoodIndex());
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

  const mood = MOODS[moodIdx.value];

  function teardown() {
    for (const n of nodesRef.current) {
      try {
        if ("stop" in n) (n as OscillatorNode).stop();
      } catch {
        // already stopped
      }
      n.disconnect();
    }
    nodesRef.current = [];
  }

  // Explicit mood arg — same stale-closure rule as Radio's play(ch).
  function start(m: Mood) {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.value = 0.7;
      masterRef.current.connect(ctxRef.current.destination);
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    teardown();
    nodesRef.current = m.build(ctx, masterRef.current!);
    playing.value = true;
  }

  function stop() {
    teardown();
    ctxRef.current?.suspend();
    playing.value = false;
  }

  function switchTo(index: number) {
    moodIdx.value = index;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ mood: MOODS[index].id }),
      );
    } catch {
      // fine
    }
    if (playing.value) start(MOODS[index]);
  }

  useEffect(() => {
    return () => {
      teardown();
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Tones</h3>
          {playing.value && (
            <span class="radio-live-dot" aria-label="Humming"></span>
          )}
        </div>
        <div class="dashboard-card-body radio-body">
          <button
            type="button"
            class="radio-play"
            onClick={() => playing.value ? stop() : start(mood)}
            aria-label={playing.value ? "Stop tones" : "Play tones"}
          >
            <i
              class={`fa ${playing.value ? "fa-stop" : "fa-play"}`}
              aria-hidden="true"
            >
            </i>
          </button>
          <div class="radio-info">
            <span class="radio-station">{mood.name}</span>
            <span class="radio-now">{mood.line}</span>
          </div>
          <button
            type="button"
            class="radio-next"
            onClick={() => switchTo((moodIdx.value + 1) % MOODS.length)}
            data-tip="Next mood"
            data-tip-align="right"
            aria-label="Next mood"
          >
            <i class="fa fa-forward-step" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
