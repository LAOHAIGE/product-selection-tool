const DATABASE_NAME = "product-selection-tool";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const CURRENT_KEY = "current";

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("浏览器存储请求失败。"));
  });
}

function openDatabase(indexedDb) {
  if (!indexedDb) return Promise.reject(new Error("当前浏览器不支持 IndexedDB。"));
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开浏览器工作区存储。"));
  });
}

export function createIndexedDbAdapter(indexedDb = globalThis.indexedDB) {
  const database = openDatabase(indexedDb);
  async function store(mode) {
    const db = await database;
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }
  return {
    async get() {
      return requestPromise((await store("readonly")).get(CURRENT_KEY));
    },
    async put(value) {
      await requestPromise((await store("readwrite")).put(value, CURRENT_KEY));
    },
    async delete() {
      await requestPromise((await store("readwrite")).delete(CURRENT_KEY));
    }
  };
}

export function isValidWorkspaceRecord(record) {
  return Boolean(
    record
    && record.version === 1
    && typeof record.savedAt === "string"
    && !Number.isNaN(Date.parse(record.savedAt))
    && record.run
    && typeof record.run === "object"
    && Array.isArray(record.run.items)
  );
}

export function createWorkspaceStorage(adapter = createIndexedDbAdapter()) {
  return {
    async save(run) {
      if (!run || typeof run !== "object" || !Array.isArray(run.items)) {
        throw new Error("Workspace run must contain an items array.");
      }
      const record = { version: 1, savedAt: new Date().toISOString(), run };
      await adapter.put(record);
      return record;
    },
    async load() {
      const record = await adapter.get();
      return isValidWorkspaceRecord(record) ? record : null;
    },
    async clear() {
      await adapter.delete();
    }
  };
}
