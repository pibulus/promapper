/**
 * Live Collaboration Island
 *
 * Hydration root for a /live/[roomId] room. On mount it joins the room and
 * starts two-way sync (remote updates flow into conversationData via the
 * loopback-guarded liveSync); on unmount it disconnects. Renders the normal
 * dashboard plus a live bar showing connection state + who's here.
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import {
  conversationData,
  isViewingShared,
} from "@signals/conversationStore.ts";
import {
  connectedRoomId,
  partyConnected,
} from "@signals/partyConnectionStore.ts";
import {
  getLocalIdentity,
  remoteUsers,
  setLocalIdentity,
} from "@signals/presenceStore.ts";
import { buildAvatar } from "@utils/avatar.ts";
import { startLiveSync, stopLiveSync } from "@signals/liveSync.ts";
import { sendRename } from "@signals/partyService.ts";
import { showToast } from "@utils/toast.ts";
import { soundChime, soundPortal } from "@utils/sound.ts";
import DashboardIsland from "./DashboardIsland.tsx";
import ChatSidebar from "./ChatSidebar.tsx";
import Modal from "../components/Modal.tsx";

interface LiveCollabIslandProps {
  roomId: string;
  partyHost: string;
}

export default function LiveCollabIsland(
  { roomId, partyHost }: LiveCollabIslandProps,
) {
  // Track seen user ids so we can toast joins/leaves without spamming on every
  // presence heartbeat. selfId is whatever the server reports first as "us".
  const seenIds = useRef<Set<string> | null>(null);

  // Display name modal
  const showNameModal = useSignal(false);
  const nameModalValue = useSignal("");

  useEffect(() => {
    if (!IS_BROWSER || !partyHost) return;
    // A live room is a borrowed view, like a shared link — don't auto-save the
    // room's conversation into THIS visitor's local history or hijack their
    // active conversation. (The outbound broadcaster is gated separately by the
    // loopback guard, so two-way editing still works.)
    isViewingShared.value = true;
    startLiveSync({
      host: partyHost,
      roomId,
      avatar: getLocalIdentity(),
    });
    return () => {
      stopLiveSync();
      isViewingShared.value = false;
      conversationData.value = null;
      seenIds.current = null;
    };
  }, [roomId, partyHost]);

  const connected = partyConnected.value && connectedRoomId.value === roomId;
  const users = remoteUsers.value;
  const hasData = Boolean(conversationData.value);

  // Join/leave toasts from presence deltas (dedup via seenIds; skip first sync).
  useEffect(() => {
    if (!IS_BROWSER) return;
    const current = new Set(users.map((u) => u.id));
    if (seenIds.current === null) {
      seenIds.current = current; // first presence snapshot — don't announce
      return;
    }
    for (const u of users) {
      if (!seenIds.current.has(u.id)) {
        showToast(`${u.alias || u.avatar} joined`, "info");
        soundChime();
      }
    }
    for (const id of seenIds.current) {
      if (!current.has(id)) showToast("Someone left", "info");
    }
    seenIds.current = current;
  }, [users]);

  // A warm "you're in" cue the moment the room connects.
  useEffect(() => {
    if (connected) soundPortal();
  }, [connected]);

  function renameSelf() {
    nameModalValue.value = getLocalIdentity();
    showNameModal.value = true;
  }

  return (
    <div>
      {/* Live bar */}
      <header
        class="app-header-glass flex items-center justify-between gap-3"
        style={{
          borderBottom: "2px solid var(--color-border)",
          padding: "0.75rem var(--card-padding)",
        }}
      >
        <div class="flex items-center gap-2 min-w-0">
          <a
            href="/"
            style={{ fontWeight: "800", color: "var(--color-text)" }}
            class="shrink-0"
          >
            ProMapper
          </a>
          <span
            class="inline-flex items-center gap-1.5 shrink-0"
            style={{
              fontSize: "var(--tiny-size)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span
              aria-hidden="true"
              class="live-status-dot"
              style={{
                background: connected ? "#52A37F" : "var(--color-border)",
              }}
            />
            <span class="sr-only">
              {connected ? "Connected" : partyHost ? "Connecting" : "Offline"}
            </span>
            {connected
              ? `Live · ${users.length} here`
              : partyHost
              ? "Connecting…"
              : "Live collab not configured"}
          </span>
        </div>

        <div class="flex items-center gap-2">
          {/* Collaborator avatars */}
          <div class="flex items-center -space-x-2">
            {users.slice(0, 6).map((u) => (
              <img
                key={u.id}
                src={buildAvatar(u.id)}
                alt={u.alias || u.avatar}
                title={u.alias || u.avatar}
                width={28}
                height={28}
                class="live-avatar"
              />
            ))}
          </div>
          <button
            onClick={renameSelf}
            class="action-header-btn live-rename-btn"
            title="Change your display name"
            aria-label="Change your display name"
          >
            ✎ Name
          </button>
        </div>
      </header>

      {/* Dashboard (or waiting state) */}
      <div style={{ padding: "var(--card-padding)" }}>
        {hasData
          ? <DashboardIsland />
          : (
            <div class="max-w-md mx-auto text-center live-waiting">
              <div style={{ fontSize: "2rem" }} class="mb-2">🛰️</div>
              <p style={{ fontWeight: "600", color: "var(--color-text)" }}>
                Waiting for the conversation…
              </p>
              <p style={{ fontSize: "var(--small-size)" }} class="mt-1">
                When someone records or adds notes, it appears here live.
              </p>
            </div>
          )}
      </div>

      {/* In-session chat (only once connected) */}
      {connected && <ChatSidebar />}

      {/* Display name modal */}
      {showNameModal.value && (
        <Modal
          open
          onClose={() => showNameModal.value = false}
          titleId="display-name-modal-title"
        >
          <div class="modal-stack">
            <h3
              id="display-name-modal-title"
              style={{
                margin: 0,
                fontSize: "var(--heading-size)",
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              Your display name
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "var(--small-size)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.5,
              }}
            >
              This is how others see you in the live room.
            </p>
            <input
              value={nameModalValue.value}
              onInput={(e) =>
                nameModalValue.value = (e.target as HTMLInputElement).value}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const next = nameModalValue.value.trim();
                  if (next) {
                    setLocalIdentity(next);
                    sendRename(next);
                  }
                  showNameModal.value = false;
                }
              }}
              placeholder="Your name"
              autoFocus
              style={{
                minHeight: "2.75rem",
                border: "2px solid var(--color-border)",
                borderRadius: "8px",
                background: "var(--surface-cream)",
                padding: "0.55rem 0.7rem",
                fontSize: "var(--text-size)",
                color: "var(--color-text)",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <div class="modal-actions">
              <button
                class="btn btn--secondary"
                style={{ flex: 1 }}
                onClick={() => showNameModal.value = false}
                type="button"
              >
                Cancel
              </button>
              <button
                class="btn btn--primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const next = nameModalValue.value.trim();
                  if (next) {
                    setLocalIdentity(next);
                    sendRename(next);
                  }
                  showNameModal.value = false;
                }}
                disabled={!nameModalValue.value.trim()}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
