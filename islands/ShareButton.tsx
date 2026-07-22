/**
 * Share Button Island - Generate Shareable Links
 *
 * Creates share links for conversations with copy-to-clipboard,
 * animated copy confirmation, and expiry countdown.
 *
 * Also the home of "Start a live room" (absorbed from GoLiveButton, July 23
 * icon audit): share-a-snapshot and bring-people-in-live are one intent —
 * ONE header entry point, the popover offers both.
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import {
  liveSession,
  startLiveMode,
  stopLiveMode,
} from "@signals/liveSessionStore.ts";
import {
  createBestShareLink,
  type ShareCreationResult,
} from "../core/storage/shareService.ts";
import { ensureApiSession } from "../utils/apiAuth.ts";
import { showToast } from "../utils/toast.ts";

export default function ShareButton() {
  const share = useSignal<ShareCreationResult | null>(null);
  const isGenerating = useSignal(false);
  const liveStarting = useSignal(false);
  const popoverOpen = useSignal(false);
  // What the current share.value was minted from — lets a re-click reopen the
  // existing link instead of minting a fresh server row every time.
  const lastSharedJSON = useSignal("");
  const containerRef = useRef<HTMLDivElement>(null);

  const canShare = useComputed(() => conversationData.value !== null);

  // We pushState to /live/<roomId> when a meeting starts; honor the browser
  // back button by actually leaving the session (before this, back showed "/"
  // while the session silently stayed live).
  useEffect(() => {
    const onPopState = () => {
      if (
        liveSession.value &&
        !globalThis.location.pathname.startsWith("/live/")
      ) {
        stopLiveMode();
        showToast("Left the live session", "info");
      }
    };
    globalThis.addEventListener("popstate", onPopState);
    return () => globalThis.removeEventListener("popstate", onPopState);
  }, []);

  async function startMeeting() {
    if (liveStarting.value) return;
    liveStarting.value = true;
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
      // Update URL without navigation so the room is shareable. The popover
      // stays open — liveSession flips and the live-room link row appears
      // right where the button was.
      globalThis.history.pushState({}, "", `/live/${roomId}`);
      showToast("Meeting room started", "info");
    } catch (_e) {
      showToast("Couldn't start a meeting room.", "error");
    } finally {
      liveStarting.value = false;
    }
  }

  // Dismissable popover: Esc or clicking anywhere outside closes it.
  useEffect(() => {
    if (!popoverOpen.value) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") popoverOpen.value = false;
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        popoverOpen.value = false;
      }
    };
    globalThis.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [popoverOpen.value]);

  async function handleShare() {
    if (!conversationData.value) return;
    // Second click = toggle the popover closed.
    if (popoverOpen.value) {
      popoverOpen.value = false;
      return;
    }
    // Same content as the last share → reopen the existing link, don't mint
    // another server row.
    const json = JSON.stringify(conversationData.value);
    if (share.value && lastSharedJSON.value === json) {
      popoverOpen.value = true;
      return;
    }
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
      lastSharedJSON.value = json;
      popoverOpen.value = true;
      if (result.serverFailed && result.warning) {
        showToast(result.warning, "warning");
      }
      if (result.mode !== "local-only") {
        // Mobile → open the OS share sheet so it's one tap to a friend.
        // Desktop (no native share) → fall back to copying the link.
        const shared = await tryNativeShare(
          result.url,
          "Here's a project map I put together — take a look.",
        );
        if (!shared) copyToClipboard(result.url);
      }
    } catch (error) {
      console.error("Failed to create share:", error);
      showToast("That didn't take — give it another try in a sec", "error");
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

  // Native share sheet on mobile (falls back to clipboard). Returns true if the
  // OS sheet handled it, so callers can skip the copy toast.
  async function tryNativeShare(
    url: string,
    message: string,
  ): Promise<boolean> {
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share !== "function") return false;
    try {
      await nav.share({
        title: "A ProMapper project map",
        text: message,
        url,
      });
      return true;
    } catch (error) {
      // AbortError = user dismissed the sheet on purpose; not a failure, and
      // we shouldn't then noisily copy behind their back.
      if (error instanceof Error && error.name === "AbortError") return true;
      return false;
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Link copied — send it to someone lovely", "success");
    } catch (error) {
      // Clipboard API can be unavailable (non-HTTPS, older Safari) — the link
      // is still visible in the panel, so point the user at it rather than
      // failing silently.
      console.error("Failed to copy share link:", error);
      showToast("Grab the link below and pop it wherever you like", "warning");
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
    <div class="relative" ref={containerRef}>
      <button
        onClick={handleShare}
        disabled={!canShare.value || isGenerating.value}
        class="header-icon-btn"
        data-tip={isGenerating.value ? "Generating…" : "Share"}
        data-tip-align="right"
        aria-label="Share conversation"
        aria-expanded={popoverOpen.value}
      >
        <i
          class={`fa ${isGenerating.value ? "fa-spinner fa-spin" : "fa-link"}`}
          aria-hidden="true"
        >
        </i>
      </button>

      {share.value && popoverOpen.value && (
        <div
          class={`absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3 share-popover${
            isLocalOnly ? " is-local" : ""
          }`}
        >
          <button
            type="button"
            class="share-popover-close"
            onClick={() => popoverOpen.value = false}
            aria-label="Close share panel"
            data-tip="Close"
            data-tip-align="right"
          >
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
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
                  onClick={async () => {
                    const url = liveRoomUrl();
                    const shared = await tryNativeShare(
                      url,
                      "Come join my live ProMapper room — we'll map it out together.",
                    );
                    if (!shared) copyToClipboard(url);
                  }}
                  class="min-h-9 px-3 py-1 text-xs font-bold share-copy-btn"
                  data-tip="Copy live link"
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
                data-tip="Copy link"
              >
                <i class="fa fa-copy" aria-hidden="true"></i>
              </button>
            </div>
          )}

          {remaining !== null && remaining > 0 && (
            <p
              class="text-xs font-semibold"
              style={{ color: "var(--accent-ink)" }}
            >
              Expires in {remaining} day{remaining !== 1 ? "s" : ""}
            </p>
          )}

          {/* Not live yet → the other way to bring people in, right here. */}
          {!liveSession.value && (
            <div class="share-golive-row">
              <button
                type="button"
                class="share-golive-btn"
                onClick={startMeeting}
                disabled={liveStarting.value}
              >
                <i
                  class={`fa ${
                    liveStarting.value
                      ? "fa-spinner fa-spin"
                      : "fa-tower-broadcast"
                  }`}
                  aria-hidden="true"
                >
                </i>
                <span>
                  {liveStarting.value ? "Starting…" : "Start a live room"}
                </span>
              </button>
              <p
                class="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Talk and edit together in real time — the link appears here.
              </p>
            </div>
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
