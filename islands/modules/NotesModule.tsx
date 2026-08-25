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
import {
  conversationData,
  isViewingShared,
  processingConversation,
} from "@signals/conversationStore.ts";
import { flushPendingSave } from "@core/storage/localStorage.ts";
import { resetModules } from "@signals/moduleStore.ts";
import { ensureApiSession } from "../../utils/apiAuth.ts";
import { enqueueApiRequest } from "../../utils/requestQueue.ts";
import { coerceFlowResult } from "../../utils/coerceFlowResult.ts";
import { copyToClipboard, showErrorToast, showToast } from "@utils/toast.ts";
import { soundBloom } from "@utils/sound.ts";

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
    // A shared snapshot has nowhere to keep a note (and the sender's own notes
    // never ride along — the share sanitizer strips them). The textarea is
    // read-only there; this is the net.
    if (isViewingShared.value) return;
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

  async function resampleNotes() {
    commit();
    const text = (taRef.current?.value ?? notes).trim();
    if (!text) return;
    flushPendingSave();
    resetModules();
    conversationData.value = null;
    processingConversation.value = true;
    showToast("Resampling notes into a fresh map…", "info");
    try {
      await ensureApiSession();
      const result = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal,
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Processing failed");
        }
        return response.json();
      });
      const flowResult = coerceFlowResult(result);
      if (!flowResult) {
        throw new Error("Server returned an unexpected response.");
      }
      resetModules();
      conversationData.value = flowResult;
      soundBloom();
      showToast(
        `Resampled! Found ${flowResult.actionItems.length} action items, ${flowResult.nodes.length} topics`,
        "success",
      );
    } catch (err) {
      console.error("❌ Resample error:", err);
      showErrorToast(err, "Couldn't resample notes.");
    } finally {
      processingConversation.value = false;
    }
  }

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
            {!isViewingShared.value && (
              <button
                onClick={resampleNotes}
                class="cursor-pointer"
                data-tip="Resample notes as a new map"
                aria-label="Resample notes as new map"
                disabled={!notes.trim()}
              >
                <i class="fa fa-wand-magic-sparkles text-sm"></i>
              </button>
            )}
          </div>
        </div>
        <div class="dashboard-card-body">
          <textarea
            ref={taRef}
            class="notes-module-textarea"
            defaultValue={notes}
            onInput={(e) => save((e.target as HTMLTextAreaElement).value)}
            onBlur={commit}
            readOnly={isViewingShared.value}
            placeholder={isViewingShared.value
              ? "Notes live with the original — this is a snapshot."
              : undefined}
            aria-label="Conversation notes"
          />
        </div>
      </div>
    </div>
  );
}
