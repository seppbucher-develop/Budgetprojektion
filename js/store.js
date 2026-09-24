// Zentraler Zustand der App: wird komplett im localStorage gehalten,
// es gibt kein Backend. Andere Module lesen/ändern den Zustand nur über
// diese Funktionen, damit Persistenz und Änderungs-Events an einer Stelle bleiben.

// Gemeinsames Präfix aller localStorage-Schlüssel dieser App. Das Backup
// (siehe backup.js) sichert generisch JEDEN Schlüssel mit diesem Präfix,
// statt einzelne Schlüssel hart zu verdrahten — neue Schlüssel, die künftig
// dazukommen, werden dadurch automatisch mitgesichert.
export const STORAGE_PREFIX = "budgetprojektion.";
const STORAGE_KEY = STORAGE_PREFIX + "state.v2";
const BACKUP_META_KEY = STORAGE_PREFIX + "backupmeta.v1";

function defaultState() {
  return {
    version: 2,
    budgetPosten: [],
    vermoegenKonten: [],
    vermoegenEintraege: [],
    einstellungen: {
      horizontJahre: 30,
      renditePct: 2,
      inflationPct: 0
    },
    realTransaktionen: [],
    // Effektiver Cashflow-Log: bei jedem CSV-Import mit dem vorherigen
    // Import abgeglichene Buchungen (siehe cashflowDiff.js), dem
    // Import-Zeitpunkt statt dem oft budget-verschobenen Buchungsdatum
    // zugeordnet — Basis für die Renditeberechnung (siehe renditeTab.js).
    cashflowLog: [],
    // Manuelle Korrekturbuchungen für die Renditeberechnung, wenn eine
    // Korrektur in Bluecoins selbst nicht möglich/sinnvoll ist.
    korrekturen: [],
    importInfo: {
      xlsxImportiertAm: null,
      csvImportiertAm: null,
      csvDateiname: null,
      csvAnzahl: 0
    }
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // fehlende Felder aus Default ergänzen (z. B. nach App-Update)
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    return defaultState();
  }
}

function loadBackupMeta() {
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY);
    if (!raw) return { dirty: false, lastBackupAt: null, lastRestoreAt: null };
    return Object.assign({ dirty: false, lastBackupAt: null, lastRestoreAt: null }, JSON.parse(raw));
  } catch (e) {
    return { dirty: false, lastBackupAt: null, lastRestoreAt: null };
  }
}

function saveBackupMeta(meta) {
  try {
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
  } catch (e) {
    // Speichern ist optional; die Dirty-Anzeige ist rein informativ
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Speichern ist optional; App funktioniert auch ohne Persistenz weiter
  }
  const meta = loadBackupMeta();
  if (!meta.dirty) {
    meta.dirty = true;
    saveBackupMeta(meta);
  }
  document.dispatchEvent(new CustomEvent("state-changed"));
}

export function getBackupMeta() {
  return loadBackupMeta();
}

export function markBackupSaved() {
  const meta = loadBackupMeta();
  meta.dirty = false;
  meta.lastBackupAt = new Date().toISOString();
  saveBackupMeta(meta);
  document.dispatchEvent(new CustomEvent("state-changed"));
}

export function markBackupRestored() {
  const meta = loadBackupMeta();
  meta.dirty = false;
  meta.lastRestoreAt = new Date().toISOString();
  saveBackupMeta(meta);
  document.dispatchEvent(new CustomEvent("state-changed"));
}

// Liest alle Schlüssel dieser App (inkl. state & backup-Metadaten) neu aus
// dem localStorage ein — genutzt vom Restore in backup.js, nachdem die
// rohen Schlüssel aus der Backup-Datei direkt geschrieben wurden.
export function reloadStateFromStorage() {
  state = load();
  document.dispatchEvent(new CustomEvent("state-changed"));
}

export function getState() {
  return state;
}

export function updateState(mutator) {
  mutator(state);
  persist();
}

export function replaceState(newState) {
  state = Object.assign(defaultState(), newState);
  persist();
}

export function onStateChanged(handler) {
  document.addEventListener("state-changed", handler);
}

export function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function hasBudgetData() {
  return state.budgetPosten.length > 0 || state.vermoegenEintraege.length > 0;
}
