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
      <div class="shared-panel">
        <div class="shared-panel__icon">
          <i class="fa fa-link" aria-hidden="true"></i>
        </div>
        <h2 class="shared-panel__title">Loading shared conversation</h2>
        <p class="shared-panel__body">Opening the shared map…</p>
      </div>
    );
  }

  if (!hasConversation) {
    return (
      <div class="shared-panel">
        <div class="shared-panel__icon">
          <i class="fa fa-link-slash" aria-hidden="true"></i>
        </div>
        <h2 class="shared-panel__title">Conversation Not Found</h2>
        <p class="shared-panel__body mb-6">
          {loadError.value ||
            "This share link may have expired or doesn't exist."}
        </p>
        <a href="/" class="btn btn--accent">
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

      {
        /* Info Banner — honest about what this view is: you CAN poke at it,
          but nothing you change here is saved or sent anywhere. */
      }
      <div class="shared-note mb-6">
        <p>
          <i class="fa fa-share-nodes" aria-hidden="true"></i>{" "}
          Someone shared this snapshot with you. Feel free to explore — changes
          you make here stay on this device and aren't saved.{" "}
          <a href="/" class="underline font-bold">
            Start your own map
          </a>
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
