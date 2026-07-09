/**
 * Canvas — the whiteboard as a module, outside live meetings. Draw by hand;
 * the scene lives in the conversation JSON (same field the live whiteboard
 * uses), so a sketch started solo is already on the board when you go live.
 *
 * During a live session the meeting panel owns the board (two mounted
 * Excalidraws would fight), so this card steps aside.
 */

import { useEffect, useRef } from "preact/hooks";
import SharedWhiteboard from "../SharedWhiteboard.tsx";
import { conversationData } from "@signals/conversationStore.ts";
import { liveSession } from "@signals/liveSessionStore.ts";

const SAVE_DEBOUNCE_MS = 2_000;

export default function CanvasModule() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persistScene(scene: string) {
    const forId = conversationData.value?.conversation.id;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const current = conversationData.value;
      // Conversation switched mid-debounce — this sketch belongs to the old
      // one; dropping beats stamping it onto the new one (Bumblefuzz #2).
      if (!current || current.conversation.id !== forId) return;
      conversationData.value = { ...current, whiteboardScene: scene };
    }, SAVE_DEBOUNCE_MS);
  }

  // No orphaned timers after unmount (rack toggle / live handoff / switch).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (liveSession.value) {
    return (
      <div class="w-full h-full">
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>Canvas</h3>
          </div>
          <div class="dashboard-card-body">
            <p class="canvas-live-note">
              The board is live in the meeting panel below — everything you drew
              here is already on it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Canvas</h3>
          <span class="bishop-subtitle">draw alongside the map</span>
        </div>
        <div class="dashboard-card-body canvas-module-body">
          <SharedWhiteboard
            roomId="local"
            initialScene={conversationData.value?.whiteboardScene}
            onSceneChange={persistScene}
          />
        </div>
      </div>
    </div>
  );
}
