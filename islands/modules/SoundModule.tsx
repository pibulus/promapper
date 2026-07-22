/**
 * Sound — Radio and Tones as one small tile. Front is whatever's playing
 * (a SomaFM/KPAB stream OR a generated WebAudio mood); the flip is the dial:
 * stations up top, moods below a divider. One play slab, one next button,
 * one tile of habitat instead of two near-identical siblings.
 *
 * Two engines, one rule: starting either side stops the other (a stream and
 * a drone at once is a haunting, not a feature).
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { showToast } from "@utils/toast.ts";
import FlipCard from "../FlipCard.tsx";

interface Channel {
  id: string;
  name: string;
  description: string;
  stream: string;
  nowPlayingUrl?: string;
}

// KPAB.fm is parked while the Pi stream is down (restore it to the top of
// this list, with its nowplaying URL, when the pirate signal returns).
const CHANNELS: Channel[] = [
  {
    id: "groovesalad",
    name: "Groove Salad",
    description: "Ambient and downtempo beats.",
    stream: "https://ice2.somafm.com/groovesalad-128-mp3",
  },
  {
    id: "fluid",
    name: "Fluid",
    description: "Instrumental hip-hop and future soul.",
    stream: "https://ice2.somafm.com/fluid-128-mp3",
  },
  {
    id: "beatblender",
    name: "Beat Blender",
    description: "Late-night deep house and chill.",
    stream: "https://ice2.somafm.com/beatblender-128-mp3",
  },
  {
    id: "lush",
    name: "Lush",
    description: "Mellow vocals with an electronic lean.",
    stream: "https://ice2.somafm.com/lush-128-mp3",
  },
  {
    id: "dronezone",
    name: "Drone Zone",
    description: "Atmospheric textures, minimal beats.",
    stream: "https://ice2.somafm.com/dronezone-128-mp3",
  },
];

/** Builders return nodes to stop/disconnect plus plain cleanup functions
 * (droplet timers). teardownTones handles both. */
type Teardown = AudioNode | (() => void);

interface Mood {
  id: string;
  name: string;
  line: string;
  build: (ctx: AudioContext, out: GainNode) => Teardown[];
}

/** Per-play roll — every start sounds slightly different. */
function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** Slow sine wired into an AudioParam — the "alive" ingredient. */
function slowLfo(
  ctx: AudioContext,
  param: AudioParam,
  rate: number,
  depth: number,
): AudioNode[] {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  lfo.connect(g).connect(param);
  lfo.start();
  return [lfo, g];
}

/** 2s looped noise buffer with decorrelated channels (true stereo width);
 * brown = integrated white (deeper, softer). */
function noiseSource(ctx: AudioContext, brown: boolean): AudioBufferSourceNode {
  const len = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
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
): Teardown[] {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.connect(out);
  // A slow breath on the filter keeps the drone alive instead of static.
  const nodes: Teardown[] = [filter];
  nodes.push(
    ...slowLfo(ctx, filter.frequency, rand(0.05, 0.11), cutoff * 0.25),
  );
  for (const [i, f] of freqs.entries()) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = i * 3; // gentle chorus between voices
    const g = ctx.createGain();
    g.gain.value = 0.22 / freqs.length;
    // Voices spread alternately left/right, and each one wanders a few
    // cents on its own slow clock — the chord never freezes solid.
    const pan = ctx.createStereoPanner();
    pan.pan.value = (i % 2 ? 1 : -1) * rand(0.15, 0.45);
    osc.connect(g).connect(pan).connect(filter);
    nodes.push(...slowLfo(ctx, osc.detune, rand(0.03, 0.08), rand(2, 5)));
    osc.start();
    nodes.push(osc, g, pan);
  }
  return nodes;
}

/** An extra voice that swells in and out on a very slow cycle — heard as a
 * visitor, not a member of the chord. */
function breathVoice(
  ctx: AudioContext,
  out: GainNode,
  freq: number,
  type: OscillatorType,
  level: number,
  cycleSec: number,
): Teardown[] {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = freq * 2;
  const g = ctx.createGain();
  g.gain.value = level / 2; // offset so the LFO swings 0..level, never negative
  osc.connect(lp).connect(g).connect(out);
  osc.start();
  return [osc, lp, g, ...slowLfo(ctx, g.gain, 1 / cycleSec, level / 2)];
}

