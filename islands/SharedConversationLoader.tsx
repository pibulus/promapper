/**
 * Shared Conversation Loader Island
 *
 * Client-side loader for shared conversations
 * Prevents auto-save by setting isViewingShared flag
 */

import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { loadSharedConversation } from "../core/storage/shareService.ts";
import {
  conversationData,
  isViewingShared,
} from "@signals/conversationStore.ts";
import DashboardIsland from "./DashboardIsland.tsx";

interface Props {
  shareId: string;
}

export default function SharedConversationLoader({ shareId }: Props) {
  const isLoading = useSignal(true);
  const loadError = useSignal<string | null>(null);
  // Share extras: pointer to a live room + per-assignee filter badge.
  const liveRoomId = useSignal<string | null>(null);
  const filterAssignee = useSignal<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Set flag to prevent auto-save
    isViewingShared.value = true;
    isLoading.value = true;
    loadError.value = null;

    async function loadShare() {
      try {
        const shared = loadSharedConversation(shareId);

        if (shared) {
          applySharedData(shared);
          const extras = extractShareExtras(shared);
          liveRoomId.value = extras.liveRoomId;
          filterAssignee.value = extras.filterAssignee;
          return;
        }

        const response = await fetch(
          `/api/share/${encodeURIComponent(shareId)}`,
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "Share not found.",
          );
        }

        if (!cancelled && payload.data) {
          applySharedData(payload.data);
          const extras = extractShareExtras(payload.data);
          liveRoomId.value = extras.liveRoomId;
          filterAssignee.value = extras.filterAssignee;
        }
      } catch (error) {
        if (!cancelled) {
          loadError.value = error instanceof Error
            ? error.message
            : "This share link could not be loaded.";
        }
      } finally {
        if (!cancelled) isLoading.value = false;
      }
    }

    loadShare();

    // Cleanup: reset flag when leaving shared view
    return () => {
      cancelled = true;
      isViewingShared.value = false;
      conversationData.value = null;
    };
  }, [shareId]);

  // Check if conversation loaded
  const hasConversation = conversationData.value !== null;

  if (isLoading.value) {
    return (
      <div class="bg-white rounded-lg border-4 border-purple-200 shadow-lg p-8 text-center">
        <div class="text-5xl mb-4">🔗</div>
        <h2 class="text-2xl font-bold text-purple-600 mb-2">
          Loading shared conversation
        </h2>
        <p class="text-gray-700">Opening the shared map...</p>
      </div>
    );
  }

  if (!hasConversation) {
    return (
      <div class="bg-white rounded-lg border-4 border-red-300 shadow-lg p-8 text-center">
        <div class="text-6xl mb-4">😔</div>
        <h2 class="text-2xl font-bold text-red-600 mb-2">
          Conversation Not Found
        </h2>
        <p class="text-gray-700 mb-6">
          {loadError.value ||
            "This share link may have expired or doesn't exist."}
        </p>
        <a
          href="/"
          class="inline-block bg-purple-500 text-white font-bold py-2 px-6 rounded-lg border-2 border-purple-700 hover:bg-purple-600 transition-colors"
        >
          Go to Home
        </a>
      </div>
    );
  }

  return (
    <div>
      {
        /* Live-room pointer — this snapshot came from a session that may
          still be going. */
      }
      {liveRoomId.value && (
        <a href={`/live/${liveRoomId.value}`} class="shared-live-banner">
          <span class="live-badge__dot" aria-hidden="true" />
          This project has a live room — join in real time
          <i class="fa fa-arrow-right" aria-hidden="true" />
        </a>
      )}

      {/* Filtered-share badge */}
      {filterAssignee.value && (
        <div class="shared-filter-badge">
          Showing{" "}
          <strong>{filterAssignee.value}</strong>'s action items from this
          project
        </div>
      )}

      {/* Info Banner */}
      <div class="bg-blue-100 border-4 border-blue-300 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          📢 This is a read-only view of a shared conversation.{" "}
          <a href="/" class="underline font-bold hover:text-blue-600">
            Create your own
          </a>{" "}
          to analyze your meetings!
        </p>
      </div>

      {/* Dashboard with read-only data */}
      <DashboardIsland />
    </div>
  );
}

/** Pull sanitizable live/filter extras off a share payload. */
function extractShareExtras(
  shared: unknown,
): { liveRoomId: string | null; filterAssignee: string | null } {
  const s = (shared ?? {}) as Record<string, unknown>;
  const live = s.live as Record<string, unknown> | undefined;
  const filter = s.filter as Record<string, unknown> | undefined;
  const roomId = typeof live?.roomId === "string" &&
      /^[A-Za-z0-9_-]{3,64}$/.test(live.roomId)
    ? live.roomId
    : null;
  const assignee =
    typeof filter?.assignee === "string" && filter.assignee.trim()
      ? filter.assignee.trim().slice(0, 120)
      : null;
  return { liveRoomId: roomId, filterAssignee: assignee };
}

function applySharedData(shared: unknown) {
  // The dashboard dereferences conversation.source and transcript.text — a
  // share payload missing either would white-screen the whole shared view.
  if (!shared || typeof shared !== "object") {
    throw new Error("This share link could not be loaded.");
  }
  const s = shared as Record<string, unknown>;
  if (!s.conversation || typeof s.conversation !== "object") {
    throw new Error("This share link could not be loaded.");
  }
  conversationData.value = {
    conversation: s.conversation,
    transcript: s.transcript && typeof s.transcript === "object"
      ? s.transcript
      : { text: "", speakers: [] },
    nodes: Array.isArray(s.nodes) ? s.nodes : [],
    edges: Array.isArray(s.edges) ? s.edges : [],
    actionItems: Array.isArray(s.actionItems) ? s.actionItems : [],
    statusUpdates: Array.isArray(s.statusUpdates) ? s.statusUpdates : [],
    summary: s.summary,
    // deno-lint-ignore no-explicit-any
  } as any;
}
