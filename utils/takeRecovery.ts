// ===================================================================
// Take recovery — hand back recordings that never made it anywhere.
//
// Runs once per page load (HomeIsland). The journal (core/storage/
// takeJournal.ts) holds each take until it's safe somewhere else, so a take
// still in it — and not being recorded by a live tab — never got there: a
// crash, a dead battery, iOS killing the tab, a stray reload, or a first take
// whose mapping failed before the tab closed.
//
// - An added take goes where every take goes: recordingsDB, under its own
//   map, with no receipt — so that map's "not mapped yet" nudge offers it.
//   It's saved under the SAME id the recorder would have used, so a take the
//   recorder already saved (crash between save and clear), or one two
//   restored tabs both recover, is kept exactly once.
// - A first take has no map to wait in yet, so it becomes the home table's
//   pending audio ("Try that again" maps it). Its journal entry stays until
//   it's mapped or let go.
// ===================================================================

import { pendingAudio } from "@signals/conversationStore.ts";
import {
  clearTake,
  liveTakeIds,
  readJournal,
} from "@core/storage/takeJournal.ts";
import { hasRecording, saveRecording } from "@core/storage/recordingsDB.ts";
import {
  flushPendingSave,
  getAllConversations,
} from "@core/storage/localStorage.ts";
import { showActionToast, showErrorToast, showToast } from "@utils/toast.ts";
import { t } from "@utils/i18n.ts";

// Which journal entry a pending blob came from, so letting the blob go lets
// its journal entry go too — whichever take (fresh or recovered) it is.
const journalIdOf = new WeakMap<Blob, string>();

export function linkPendingJournal(blob: Blob, takeId: string): void {
  journalIdOf.set(blob, takeId);
}

/** The audio is in a map now, or was let go — nothing left to recover. */
export function letGoOfPendingAudio(): void {
  // Commit the map it may have just landed in BEFORE its journal copy goes:
  // autosave waits 500ms, and a crash inside that window lost both.
  flushPendingSave();
  const takeId = pendingAudio.value && journalIdOf.get(pendingAudio.value);
  pendingAudio.value = null;
  if (takeId) void clearTake(takeId);
}

/**
 * A failed map of pending audio. The journal brings that take back on every
 * load, so one that can never map (offline, daily cap, a rejected file) would
 * hold the record button hostage behind "Try that again" — every failure
 * offers the way out.
 */
export function showPendingAudioFailure(error: unknown, fallback: string) {
  if (!pendingAudio.value) return showErrorToast(error, fallback);
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
  showActionToast(message, t().recoveredLetGo, letGoOfPendingAudio, 10000);
}

export async function recoverUnfinishedTake(): Promise<void> {
  const { ready, junk } = await readJournal();
  if (!ready.length && !junk.length) return;
  const live = await liveTakeIds(); // another tab is recording these
  for (const id of junk) if (!live.has(id)) void clearTake(id);

  const i18n = t();
  const maps = ready.some((take) => take.meta.conversationId)
    ? getAllConversations()
    : {};
  let homeTableTaken = false;

  for (const { meta, blob } of ready) { // newest first
    if (live.has(meta.takeId)) continue;

    // An added take whose map still exists waits in that map. If the map was
    // deleted since, filing it there would hand it to the orphan sweep on the
    // next load — so it falls through to the home table like a first take.
    if (meta.conversationId && meta.conversationId in maps) {
      if (!(await hasRecording(meta.takeId))) {
        const saved = await saveRecording({
          id: meta.takeId,
          conversationId: meta.conversationId,
          data: blob,
          mimeType: blob.type || meta.mimeType,
          fileName: i18n.recoveredTakeName,
          createdAt: meta.startedAt,
        });
        if (!saved) continue; // journal keeps it; the next load tries again
        showToast(i18n.recoveredAddedTake(meta.title ?? ""), "info", 8000);
      }
      await clearTake(meta.takeId);
      continue;
    }

    // One home table, one pending recording. Any older one keeps its journal
    // entry and comes back once this one is mapped or let go.
    if (homeTableTaken) continue;
    homeTableTaken = true;
    pendingAudio.value = blob;
    linkPendingJournal(blob, meta.takeId);
    showActionToast(
      i18n.recoveredFirstTake,
      i18n.recoveredLetGo,
      letGoOfPendingAudio,
      12000,
    );
  }
}
