import { getState, updateState, getBackupMeta } from "./store.js?v=23";
import { formatTimestamp } from "./dateUtils.js?v=23";
import {
  exportBackup, importBackupFile, formatBytes,
  fsapiSupported, initFolder, getCachedDirHandle, queryDirPermission,
  chooseBackupDirectory, clearBackupDirectory, listFolderBackups
} from "./backup.js?v=23";

const btnExport = document.getElementById("btn-backup-export");
const btnImport = document.getElementById("btn-backup-import");
const fileInput = document.getElementById("backup-import-datei");
const msgEl = document.getElementById("backup-msg");
const lastBackupEl = document.getElementById("backup-last-export");
const lastRestoreEl = document.getElementById("backup-last-restore");
const dirtyDot = document.getElementById("sicherung-dirty-dot");

const folderPanel = document.getElementById("backup-folder-panel");
const folderNoneEl = document.getElementById("backup-folder-none");
const folderChosenEl = document.getElementById("backup-folder-chosen");
const folderNameEl = document.getElementById("backup-folder-name");
const folderPermissionHintEl = document.getElementById("backup-folder-permission-hint");
const folderFilesEl = document.getElementById("backup-folder-files");
const btnChooseFolder = document.getElementById("btn-choose-folder");
const btnChangeFolder = document.getElementById("btn-change-folder");
const btnClearFolder = document.getElementById("btn-clear-folder");

function zeigeMeldung(typ, text) {
  msgEl.textContent = text;
  msgEl.className = typ === "error" ? "error" : "msg-ok";
}

function setBusy(busy) {
  btnExport.disabled = busy;
  btnImport.disabled = busy;
}

function confirmRestore() {
  return confirm("Ein Restore ersetzt alle aktuellen Budget-, Vermögens- und Transaktionsdaten durch den Inhalt dieser Datei. Fortfahren?");
}

async function restoreFromFile(file) {
  setBusy(true);
  msgEl.textContent = "";
  try {
    const result = await importBackupFile(file);
    zeigeMeldung("ok", "✓ " + result.count + " Einträge wiederhergestellt.");
  } catch (e) {
    zeigeMeldung("error", "Fehler beim Wiederherstellen: " + (e.message || String(e)));
  } finally {
    setBusy(false);
  }
}

btnExport.addEventListener("click", async function () {
  setBusy(true);
  msgEl.textContent = "";
  try {
    const result = await exportBackup();
    zeigeMeldung("ok", (result.ordner ? "✓ Automatisch gespeichert in „" + result.ordner + "“: " : "✓ Backup gesichert: ") + result.filename + " (" + result.count + " Einträge).");
    if (result.ordner) refreshFolderList();
  } catch (e) {
    if (e && e.name !== "AbortError") zeigeMeldung("error", "Fehler beim Sichern: " + (e.message || String(e)));
  } finally {
    setBusy(false);
  }
});

btnImport.addEventListener("click", function () { fileInput.click(); });

fileInput.addEventListener("change", function () {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  if (!confirmRestore()) return;
  restoreFromFile(file);
});

async function refreshFolderList() {
  const handle = getCachedDirHandle();
  if (!handle) { folderFilesEl.innerHTML = ""; return; }
  const perm = await queryDirPermission(handle);
  if (perm !== "granted") { folderFilesEl.innerHTML = ""; return; }

  folderFilesEl.innerHTML = '<div class="hint">Lade Ordnerinhalt…</div>';
  const files = await listFolderBackups(handle);
  if (files.length === 0) {
    folderFilesEl.innerHTML = '<div class="hint">Noch keine Backup-Dateien hier gefunden.</div>';
    return;
  }
  folderFilesEl.innerHTML = "";
  files.forEach(function (f) {
    const row = document.createElement("div");
    row.className = "folder-file-row";
    row.innerHTML =
      '<div class="folder-file-info">' +
        '<div class="folder-file-name">' + f.name + '</div>' +
        '<div class="folder-file-meta">' + formatTimestamp(f.lastModified) + ' · ' + formatBytes(f.size) + '</div>' +
      '</div>' +
      '<button class="btn-secondary" data-action="restore">Wiederherstellen</button>';
    row.querySelector('[data-action="restore"]').addEventListener("click", async function () {
      if (!confirmRestore()) return;
      const file = await f.handle.getFile();
      restoreFromFile(file);
    });
    folderFilesEl.appendChild(row);
  });
}

function renderFolderState() {
  const handle = getCachedDirHandle();
  if (handle) {
    folderNoneEl.style.display = "none";
    folderChosenEl.style.display = "block";
    folderNameEl.textContent = "📂 " + handle.name;
    queryDirPermission(handle).then(function (perm) {
      folderPermissionHintEl.textContent = perm === "granted" ? "" : "(Berechtigung beim nächsten Backup erneut bestätigen)";
      if (perm === "granted") refreshFolderList();
      else folderFilesEl.innerHTML = "";
    });
  } else {
    folderNoneEl.style.display = "block";
    folderChosenEl.style.display = "none";
    folderFilesEl.innerHTML = "";
  }
}

async function setupFolderUi() {
  if (!fsapiSupported()) { folderPanel.style.display = "none"; return; }
  folderPanel.style.display = "block";
  await initFolder();
  renderFolderState();
}

btnChooseFolder.addEventListener("click", async function () {
  try {
    await chooseBackupDirectory();
    zeigeMeldung("ok", "✓ Backup-Ordner festgelegt. Künftige Backups landen automatisch dort.");
    renderFolderState();
  } catch (e) {
    if (e && e.name !== "AbortError") zeigeMeldung("error", "Ordnerauswahl fehlgeschlagen: " + (e.message || String(e)));
  }
});
btnChangeFolder.addEventListener("click", function () { btnChooseFolder.click(); });
btnClearFolder.addEventListener("click", async function () {
  await clearBackupDirectory();
  renderFolderState();
});

setupFolderUi();

// Cache-Strategie des Service Workers (siehe sw.js für die ausführliche
// Erklärung). Die Auswahl wird in state.einstellungen persistiert (übersteht
// so auch einen Browser-Neustart) und bei jedem Laden zusätzlich per
// postMessage an den Service Worker geschickt, damit ein evtl. verlorener
// Cache-Eintrag dort repariert wird.
const cacheNetworkFirstCheckbox = document.getElementById("cache-network-first");

async function sendCacheStrategyToSw(value) {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.active) reg.active.postMessage({ type: "setCacheStrategy", value: value });
  } catch (e) {
    // Service Worker ist optional -- die App funktioniert auch ohne.
  }
}

cacheNetworkFirstCheckbox.checked = !!getState().einstellungen.cacheNetworkFirst;
sendCacheStrategyToSw(cacheNetworkFirstCheckbox.checked ? "network-first" : "stale-while-revalidate");

cacheNetworkFirstCheckbox.addEventListener("change", function () {
  const networkFirst = cacheNetworkFirstCheckbox.checked;
  updateState(function (s) { s.einstellungen.cacheNetworkFirst = networkFirst; });
  sendCacheStrategyToSw(networkFirst ? "network-first" : "stale-while-revalidate");
});

export function renderBackupTab() {
  const meta = getBackupMeta();
  lastBackupEl.textContent = meta.lastBackupAt ? "Letztes Backup: " + formatTimestamp(meta.lastBackupAt) : "Noch kein Backup gesichert.";
  lastRestoreEl.textContent = meta.lastRestoreAt ? "Letzter Restore: " + formatTimestamp(meta.lastRestoreAt) : "Noch kein Restore durchgeführt.";
  dirtyDot.classList.toggle("show", !!meta.dirty);
}
