/**
 * Live Sync — bridges the conversationData signal to the live room.
 *
 * Outbound: an effect watches conversationData; when we're connected to a room
 * AND the change is local (not a remote apply), it broadcasts the snapshot.
 * Inbound: remote updates are applied via applyRemoteConversation(), which sets
 * the loopback guard so the outbound effect skips them — no echo loop.
 *
 * startLiveSync()/stopLiveSync() are called by the live route island.
 */

import { effect } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import {
  applyingRemoteUpdate,
  applyRemoteConversation,
  conversationData,
} from "@signals/conversationStore.ts";
import {
  type ChatMessage,
  chatMessages,
  liveSyncStatus,
  partyConnected,
  remoteWhiteboardUpdate,
  unreadChatCount,
} from "@signals/partyConnectionStore.ts";
import {
  connectToRoom,
  disconnectFromRoom,
  type PartyCallbacks,
  type PartyConnectOptions,
  sendChat,
  sendConversationUpdate,
} from "@signals/partyService.ts";
import {
  getLocalIdentity,
  type RemoteUser,
  remoteUserName,
} from "@signals/presenceStore.ts";
import type { ConversationData } from "../core/types/conversation-data.ts";
import {
  loadConversation,
  restoreConversation,
} from "../core/storage/localStorage.ts";

import { showToast } from "@utils/toast.ts";
import { reconcileRoomUpdate } from "@core/orchestration/room-reconcile.ts";

const PENDING_TIMEOUT_MS = 5000;
let stopBroadcast: (() => void) | null = null;
let lastObservedJSON = "";
let queuedLocal = false;
let roomReady = false;
let headRev = -1;
let headData: ConversationData | null = null;
let connectBaseline: ConversationData | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pending: {
  id: string;
  base: ConversationData;
  sent: ConversationData;
} | null = null;

function clearPending(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pending = null;
}

function flushLocal(): void {
  if (!roomReady || !partyConnected.value || !queuedLocal || pending) return;
  const current = conversationData.value;
  if (!current || headRev < 0) return;
  const id = crypto.randomUUID();
  if (!sendConversationUpdate(stripWhiteboard(current), headRev, id)) return;
  pending = { id, base: headData ?? current, sent: current };
  liveSyncStatus.value = "syncing";
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    // Write ack timed out after 5s — clear lock and retry if still queued
    pending = null;
    pendingTimer = null;
    queuedLocal = true;
    flushLocal();
  }, PENDING_TIMEOUT_MS);
  queuedLocal = false;
}

function receiveHead(data: ConversationData, rev: number): void {
  if (rev <= headRev) return;
  const base = headData;
  const mine = conversationData.value;
  headData = data;
  headRev = rev;
  const merged = base && mine && mine.conversation.id === data.conversation.id
    ? reconcileRoomUpdate(base, mine, data)
    : data;
  applyRemoteConversation(merged);
  lastObservedJSON = sentKey();
  if (
    JSON.stringify(stripWhiteboard(merged)) !==
      JSON.stringify(stripWhiteboard(data))
  ) queuedLocal = true;
  liveSyncStatus.value = queuedLocal || pending ? "syncing" : "synced";
  if (!pending) flushLocal();
}

/**
 * Connect to a room and start two-way conversation sync. Extra callbacks
 * (chat/typing) can be passed through for the UI layer.
 */
