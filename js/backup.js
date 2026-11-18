// Backup/Restore — analog zur Service-Seite im Flugbuch-Projekt: sichert
// generisch JEDEN localStorage-Schlüssel mit unserem App-Präfix, statt
// einzelne Felder hart zu verdrahten. Neue Daten, die künftig dazukommen,
// werden dadurch automatisch mitgesichert.
import { STORAGE_PREFIX, STORAGE_KEY, markBackupSaved, markBackupRestored, reloadStateFromStorage } from "./store.js?v=46";
import { fsapiHandle } from "./fsapiHandle.js?v=46";

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

// Handy (Chrome Android hat keine Ordnerauswahl): Kopien im App-eigenen
// Speicher (OPFS) — nur dort darf die App Dateien auch wieder löschen.
export function opfsSupported() {
  return !fsapiSupported() && typeof navigator !== "undefined" && !!(navigator.storage && navigator.storage.getDirectory);
}

export async function getOpfsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("backups", { create: true });
}

async function saveOpfsCopy(blob, filename) {
  if (!opfsSupported()) return;
  try {
    const dir = await getOpfsDir();
    const fh = await dir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  } catch (e) {
    console.error("Kopie im App-Speicher fehlgeschlagen:", e);
  }
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

// Gerätename für den Backup-Dateinamen: frei wählbar, nur lokal gespeichert
// (bewusst OHNE STORAGE_PREFIX, damit er nicht ins Backup wandert und beim
// Restore ein anderes Gerät überschreibt). Leer = kein Gerätename im Dateinamen.
const DEVICE_NAME_KEY = "budgetprojektion-geraetename";

export function getCustomDeviceName() {
  try { return localStorage.getItem(DEVICE_NAME_KEY) || ""; } catch (e) { return ""; }
}

export function setCustomDeviceName(name) {
  try {
    const v = (name || "").trim();
    if (v) localStorage.setItem(DEVICE_NAME_KEY, v);
    else localStorage.removeItem(DEVICE_NAME_KEY);
  } catch (e) { /* ignorieren */ }
}

function getDeviceTag() {
  return getCustomDeviceName().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
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
  const deviceTag = getDeviceTag();
  const payload = { exportedAt: new Date().toISOString(), device: deviceTag, entries };
  const json = JSON.stringify(payload);

  const versionTag = (window.APP_VERSION || "unbekannt").replace(/[\\/:*?"<>|]/g, "_");
  const dateStamp = new Date().toISOString().slice(0, 10);

  let blob, filename;
  try {
    if (typeof CompressionStream !== "undefined") {
      const gzStream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      blob = await new Response(gzStream).blob();
      filename = `budgetprojektion-backup-${versionTag}${deviceTag ? "-" + deviceTag : ""}-${dateStamp}.json.gz`;
    }
  } catch (e) {
    console.error("Backup: gzip-Kompression fehlgeschlagen, weiche auf reines JSON aus:", e);
  }
  if (!blob) {
    blob = new Blob([json], { type: "application/json" });
    filename = `budgetprojektion-backup-${versionTag}${deviceTag ? "-" + deviceTag : ""}-${dateStamp}.json`;
  }

  await saveOpfsCopy(blob, filename);

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

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Die Datei ist kein gültiges Backup (kein lesbares JSON).");
  }
  const eintraege = pruefeBackupDaten(data);

  // Alles-oder-nichts: schlägt ein Schreibvorgang fehl (z. B. Speicher voll),
  // werden die bisher überschriebenen Schlüssel auf ihren alten Stand
  // zurückgesetzt, statt einen halb wiederhergestellten Zustand zu hinterlassen.
  const alt = {};
  try {
    for (const [key, value] of eintraege) {
      alt[key] = localStorage.getItem(key);
      localStorage.setItem(key, value);
    }
  } catch (e) {
    Object.keys(alt).forEach(function (key) {
      try {
        if (alt[key] === null) localStorage.removeItem(key); else localStorage.setItem(key, alt[key]);
      } catch (e2) { /* Rückabwicklung best effort */ }
    });
    throw new Error("Wiederherstellen fehlgeschlagen (Speicher voll?) – die bisherigen Daten wurden beibehalten.");
  }

  reloadStateFromStorage();
  markBackupRestored();
  return { count: eintraege.length };
}

/**
 * Prüft den Inhalt einer Backup-Datei, BEVOR irgendetwas geschrieben wird:
 * `entries` muss ein Objekt mit Text-Werten sein, mindestens einen Schlüssel
 * der App enthalten, und der App-Zustand muss lesbares JSON (Objekt) sein.
 * Liefert die zu schreibenden [Schlüssel, Wert]-Paare (nur Schlüssel mit
 * App-Präfix).
 */
export function pruefeBackupDaten(data) {
  if (!data || typeof data !== "object" || !data.entries || typeof data.entries !== "object" || Array.isArray(data.entries)) {
    throw new Error("Ungültiges Backup-Format.");
  }
  const eintraege = Object.entries(data.entries).filter(function (e) { return e[0].indexOf(STORAGE_PREFIX) === 0; });
  if (eintraege.length === 0) throw new Error("Das Backup enthält keine Daten dieser App.");
  eintraege.forEach(function (e) {
    if (typeof e[1] !== "string") throw new Error("Ungültiges Backup-Format (Wert von „" + e[0] + "“ ist kein Text).");
    if (e[0] === STORAGE_KEY) {
      let zustand;
      try { zustand = JSON.parse(e[1]); } catch (err) { throw new Error("Das Backup enthält beschädigte App-Daten."); }
      if (!zustand || typeof zustand !== "object" || Array.isArray(zustand)) throw new Error("Das Backup enthält beschädigte App-Daten.");
    }
  });
  return eintraege;
}

export { formatBytes };
