// Geschäftslogik für Vermögens-Konten (state.vermoegenKonten) und
// -Einträge (state.vermoegenEintraege), siehe vermoegenTab.js für die
// Erfassung. Konten können in Fremdwährung geführt werden (z. B. "Euro",
// "USD"): erfasst wird dann der native Fremdwährungsbetrag
// (eintrag.fremdbetraege[kontoName]), aus dem der CHF-Betrag
// (eintrag.werte[kontoName], wie bisher unverändert für Summe/Rendite/
// Projektion genutzt) beim Erfassen/erstmaligen Speichern EINMALIG mit dem
// dann aktuellen Kurs berechnet wird -- der damalige Kurs bleibt danach
// stehen (nachvollziehbarer historischer Gegenwert), bis er über den Button
// "Währung neu berechnen" (siehe vermoegenTab.js) gezielt aufgefrischt wird.
import { holeWechselkurs } from "./fx.js?v=29";

/**
 * Einmalige, idempotente Migration: vermoegenKonten waren ursprünglich ein
 * einfaches Array von Namen (implizit immer CHF). Neu ist jedes Konto ein
 * Objekt {name, waehrung}, damit Fremdwährungskonten möglich sind.
 */
export function migriereVermoegenKonten(state) {
  let geaendert = false;
  state.vermoegenKonten = state.vermoegenKonten.map(function (k) {
    if (typeof k === "string") {
      geaendert = true;
      return { name: k, waehrung: "CHF" };
    }
    return k;
  });
  return geaendert;
}

function fremdwaehrungsKonten(state) {
  return state.vermoegenKonten.filter(function (k) { return k.waehrung !== "CHF"; });
}

/**
 * Rechnet die übergebenen Fremdwährungsbeträge (eines einzelnen Eintrags)
 * mit dem jeweils aktuellen Kurs in CHF um und schreibt die Ergebnisse in
 * werte -- mutiert werte direkt, gehört darum in den updateState()-Mutator
 * des Aufrufers.
 */
export async function berechneFremdwaehrungBetraege(state, fremdbetraege, werte) {
  const fremdKonten = fremdwaehrungsKonten(state).filter(function (k) { return fremdbetraege[k.name] != null; });
  for (const k of fremdKonten) {
    const ergebnis = await holeWechselkurs(null, k.waehrung);
    if (ergebnis.kurs != null) {
      werte[k.name] = Math.round(fremdbetraege[k.name] * ergebnis.kurs * 100) / 100;
    }
  }
}

/**
 * Button "Währung neu berechnen": frischt die CHF-Beträge der
 * Fremdwährungskonten eines bereits gespeicherten Eintrags mit dem dann
 * aktuellen Kurs auf.
 */
export async function berechneFremdwaehrungEintragNeu(getState, updateState, eintragId) {
  const state = getState();
  const row = state.vermoegenEintraege.find(function (r) { return r.id === eintragId; });
  if (!row || !row.fremdbetraege) return;
  const werte = Object.assign({}, row.werte);
  await berechneFremdwaehrungBetraege(state, row.fremdbetraege, werte);
  updateState(function (s) {
    const r = s.vermoegenEintraege.find(function (x) { return x.id === eintragId; });
    if (r) r.werte = werte;
  });
}

/**
 * Ob ein Eintrag mindestens ein Fremdwährungskonto mit erfasstem Betrag
 * hat -- steuert, ob der Button "Währung neu berechnen" für ihn sinnvoll
 * ist (siehe vermoegenTab.js).
 */
export function hatFremdwaehrungsBetraege(state, row) {
  if (!row.fremdbetraege) return false;
  return fremdwaehrungsKonten(state).some(function (k) { return row.fremdbetraege[k.name] != null; });
}
