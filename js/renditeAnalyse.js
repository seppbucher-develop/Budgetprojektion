// Vermögensrendite zwischen zwei Stichtagen: Vermögen(Ende) - Vermögen(Anfang)
// abzüglich des effektiven Netto-Cashflows in der Zwischenzeit ergibt die
// Rendite (Zinsen/Dividenden/Kursgewinne) als Restgrösse. Der Cashflow kommt
// nicht aus dem (oft budget-verschobenen) Buchungsdatum der Bluecoins-Daten,
// sondern aus dem cashflowLog (siehe cashflowDiff.js, dem Import-Zeitpunkt
// zugeordnet) sowie manuellen Korrekturbuchungen (state.korrekturen).
function vermoegenSummeAmStichtag(state, datum) {
  const eintrag = state.vermoegenEintraege.find(function (e) { return e.datum === datum; });
  if (!eintrag) return null;
  return Object.values(eintrag.werte).reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
}

/**
 * Cashflow-Posten (Import-Log + manuelle Korrekturen) im Zeitraum
 * (stichtagVon, stichtagBis] — der Start-Stichtag selbst zählt zur Vorperiode.
 */
export function cashflowPostenImZeitraum(state, stichtagVon, stichtagBis) {
  const posten = [];
  state.cashflowLog.forEach(function (e) {
    if (e.erkanntAm > stichtagVon && e.erkanntAm <= stichtagBis) {
      posten.push({ datum: e.erkanntAm, betrag: e.betrag, bezeichnung: e.kategorie, quelle: "import" });
    }
  });
  state.korrekturen.forEach(function (k) {
    if (k.datum > stichtagVon && k.datum <= stichtagBis) {
      posten.push({ datum: k.datum, betrag: k.betrag, bezeichnung: k.beschreibung, quelle: "korrektur" });
    }
  });
  return posten.sort(function (a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0; });
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

/** Frühestes Datum, ab dem der cashflowLog überhaupt Einträge hat (Hinweis
 * in der UI, da vor dem ersten Import mit dieser Funktion keine Daten
 * existieren und die Rendite für ältere Perioden daher nicht aussagekräftig
 * ist). */
export function fruehesterCashflowLogEintrag(state) {
  if (state.cashflowLog.length === 0) return null;
  return state.cashflowLog.reduce(function (min, e) { return e.erkanntAm < min ? e.erkanntAm : min; }, state.cashflowLog[0].erkanntAm);
}
