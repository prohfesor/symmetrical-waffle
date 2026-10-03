import type { ProjectStore, StoredProject } from "./projectStore.js";

// The original name, kept so projects saved in earlier versions stay visible.
const DB_NAME = "pcad";
const STORE = "projects";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Could not open the browser's project storage"));
    };
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = op(tx.objectStore(STORE));
    // Resolve on commit, not on the request, so a successful write is really durable.
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? new Error("Browser storage failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Browser storage is full or unavailable"));
  });
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Projects kept in this browser. They never leave it, so they are always "private". */
export const localStore: ProjectStore = {
  async list() {
    const all = await run<StoredProject[]>("readonly", (s) => s.getAll());
    return all
      .map(({ id, title, visibility, createdAt, updatedAt }) => ({ id, title, visibility, createdAt, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id) {
    const found = await run<StoredProject | undefined>("readonly", (s) => s.get(id));
    if (!found) throw new Error("That project is no longer in this browser's storage");
    return { ...found, isOwner: true };
  },

  async create(title, document, paramsText) {
    const now = new Date().toISOString();
    const project: StoredProject = {
      id: newId(),
      title,
      document,
      paramsText,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
      isOwner: true,
    };
    await run("readwrite", (s) => s.add(project));
    return project;
  },

  async update(id, fields) {
    const current = await this.get(id);
    // Nothing is shared from local storage, so visibility can't change.
    const { visibility: _ignored, ...changes } = fields;
    const next: StoredProject = { ...current, ...changes, updatedAt: new Date().toISOString() };
    await run("readwrite", (s) => s.put(next));
    return next;
  },

  async remove(id) {
    await run("readwrite", (s) => s.delete(id));
  },
};
