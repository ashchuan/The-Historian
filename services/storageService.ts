
import { LandmarkData, ResearchPaper } from "../types";

const DB_NAME = "HistorianCache";
const DB_VERSION = 2; // Incremented version
const STORE_NAME = "landmarks";
const RESEARCH_STORE = "research_papers";

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveLandmark = async (data: LandmarkData): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(data);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to save to IndexedDB", error);
  }
};

export const getLandmark = async (id: string): Promise<LandmarkData | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to read from IndexedDB", error);
    return null;
  }
};

export const getAllLandmarks = async (): Promise<LandmarkData[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to fetch all landmarks", error);
    return [];
  }
};

export const deleteLandmark = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to delete from IndexedDB", error);
  }
};

// Research Paper Methods
export const saveResearchPaper = async (paper: ResearchPaper): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readwrite");
  const store = tx.objectStore(RESEARCH_STORE);
  store.put(paper);
};

export const getResearchPaper = async (id: string): Promise<ResearchPaper | null> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readonly");
  const store = tx.objectStore(RESEARCH_STORE);
  const request = store.get(id);
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || null);
  });
};

export const getAllResearchPapers = async (): Promise<ResearchPaper[]> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readonly");
  const store = tx.objectStore(RESEARCH_STORE);
  const request = store.getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
};

export const deleteResearchPaper = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(RESEARCH_STORE, "readwrite");
  const store = tx.objectStore(RESEARCH_STORE);
  store.delete(id);
};
