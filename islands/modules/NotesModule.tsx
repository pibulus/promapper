/**
 * Notes module — human scratch space that lives INSIDE the conversation
 * JSON (same persistence path as the whiteboard scene): autosaved with the
 * conversation, rides shares and backups.
 *
 * Safety rails (Rex + Bumblefuzz findings): every debounced write is pinned
 * to the conversation id captured at keystroke time and DROPPED if the
 * conversation changed underneath it; remote updates (live sync, another
 * tab) land in the textarea unless the user is mid-typing here.
 */

import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import { copyToClipboard } from "@utils/toast.ts";

const SAVE_DEBOUNCE_MS = 800;

export default function NotesModule() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const notes = conversationData.value?.notes ?? "";

  function save(value: string) {
    const forId = conversationData.value?.conversation.id;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const current = conversationData.value;
      // The conversation switched while we were debouncing — this note
      // belongs to the old one; dropping beats corrupting the new one.
      if (!current || current.conversation.id !== forId) return;
      conversationData.value = { ...current, notes: value };
    }, SAVE_DEBOUNCE_MS);
  }

  // External updates (live sync, another tab) reach the DOM unless the
  // user is actively typing in this textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (ta && document.activeElement !== ta && ta.value !== notes) {
      ta.value = notes;
    }
  }, [notes]);

  // No orphaned timers after unmount (rack toggle / conversation switch).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Notes</h3>
          <div class="card-header-actions">
            <button
              onClick={() => {
                const value = taRef.current?.value ?? "";
                if (value) copyToClipboard(value);
              }}
              class="cursor-pointer"
              data-tip="Copy notes"
              aria-label="Copy notes"
            >
              <i class="fa fa-copy text-sm"></i>
            </button>
          </div>
        </div>
        <div class="dashboard-card-body">
          <textarea
            ref={taRef}
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
