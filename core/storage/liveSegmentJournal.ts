/** Complete live audio segments stay here until the room acknowledges their
 * transcript. A failed request or closed tab can retry the same segment ID. */
const DB_NAME = "promapper-live-segments";
const STORE = "segments";

export interface LiveSegment {
  id: string;
  roomId: string;
  conversationId: string;
  createdAt: number;
  audio: Blob;
  text?: string;
  speakers?: string[];
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

export async function saveLiveSegment(segment: LiveSegment): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(segment);
    return await done(tx);
  } catch {
    return false;
  }
}

export async function removeLiveSegment(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await done(tx);
  } catch { /* room already owns the text; a duplicate retry is harmless */ }
}

export async function listLiveSegments(roomId: string): Promise<LiveSegment[]> {
  const db = await openDB();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, "readonly");
    const completed = done(tx);
    const request = tx.objectStore(STORE).getAll();
    const rows = await new Promise<LiveSegment[]>((resolve) => {
      request.onsuccess = () => resolve(request.result as LiveSegment[]);
      request.onerror = () => resolve([]);
    });
    if (!await completed) return [];
    return rows.filter((row) => row.roomId === roomId)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
