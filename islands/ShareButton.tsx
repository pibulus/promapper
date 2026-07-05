/**
 * Share Button Island - Generate Shareable Links
 *
 * Creates share links for conversations with copy-to-clipboard,
 * animated copy confirmation, and expiry countdown.
 */

import { useComputed, useSignal } from "@preact/signals";
import { conversationData } from "@signals/conversationStore.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import {
  createBestShareLink,
  type ShareCreationResult,
} from "../core/storage/shareService.ts";
import { showToast } from "../utils/toast.ts";

export default function ShareButton() {
  const share = useSignal<ShareCreationResult | null>(null);
  const isGenerating = useSignal(false);

  const canShare = useComputed(() => conversationData.value !== null);

  async function handleShare() {
    if (!conversationData.value) return;
    isGenerating.value = true;
    try {
      // Shared from a live session → the snapshot carries a pointer to the
      // room, so the shared page can offer "join live".
      const extras = liveSession.value
        ? { live: { roomId: liveSession.value.roomId } }
        : undefined;
      const result = await createBestShareLink(
        conversationData.value,
        30,
        extras,
      );
      share.value = result;
      if (result.mode !== "local-only") {
        copyToClipboard(result.url);
      }
    } catch (error) {
      console.error("Failed to create share:", error);
    } finally {
      isGenerating.value = false;
    }
  }

  function liveRoomUrl(): string {
    if (!liveSession.value || typeof window === "undefined") return "";
    return `${window.location.origin}/live/${liveSession.value.roomId}`;
  }

  async function handleCopyUrl() {
    if (!share.value?.url) return;
    copyToClipboard(share.value.url);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Share link copied", "success");
    } catch (error) {
      // Clipboard API can be unavailable (non-HTTPS, older Safari) — the link
      // is still visible in the panel, so point the user at it rather than
      // failing silently.
      console.error("Failed to copy share link:", error);
      showToast("Couldn't copy automatically — copy the link below", "warning");
    }
  }

  // Compute days remaining for server shares (30-day TTL).
  function daysRemaining(): number | null {
    if (!share.value || !share.value.expiresAt) return null;
    const remaining = Math.max(
      0,
      Math.ceil(
        (new Date(share.value.expiresAt).getTime() - Date.now()) / 86400000,
      ),
    );
    return remaining;
  }

  const remaining = daysRemaining();
  const isLocalOnly = share.value?.mode === "local-only";

  return (
    <div class="relative">
      <button
        onClick={handleShare}
        disabled={!canShare.value || isGenerating.value}
        class="header-icon-btn"
        data-tip={isGenerating.value ? "Generating…" : "Share"}
        data-tip-align="right"
        aria-label="Share conversation"
      >
        <i
          class={`fa ${isGenerating.value ? "fa-spinner fa-spin" : "fa-link"}`}
          aria-hidden="true"
        >
        </i>
      </button>

      {share.value && (
        <div
          class={`absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3 share-popover${
            isLocalOnly ? " is-local" : ""
          }`}
        >
          {liveSession.value && (
            <div class="share-live-row">
              <p
                class="text-xs font-bold"
                style={{ color: "var(--color-text)" }}
              >
                <span class="live-badge__dot" aria-hidden="true" />{" "}
                Live room link
              </p>
              <p
                class="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Real-time — anyone with it joins this session (open ~24h after
                the last activity).
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={liveRoomUrl()}
                  readonly
                  class="min-w-0 flex-1 px-2 py-1 font-mono text-xs share-url-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copyToClipboard(liveRoomUrl())}
                  class="min-h-9 px-3 py-1 text-xs font-bold share-copy-btn"
                  title="Copy live room link"
                >
                  <i class="fa fa-copy" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          )}

          <p class="text-xs font-bold" style={{ color: "var(--color-text)" }}>
            {share.value.mode === "public-url"
              ? "Portable share link"
              : share.value.mode === "server-share"
              ? "Share link"
              : "Saved on this device"}
            {liveSession.value ? " (snapshot)" : ""}
          </p>

          {isLocalOnly && (
            <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Couldn't reach the share server — this link only works in this
              browser for now. Try again later for a portable one.
            </p>
          )}

          {!isLocalOnly && (
            <div class="flex gap-2">
              <input
                type="text"
                value={share.value.url}
                readonly
                class="min-w-0 flex-1 px-2 py-1 font-mono text-xs share-url-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyUrl}
                class="min-h-9 px-3 py-1 text-xs font-bold share-copy-btn"
                title="Copy link"
              >
                <i class="fa fa-copy" aria-hidden="true"></i>
              </button>
            </div>
          )}

          {remaining !== null && remaining > 0 && (
            <p
              class="text-xs font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              Expires in {remaining} day{remaining !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {!canShare.value && (
        <p
          class="text-xs text-center"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Add a conversation to enable sharing
        </p>
      )}
    </div>
  );
}