export function startLiveSync(
  options: PartyConnectOptions,
  extra: PartyCallbacks = {},
): void {
  if (!IS_BROWSER) return;
  connectBaseline = conversationData.value;

  // Reset chat state for the new room.
  chatMessages.value = [];
  unreadChatCount.value = 0;

  connectToRoom(options, {
    ...extra,
    onInit: (data, meta, whiteboard) => {
      const rev = metaRev(meta);
      roomReady = true;
      if (data) {
        const incoming = data as ConversationData;
        if (!headData) {
          // A local edit can land between opening the socket and INIT. Keep
          // only that new delta; a pre-existing offline copy still gets filed
          // in History below instead of replacing the room on join.
          const mine = conversationData.value;
          const editedWhileConnecting = mine && connectBaseline &&
            mine.conversation.id === incoming.conversation.id &&
            JSON.stringify(stripWhiteboard(mine)) !==
              JSON.stringify(stripWhiteboard(connectBaseline));
          const merged = editedWhileConnecting
            ? reconcileRoomUpdate(connectBaseline, mine, incoming)
            : incoming;
          const stashed = stashDivergedLocalCopy(incoming);
          if (stashed) {
            showToast(
              stashed.ok
                ? `Kept your version as "${stashed.title}" in History — the room's map is what's on screen.`
                : "Couldn't set your own version aside — storage is full. Leave the room before editing.",
              stashed.ok ? "info" : "error",
              7000,
            );
          }
          headData = incoming;
          headRev = rev ?? 0;
          applyRemoteConversation(merged);
          lastObservedJSON = sentKey();
          queuedLocal = JSON.stringify(stripWhiteboard(merged)) !==
            JSON.stringify(stripWhiteboard(incoming));
          liveSyncStatus.value = queuedLocal ? "syncing" : "synced";
          flushLocal();
        } else if (rev !== null && rev >= headRev) {
          // A reconnect can arrive while a write was in flight. Reconcile
          // against the last accepted head, then retry from the new revision.
          const mine = conversationData.value;
          const merged = mine
            ? reconcileRoomUpdate(headData, mine, incoming)
            : incoming;
          headData = incoming;
          headRev = rev;
          clearPending();
          applyRemoteConversation(merged);
          lastObservedJSON = sentKey();
          queuedLocal = JSON.stringify(stripWhiteboard(merged)) !==
            JSON.stringify(stripWhiteboard(incoming));
          liveSyncStatus.value = queuedLocal ? "syncing" : "synced";
          flushLocal();
        }
      } else if (rev !== null) {
        headRev = rev;
        queuedLocal = Boolean(conversationData.value);
        liveSyncStatus.value = queuedLocal ? "syncing" : "synced";
        flushLocal();
      }
      // The room remembers the whiteboard — late joiners and reloading hosts
      // get the current drawing instead of a blank board.
      if (whiteboard) remoteWhiteboardUpdate.value = whiteboard;
      extra.onInit?.(data, meta, whiteboard);
    },
    onConversationUpdate: (data, rev) => {
      if (!data) return;
      receiveHead(data as ConversationData, rev ?? headRev + 1);
      extra.onConversationUpdate?.(data, rev);
    },
    onUpdateAck: (rev, updateId) => {
      if (pending?.id !== updateId) return;
      if (rev > headRev) {
        headRev = rev;
        headData = pending.sent;
      }
      clearPending();
      liveSyncStatus.value = queuedLocal ? "syncing" : "synced";
      flushLocal();
      extra.onUpdateAck?.(rev, updateId);
    },
    onUpdateStale: (data, rev, updateId) => {
      if (pending?.id !== updateId || !data) return;
      const mine = conversationData.value;
      const incoming = data as ConversationData;
      const merged = mine
        ? reconcileRoomUpdate(pending.base, mine, incoming)
        : incoming;
      headData = incoming;
      headRev = rev;
      clearPending();
      liveSyncStatus.value = "conflict";
      applyRemoteConversation(merged);
      lastObservedJSON = sentKey();
      queuedLocal = JSON.stringify(stripWhiteboard(merged)) !==
        JSON.stringify(stripWhiteboard(incoming));
      flushLocal();
    },
    onChat: (text, sender: RemoteUser, at) => {
      appendChat({
        id: `${sender.id}-${at}`,
        senderId: sender.id,
        senderName: remoteUserName(sender),
        text,
        at,
      });
      extra.onChat?.(text, sender, at);
    },
    onWhiteboardUpdate: (scene) => {
      remoteWhiteboardUpdate.value = scene;
      extra.onWhiteboardUpdate?.(scene);
    },
  });

  // Outbound broadcaster: fire on local conversationData changes only.
  stopBroadcast = effect(() => {
    const data = conversationData.value;
    if (!data) return;
    if (applyingRemoteUpdate.current) return; // remote apply — don't echo
    // Exclude whiteboardScene — the lightweight sendWhiteboardUpdate channel
    // handles live whiteboard sync. It must be stripped from the SENT payload
    // too (not just the dedup key): a big scene riding on every conversation
    // edit could trip the room's 1MB message cap and close the socket.
    const rest = stripWhiteboard(data);
    const json = JSON.stringify(rest);
    if (json === lastObservedJSON) return;
    lastObservedJSON = json;
    queuedLocal = true;
    flushLocal();
  });
}

