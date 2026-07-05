/**
 * Recordings DB — durable audio takes in IndexedDB.
 *
 * localStorage can't hold Blobs, so appended recordings live here: one record
 * per take, indexed by conversation. Everything degrades gracefully — if
 * IndexedDB is unavailable (private mode, ancient browser, SSR) every call
 * quietly no-ops and the app behaves like the old session-only version.
 *
 * Deliberately NO cascade delete when a conversation is deleted (that would
 * break the undo toast). Instead `sweepOrphans` runs once per app load and
 * removes takes whose conversation no longer exists.
 */

import type { AppendReceipt } from "../orchestration/append-receipt.ts";

const DB_NAME = "promapper";
const DB_VERSION = 1;
const STORE = "recordings";

export const RECORDING_CAPS = {
  /** Total audio bytes kept across ALL conversations. */
  maxBytes: 200 * 1024 * 1024,
  /** Total take count kept across ALL conversations. */
  maxCount: 100,
};

export interface StoredRecording {
  id: string;
  conversationId: string;
  data: Blob;
  mimeType: string;
  fileName: string;
  createdAt: string;
  durationSec?: number;
  receipt?: AppendReceipt;
}

export interface RecordingMeta {
  id: string;
  bytes: number;
  createdAt: string;
}

/**
 * Pure eviction planner: which take ids must go (oldest first) so the set
 * fits under both caps. Exported for tests — the IDB wrapper stays thin.
 */
export function planEviction(
  metas: RecordingMeta[],
  caps: { maxBytes: number; maxCount: number } = RECORDING_CAPS,
): string[] {
  const sorted = [...metas].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  let totalBytes = sorted.reduce((sum, m) => sum + m.bytes, 0);
  let count = sorted.length;
  const drop: string[] = [];
  for (const meta of sorted) {
    if (count <= caps.maxCount && totalBytes <= caps.maxBytes) break;
    drop.push(meta.id);
    totalBytes -= meta.bytes;
    count--;
  }
  return drop;
}

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
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
    // A failed open should not poison every future call — allow a retry.
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

async function getAll(db: IDBDatabase): Promise<StoredRecording[]> {
  const tx = db.transaction(STORE, "readonly");
  return await requestToPromise(
    tx.objectStore(STORE).getAll() as IDBRequest<StoredRecording[]>,
  );
}

async function putRecord(db: IDBDatabase, rec: StoredRecording): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).put(rec));
}

async function deleteRecord(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).delete(id));
}

/** Persist a take, then enforce the caps (never evicting the take just saved). */
export async function saveRecording(rec: StoredRecording): Promise<boolean> {
  if (!idbAvailable()) return false;
  try {
    const db = await openDB();
    await putRecord(db, rec);
    const all = await getAll(db);
    const drop = planEviction(
      all.map((r) => ({
        id: r.id,
        bytes: r.data?.size ?? 0,
        createdAt: r.createdAt,
      })),
    ).filter((id) => id !== rec.id);
    for (const id of drop) {
      await deleteRecord(db, id);
    }
    return true;
  } catch (err) {
    console.warn("recordingsDB: save failed", err);
    return false;
  }
}

/** All takes for one conversation, oldest first. */
export async function listRecordings(
  conversationId: string,
): Promise<StoredRecording[]> {
  if (!idbAvailable() || !conversationId) return [];
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("by-conversation");
    const records = await requestToPromise(
      index.getAll(conversationId) as IDBRequest<StoredRecording[]>,
    );
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch (err) {
    console.warn("recordingsDB: list failed", err);
    return [];
  }
}

/** Merge a patch (receipt, duration…) into an existing take. */
export async function updateRecording(
  id: string,
  patch: Partial<Pick<StoredRecording, "receipt" | "durationSec" | "fileName">>,
): Promise<boolean> {
  if (!idbAvailable()) return false;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const existing = await requestToPromise(
      store.get(id) as IDBRequest<StoredRecording | undefined>,
    );
    if (!existing) return false;
    await requestToPromise(store.put({ ...existing, ...patch }));
    return true;
  } catch (err) {
    console.warn("recordingsDB: update failed", err);
    return false;
  }
}

export async function deleteRecording(id: string): Promise<boolean> {
  if (!idbAvailable()) return false;
  try {
    const db = await openDB();
    await deleteRecord(db, id);
    return true;
  } catch (err) {
    console.warn("recordingsDB: delete failed", err);
    return false;
  }
}

/**
 * Remove takes whose conversation no longer exists. Called once per app load
 * with the ids of all saved conversations.
 */
export async function sweepOrphans(
  liveConversationIds: string[],
): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const live = new Set(liveConversationIds);
    const db = await openDB();
    const all = await getAll(db);
    for (const rec of all) {
      if (!live.has(rec.conversationId)) {
        await deleteRecord(db, rec.id);
      }
    }
  } catch (err) {
    console.warn("recordingsDB: orphan sweep failed", err);
  }
}
