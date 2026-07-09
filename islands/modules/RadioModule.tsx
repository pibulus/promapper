/**
 * Radio — a small tile that hums. Ported from raya (Pablo's radio widget):
 * KPAB.fm first, SomaFM friends after. One Audio element, lazy-created on
 * first play; last channel remembered. Born gap-filler (small size).
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { showToast } from "@utils/toast.ts";

interface Channel {
  id: string;
  name: string;
  description: string;
  stream: string;
  nowPlayingUrl?: string;
}

const CHANNELS: Channel[] = [
  {
    id: "kpab",
    name: "KPAB.fm",
    description: "Brunswick pirate radio, live from the good pile.",
    stream: "https://kpab.fm/radio.mp3",
    nowPlayingUrl: "https://kpab.fm/api/nowplaying/1",
  },
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
    id: "dronezone",
    name: "Drone Zone",
    description: "Atmospheric textures, minimal beats.",
    stream: "https://ice2.somafm.com/dronezone-128-mp3",
  },
];

const STORE_KEY = "promapper-radio";
const NOW_PLAYING_MS = 30_000;

function loadChannelIndex(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    const i = CHANNELS.findIndex((c) => c.id === saved.channel);
    return i >= 0 ? i : 0;
  } catch {
    return 0;
  }
}

export default function RadioModule() {
  const playing = useSignal(false);
  const channelIdx = useSignal(loadChannelIndex());
  const nowPlaying = useSignal("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const channel = CHANNELS[channelIdx.value];

  function persist() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ channel: CHANNELS[channelIdx.value].id }),
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

  function play() {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = 0.8;
    }
    audioRef.current.src = channel.stream;
    audioRef.current.play().then(() => {
      playing.value = true;
      pollNowPlaying(channel);
    }).catch((err) => {
      playing.value = false;
      // An interrupted play (rapid channel-skips) is normal; a dead stream
      // deserves a word instead of a silently dead button (Rex #4).
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        showToast("That station isn't reachable right now", "warning");
      }
    });
  }

  function pause() {
    audioRef.current?.pause();
    playing.value = false;
    stopPolling();
  }

  function nextChannel() {
    channelIdx.value = (channelIdx.value + 1) % CHANNELS.length;
    persist();
    if (playing.value) play();
  }

  // Kill the stream when the module unmounts (toggled off / page change).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      stopPolling();
    };
  }, []);

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Radio</h3>
          {playing.value && (
            <span class="radio-live-dot" aria-label="Playing"></span>
          )}
        </div>
        <div class="dashboard-card-body radio-body">
          <button
            type="button"
            class="radio-play"
            onClick={() => playing.value ? pause() : play()}
            aria-label={playing.value ? "Pause radio" : "Play radio"}
          >
            <i
              class={`fa ${playing.value ? "fa-pause" : "fa-play"}`}
              aria-hidden="true"
            >
            </i>
          </button>
          <div class="radio-info">
            <span class="radio-station">{channel.name}</span>
            <span class="radio-now">
              {nowPlaying.value || channel.description}
            </span>
          </div>
          <button
            type="button"
            class="radio-next"
            onClick={nextChannel}
            data-tip="Next station"
            data-tip-align="right"
            aria-label="Next station"
          >
            <i class="fa fa-forward-step" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
