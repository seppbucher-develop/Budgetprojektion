import { isoYear } from "./dateUtils.js?v=9";

function monatsIndex(iso) {
  return isoYear(iso) * 12 + parseInt(String(iso).slice(5, 7), 10);
}

/**
 * Für einen konkreten Monat (jahr, monat 1-12) gültiger Wert einer
 * wiederkehrenden Zeitachse: die Zeile mit dem jüngsten "ab"-Monat, der
 * nicht nach dem Zielmonat liegt (0, falls noch keine Zeile gilt).
 */
function wiederkehrenderMonatswert(wiederkehrendRows, jahr, monat) {
  const zielIndex = jahr * 12 + monat;
  let bestesBetrag = 0;
  let bestesIndex = -Infinity;
  wiederkehrendRows.forEach(function (r) {
    const index = monatsIndex(r.ab);
    if (index <= zielIndex && index > bestesIndex) {
      bestesIndex = index;
      bestesBetrag = r.betrag;
    }
  });
  return bestesBetrag;
}

/**
 * Ermittelt den für ein Jahr gültigen Budgetwert eines Postens.
 *
 * Modell: "wiederkehrend"-Zeilen bilden pro Posten eine Zeitachse ("gültig ab
 * diesem Monat, bis zur nächsten Änderung"). Der Jahreswert wird monatsgenau
 * aus den 12 Einzelmonaten aufsummiert, sodass ein Wechsel mitten im Jahr
 * (z. B. ein neuer Rentenbetrag ab Dezember) korrekt anteilig sowohl den
 * alten Wert für die Monate davor als auch den neuen Wert für die Monate
 * danach berücksichtigt – auch wenn dadurch zwei Wechsel im selben
 * Kalenderjahr liegen. "einmalig"-Zeilen kommen zusätzlich nur in ihrem
 * eigenen Jahr obendrauf (z. B. eine Anschaffung).
 */
export function budgetwertFuerJahr(budgetPosten, kategorieId, jahr) {
  const rows = budgetPosten.filter(function (r) { return r.kategorieId === kategorieId; });
  const wiederkehrendRows = rows.filter(function (r) { return r.typ === "wiederkehrend"; });

  let basiswert = 0;
  for (let monat = 1; monat <= 12; monat++) {
    basiswert += wiederkehrenderMonatswert(wiederkehrendRows, jahr, monat) / 12;
  }

  const einmaligSumme = rows
    .filter(function (r) { return r.typ === "einmalig" && isoYear(r.ab) === jahr; })
    .reduce(function (sum, r) { return sum + r.betrag; }, 0);

  return basiswert + einmaligSumme;
}

export function alleBudgetKategorieIds(budgetPosten) {
  const ids = [];
  budgetPosten.forEach(function (r) {
    if (ids.indexOf(r.kategorieId) === -1) ids.push(r.kategorieId);
  });
  return ids;
}

/**
 * Budgetiertes Netto eines Jahres, aufgeteilt in Ertrag (positive Postenwerte)
 * und Kosten (negative Postenwerte).
 */
export function budgetJahresSumme(budgetPosten, jahr) {
  const kategorieIds = alleBudgetKategorieIds(budgetPosten);
  let ertrag = 0;
  let kosten = 0;
  kategorieIds.forEach(function (kategorieId) {
    const wert = budgetwertFuerJahr(budgetPosten, kategorieId, jahr);
    if (wert >= 0) ertrag += wert; else kosten += wert;
  });
  return { ertrag: ertrag, kosten: kosten };
}

export function letztesVermoegen(state) {
  if (state.vermoegenEintraege.length === 0) return { datum: null, jahr: new Date().getFullYear(), summe: 0 };
  const sortiert = state.vermoegenEintraege.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
  const letzter = sortiert[0];
  const summe = Object.values(letzter.werte).reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
  return { datum: letzter.datum, jahr: isoYear(letzter.datum), summe: summe };
}

/**
 * 30-Jahres-Projektion (Standard, über einstellungen.horizontJahre einstellbar).
 * Ertrag und Kosten sind immer budgetiert (reale Buchungen fliessen bewusst
 * nicht ein, da sie sich in der Projektion sonst zu stark mit budgetierten
 * Werten anderer Jahre vermischen), optional mit p.a.-Inflation auf die
 * Kosten ab dem laufenden Jahr hochgerechnet. Vermögen wächst mit der
 * eingestellten Rendite p.a. auf dem Vorjahresendbestand.
 */
export function berechneProjektion(state) {
  const { budgetPosten, einstellungen } = state;
  const start = letztesVermoegen(state);
  const heuteJahr = new Date().getFullYear();
  const startJahr = Math.max(start.jahr, heuteJahr);
  const horizont = einstellungen.horizontJahre || 30;
  const renditeFaktor = 1 + (einstellungen.renditePct || 0) / 100;
  const inflationPct = einstellungen.inflationPct || 0;

  const jahre = [];
  let vermoegen = start.summe;

  for (let jahr = startJahr; jahr < startJahr + horizont; jahr++) {
    const budget = budgetJahresSumme(budgetPosten, jahr);
    const ertrag = budget.ertrag;
    const inflationFaktor = Math.pow(1 + inflationPct / 100, Math.max(0, jahr - heuteJahr));
    const kosten = budget.kosten * inflationFaktor;
    const netto = ertrag + kosten;

    const vermoegenStart = vermoegen;
    vermoegen = vermoegenStart * renditeFaktor + netto;

    jahre.push({
      jahr: jahr,
      ertrag: ertrag,
      kosten: kosten,
      netto: netto,
      vermoegenStart: vermoegenStart,
      vermoegenEnde: vermoegen
    });
  }

  return { startJahr: startJahr, startVermoegen: start.summe, startDatum: start.datum, jahre: jahre };
}
