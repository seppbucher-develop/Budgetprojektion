// Backup/Restore — analog zur Service-Seite im Flugbuch-Projekt: sichert
// generisch JEDEN localStorage-Schlüssel mit unserem App-Präfix, statt
// einzelne Felder hart zu verdrahten. Neue Daten, die künftig dazukommen,
// werden dadurch automatisch mitgesichert.
import { STORAGE_PREFIX, markBackupSaved, markBackupRestored, reloadStateFromStorage } from "./store.js";

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
 * Nutzt navigator.share() auf unterstützten Geräten (z. B. Mobile: direkt in
 * eine Cloud-App/den Dateien-Ordner teilen), sonst einen normalen Download.
 * @returns {Promise<{filename:string, count:number, bytes:number}>}
 */
export async function exportBackup() {
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
