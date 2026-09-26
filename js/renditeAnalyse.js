// Vermögensrendite zwischen zwei Stichtagen: Vermögen(Ende) - Vermögen(Anfang)
// abzüglich des effektiven Netto-Cashflows in der Zwischenzeit ergibt die
// Rendite (Zinsen/Dividenden/Kursgewinne) als Restgrösse. Der Cashflow kommt
// aus dem Valutadatum jeder Buchung (nicht dem Buchungsdatum, das für
// Budgetzwecke abweichen kann, siehe einnahmenAusgabenTab.js).
import { unterkategorieName } from "./kategorien.js?v=20";

function vermoegenSummeAmStichtag(state, datum) {
  const eintrag = state.vermoegenEintraege.find(function (e) { return e.datum === datum; });
  if (!eintrag) return null;
  return Object.values(eintrag.werte).reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
}

/**
 * Cashflow-Posten im Zeitraum (stichtagVon, stichtagBis] — der Start-
 * Stichtag selbst zählt zur Vorperiode.
 */
export function cashflowPostenImZeitraum(state, stichtagVon, stichtagBis) {
  return state.realTransaktionen
    .filter(function (t) { return t.valutadatum > stichtagVon && t.valutadatum <= stichtagBis; })
    .map(function (t) { return { datum: t.valutadatum, betrag: t.betragChf, bezeichnung: unterkategorieName(state, t.unterkategorieId) }; })
    .sort(function (a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0; });
}

// Hochrechnung der Perioden-Rendite auf ein Jahr (geometrisch, wie ein
// Zinseszins-Satz -- nicht einfach linear mit 365/Tage multipliziert). Bei
// sehr kurzen Perioden ist das Ergebnis entsprechend instabil/extrem, bleibt
// aber die korrekte Fortschreibung des tatsächlichen Periodensatzes.
function renditePctProJahr(renditePct, tage) {
  if (renditePct == null || !tage || tage <= 0) return null;
  const faktor = 1 + renditePct / 100;
  if (faktor <= 0) return null; // Totalverlust oder mehr -- Wurzel nicht definiert
  const jahre = tage / 365;
  return (Math.pow(faktor, 1 / jahre) - 1) * 100;
}

export function berechneRendite(state, stichtagVon, stichtagBis) {
  const vermoegenStart = vermoegenSummeAmStichtag(state, stichtagVon);
  const vermoegenEnde = vermoegenSummeAmStichtag(state, stichtagBis);
  const cashflowPosten = cashflowPostenImZeitraum(state, stichtagVon, stichtagBis);
  const effektiverCashflow = cashflowPosten.reduce(function (s, p) { return s + p.betrag; }, 0);

  const renditeChf = (vermoegenStart != null && vermoegenEnde != null)
    ? vermoegenEnde - vermoegenStart - effektiverCashflow
    : null;
  const renditePct = (renditeChf != null && vermoegenStart)
    ? (renditeChf / Math.abs(vermoegenStart)) * 100
    : null;
  const tage = (new Date(stichtagBis) - new Date(stichtagVon)) / 86400000;
  const renditePctJahr = renditePctProJahr(renditePct, tage);

  return {
    stichtagVon: stichtagVon,
    stichtagBis: stichtagBis,
    vermoegenStart: vermoegenStart,
    vermoegenEnde: vermoegenEnde,
    effektiverCashflow: effektiverCashflow,
    renditeChf: renditeChf,
    renditePct: renditePct,
    renditePctJahr: renditePctJahr,
    cashflowPosten: cashflowPosten
  };
}
