// Zuordnung von Flugreisekosten (Unterkategorie "Flugreisen") zu den Reisen
// der Flugbuch-Reiseanalyse (pistazienfarbige Google-Kalender-Termine).
//
// Die Reisen liegen im Schwester-App "Flugbuch" (gleicher Origin) in dessen
// IndexedDB unter "flugbuch:reiseanalyse:tripsCache" und werden hier nur
// gelesen. Das Ergebnis der Zuordnung steht als Feld reiseId direkt an der
// Buchung in realTransaktionen (dadurch auch im Backup) und wird vom Flugbuch
// (Statistik → Reiseanalyse) aus dem localStorage dieser App gelesen.
//
// Regeln (Buchungsdatum datum):
//  - liegt es innerhalb genau einer Reise → automatisch dieser Reise zugeordnet
//  - liegt es in der Pufferzeit vor/nach einer Reise (Hotel/Flug früher bzw.
//    später verbucht), in mehreren Reisen zugleich oder ausserhalb jeder Reise
//    → offen, der Nutzer entscheidet im Dialog (Reise wählen und/oder
//    Buchungsdatum ändern)
//  - reiseId === KEINE_REISE: bewusst keiner Reise zugeordnet
import { isoToDate } from "./dateUtils.js?v=27";
import { unterkategorieName } from "./kategorien.js?v=27";

export const FLUGREISEN_UNTERKATEGORIE = "Flugreisen";
export const KEINE_REISE = "keine";
export const PUFFER_VOR_DEFAULT = 60;
export const PUFFER_NACH_DEFAULT = 14;

const DAY_MS = 24 * 3600 * 1000;
const DB_NAME = "flugbuch-db";
const STORE = "kv";
const TRIPS_KEY = "flugbuch:reiseanalyse:tripsCache";

function openFlugbuchDb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(new Error("IndexedDB nicht verfügbar")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    // Wie im Flugbuch: falls die DB hier zuerst angelegt wird, muss der Store
    // trotzdem existieren, sonst würde das Flugbuch sie später nicht nutzen.
    req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

/** Liest die zwischengespeicherten Reisen des Flugbuchs; [] wenn keine da. */
export async function ladeReisen() {
  let raw = null;
  try {
    const db = await openFlugbuchDb();
    raw = await new Promise(function (resolve, reject) {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(TRIPS_KEY);
      req.onsuccess = function () { resolve(req.result !== undefined ? req.result : null); };
      req.onerror = function () { reject(req.error); };
    });
    db.close();
  } catch (e) { /* weiter mit localStorage-Fallback */ }
  if (raw === null) {
    try { raw = localStorage.getItem(TRIPS_KEY); } catch (e) { raw = null; }
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed.trips) ? parsed.trips : []).map(function (t) {
      const start = isoToDate(t.startDate).getTime();
      let endEx = isoToDate(t.endDate).getTime();
      if (!t.allDay) endEx += DAY_MS; // Termine mit Uhrzeit: Endtag zählt noch mit
      return { id: t.id, title: t.title, startDate: t.startDate, endDate: t.endDate, start: start, endExclusive: endEx };
    }).sort(function (a, b) { return a.start - b.start; });
  } catch (e) {
    return [];
  }
}

export function pufferEinstellung(state) {
  const e = state.einstellungen || {};
  return {
    vor: Number.isFinite(e.reisePufferVorTage) ? e.reisePufferVorTage : PUFFER_VOR_DEFAULT,
    nach: Number.isFinite(e.reisePufferNachTage) ? e.reisePufferNachTage : PUFFER_NACH_DEFAULT
  };
}

/** Alle Buchungen der Unterkategorie "Flugreisen" (Ausgaben wie Erstattungen). */
export function flugreisenBuchungen(state) {
  return state.realTransaktionen.filter(function (t) {
    return unterkategorieName(state, t.unterkategorieId) === FLUGREISEN_UNTERKATEGORIE;
  });
}

/**
 * Bestimmt für eine Buchung, was das Datum über die Zuordnung aussagt.
 * Rückgabe: { status, reise?, kandidaten? }
 *  status "zugeordnet": reiseId ist gesetzt (manuell oder bereits automatisch)
 *  status "innen": genau eine Reise umfasst das Buchungsdatum
 *  status "puffer": nicht in einer Reise, aber im Puffer der Reise `reise`
 *  status "mehrdeutig": in mehreren Reisen bzw. Puffern gleichzeitig
 *  status "ausserhalb": weder in einer Reise noch in einem Puffer
 */
export function klassifiziere(buchung, reisen, puffer) {
  if (buchung.reiseId) return { status: "zugeordnet" };
  const t = isoToDate(buchung.datum).getTime();
  const innen = reisen.filter(function (r) { return t >= r.start && t < r.endExclusive; });
  if (innen.length === 1) return { status: "innen", reise: innen[0] };
  if (innen.length > 1) return { status: "mehrdeutig", kandidaten: innen };
  const imPuffer = reisen.filter(function (r) {
    return t >= r.start - puffer.vor * DAY_MS && t < r.endExclusive + puffer.nach * DAY_MS;
  });
  if (imPuffer.length === 1) return { status: "puffer", reise: imPuffer[0] };
  if (imPuffer.length > 1) return { status: "mehrdeutig", kandidaten: imPuffer };
  return { status: "ausserhalb" };
}

/** Offene Buchungen (alles ausser bereits zugeordnet bzw. "innen"). */
export function offeneBuchungen(state, reisen) {
  const puffer = pufferEinstellung(state);
  return flugreisenBuchungen(state)
    .map(function (b) { return { buchung: b, klasse: klassifiziere(b, reisen, puffer) }; })
    .filter(function (x) { return x.klasse.status !== "zugeordnet" && x.klasse.status !== "innen"; })
    .sort(function (a, b) { return a.buchung.datum.localeCompare(b.buchung.datum); });
}

/**
 * Schreibt die eindeutigen Zuordnungen (Buchung liegt innerhalb genau einer
 * Reise) als reiseId in die Buchungen. Gibt die Anzahl geänderter Buchungen
 * zurück. Mutiert state direkt — im updateState-Callback aufrufen.
 */
export function wendeAutomatischeZuordnungAn(state, reisen) {
  const puffer = pufferEinstellung(state);
  let n = 0;
  flugreisenBuchungen(state).forEach(function (b) {
    const k = klassifiziere(b, reisen, puffer);
    if (k.status === "innen") { b.reiseId = k.reise.id; n++; }
  });
  return n;
}
