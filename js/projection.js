import { isoYear, daysBetweenIso } from "./dateUtils.js";

/**
 * Anteil eines Jahres von einem gegebenen Datum (inkl.) bis Jahresende, z. B.
 * für den 1.7. eines Jahres ca. 0.5. Für den 1.1. ergibt sich 1 (kein
 * angebrochenes Jahr).
 */
function jahresanteilAb(abIso) {
  const jahr = isoYear(abIso);
  const jahresbeginn = jahr + "-01-01";
  const naechsterJahresbeginn = (jahr + 1) + "-01-01";
  const tageGesamt = daysBetweenIso(jahresbeginn, naechsterJahresbeginn);
  const tageAbDatum = daysBetweenIso(abIso, naechsterJahresbeginn);
  return tageAbDatum / tageGesamt;
}

/**
 * Ermittelt den für ein Jahr gültigen Budgetwert eines Postens.
 *
 * Modell: "wiederkehrend"-Zeilen bilden pro Posten eine Zeitachse ("gültig ab
 * diesem Jahr, bis zur nächsten Änderung") – es zählt die Zeile mit dem
 * jüngsten "ab"-Jahr <= Zieljahr. "einmalig"-Zeilen kommen zusätzlich nur in
 * ihrem eigenen Jahr obendrauf (z. B. eine Anschaffung). Beginnt eine
 * wiederkehrende Zeile nicht am 1.1., wird ihr Wert im ersten (angebrochenen)
 * Jahr nur anteilsmässig berücksichtigt.
 */
export function budgetwertFuerJahr(budgetPosten, posten, jahr) {
  const rows = budgetPosten.filter(function (r) { return r.posten === posten; });

  let basiswert = 0;
  let bestesJahr = -Infinity;
  let bestesAb = null;
  rows.forEach(function (r) {
    if (r.typ === "wiederkehrend") {
      const abJahr = isoYear(r.ab);
      if (abJahr <= jahr && abJahr > bestesJahr) {
        bestesJahr = abJahr;
        basiswert = r.betrag;
        bestesAb = r.ab;
      }
    }
  });

  if (bestesJahr === jahr && bestesAb) {
    basiswert *= jahresanteilAb(bestesAb);
  }

  const einmaligSumme = rows
    .filter(function (r) { return r.typ === "einmalig" && isoYear(r.ab) === jahr; })
    .reduce(function (sum, r) { return sum + r.betrag; }, 0);

  return basiswert + einmaligSumme;
}

export function alleBudgetPostenNamen(budgetPosten) {
  const namen = [];
  budgetPosten.forEach(function (r) {
    if (namen.indexOf(r.posten) === -1) namen.push(r.posten);
  });
  return namen;
}

/**
 * Budgetiertes Netto eines Jahres, aufgeteilt in Ertrag (positive Postenwerte)
 * und Kosten (negative Postenwerte).
 */
export function budgetJahresSumme(budgetPosten, jahr) {
  const namen = alleBudgetPostenNamen(budgetPosten);
  let ertrag = 0;
  let kosten = 0;
  namen.forEach(function (posten) {
    const wert = budgetwertFuerJahr(budgetPosten, posten, jahr);
    if (wert >= 0) ertrag += wert; else kosten += wert;
  });
  return { ertrag: ertrag, kosten: kosten };
}

function realErtragFuerJahr(realTransaktionen, jahr) {
  const treffer = realTransaktionen.filter(function (t) { return t.istEinnahme && isoYear(t.datum) === jahr; });
  if (treffer.length === 0) return null;
  return treffer.reduce(function (sum, t) { return sum + t.betragChf; }, 0);
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
 * Ertrag: reale Erträge des Jahres, falls Transaktionen vorhanden, sonst
 * budgetierter Ertrag. Kosten: immer budgetiert, optional mit p.a.-Inflation
 * ab dem laufenden Jahr hochgerechnet. Vermögen wächst mit der eingestellten
 * Rendite p.a. auf dem Vorjahresendbestand.
 */
export function berechneProjektion(state) {
  const { budgetPosten, realTransaktionen, einstellungen } = state;
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
    const realErtrag = realErtragFuerJahr(realTransaktionen, jahr);
    const ertrag = realErtrag !== null ? realErtrag : budget.ertrag;
    const inflationFaktor = Math.pow(1 + inflationPct / 100, Math.max(0, jahr - heuteJahr));
    const kosten = budget.kosten * inflationFaktor;
    const netto = ertrag + kosten;

    const vermoegenStart = vermoegen;
    vermoegen = vermoegenStart * renditeFaktor + netto;

    jahre.push({
      jahr: jahr,
      ertrag: ertrag,
      ertragIstReal: realErtrag !== null,
      kosten: kosten,
      netto: netto,
      vermoegenStart: vermoegenStart,
      vermoegenEnde: vermoegen
    });
  }

  return { startJahr: startJahr, startVermoegen: start.summe, startDatum: start.datum, jahre: jahre };
}
