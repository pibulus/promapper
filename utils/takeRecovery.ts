// ===================================================================
// Take recovery — hand back a recording that got cut short.
//
// Runs once per page load (HomeIsland). The journal (core/storage/
// takeJournal.ts) holds a take until it's safe somewhere else, so anything
// still in it on a fresh load never got there: a crash, a dead battery, iOS
// killing the tab, a stray reload — or a first take whose mapping failed
// before the tab closed.
//
// - An added take goes where every take goes: recordingsDB, under its own
//   map, with no receipt — so that map's existing "not mapped yet" nudge
//   offers it the next time the map opens. Then the journal lets go.
// - A first take has no map to wait in yet, so it becomes the home table's
//   pending audio ("Try again" maps it). The journal keeps it until it's
//   mapped or let go — a crash during THAT try is covered too.
// ===================================================================

import { pendingAudio } from "@signals/conversationStore.ts";
import { clearJournal, readJournal } from "@core/storage/takeJournal.ts";
import { saveRecording } from "@core/storage/recordingsDB.ts";
import { getAllConversations } from "@core/storage/localStorage.ts";
import { showActionToast, showToast } from "@utils/toast.ts";
import { t } from "@utils/i18n.ts";

/** A live take writes a chunk at least once a second (both recorders'
 * timeslices are ≤1s); a crashed one never writes again. */
const STILL_RECORDING_CHECK_MS = 2500;

/** The audio is in a map now, or was let go — nothing left to recover. */
export function letGoOfPendingAudio(): void {
  pendingAudio.value = null;
  void clearJournal();
}

export async function recoverUnfinishedTake(): Promise<void> {
  const first = await readJournal();
  if (!first) return;

  // Another tab may be mid-take right now, writing into this same journal.
  // Taking its half-finished audio would file a copy of it and then pull the
  // journal out from under it. A crashed take doesn't grow; a live one does.
  await new Promise((r) => setTimeout(r, STILL_RECORDING_CHECK_MS));
  const take = await readJournal();
  if (
    !take || take.meta.startedAt !== first.meta.startedAt ||
    take.chunks !== first.chunks
  ) return;

  const i18n = t();
  const { meta, blob } = take;

  // An added take whose map still exists waits in that map. If the map was
  // deleted since, filing it there would hand it to the orphan sweep on the
  // next load — so it falls through to the home table like a first take.
  if (meta.conversationId && meta.conversationId in getAllConversations()) {
    const saved = await saveRecording({
      id: crypto.randomUUID(),
      conversationId: meta.conversationId,
      data: blob,
      mimeType: blob.type || meta.mimeType,
      fileName: i18n.recoveredTakeName,
      createdAt: meta.startedAt,
    });
    if (!saved) return; // journal keeps it; the next load tries again
    await clearJournal();
    showToast(i18n.recoveredAddedTake(meta.title ?? ""), "info", 8000);
    return;
  }

  pendingAudio.value = blob;
  showActionToast(
    i18n.recoveredFirstTake,
    i18n.recoveredLetGo,
    letGoOfPendingAudio,
    12000,
  );
}
