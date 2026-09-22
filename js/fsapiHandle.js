// Kleine, eigenständige IndexedDB nur für den lokal gewählten Backup-Ordner
// (File System Access API, aktuell nur Chrome/Edge Desktop). Bewusst NICHT
// zusammen mit den App-Daten im localStorage abgelegt: ein
// FileSystemDirectoryHandle ist kein per JSON.stringify serialisierbarer
// String, sondern ein eigenes strukturiert-klonbares Objekt, das nur
// IndexedDB direkt speichern kann.
const DB_NAME = "budgetprojektion-fsapi";
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(new Error("IndexedDB nicht verfügbar")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore("handles"); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  return dbPromise;
}

export const fsapiHandle = {
  async get(key) {
    try {
      const db = await openDb();
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction("handles", "readonly");
        const req = tx.objectStore("handles").get(key);
        req.onsuccess = function () { resolve(req.result !== undefined ? req.result : null); };
        req.onerror = function () { reject(req.error); };
      });
    } catch (e) { return null; }
  },
  async set(key, handle) {
    try {
      const db = await openDb();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(handle, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
      return true;
    } catch (e) { return false; }
  },
  async delete(key) {
    try {
      const db = await openDb();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
      return true;
    } catch (e) { return false; }
  }
};
