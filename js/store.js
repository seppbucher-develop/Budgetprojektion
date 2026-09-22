// Zentraler Zustand der App: wird komplett im localStorage gehalten,
// es gibt kein Backend. Andere Module lesen/ändern den Zustand nur über
// diese Funktionen, damit Persistenz und Änderungs-Events an einer Stelle bleiben.

const STORAGE_KEY = "budgetprojektion.state.v2";

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

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Speichern ist optional; App funktioniert auch ohne Persistenz weiter
  }
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
