// Backup/Restore — analog zur Service-Seite im Flugbuch-Projekt: sichert
// generisch JEDEN localStorage-Schlüssel mit unserem App-Präfix, statt
// einzelne Felder hart zu verdrahten. Neue Daten, die künftig dazukommen,
// werden dadurch automatisch mitgesichert.
import { STORAGE_PREFIX, markBackupSaved, markBackupRestored, reloadStateFromStorage } from "./store.js?v=4";
import { fsapiHandle } from "./fsapiHandle.js?v=4";

const BACKUP_FILE_REGEX = /^budgetprojektion-backup-.*\.(json|json\.gz)$/i;

// In-Memory-Cache des zuletzt geladenen/gewählten Ordner-Handles. Wird
// einmalig beim Öffnen des Tabs aus der IndexedDB geladen (initFolder()) und
// danach synchron gelesen — wichtig, damit requestDirWriteHandle() als
// ERSTER await in exportBackup() läuft und damit noch innerhalb der
// "Nutzer-Geste" des Klicks liegt (ein vorheriger await, z. B. ein eigener
// IndexedDB-Zugriff an dieser Stelle, würde requestPermission() sonst vom
// Browser stillschweigend ablehnen lassen).
let cachedDirHandle = null;

export function fsapiSupported() {
  return typeof window !== "undefined" && !!window.showDirectoryPicker;
}

export function getCachedDirHandle() {
  return cachedDirHandle;
}

/** Lädt einen zuvor gewählten Backup-Ordner (falls vorhanden) in den Cache. */
export async function initFolder() {
  if (!fsapiSupported()) return null;
  try {
    cachedDirHandle = await fsapiHandle.get("backupDir");
  } catch (e) {
    cachedDirHandle = null;
  }
  return cachedDirHandle;
}

export async function queryDirPermission(handle) {
  if (!handle) return "prompt";
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch (e) {
    return "prompt";
  }
}

/** Fragt (falls nötig) Schreibrechte an. Muss ohne vorherigen await aus einer Nutzer-Geste heraus aufgerufen werden. */
async function requestDirWriteHandle(handle) {
  if (!handle) return null;
  try {
    let perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") perm = await handle.requestPermission({ mode: "readwrite" });
    return perm === "granted" ? handle : null;
  } catch (e) {
    console.error("Berechtigung für Backup-Ordner fehlgeschlagen:", e);
    return null;
  }
}

/** Öffnet den nativen Ordnerauswahl-Dialog (Chrome/Edge Desktop) und merkt sich die Wahl dauerhaft. */
export async function chooseBackupDirectory() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await fsapiHandle.set("backupDir", handle);
  cachedDirHandle = handle;
  return handle;
}

export async function clearBackupDirectory() {
  await fsapiHandle.delete("backupDir");
  cachedDirHandle = null;
}

/** Listet vorhandene Backup-Dateien direkt im gewählten Ordner (neueste zuerst). */
export async function listFolderBackups(handle) {
  if (!handle) return [];
  const found = [];
  try {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== "file") continue;
      if (!BACKUP_FILE_REGEX.test(name)) continue;
      try {
        const file = await entry.getFile();
        found.push({ name: name, lastModified: file.lastModified, size: file.size, handle: entry });
      } catch (e) {
        // einzelne nicht lesbare Datei überspringen
      }
    }
  } catch (e) {
    console.error("Ordner-Inhalt lesen fehlgeschlagen:", e);
  }
  found.sort(function (a, b) { return b.lastModified - a.lastModified; });
  return found;
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function collectEntries() {
  const entries = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.indexOf(STORAGE_PREFIX) === 0) entries[key] = localStorage.getItem(key);
  }
  return entries;
}

/**
 * Sichert alle App-Daten als (nach Möglichkeit gzip-komprimierte) JSON-Datei.
 * Reihenfolge wie im Flugbuch: zuerst automatisch in den gewählten
 * Backup-Ordner (falls vorhanden und Berechtigung erteilt/erteilbar), sonst
 * navigator.share() (z. B. Mobile), sonst normaler Download.
 * @returns {Promise<{filename:string, count:number, bytes:number, ordner?:string}>}
 */
export async function exportBackup() {
  // Berechtigung ganz am Anfang anfragen — noch bevor irgendein anderer
  // await die Nutzer-Geste dieses Klicks verbraucht.
  const writeHandle = cachedDirHandle ? await requestDirWriteHandle(cachedDirHandle) : null;

  const entries = collectEntries();
  const keys = Object.keys(entries);
  const payload = { exportedAt: new Date().toISOString(), entries };
  const json = JSON.stringify(payload);

  const versionTag = (window.APP_VERSION || "unbekannt").replace(/[\\/:*?"<>|]/g, "_");
  const dateStamp = new Date().toISOString().slice(0, 10);

  let blob, filename;
  try {
    if (typeof CompressionStream !== "undefined") {
      const gzStream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      blob = await new Response(gzStream).blob();
      filename = `budgetprojektion-backup-${versionTag}-${dateStamp}.json.gz`;
    }
  } catch (e) {
    console.error("Backup: gzip-Kompression fehlgeschlagen, weiche auf reines JSON aus:", e);
  }
  if (!blob) {
    blob = new Blob([json], { type: "application/json" });
    filename = `budgetprojektion-backup-${versionTag}-${dateStamp}.json`;
  }

  if (writeHandle) {
    try {
      const fileHandle = await writeHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      markBackupSaved();
      return { filename, count: keys.length, bytes: blob.size, ordner: writeHandle.name };
    } catch (e) {
      console.error("Direktes Schreiben in Backup-Ordner fehlgeschlagen, weiche auf Teilen/Download aus:", e);
      // kein return — bewusst weiter auf den bestehenden Weg unten
    }
  }

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        markBackupSaved();
        return { filename, count: keys.length, bytes: blob.size };
      }
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      // sonst: auf Download weiter unten ausweichen
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  markBackupSaved();
  return { filename, count: keys.length, bytes: blob.size };
}

/**
 * Stellt App-Daten aus einer zuvor mit exportBackup() erzeugten Datei wieder
 * her (mit oder ohne gzip). Ersetzt alle enthaltenen Schlüssel vollständig.
 * @param {File} file
 * @returns {Promise<{count:number}>}
 */
export async function importBackupFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  let text;
  if (isGzip) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Dieses gzip-komprimierte Backup kann in diesem Browser nicht gelesen werden.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder("utf-8").decode(bytes);
  }

  const data = JSON.parse(text);
  if (!data.entries || typeof data.entries !== "object") {
    throw new Error("Ungültiges Backup-Format.");
  }

  let count = 0;
  for (const [key, value] of Object.entries(data.entries)) {
    if (key.indexOf(STORAGE_PREFIX) !== 0) continue; // nur eigene Schlüssel übernehmen
    localStorage.setItem(key, value);
    count++;
  }

  reloadStateFromStorage();
  markBackupRestored();
  return { count };
}

export { formatBytes };
