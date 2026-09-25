// ===================================================================
// Take journal — the recording in progress, chunk by chunk.
//
// Both batch recorders (the home table's and AudioRecorder's) held their
// audio in memory until stop, so a crashed tab, a dead battery or iOS
// killing the page mid-take lost the whole take. Every chunk now lands
// here as it arrives. A take that ends normally is cleared once it's safe
// somewhere else; one that didn't is found on the next load
// (utils/takeRecovery.ts) and handed back.
//
// ONE take at a time: chunk 0 of a new take wipes whatever was here.
// Everything no-ops without IndexedDB, same as recordingsDB.
// Fleet pattern: _shared-modules/crash-recovery (canonical Pass 4.6).
// ===================================================================

const DB_NAME = "promapper-journal";
const CHUNKS = "chunks";
const META = "meta";
const META_KEY = "take";

/** Below this a take is a blink-tap, not something to hand back — the same
 * floor as the server's MIN_AUDIO_SIZE and AudioRecorder's minBlobBytes. */
export const MIN_RECOVERABLE_BYTES = 1024;

export interface TakeMeta {
  mimeType: string;
  startedAt: string;
  /** Set when the take was being added to an existing map. */
  conversationId?: string;
  title?: string;
}

export interface JournalRow {
  seq: number;
  data: Blob;
}

export interface JournaledTake {
  meta: TakeMeta;
  blob: Blob;
  chunks: number;
}

/** Pure: meta + rows (any order) → the take, or null if nothing's worth
 * recovering. Exported for tests; the IDB wrapper below stays thin. */
export function assembleTake(
  meta: TakeMeta | undefined,
  rows: JournalRow[] | undefined,
): JournaledTake | null {
  if (!meta || !rows?.length) return null;
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  const blob = new Blob(sorted.map((r) => r.data), { type: meta.mimeType });
  if (blob.size < MIN_RECOVERABLE_BYTES) return null;
  return { meta, blob, chunks: rows.length };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CHUNKS, { keyPath: "seq" });
        req.result.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // private mode and friends
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

/**
 * Journal one chunk. Fire-and-forget from ondataavailable: recording must
 * never wait on the journal, or fail because of it. Chunk 0 starts a take —
 * the wipe, the meta and its bytes share ONE transaction, and IndexedDB runs
 * overlapping transactions in creation order, so a later chunk can never
 * land in the previous take's journal.
 */
export function journalChunk(
  seq: number,
  data: Blob,
  meta?: Pick<TakeMeta, "conversationId" | "title">,
): void {
  void openDB().then((db) => {
    if (!db) return;
    const tx = db.transaction([CHUNKS, META], "readwrite");
    if (seq === 0) {
      tx.objectStore(CHUNKS).clear();
      const take: TakeMeta = {
        mimeType: data.type || "audio/webm",
        startedAt: new Date().toISOString(),
        ...meta,
      };
      tx.objectStore(META).put(take, META_KEY);
    }
    tx.objectStore(CHUNKS).put({ seq, data } satisfies JournalRow);
  }).catch(() => {/* best effort — the in-memory take is unaffected */});
}

/** The take is safe elsewhere (mapped, kept as a take) or was let go. */
export async function clearJournal(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction([CHUNKS, META], "readwrite");
    tx.objectStore(CHUNKS).clear();
    tx.objectStore(META).clear();
    await txDone(tx);
  } catch {
    // best effort
  }
}

/** The unfinished take, if there is one. Both reads are issued before either
 * is awaited, so the transaction has no gap to auto-commit in. */
export async function readJournal(): Promise<JournaledTake | null> {
  const db = await openDB();
  if (!db) return null;
  try {
    const tx = db.transaction([CHUNKS, META], "readonly");
    const metaReq = tx.objectStore(META).get(META_KEY);
    const rowsReq = tx.objectStore(CHUNKS).getAll();
    await txDone(tx);
    return assembleTake(
      metaReq.result as TakeMeta | undefined,
      rowsReq.result as JournalRow[],
    );
  } catch {
    return null;
  }
}
