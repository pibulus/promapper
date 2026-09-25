// ===================================================================
// Take journal — every recording in progress, chunk by chunk.
//
// Both batch recorders (the home table's and AudioRecorder's) held their
// audio in memory until stop, so a crashed tab, a dead battery or iOS
// killing the page mid-take lost the whole take. Every chunk now lands
// here as it arrives. A take is cleared once it's safe somewhere else;
// anything still here on a fresh load never got there, and
// utils/takeRecovery.ts hands it back.
//
// KEYED PER TAKE. The first cut kept one slot, and a new take's first chunk
// wiped it — so recording again right after a crash, or adding a take while
// a recovered one waited on the home table, destroyed the audio this exists
// to save.
//
// While a take records, its tab holds a Web Lock named after it. The browser
// drops the lock the moment the tab dies, so "is this take's lock held?" is
// the exact difference between a crashed take and one another tab is still
// recording. Everything no-ops without IndexedDB, same as recordingsDB.
// Fleet pattern: _shared-modules/crash-recovery (canonical Pass 4.6).
// ===================================================================

const DB_NAME = "promapper-take-journal";
const CHUNKS = "chunks"; // key [takeId, seq]
const TAKES = "takes"; // key takeId
const LOCK_PREFIX = "promapper-take:";

/** Below this a take is a blink-tap, not something to hand back — the same
 * floor as the server's MIN_AUDIO_SIZE and AudioRecorder's minBlobBytes. */
export const MIN_RECOVERABLE_BYTES = 1024;

export interface TakeMeta {
  takeId: string;
  mimeType: string;
  startedAt: string;
  /** Set when the take was being added to an existing map. */
  conversationId?: string;
  title?: string;
}

export interface JournalRow {
  takeId: string;
  seq: number;
  data: Blob;
}

export interface JournaledTake {
  meta: TakeMeta;
  blob: Blob;
}

/**
 * Pure: every journaled take worth handing back (newest first), plus the ids
 * of what isn't — blink-taps, and takes whose chunk 0 (the container header)
 * never landed, which can't decode. Exported for tests.
 */
export function assembleTakes(
  metas: TakeMeta[],
  rows: JournalRow[],
): { ready: JournaledTake[]; junk: string[] } {
  const byTake = new Map<string, JournalRow[]>();
  for (const row of rows) {
    const list = byTake.get(row.takeId);
    if (list) list.push(row);
    else byTake.set(row.takeId, [row]);
  }
  const ready: JournaledTake[] = [];
  const junk: string[] = [];
  for (const meta of metas) {
    const sorted = (byTake.get(meta.takeId) ?? []).sort((a, b) =>
      a.seq - b.seq
    );
    byTake.delete(meta.takeId);
    const blob = new Blob(sorted.map((r) => r.data), { type: meta.mimeType });
    if (sorted[0]?.seq !== 0 || blob.size < MIN_RECOVERABLE_BYTES) {
      junk.push(meta.takeId);
    } else {
      ready.push({ meta, blob });
    }
  }
  junk.push(...byTake.keys()); // rows with no take left to belong to
  ready.sort((a, b) => b.meta.startedAt.localeCompare(a.meta.startedAt));
  return { ready, junk };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CHUNKS, { keyPath: ["takeId", "seq"] });
        req.result.createObjectStore(TAKES, { keyPath: "takeId" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null; // private mode and friends — the next call retries
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export interface TakeJournal {
  takeId: string;
  /** Cancelled: stop journaling and forget what's already here. */
  discard(): void;
}

/**
 * Journal one recorder's take from its OWN dataavailable events. Call it
 * before recorder.start(). The chunk index is counted here, never read off a
 * caller's array: Cancel and unmount reset that array BEFORE the recorder's
 * last chunk arrives, and the tail then claimed to be chunk 0 of a new take —
 * a headerless ghost that came back on the next load as a "recovered" take.
 *
 * Writes are fire-and-forget: recording never waits on the journal or fails
 * because of it. Every write is a transaction created through the same
 * cached openDB() promise, so they run in the order chunks arrive.
 */
export function startJournal(
  recorder: MediaRecorder,
  meta?: Pick<TakeMeta, "conversationId" | "title">,
): TakeJournal {
  const takeId = crypto.randomUUID();
  let seq = 0;
  let discarded = false;

  const onData = (e: BlobEvent) => {
    if (discarded || !e.data?.size) return;
    const n = seq++;
    const data = e.data;
    void openDB().then((db) => {
      if (!db) return;
      const tx = db.transaction([CHUNKS, TAKES], "readwrite");
      if (n === 0) {
        tx.objectStore(TAKES).put(
          {
            takeId,
            mimeType: data.type || recorder.mimeType || "audio/webm",
            startedAt: new Date().toISOString(),
            ...meta,
          } satisfies TakeMeta,
        );
      }
      tx.objectStore(CHUNKS).put({ takeId, seq: n, data } satisfies JournalRow);
    }).catch(() => {/* best effort — the in-memory take is unaffected */});
  };
  recorder.addEventListener("dataavailable", onData);

  // Held until the recorder stops (its last chunk fires first, so it's
  // journaled by then). A lock granted after stop lets go at once.
  let stopped = false;
  let release: (() => void) | null = null;
  recorder.addEventListener("stop", () => {
    stopped = true;
    release?.();
  }, { once: true });
  navigator.locks?.request(
    LOCK_PREFIX + takeId,
    () =>
      stopped ? undefined : new Promise<void>((resolve) => {
        release = resolve;
      }),
  ).catch(() => {});

  return {
    takeId,
    discard() {
      discarded = true;
      recorder.removeEventListener("dataavailable", onData);
      void clearTake(takeId);
    },
  };
}

/** The take is safe elsewhere (mapped, kept as a take) or was let go. */
export async function clearTake(takeId: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction([CHUNKS, TAKES], "readwrite");
    tx.objectStore(CHUNKS).delete(
      IDBKeyRange.bound([takeId, 0], [takeId, Infinity]),
    );
    tx.objectStore(TAKES).delete(takeId);
    await txDone(tx);
  } catch {
    // best effort
  }
}

/** Everything in the journal. Both reads are issued before either is
 * awaited, so the transaction has no gap to auto-commit in. */
export async function readJournal(): Promise<
  { ready: JournaledTake[]; junk: string[] }
> {
  const db = await openDB();
  if (!db) return { ready: [], junk: [] };
  try {
    const tx = db.transaction([CHUNKS, TAKES], "readonly");
    const metas = tx.objectStore(TAKES).getAll();
    const rows = tx.objectStore(CHUNKS).getAll();
    await txDone(tx);
    return assembleTakes(
      metas.result as TakeMeta[],
      rows.result as JournalRow[],
    );
  } catch {
    return { ready: [], junk: [] };
  }
}

/** Takes some tab is recording right now. Without Web Locks nothing is
 * known to be live, and every take reads as crashed. */
export async function liveTakeIds(): Promise<Set<string>> {
  try {
    const { held = [], pending = [] } = await navigator.locks.query();
    return new Set(
      [...held, ...pending]
        .map((lock) => lock.name ?? "")
        .filter((name) => name.startsWith(LOCK_PREFIX))
        .map((name) => name.slice(LOCK_PREFIX.length)),
    );
  } catch {
    return new Set();
  }
}
