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

  useEffect(() => {
    let cancelled = false;

    // Set flag to prevent auto-save
    isViewingShared.value = true;
    isLoading.value = true;
    loadError.value = null;

    async function loadShare() {
      const shared = loadSharedConversation(shareId);

      if (shared) {
        applySharedData(shared);
        if (!cancelled) isLoading.value = false;
        return;
      }

      try {
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

function applySharedData(shared: any) {
  conversationData.value = {
    conversation: shared.conversation,
    transcript: shared.transcript,
    nodes: shared.nodes ?? [],
    edges: shared.edges ?? [],
    actionItems: shared.actionItems ?? [],
    statusUpdates: shared.statusUpdates ?? [],
    summary: shared.summary,
  };
}
