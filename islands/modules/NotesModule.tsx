/**
 * Notes module — human scratch space that lives INSIDE the conversation
 * JSON (same persistence path as the whiteboard scene): autosaved with the
 * conversation, rides shares and backups, feeds nothing to the AI unless a
 * future export wants it.
 */

import { useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import { copyToClipboard } from "@utils/toast.ts";

const SAVE_DEBOUNCE_MS = 800;

export default function NotesModule() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notes = conversationData.value?.notes ?? "";

  function save(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!conversationData.value) return;
      conversationData.value = { ...conversationData.value, notes: value };
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Notes</h3>
          <div class="card-header-actions">
            <button
              onClick={() => notes && copyToClipboard(notes)}
              class="cursor-pointer"
              data-tip="Copy"
              aria-label="Copy notes"
              disabled={!notes}
            >
              <i class="fa fa-copy text-sm"></i>
            </button>
          </div>
        </div>
        <div class="dashboard-card-body">
          <textarea
            class="notes-module-textarea"
            placeholder="Scraps, thoughts, anything — it stays with this conversation."
            defaultValue={notes}
            onInput={(e) => save((e.target as HTMLTextAreaElement).value)}
            aria-label="Conversation notes"
          />
        </div>
      </div>
    </div>
  );
}
