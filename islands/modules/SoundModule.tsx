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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

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
      try {
        if ("stop" in n) (n as OscillatorNode).stop();
      } catch {
        // already stopped
      }
      n.disconnect();
    }
    nodesRef.current = [];
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
      ctxRef.current?.suspend();
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.volume = 0.8;
      }
      audioRef.current.src = s.channel.stream;
      audioRef.current.play().then(() => {
        playing.value = true;
        pollNowPlaying(s.channel);
      }).catch((err) => {
        playing.value = false;
        // Rapid skips abort plays — normal. A dead stream deserves a word
        // instead of a silently dead button.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          showToast("That station isn't reachable right now", "warning");
        }
      });
    } else {
      stopStream();
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
        masterRef.current = ctxRef.current.createGain();
        masterRef.current.gain.value = 0.7;
        masterRef.current.connect(ctxRef.current.destination);
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      teardownTones();
      nodesRef.current = s.mood.build(ctx, masterRef.current!);
      playing.value = true;
    }
  }

  function stop() {
    stopStream();
    teardownTones();
    ctxRef.current?.suspend();
    playing.value = false;
  }

  function switchTo(index: number) {
    sourceIdx.value = index;
    persist(index);
    if (playing.value) start(SOURCES[index]);
  }

  function next() {
    switchTo((sourceIdx.value + 1) % SOURCES.length);
  }

  // Kill everything when the module unmounts (toggled off / page change).
  useEffect(() => {
    return () => {
      stopStream();
      teardownTones();
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
              <span class="radio-live-dot" aria-label="Playing"></span>
            )}
          </div>
          <div class="dashboard-card-body radio-body">
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
              data-tip="Next"
              data-tip-align="right"
              aria-label="Next station or mood"
            >
              <i class="fa fa-forward-step" aria-hidden="true"></i>
            </button>
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