/** The conversation without its (heavy, separately-synced) whiteboard scene. */
function stripWhiteboard(data: ConversationData): ConversationData {
  const {
    whiteboardScene: _s,
    notes: _notes,
    magpie: _magpie,
    warnings: _warnings,
    ...rest
  } = data;
  return rest as ConversationData;
}

/** The outbound JSON shape (whiteboardScene excluded) for echo-dedup. */
function localJSON(data: ConversationData): string {
  return JSON.stringify(stripWhiteboard(data));
}

/**
 * What a map SAYS, ignoring how it's stored. Sorted, and blind to positions,
 * colors, timestamps and transcript text — so a copy that came back through
 * the room (which re-normalizes `created_at` and re-orders nothing reliably)
 * still matches itself. What it does catch is a topic or task added, removed,
 * renamed, reworded or ticked: divergence a person would notice losing.
 */
function substance(data: ConversationData): string {
  return JSON.stringify({
    nodes: (data.nodes ?? []).map((n) => [n.id, n.label, n.emoji]).sort(),
    items: (data.actionItems ?? []).map((
      i,
    ) => [i.id, i.description, i.status]).sort(),
    summary: data.summary ?? "",
  });
}

/**
 * A room snapshot is about to land on a conversation id this device already
 * holds. Usually that's fine — it's your own copy of this very room, coming
 * back after a reload.
 *
 * But `Go Live` mints a BRAND NEW room id every time and nothing remembers the
 * old one, so the second time a map is shared it's a different room carrying
 * the same conversation id. A guest who left the first meeting with a copy,
 * edited it for a week, then opened the new link had all of it replaced under
 * that id — silently, no merge, no warning, and their notes and whiteboard
 * went too (the join path nulls the signal first, so `applyRemoteConversation`
 * has no `mine` to preserve client-only fields from).
 *
 * Keep their version beside it instead. Not a merge — the reconcile engine
 * could do that properly with a stored BASE per room — just: never delete a
 * week of someone's work to make room for a link they clicked.
 *
 * Returns what it filed (so the caller owns the toast and this stays testable
 * without a DOM), or null when nothing needed keeping. Exported for its test.
 */
export function stashDivergedLocalCopy(
  incoming: ConversationData,
): { title: string; ok: boolean } | null {
  const id = incoming.conversation?.id;
  if (!id) return null;
  const stored = loadConversation(id);
  if (!stored) return null; // nothing of ours here — the room lands free
  if (substance(stored) === substance(incoming)) return null; // same map

  const copyId = crypto.randomUUID();
  const title = `${stored.conversation?.title || "Untitled"} (your copy)`;
  const ok = restoreConversation({
    ...stored,
    id: copyId,
    conversation: { ...stored.conversation, id: copyId, title },
  }, []);
  return { title, ok };
}

/**
 * The dedup key for what we've just taken on board. Must be the LOCAL shape:
 * stamping the raw server payload here compared a sanitized snapshot (no
 * notes/magpie/deleted*) against the local one, so anyone holding a
 * client-only field never matched — every reconnect re-broadcast the whole
 * conversation and bumped the room's revision for nothing.
 */
function sentKey(): string {
  const current = conversationData.value;
  return current ? localJSON(current) : "";
}

/** Read the revision counter out of the INIT meta blob (null if absent). */
function metaRev(meta: unknown): number | null {
  if (meta && typeof meta === "object") {
    const rev = (meta as { rev?: unknown }).rev;
    if (typeof rev === "number" && rev >= 0) return rev;
  }
  return null;
}

export function stopLiveSync(): void {
  stopBroadcast?.();
  stopBroadcast = null;
  lastObservedJSON = "";
  queuedLocal = false;
  roomReady = false;
  headRev = -1;
  headData = null;
  connectBaseline = null;
  clearPending();
  liveSyncStatus.value = "disconnected";
  chatMessages.value = [];
  unreadChatCount.value = 0;
  remoteWhiteboardUpdate.value = null;
  disconnectFromRoom();
}

function appendChat(message: ChatMessage): void {
  // Cap the log so a long session can't grow unbounded.
  chatMessages.value = [...chatMessages.value, message].slice(-200);
}

/** Send a chat message (broadcasts; the server echoes it back to us too). */
export function sendChatMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  sendChat(trimmed);
}

// Re-export for convenience to the UI layer.
export { getLocalIdentity, remoteUserName };
