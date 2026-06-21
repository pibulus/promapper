/**
 * Share Button Island - Generate Shareable Links
 *
 * Creates share links for conversations with copy-to-clipboard
 */

import { useComputed, useSignal } from "@preact/signals";
import { conversationData } from "@signals/conversationStore.ts";
import {
  createBestShareLink,
  type ShareCreationResult,
} from "../core/storage/shareService.ts";

export default function ShareButton() {
  const share = useSignal<ShareCreationResult | null>(null);
  const showCopied = useSignal(false);
  const isGenerating = useSignal(false);

  // Check if we have conversation data to share
  const canShare = useComputed(() => conversationData.value !== null);

  async function handleShare() {
    if (!conversationData.value) return;

    isGenerating.value = true;

    try {
      const result = await createBestShareLink(conversationData.value, 30);
      share.value = result;

      const copied = result.mode !== "local-only"
        ? await copyToClipboard(result.url)
        : false;

      if (copied) {
        showCopied.value = true;
        setTimeout(() => {
          showCopied.value = false;
        }, 3000);
      }
    } catch (error) {
      console.error("Failed to create share:", error);
    } finally {
      isGenerating.value = false;
    }
  }

  async function handleCopyUrl() {
    if (!share.value?.url) return;

    const copied = await copyToClipboard(share.value.url);
    if (copied) {
      showCopied.value = true;
      setTimeout(() => {
        showCopied.value = false;
      }, 3000);
    }
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error("Failed to copy share link:", error);
      return false;
    }
  }

  const isLocalOnly = share.value?.mode === "local-only";

  return (
    <div class="relative">
      {
        /* Share Button — neutral house chip (dark ink fill), one accent system,
          no per-button semantic rainbow. */
      }
      <button
        onClick={handleShare}
        disabled={!canShare.value || isGenerating.value}
        class="btn btn--secondary btn--compact"
        title="Share conversation"
        aria-label="Share conversation"
      >
        <i
          class={`fa ${isGenerating.value ? "fa-spinner fa-spin" : "fa-link"}`}
          aria-hidden="true"
        >
        </i>
        <span class="hidden sm:inline">
          {isGenerating.value ? "Generating" : "Share"}
        </span>
      </button>

      {
        /* Share URL popover — warm cream surface; local-only uses a warm amber
          status tint (a heads-up, not an error). */
      }
      {share.value && (
        <div
          class="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3"
          style={{
            borderRadius: "var(--border-radius)",
            border: "2px solid var(--border-cream-medium)",
            background: isLocalOnly
              ? "var(--status-amber)"
              : "var(--surface-cream)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <p
            class="text-xs font-bold"
            style={{ color: "var(--color-text)" }}
          >
            {share.value.mode === "public-url"
              ? "Portable share link"
              : share.value.mode === "server-share"
              ? "Share link"
              : "Saved on this device"}
          </p>
          <div class="flex gap-2">
            <input
              type="text"
              value={share.value.url}
              readonly
              class="min-w-0 flex-1 px-2 py-1 font-mono text-xs"
              style={{
                borderRadius: "var(--border-radius-sm)",
                border: "2px solid var(--border-cream)",
                background: "var(--surface-white-warm)",
                color: "var(--color-text)",
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopyUrl}
              class="min-h-9 px-3 py-1 text-xs font-bold"
              style={{
                borderRadius: "var(--border-radius-sm)",
                border: "none",
                background: "var(--color-accent)",
                color: "#fff",
              }}
              title="Copy link"
              aria-label="Copy link"
            >
              <i class="fa fa-copy" aria-hidden="true"></i>
            </button>
          </div>
          <p
            class="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {share.value.mode === "public-url"
              ? "Portable link includes the shared data"
              : share.value.mode === "server-share"
              ? "Stored server-side, expires in 30 days"
              : "Too large for a portable URL — this link only works in this browser"}
          </p>
        </div>
      )}

      {/* Copied notification — warm rose, on-accent. */}
      {showCopied.value && (
        <div
          class="p-2 text-center"
          style={{
            borderRadius: "var(--border-radius-sm)",
            border:
              "2px solid color-mix(in srgb, var(--color-accent) 25%, transparent)",
            background: "var(--accent-rose-wash)",
          }}
        >
          <p
            class="text-sm font-bold"
            style={{ color: "var(--color-accent)" }}
          >
            <i class="fa fa-check" aria-hidden="true"></i> Copied to clipboard
          </p>
        </div>
      )}

      {/* Help text */}
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
