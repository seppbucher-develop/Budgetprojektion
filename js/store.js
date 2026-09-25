// Zentraler Zustand der App: wird komplett im localStorage gehalten,
// es gibt kein Backend. Andere Module lesen/ändern den Zustand nur über
// diese Funktionen, damit Persistenz und Änderungs-Events an einer Stelle bleiben.
import { migriereKategorien } from "./kategorien.js?v=15";
import { migriereTransaktionen } from "./transaktionen.js?v=15";

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
    // Kategorien (z. B. "Wohnen") und Unterkategorien (z. B. "Miete") mit
    // stabiler ID als Primärschlüssel, siehe kategorien.js. budgetPosten
    // und realTransaktionen referenzieren diese IDs.
    kategorien: [],
    unterkategorien: [],
    budgetPosten: [],
    vermoegenKonten: [],
    vermoegenEintraege: [],
    einstellungen: {
      horizontJahre: 30,
      renditePct: 2,
      inflationPct: 0
    },
    // Einnahmen/Ausgaben, direkt in der App gepflegt (siehe
    // einnahmenAusgabenTab.js). Jede Buchung trägt drei Daten: datum
    // (Buchungsdatum, für den Budgetvergleich), valutadatum (für Cashflow/
    // Rendite-Analyse) und erfasstAm (Zeitstempel der Erfassung, nur intern).
    realTransaktionen: [],
    // Vorlagen für automatisch zu erzeugende Buchungen (z. B. Miete, Abos),
    // siehe wiederkehrendeBuchungen.js. Erzeugte Buchungen landen als
    // normale, unabhängige Einträge in realTransaktionen.
    wiederkehrendeBuchungen: []
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // fehlende Felder aus Default ergänzen (z. B. nach App-Update)
    const s = Object.assign(defaultState(), parsed);
    const kategorienMigriert = migriereKategorien(s, uid);
    const transaktionenMigriert = migriereTransaktionen(s);
    if (kategorienMigriert || transaktionenMigriert) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* siehe persist() */ }
    }
    return s;
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
