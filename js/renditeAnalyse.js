// Vermögensrendite zwischen zwei Stichtagen: Vermögen(Ende) - Vermögen(Anfang)
// abzüglich des effektiven Netto-Cashflows in der Zwischenzeit ergibt die
// Rendite (Zinsen/Dividenden/Kursgewinne) als Restgrösse. Der Cashflow kommt
// aus dem Valutadatum jeder Buchung (nicht dem Buchungsdatum, das für
// Budgetzwecke abweichen kann, siehe einnahmenAusgabenTab.js).
import { unterkategorieName } from "./kategorien.js?v=15";

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

  return {
    stichtagVon: stichtagVon,
    stichtagBis: stichtagBis,
    vermoegenStart: vermoegenStart,
    vermoegenEnde: vermoegenEnde,
    effektiverCashflow: effektiverCashflow,
    renditeChf: renditeChf,
    renditePct: renditePct,
    cashflowPosten: cashflowPosten
  };
}
