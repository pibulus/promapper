/**
 * Live Session Store — enables live meeting features on the current dashboard.
 *
 * When a live session is active, HomeIsland shows: recording controls,
 * voice drawer, live transcript, whiteboard module, and chat sidebar.
 * The dashboard itself is the meeting room — no separate page needed.
 */

import { signal } from "@preact/signals";

export interface LiveSession {
  roomId: string;
  partyHost: string;
}

export const liveSession = signal<LiveSession | null>(null);

export function startLiveMode(roomId: string, partyHost: string) {
  liveSession.value = { roomId, partyHost };
}

export function stopLiveMode() {
  liveSession.value = null;
}
