import { isoYear } from "./dateUtils.js?v=1";
import { budgetwertFuerJahr, alleBudgetPostenNamen } from "./projection.js?v=1";

const SCHWELLE_CHF = 100; // Abweichungen darunter werden nicht als Einsparpotenzial gewertet

function distinctSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function istUnvollstaendig(jahr) {
  return jahr >= new Date().getFullYear();
}

/**
 * Typ eines Postens ("kosten" oder "ertrag"), ermittelt primär aus dem
 * Vorzeichen des Budgetwerts, ersatzweise (Posten ohne Budget-Zeile) aus dem
 * istEinnahme-Flag der realen Buchungen.
 */
function postenTyp(state, posten) {
  const budgetRow = state.budgetPosten.find(function (r) { return r.posten === posten; });
  if (budgetRow) return budgetRow.betrag < 0 ? "kosten" : "ertrag";
  const txn = state.realTransaktionen.find(function (t) { return t.kategoriengruppe === posten; });
  return txn && txn.istEinnahme ? "ertrag" : "kosten";
}

/**
 * Vergleichstabelle "reale Buchungen vs. Budget" pro Jahr und Kategorie
 * (Kategoriengruppe der Transaktionen = "Posten" im Budget). Umfasst sowohl
 * Kosten- als auch Ertragsposten (z. B. Renten); Beträge behalten ihr
 * natürliches Vorzeichen. abweichung = real - budget, d. h. positiv = besser
 * fürs Vermögen als budgetiert (weniger ausgegeben bzw. mehr eingenommen).
 */
export function berechneAbweichungen(state) {
  const jahre = distinctSorted(state.realTransaktionen.map(function (t) { return isoYear(t.datum); }));

  const realKategorien = distinctSorted(state.realTransaktionen.map(function (t) { return t.kategoriengruppe; }).filter(Boolean));
  const budgetPostenNamen = alleBudgetPostenNamen(state.budgetPosten);
  const postenListe = distinctSorted(realKategorien.concat(budgetPostenNamen));

  const zeilen = [];
  jahre.forEach(function (jahr) {
    postenListe.forEach(function (posten) {
      const real = state.realTransaktionen
        .filter(function (t) { return t.kategoriengruppe === posten && isoYear(t.datum) === jahr; })
        .reduce(function (s, t) { return s + t.betragChf; }, 0);
      const budget = budgetwertFuerJahr(state.budgetPosten, posten, jahr);
      if (budget === 0 && real === 0) return;
      const abweichung = real - budget;
      const abweichungPct = budget !== 0 ? (abweichung / Math.abs(budget)) * 100 : null;
      zeilen.push({
        jahr: jahr,
        posten: posten,
        typ: postenTyp(state, posten),
        budget: budget,
        real: real,
        abweichung: abweichung,
        abweichungPct: abweichungPct,
        unvollstaendig: istUnvollstaendig(jahr)
      });
    });
  });

  const summenProJahr = jahre.map(function (jahr) {
    const zeilenDesJahres = zeilen.filter(function (z) { return z.jahr === jahr; });
    return {
      jahr: jahr,
      budget: zeilenDesJahres.reduce(function (s, z) { return s + z.budget; }, 0),
      real: zeilenDesJahres.reduce(function (s, z) { return s + z.real; }, 0),
      abweichung: zeilenDesJahres.reduce(function (s, z) { return s + z.abweichung; }, 0),
      unvollstaendig: istUnvollstaendig(jahr)
    };
  });

  return { jahre: jahre, postenListe: postenListe, zeilen: zeilen, summenProJahr: summenProJahr };
}

/**
 * Istkostenvergleich: reale Buchungen pro Kategorie über drei Jahre
 * nebeneinander (gewähltes Jahr sowie die zwei vorangehenden), ohne
 * Budget-Bezug oder Abweichung — reiner Trend der tatsächlichen Buchungen
 * (Kosten und Erträge, z. B. Renten, mit natürlichem Vorzeichen).
 */
export function berechneIstkosten(state, bisJahr) {
  const jahre = [bisJahr - 2, bisJahr - 1, bisJahr];
  const postenListe = distinctSorted(state.realTransaktionen.map(function (t) { return t.kategoriengruppe; }).filter(Boolean));

  const zeilen = postenListe.map(function (posten) {
    const werte = jahre.map(function (jahr) {
      return state.realTransaktionen
        .filter(function (t) { return t.kategoriengruppe === posten && isoYear(t.datum) === jahr; })
        .reduce(function (s, t) { return s + t.betragChf; }, 0);
    });
    return { posten: posten, werte: werte };
  }).filter(function (z) { return z.werte.some(function (w) { return w !== 0; }); });

  const summenProJahr = jahre.map(function (_jahr, i) {
    return zeilen.reduce(function (s, z) { return s + z.werte[i]; }, 0);
  });

  return { jahre: jahre, zeilen: zeilen, summenProJahr: summenProJahr };
}

/**
 * Liefert die einzelnen realen Buchungen, aus denen sich der "Real"-Wert
 * einer Zelle der Abweichungstabelle zusammensetzt (für den Drilldown).
 */
export function buchungenFuerJahrPosten(state, jahr, posten) {
  return state.realTransaktionen
    .filter(function (t) { return t.kategoriengruppe === posten && isoYear(t.datum) === jahr; })
    .sort(function (a, b) { return a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0; });
}

/**
 * Sinnvolle Einsparungsmöglichkeiten: Kosten-Kategorien, die im Schnitt über
 * mehrere abgeschlossene Jahre das Budget übersteigen, sowie – als
 * Zusatzinfo – Kategorien mit deutlichen Budgetreserven. Nur Kostenposten
 * (Ertragsposten wie Renten sind hier nicht relevant, da "Einsparung" nur
 * bei Ausgaben Sinn ergibt).
 */
export function berechneSparpotenzial(state) {
  const abweichungen = berechneAbweichungen(state);
  const vollstaendigeZeilen = abweichungen.zeilen.filter(function (z) { return !z.unvollstaendig && z.typ === "kosten"; });

  const proPosten = {};
  vollstaendigeZeilen.forEach(function (z) {
    (proPosten[z.posten] = proPosten[z.posten] || []).push(z.abweichung);
  });

  const auswertung = Object.keys(proPosten).map(function (posten) {
    const werte = proPosten[posten];
    const durchschnitt = werte.reduce(function (s, v) { return s + v; }, 0) / werte.length;
    return { posten: posten, durchschnittAbweichung: durchschnitt, anzahlJahre: werte.length };
  });

  // abweichung = real - budget, d. h. negativ = mehr ausgegeben als budgetiert (schlecht).
  const ueberschreitungen = auswertung
    .filter(function (a) { return a.durchschnittAbweichung < -SCHWELLE_CHF; })
    .sort(function (a, b) { return a.durchschnittAbweichung - b.durchschnittAbweichung; });

  const reserven = auswertung
    .filter(function (a) { return a.durchschnittAbweichung > SCHWELLE_CHF; })
    .sort(function (a, b) { return b.durchschnittAbweichung - a.durchschnittAbweichung; });

  return {
    basisJahre: distinctSorted(vollstaendigeZeilen.map(function (z) { return z.jahr; })),
    ueberschreitungen: ueberschreitungen,
    reserven: reserven
  };
}
