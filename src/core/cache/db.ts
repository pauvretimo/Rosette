const DB_NAME = 'rosette';
const DB_VERSION = 1;

export const STORE_TRANSLATION_CACHE = 'translationCache';
export const STORE_MODEL_BLOBS = 'modelBlobs';
export const STORE_CRYPTO_KEYS = 'cryptoKeys';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Single shared IndexedDB handle for the background context. Content scripts must never open
 * this directly — their `indexedDB` global resolves to the host page's origin (discord.com),
 * not the extension's isolated storage origin, so this file is only ever imported from
 * entrypoints/background.ts.
 */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRANSLATION_CACHE)) {
        db.createObjectStore(STORE_TRANSLATION_CACHE);
      }
      if (!db.objectStoreNames.contains(STORE_MODEL_BLOBS)) {
        db.createObjectStore(STORE_MODEL_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_CRYPTO_KEYS)) {
        db.createObjectStore(STORE_CRYPTO_KEYS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
