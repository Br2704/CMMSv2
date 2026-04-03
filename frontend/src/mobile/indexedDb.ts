const DB_NAME = "cmms_mobile";
const DB_VERSION = 1;
const CACHE_STORE = "cache";
const QUEUE_STORE = "sync_queue";

export interface CachedRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

export interface QueuedMutation {
  id?: number;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: unknown;
  createdAt: number;
  retryCount: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
        queueStore.createIndex("createdAt", "createdAt");
      }
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => resolve(request.result);
  });
}

function runWrite(storeName: string, writer: (store: IDBObjectStore) => void): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        writer(store);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction aborted"));
        };
      }),
  );
}

function runRead<T>(storeName: string, reader: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        reader(store, resolve);

        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB read failed"));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB read aborted"));
        };
        tx.oncomplete = () => {
          db.close();
        };
      }),
  );
}

export async function cachePut<T>(key: string, value: T): Promise<void> {
  await runWrite(CACHE_STORE, (store) => {
    store.put({ key, value, updatedAt: Date.now() } as CachedRecord<T>);
  });
}

export async function cacheGet<T>(key: string): Promise<CachedRecord<T> | null> {
  return runRead<CachedRecord<T> | null>(CACHE_STORE, (store, resolve) => {
    const request = store.get(key);
    request.onsuccess = () => {
      resolve((request.result as CachedRecord<T>) ?? null);
    };
  });
}

export async function queueMutation(input: Omit<QueuedMutation, "id" | "createdAt" | "retryCount">): Promise<void> {
  await runWrite(QUEUE_STORE, (store) => {
    store.add({ ...input, createdAt: Date.now(), retryCount: 0 } as QueuedMutation);
  });
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  return runRead<QueuedMutation[]>(QUEUE_STORE, (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = ((request.result as QueuedMutation[]) ?? []).sort((a, b) => a.createdAt - b.createdAt);
      resolve(rows);
    };
  });
}

export async function getQueuedMutationCount(): Promise<number> {
  const rows = await listQueuedMutations();
  return rows.length;
}

export async function deleteQueuedMutation(id: number): Promise<void> {
  await runWrite(QUEUE_STORE, (store) => {
    store.delete(id);
  });
}

export async function bumpQueuedMutationRetry(id: number, retryCount: number): Promise<void> {
  await runWrite(QUEUE_STORE, (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const row = request.result as QueuedMutation | undefined;
      if (!row) return;
      store.put({ ...row, retryCount });
    };
  });
}
