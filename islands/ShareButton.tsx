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

  return (
    <div class="relative">
      {/* Share Button */}
      <button
        onClick={handleShare}
        disabled={!canShare.value || isGenerating.value}
        class={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 font-bold transition-colors sm:px-4 ${
          canShare.value && !isGenerating.value
            ? "bg-green-500 text-white border-green-700 hover:bg-green-600"
            : "bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed"
        }`}
        title="Share conversation"
        aria-label="Share conversation"
      >
        <span aria-hidden="true">{isGenerating.value ? "🔄" : "🔗"}</span>
        <span class="hidden sm:inline">
          {isGenerating.value ? "Generating..." : "Share Conversation"}
        </span>
      </button>

      {/* Share URL Display */}
      {share.value && (
        <div
          class={`absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-lg border-2 p-3 shadow-lg ${
            share.value.mode !== "local-only"
              ? "bg-green-50 border-green-300"
              : "bg-amber-50 border-amber-300"
          }`}
        >
          <p
            class={`text-xs font-bold ${
              share.value.mode !== "local-only"
                ? "text-green-800"
                : "text-amber-900"
            }`}
          >
            {share.value.mode === "public-url"
              ? "Portable share link:"
              : share.value.mode === "server-share"
              ? "Share link:"
              : "Saved on this device:"}
          </p>
          <div class="flex gap-2">
            <input
              type="text"
              value={share.value.url}
              readonly
              class={`min-w-0 flex-1 rounded border-2 bg-white px-2 py-1 font-mono text-xs ${
                share.value.mode !== "local-only"
                  ? "border-green-300"
                  : "border-amber-300"
              }`}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopyUrl}
              class={`min-h-9 rounded border-2 px-3 py-1 text-xs font-bold text-white ${
                share.value.mode !== "local-only"
                  ? "bg-green-500 border-green-700 hover:bg-green-600"
                  : "bg-amber-500 border-amber-700 hover:bg-amber-600"
              }`}
              title={share.value.mode !== "local-only"
                ? "Copy share link"
                : "Copy this-device link"}
              aria-label={share.value.mode !== "local-only"
                ? "Copy share link"
                : "Copy this-device link"}
            >
              📋
            </button>
          </div>
          <p
            class={`text-xs ${
              share.value.mode !== "local-only"
                ? "text-green-700"
                : "text-amber-800"
            }`}
          >
            {share.value.mode === "public-url"
              ? "✅ Portable link includes the shared data"
              : share.value.mode === "server-share"
              ? "✅ Link is stored server-side and expires in 30 days"
              : "⚠️ Too large for a portable URL. This link only works in this browser."}
          </p>
        </div>
      )}

      {/* Copied Notification */}
      {showCopied.value && (
        <div class="bg-purple-100 border-2 border-purple-400 rounded-lg p-2 text-center animate-pulse">
          <p class="text-sm font-bold text-purple-700">
            ✨ Copied to clipboard!
          </p>
        </div>
      )}

      {/* Help Text */}
      {!canShare.value && (
        <p class="text-xs text-gray-500 text-center">
          Upload a conversation to enable sharing
        </p>
      )}
    </div>
  );
}
