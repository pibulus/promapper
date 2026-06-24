/**
 * Start Meeting Button
 *
 * Activates live mode on the current dashboard — creates a PartyKit room,
 * connects the live sync, and enables recording, voice, whiteboard, and
 * chat without leaving the page. The dashboard IS the meeting room.
 */

import { useSignal } from "@preact/signals";
import { conversationData } from "@signals/conversationStore.ts";
import { startLiveMode } from "@signals/liveSessionStore.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { showToast } from "@utils/toast.ts";

export default function GoLiveButton() {
  const loading = useSignal(false);

  if (!conversationData.value) return null;

  async function startMeeting() {
    if (loading.value) return;
    loading.value = true;
    try {
      await ensureApiSession();
      const res = await fetch("/api/live/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation: conversationData.value }),
      });
      if (!res.ok) {
        const msg = res.status === 503
          ? "Live collaboration isn't set up yet."
          : "Couldn't start a meeting room.";
        showToast(msg, "error");
        return;
      }
      const { roomId, host } = await res.json();
      startLiveMode(roomId, host);
      // Update URL without navigation so the room is shareable.
      globalThis.history.pushState({}, "", `/live/${roomId}`);
      showToast("Meeting room started", "info");
    } catch (_e) {
      showToast("Couldn't start a meeting room.", "error");
    } finally {
      loading.value = false;
    }
  }

  return (
    <button
      onClick={startMeeting}
      disabled={loading.value}
      class="header-icon-btn"
      data-tip={loading.value ? "Starting…" : "Start meeting"}
      data-tip-align="right"
      aria-label="Start a live meeting room"
    >
      <i
        class={`fa ${loading.value ? "fa-spinner fa-spin" : "fa-users"}`}
        aria-hidden="true"
      >
      </i>
    </button>
  );
}