function noiseBed(
  ctx: AudioContext,
  out: GainNode,
  brown: boolean,
  low: number,
  high: number,
  level: number,
): Teardown[] {
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
  // The weather: a slow swell on the level and a drift on the top filter,
  // rates rolled per play so no two sits sound the same.
  return [
    src,
    hp,
    lp,
    g,
    ...slowLfo(ctx, g.gain, rand(0.03, 0.09), level * 0.3),
    ...slowLfo(ctx, lp.frequency, rand(0.04, 0.1), high * 0.2),
  ];
}

/** Random little blips over the rain bed — the difference between hiss and
 * weather. A short noise burst through a narrow bandpass, panned wherever. */
function droplets(ctx: AudioContext, out: GainNode): Teardown[] {
  const len = Math.floor(ctx.sampleRate * 0.06);
  const burst = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = burst.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  let timer: ReturnType<typeof setTimeout>;
  const drip = () => {
    const src = ctx.createBufferSource();
    src.buffer = burst;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = rand(900, 3800);
    bp.Q.value = 8;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(rand(0.015, 0.05), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.7, 0.7);
    src.connect(bp).connect(g).connect(pan).connect(out);
    src.start();
    src.stop(t + 0.08);
    src.onended = () => pan.disconnect();
    timer = setTimeout(drip, rand(90, 600));
  };
  timer = setTimeout(drip, 400);
  return [() => clearTimeout(timer)];
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
    build: (ctx, out) => [
      ...noiseBed(ctx, out, false, 500, 4200, 0.12),
      ...droplets(ctx, out),
    ],
  },
  {
    id: "warm",
    name: "Warm",
    line: "A slow triangle chord, breathing.",
    build: (ctx, out) => [
      ...drone(ctx, out, [110, 165, 220], "triangle", 700),
      // An E4 that visits every so often, then leaves.
      ...breathVoice(ctx, out, 329.63, "sine", 0.04, rand(18, 30)),
    ],
  },
  {
    id: "deep",
    name: "Deep",
    line: "Low sines for the bottom of the night.",
    // The near-unison pair (55 vs 55.22) beats at ~0.2Hz — a sub throb
    // you feel more than hear.
    build: (ctx, out) => drone(ctx, out, [55, 55.22, 82.5], "sine", 280),
  },
];

/** One flat list for the dial + next-cycling: stations first, moods after. */
type Source =
  | { kind: "channel"; channel: Channel }
  | { kind: "mood"; mood: Mood };

const SOURCES: Source[] = [
  ...CHANNELS.map((channel) => ({ kind: "channel" as const, channel })),
  ...MOODS.map((mood) => ({ kind: "mood" as const, mood })),
];

const STORE_KEY = "promapper-sound";
const NOW_PLAYING_MS = 30_000;

function sourceId(s: Source): string {
  return s.kind === "channel" ? s.channel.id : `tone:${s.mood.id}`;
}

function loadSourceIndex(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    const i = SOURCES.findIndex((s) => sourceId(s) === saved.source);
    if (i >= 0) return i;
    // Legacy keys from the separate Radio/Tones tiles — honor the old pick.
    const radio = JSON.parse(
      localStorage.getItem("promapper-radio") ?? "{}",
    );
    const j = SOURCES.findIndex((s) => sourceId(s) === radio.channel);
    return j >= 0 ? j : 0;
  } catch {
    return 0;
  }
}

