/**
 * Notes module — human scratch space that lives INSIDE the conversation
 * JSON (same persistence path as the whiteboard scene): autosaved with the
 * conversation, rides shares and backups.
 *
 * Safety rails (Rex + Bumblefuzz findings): every debounced write is pinned
 * to the conversation id captured at keystroke time and DROPPED if the
 * conversation changed underneath it; remote updates (live sync, another
 * tab) land in the textarea unless the user is mid-typing here.
 *
 * That drop is correct but it used to be the ONLY outcome: this 800ms debounce
 * sits in front of the store's own 500ms autosave debounce, so leaving within
 * ~1.3s of a keystroke lost the note twice over — pinned-and-dropped here, and
 * cancel-on-null there. `commit()` now runs on blur (which fires on mousedown,
 * before any History row or wordmark click handler) and on unmount, so the note
 * lands while its conversation is still the open one.
 */

import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import { flushPendingSave } from "@core/storage/localStorage.ts";
import { copyToClipboard } from "@utils/toast.ts";

const SAVE_DEBOUNCE_MS = 800;

export default function NotesModule() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: string; forId?: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const notes = conversationData.value?.notes ?? "";

  /** Write the pending note now (debounce timer or not). Safe to call twice. */
  function commit() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    const current = conversationData.value;
    // The conversation switched while we were debouncing — this note
    // belongs to the old one; dropping beats corrupting the new one.
    if (!current || current.conversation.id !== p.forId) return;
    // No-op writes would wake the autosave + the live broadcast for nothing.
    if (current.notes === p.value) return;
    conversationData.value = { ...current, notes: p.value };
  }

  function save(value: string) {
    pending.current = {
      value,
      forId: conversationData.value?.conversation.id,
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, SAVE_DEBOUNCE_MS);
  }

  // External updates (live sync, another tab) reach the DOM unless the
  // user is actively typing in this textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (ta && document.activeElement !== ta && ta.value !== notes) {
      ta.value = notes;
    }
  }, [notes]);

  // No orphaned timers after unmount (rack toggle / conversation switch) —
  // and the note in flight gets written rather than thrown away.
  useEffect(() => {
    return () => commit();
  }, []);

  // Tab close / backgrounding (the common one on a phone: type a line, swipe
  // away). DashboardIsland already flushes for this, but it saves the SIGNAL —
  // which doesn't hold this note yet. Commit into the signal first, then land
  // it, so the outcome doesn't depend on which listener fires first.
  useEffect(() => {
    const flush = () => {
      commit();
      flushPendingSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    globalThis.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
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
            defaultValue={notes}
            onInput={(e) => save((e.target as HTMLTextAreaElement).value)}
            onBlur={commit}
            aria-label="Conversation notes"
          />
        </div>
      </div>
    </div>
  );
}
