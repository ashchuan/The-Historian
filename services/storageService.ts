
import { LandmarkData, ResearchPaper, StorageConfig } from "../types";

const DB_NAME = "HistorianCache";
const DB_VERSION = 4; // Bumped for storage config
const STORE_NAME = "landmarks";
const RESEARCH_STORE = "research_papers";
const CONFIG_STORE = "config";

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(RESEARCH_STORE)) {
        db.createObjectStore(RESEARCH_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const clearAllData = async (): Promise<void> => {
  const db = await openDB();
  const stores = [STORE_NAME, RESEARCH_STORE];
  const tx = db.transaction(stores, "readwrite");
  stores.forEach(s => tx.objectStore(s).clear());
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};

export const saveLandmark = async (data: LandmarkData): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(data);
};

export const getLandmark = async (id: string): Promise<LandmarkData | null> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const request = tx.objectStore(STORE_NAME).get(id);
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || null);
  });
};

export const getAllLandmarks = async (): Promise<LandmarkData[]> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const request = tx.objectStore(STORE_NAME).getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
};

export const deleteLandmark = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
};

export const saveResearchPaper = async (paper: ResearchPaper): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readwrite");
  tx.objectStore(RESEARCH_STORE).put(paper);
};

export const getAllResearchPapers = async (): Promise<ResearchPaper[]> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readonly");
  const request = tx.objectStore(RESEARCH_STORE).getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
};

export const deleteResearchPaper = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readwrite");
  tx.objectStore(RESEARCH_STORE).delete(id);
};

export const saveStorageConfig = async (config: StorageConfig): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(CONFIG_STORE, "readwrite");
  tx.objectStore(CONFIG_STORE).put(config, 'external');
};

export const getStorageConfig = async (): Promise<StorageConfig | null> => {
  const db = await openDB();
  const tx = db.transaction(CONFIG_STORE, "readonly");
  const request = tx.objectStore(CONFIG_STORE).get('external');
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || null);
  });
};
