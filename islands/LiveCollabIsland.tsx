/**
 * Live Collaboration Island
 *
 * Hydration root for a /live/[roomId] room. On mount it joins the room and
 * starts two-way sync (remote updates flow into conversationData via the
 * loopback-guarded liveSync); on unmount it disconnects. Renders the normal
 * dashboard plus a live bar showing connection state + who's here.
 */

import { useEffect, useRef } from "preact/hooks";
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
  userColor,
} from "@signals/presenceStore.ts";
import { startLiveSync, stopLiveSync } from "@signals/liveSync.ts";
import { sendRename } from "@signals/partyService.ts";
import { showToast } from "@utils/toast.ts";
import { soundChime, soundPortal } from "@utils/sound.ts";
import DashboardIsland from "./DashboardIsland.tsx";
import ChatSidebar from "./ChatSidebar.tsx";

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
    const next = globalThis.prompt("Your display name:", getLocalIdentity());
    if (!next || !next.trim()) return;
    setLocalIdentity(next);
    sendRename(next.trim());
  }

  return (
    <div>
      {/* Live bar */}
      <header
        style={{
          background: "rgba(255, 250, 245, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "2px solid var(--color-border)",
          padding: "0.75rem var(--card-padding)",
        }}
        class="flex items-center justify-between gap-3"
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
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: connected ? "#52A37F" : "var(--color-border)",
                display: "inline-block",
              }}
            />
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
              <span
                key={u.id}
                title={u.alias || u.avatar}
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  background: userColor(u.id),
                  color: "#fff",
                  border: "2px solid var(--soft-cream)",
                  fontSize: "0.7rem",
                  fontWeight: "700",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {(u.alias || u.avatar || "?").charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          <button
            onClick={renameSelf}
            class="action-header-btn"
            style={{
              background: "var(--surface-cream)",
              fontSize: "var(--tiny-size)",
              padding: "0.25rem 0.6rem",
              borderRadius: "var(--border-radius-sm)",
            }}
            title="Change your display name"
            aria-label="Change your display name"
          >
            ✎ Name
          </button>
        </div>
      </header>

      {/* Dashboard (or waiting state) */}
      <div style={{ padding: "var(--card-padding)" }}>
        {hasData ? <DashboardIsland /> : (
          <div
            class="max-w-md mx-auto text-center"
            style={{
              padding: "3rem 1rem",
              color: "var(--color-text-secondary)",
            }}
          >
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
    </div>
  );
}
