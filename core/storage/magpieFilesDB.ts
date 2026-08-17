/**
 * Magpie files — the shelf can hold real things now.
 *
 * Magpie was pointers-only ("no uploads, no file storage") for a good reason:
 * conversations live in localStorage, and base64 payloads would eat the quota
 * that holds the actual maps. That reason still stands, so the LAW is
 * unchanged — the conversation JSON still stores only a pointer. What changed
 * is that there is now somewhere for the bytes to go: a Blob store, the same
 * shape as recordingsDB.
 *
 * Deliberately its OWN database rather than a second store inside `promapper`.
 * Adding a store means bumping that DB's version, and a version upgrade is
 * BLOCKED while another tab holds the old version open — which for an app
 * people routinely run in two tabs (live collab) would mean a shelf drop
 * could knock out audio takes. A separate database cannot interfere.
 *
 * Everything degrades quietly: no IndexedDB (private mode, SSR, ancient
 * browser) and every call no-ops, the same contract recordings honour.
 *
 * Note for the reader who goes looking: these bytes are LOCAL. They do not
 * ride along in a JSON backup and they are stripped from shares, exactly like
 * recorded takes. The UI says so.
 */

import { planEviction } from "./recordingsDB.ts";

const DB_NAME = "promapper-magpie";
const DB_VERSION = 1;
const STORE = "files";

export const MAGPIE_FILE_CAPS = {
  /** Total bytes kept across ALL conversations. */
  maxBytes: 60 * 1024 * 1024,
  /** Total file count kept across ALL conversations. */
  maxCount: 80,
};

/** Biggest single file the shelf accepts. Bigger than this is a link's job. */
export const MAGPIE_MAX_FILE_BYTES = 12 * 1024 * 1024;

export interface StoredMagpieFile {
  id: string;
  conversationId: string;
  name: string;
  mimeType: string;
  data: Blob;
  createdAt: string;
}

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Whether the Blob store can be consulted at all. The shelf uses this before
 * pruning rows whose bytes are missing: with no IndexedDB every lookup
 * returns null, and a pruner that can't tell "gone" from "can't look" would
 * cheerfully delete a private-mode user's entire shelf.
 */
export function magpieFilesAvailable(): boolean {
  return idbAvailable();
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by-conversation", "conversationId");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error("IndexedDB open failed"));
      req.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
    // A failed open must not poison every later call — allow a retry.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** Resolve on COMMIT, not on request success — same durability rule as takes. */
function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Just the numbers eviction needs, walked with a cursor.
 *
 * `getAll()` would structured-clone every record — Blobs included — to work
 * out three fields per file, so a near-full shelf meant allocating the whole
 * 60MB on every drop, on a phone, right after the user handed us a 12MB
 * screenshot. The cursor holds one record at a time instead.
 *
 * ponytail: still deserialises each record in turn; a sibling metadata store
 * would make it genuinely free, worth doing if the cap ever grows.
 */
function getAllMeta(
  db: IDBDatabase,
): Promise<{ id: string; bytes: number; createdAt: string; mapped: true }[]> {
  return new Promise((resolve, reject) => {
    const out: {
      id: string;
      bytes: number;
      createdAt: string;
      mapped: true;
    }[] = [];
    const req = db.transaction(STORE, "readonly").objectStore(STORE)
      .openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(out);
      const v = cursor.value as StoredMagpieFile;
      out.push({
        id: v.id,
        bytes: v.data?.size ?? 0,
        createdAt: v.createdAt,
        mapped: true,
      });
      cursor.continue();
    };
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB cursor failed"));
  });
}

/** Save a file, then trim the oldest until the caps hold. */
export async function saveMagpieFile(
  rec: StoredMagpieFile,
): Promise<boolean> {
  if (!idbAvailable()) return false;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await txComplete(tx);

    // planEviction sorts unmapped-last then oldest-first; with everything
    // marked mapped it degrades to pure oldest-first, which is the whole
    // policy here. Reused rather than re-derived.
    const drop = planEviction(await getAllMeta(db), MAGPIE_FILE_CAPS)
      .filter((id) => id !== rec.id);
    for (const id of drop) await deleteMagpieFile(id);
    return true;
  } catch (err) {
    console.warn("magpieFilesDB: save failed", err);
    return false;
  }
}

export async function getMagpieFile(
  id: string,
): Promise<StoredMagpieFile | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const rec = await requestToPromise(
      tx.objectStore(STORE).get(id) as IDBRequest<StoredMagpieFile | undefined>,
    );
    return rec ?? null;
  } catch (err) {
    console.warn("magpieFilesDB: read failed", err);
    return null;
  }
}

export async function deleteMagpieFile(id: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).delete(id));
  } catch (err) {
    console.warn("magpieFilesDB: delete failed", err);
  }
}
