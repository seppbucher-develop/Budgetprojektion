import { getBackupMeta } from "./store.js";
import { formatTimestamp } from "./dateUtils.js";
import { exportBackup, importBackupFile } from "./backup.js";

const btnExport = document.getElementById("btn-backup-export");
const btnImport = document.getElementById("btn-backup-import");
const fileInput = document.getElementById("backup-import-datei");
const msgEl = document.getElementById("backup-msg");
const lastBackupEl = document.getElementById("backup-last-export");
const lastRestoreEl = document.getElementById("backup-last-restore");
const dirtyDot = document.getElementById("sicherung-dirty-dot");

function zeigeMeldung(typ, text) {
  msgEl.textContent = text;
  msgEl.className = typ === "error" ? "error" : "msg-ok";
}

function setBusy(busy) {
  btnExport.disabled = busy;
  btnImport.disabled = busy;
}

btnExport.addEventListener("click", async function () {
  setBusy(true);
  msgEl.textContent = "";
  try {
    const result = await exportBackup();
    zeigeMeldung("ok", "✓ Backup gesichert: " + result.filename + " (" + result.count + " Einträge).");
  } catch (e) {
    if (e && e.name !== "AbortError") zeigeMeldung("error", "Fehler beim Sichern: " + (e.message || String(e)));
  } finally {
    setBusy(false);
  }
});

btnImport.addEventListener("click", function () { fileInput.click(); });

fileInput.addEventListener("change", async function () {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  if (!confirm("Ein Restore ersetzt alle aktuellen Budget-, Vermögens- und Transaktionsdaten durch den Inhalt dieser Datei. Fortfahren?")) return;

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
});

export function renderBackupTab() {
  const meta = getBackupMeta();
  lastBackupEl.textContent = meta.lastBackupAt ? "Letztes Backup: " + formatTimestamp(meta.lastBackupAt) : "Noch kein Backup gesichert.";
  lastRestoreEl.textContent = meta.lastRestoreAt ? "Letzter Restore: " + formatTimestamp(meta.lastRestoreAt) : "Noch kein Restore durchgeführt.";
  dirtyDot.classList.toggle("show", !!meta.dirty);
}