export default function SoundModule() {
  const playing = useSignal(false);
  const sourceIdx = useSignal(loadSourceIndex());
  const nowPlaying = useSignal("");
  // Last pick per kind, so the Radio/Moods switch returns you to where you
  // were on that side instead of always the first entry.
  const lastByKind = useRef<{ channel: number; mood: number }>({
    channel: SOURCES.findIndex((s) => s.kind === "channel"),
    mood: SOURCES.findIndex((s) => s.kind === "mood"),
  });
  lastByKind.current[SOURCES[sourceIdx.value].kind] = sourceIdx.value;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<Teardown[]>([]);
  // The meter: everything audible converges on one analyser before the
  // speakers, so four little bars can ride whatever is playing.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterElRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const meterLive = useSignal(false);
  // Radio through the analyser needs a CORS-clean stream. One failed
  // handshake flips this and radio plays plain (meter sways instead).
  const corsBlockedRef = useRef(false);
  const streamWiredRef = useRef(false);

  const source = SOURCES[sourceIdx.value];

  function persist(index: number) {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ source: sourceId(SOURCES[index]) }),
      );
    } catch {
      // fine — the tile still plays
    }
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    nowPlaying.value = "";
  }

  function pollNowPlaying(ch: Channel) {
    stopPolling();
    if (!ch.nowPlayingUrl) return;
    const fetchNow = async () => {
      try {
        const res = await fetch(ch.nowPlayingUrl!, {
          signal: AbortSignal.timeout(8_000),
        });
        const data = await res.json();
        const song = data?.now_playing?.song;
        if (song?.title) {
          nowPlaying.value = song.artist
            ? `${song.artist} — ${song.title}`
            : song.title;
        }
      } catch {
        // Stream keeps playing even if now-playing is unreachable.
      }
    };
    fetchNow();
    pollRef.current = setInterval(fetchNow, NOW_PLAYING_MS);
  }

  function teardownTones() {
    for (const n of nodesRef.current) {
      if (typeof n === "function") {
        n();
        continue;
      }
      try {
        if ("stop" in n) (n as OscillatorNode).stop();
      } catch {
        // already stopped
      }
      n.disconnect();
    }
    nodesRef.current = [];
  }

  function ensureCtx(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.value = 0.7;
      analyserRef.current = ctxRef.current.createAnalyser();
      // 1024-point FFT so the low drones (55–220Hz) land in distinct bins
      // instead of all piling into bin zero.
      analyserRef.current.fftSize = 1024;
      analyserRef.current.smoothingTimeConstant = 0.85;
      masterRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctxRef.current.destination);
    }
    return ctxRef.current;
  }

  function stopMeter() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    meterLive.value = false;
  }

  // Log-spaced band edges (in FFT bins, ~47Hz each): sub/low, low-mid,
  // mid, presence. Drones move the left bars, rain and radio light them all.
  function startMeter() {
    stopMeter();
    const analyser = analyserRef.current;
    const reduced = typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!analyser || reduced) return;
    meterLive.value = true;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const edges = [1, 3, 8, 24, 96];
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      const bars = meterElRef.current?.children;
      if (bars) {
        for (let b = 0; b < 4; b++) {
          let sum = 0;
          for (let i = edges[b]; i < edges[b + 1]; i++) sum += bins[i];
          const v = sum / ((edges[b + 1] - edges[b]) * 255);
          const scale = Math.max(0.15, Math.min(1, v * 1.6));
          (bars[b] as HTMLElement).style.transform = `scaleY(${
            scale.toFixed(3)
          })`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopStream() {
    audioRef.current?.pause();
    stopPolling();
  }

  // Explicit source arg — reading render-scope `source` here would replay a
  // stale closure's pick after a skip (same rule the old Radio tile learned).
  function start(s: Source) {
    if (s.kind === "channel") {
      teardownTones();
      stopMeter();
      if (!audioRef.current) {
        audioRef.current = new Audio();
        // crossOrigin BEFORE src — it's what lets the stream feed the
        // analyser. SomaFM allows it; a server that doesn't fails the load
        // and we fall back to a plain element below.
        if (!corsBlockedRef.current) audioRef.current.crossOrigin = "anonymous";
        audioRef.current.volume = 0.8;
      }
      const el = audioRef.current;
      el.src = s.channel.stream;
      el.play().then(() => {
        playing.value = true;
        pollNowPlaying(s.channel);
        if (!corsBlockedRef.current) {
          // Ride the real audio: element → analyser → speakers. Once a
          // media element joins the graph it only outputs through the
          // context, so keep it running (no suspend on this path).
          const ctx = ensureCtx();
          if (ctx.state === "suspended") ctx.resume();
          if (!streamWiredRef.current) {
            ctx.createMediaElementSource(el).connect(analyserRef.current!);
            streamWiredRef.current = true;
          }
          startMeter();
        } else {
          ctxRef.current?.suspend();
        }
      }).catch((err) => {
        // Rapid skips abort plays — normal.
        if (err instanceof DOMException && err.name === "AbortError") {
          playing.value = false;
          return;
        }
        // First CORS-mode failure with no prior success: assume the
        // handshake (not the station) and retry once with a plain element.
        if (!corsBlockedRef.current && !streamWiredRef.current) {
          corsBlockedRef.current = true;
          el.pause();
          audioRef.current = null;
          start(s);
          return;
        }
        playing.value = false;
        // A dead stream deserves a word instead of a silently dead button.
        showToast("That station isn't reachable right now", "warning");
      });
    } else {
      stopStream();
      const ctx = ensureCtx();
      if (ctx.state === "suspended") ctx.resume();
      teardownTones();
      nodesRef.current = s.mood.build(ctx, masterRef.current!);
      playing.value = true;
      startMeter();
    }
  }

  function stop() {
    stopStream();
    teardownTones();
    stopMeter();
    ctxRef.current?.suspend();
    playing.value = false;
  }

  function switchTo(index: number) {
    lastByKind.current[SOURCES[index].kind] = index;
    sourceIdx.value = index;
    persist(index);
    if (playing.value) start(SOURCES[index]);
  }

  // Next stays WITHIN the current kind — skipping used to march radio
  // listeners into the drone moods with no warning ("wait, what happened
  // to the music"). The Radio/Moods switch is how you change worlds.
  function next() {
    const kind = SOURCES[sourceIdx.value].kind;
    let i = sourceIdx.value;
    do {
      i = (i + 1) % SOURCES.length;
    } while (SOURCES[i].kind !== kind);
    switchTo(i);
  }

  function setKind(kind: "channel" | "mood") {
    if (SOURCES[sourceIdx.value].kind === kind) return;
    switchTo(lastByKind.current[kind]);
  }

  // Kill everything when the module unmounts (toggled off / page change).
  useEffect(() => {
    return () => {
      stopStream();
      teardownTones();
      stopMeter();
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  const name = source.kind === "channel"
    ? source.channel.name
    : source.mood.name;
  const line = source.kind === "channel"
    ? (nowPlaying.value || source.channel.description)
    : source.mood.line;

  // The FLIP: front is the tile, the back is the dial — stations up top,
  // moods under the divider. Both faces close over the same signals.
  return (
    <FlipCard
      label="Sound dial"
      front={
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>Sound</h3>
            {playing.value && (
              <span
                ref={meterElRef}
                class={`sound-meter${meterLive.value ? "" : " is-idle"}`}
                aria-label="Playing"
              >
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </span>
            )}
          </div>
          <div class="dashboard-card-body radio-body">
            {
              /* The two worlds, visible up front — radio streams vs generated
                moods. Switching returns to your last pick on that side. */
            }
            <div class="sound-kind-toggle" role="group" aria-label="Sound kind">
              <button
                type="button"
                class={source.kind === "channel" ? "is-on" : ""}
                aria-pressed={source.kind === "channel"}
                onClick={() => setKind("channel")}
              >
                <i class="fa fa-music" aria-hidden="true"></i> Radio
              </button>
              <button
                type="button"
                class={source.kind === "mood" ? "is-on" : ""}
                aria-pressed={source.kind === "mood"}
                onClick={() => setKind("mood")}
              >
                <i class="fa fa-wave-square" aria-hidden="true"></i> Moods
              </button>
            </div>
            <div class="radio-main">
              <button
                type="button"
                class="radio-play"
                onClick={() => playing.value ? stop() : start(source)}
                aria-label={playing.value ? "Stop sound" : "Play sound"}
              >
                <i
                  class={`fa ${playing.value ? "fa-pause" : "fa-play"}`}
                  aria-hidden="true"
                >
                </i>
              </button>
              <div class="radio-info">
                <span class="radio-station">{name}</span>
                <span class="radio-now">{line}</span>
              </div>
              <button
                type="button"
                class="radio-next"
                onClick={next}
                data-tip={source.kind === "channel"
                  ? "Next station"
                  : "Next mood"}
                data-tip-align="right"
                aria-label={source.kind === "channel"
                  ? "Next station"
                  : "Next mood"}
              >
                <i class="fa fa-forward-step" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      }
      back={
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>Dial</h3>
          </div>
          <div class="dashboard-card-body radio-stations">
            {SOURCES.map((s, i) => {
              const current = i === sourceIdx.value;
              const label = s.kind === "channel" ? s.channel.name : s.mood.name;
              return (
                <>
                  {
                    /* Both groups labeled — one lone "moods" divider left the
                    stations block reading as an unlabeled mystery list. */
                  }
                  {i === 0 && (
                    <span class="radio-dial-divider" aria-hidden="true">
                      stations
                    </span>
                  )}
                  {s.kind === "mood" && SOURCES[i - 1]?.kind === "channel" && (
                    <span class="radio-dial-divider" aria-hidden="true">
                      moods
                    </span>
                  )}
                  <button
                    key={sourceId(s)}
                    type="button"
                    class={`radio-station-row${current ? " is-current" : ""}`}
                    onClick={() => switchTo(i)}
                    aria-pressed={current}
                  >
                    <i
                      class={`fa ${
                        current && playing.value
                          ? "fa-volume-high"
                          : s.kind === "mood"
                          ? "fa-wave-square"
                          : "fa-music"
                      }`}
                      aria-hidden="true"
                    >
                    </i>
                    <span class="radio-station-row__name">{label}</span>
                  </button>
                </>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
