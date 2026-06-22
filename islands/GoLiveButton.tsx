/**
 * Go Live Button
 *
 * Creates a live-collab room from the current conversation and navigates to it.
 * Hidden when there's no conversation. Quietly hides if live collab isn't
 * configured (the API returns 503).
 */

import { useSignal } from "@preact/signals";
import { conversationData } from "@signals/conversationStore.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { showToast } from "@utils/toast.ts";

export default function GoLiveButton() {
  const loading = useSignal(false);

  if (!conversationData.value) return null;

  async function goLive() {
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
          : "Couldn't start a live room.";
        showToast(msg, "error");
        return;
      }
      const { roomId } = await res.json();
      globalThis.location.href = `/live/${roomId}`;
    } catch (_e) {
      showToast("Couldn't start a live room.", "error");
    } finally {
      loading.value = false;
    }
  }

  return (
    <button
      onClick={goLive}
      disabled={loading.value}
      class="header-icon-btn"
      data-tip={loading.value ? "Starting…" : "Go live"}
      aria-label="Start a live collaboration room"
    >
      <i
        class={`fa ${
          loading.value ? "fa-spinner fa-spin" : "fa-satellite-dish"
        }`}
        aria-hidden="true"
      >
      </i>
    </button>
  );
}
