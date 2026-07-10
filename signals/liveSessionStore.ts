/**
 * Live Session Store — enables live meeting features on the current dashboard.
 *
 * When a live session is active, HomeIsland shows: recording controls,
 * voice drawer, live transcript, whiteboard module, and chat panel (FAB).
 * The dashboard itself is the meeting room — no separate page needed.
 */

import { signal } from "@preact/signals";

export interface LiveSession {
  roomId: string;
  partyHost: string;
  /** True for the room's creator (started Go Live from THEIR dashboard);
   * false for link-joiners. One room, one mic: only the host records —
   * in person the host's mic hears everyone, and two open mics in one
   * room would transcribe the same conversation twice. UI-level gate;
   * server-side enforcement is a later protocol step. */
  isHost: boolean;
}

export const liveSession = signal<LiveSession | null>(null);

export function startLiveMode(
  roomId: string,
  partyHost: string,
  isHost = true,
) {
  liveSession.value = { roomId, partyHost, isHost };
}

export function stopLiveMode() {
  liveSession.value = null;
}
