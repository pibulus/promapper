/**
 * Live Collaboration Island
 *
 * Hydration root for a /live/[roomId] room. On mount it joins the room and
 * starts two-way sync (remote updates flow into conversationData via the
 * loopback-guarded liveSync); on unmount it disconnects. Renders the normal
 * dashboard plus a live bar showing connection state + who's here.
 */

import { useEffect } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { conversationData } from "@signals/conversationStore.ts";
import {
  connectedRoomId,
  partyConnected,
} from "@signals/partyConnectionStore.ts";
import {
  getLocalIdentity,
  remoteUsers,
  userColor,
} from "@signals/presenceStore.ts";
import { startLiveSync, stopLiveSync } from "@signals/liveSync.ts";
import DashboardIsland from "./DashboardIsland.tsx";

interface LiveCollabIslandProps {
  roomId: string;
  partyHost: string;
}

export default function LiveCollabIsland(
  { roomId, partyHost }: LiveCollabIslandProps,
) {
  useEffect(() => {
    if (!IS_BROWSER || !partyHost) return;
    startLiveSync({
      host: partyHost,
      roomId,
      avatar: getLocalIdentity(),
    });
    return () => stopLiveSync();
  }, [roomId, partyHost]);

  const connected = partyConnected.value && connectedRoomId.value === roomId;
  const users = remoteUsers.value;
  const hasData = Boolean(conversationData.value);

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
    </div>
  );
}
