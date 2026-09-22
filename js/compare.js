import { isoYear } from "./dateUtils.js";
import { budgetwertFuerJahr } from "./projection.js";

const SCHWELLE_CHF = 100; // Abweichungen darunter werden nicht als Einsparpotenzial gewertet

function distinctSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function istUnvollstaendig(jahr) {
  return jahr >= new Date().getFullYear();
}

/**
 * Vergleichstabelle "reale Kosten vs. Budget" pro Jahr und Kategorie
 * (Kategoriengruppe der Transaktionen = "Posten" im Budget).
 */
export function berechneAbweichungen(state) {
  const ausgaben = state.realTransaktionen.filter(function (t) { return !t.istEinnahme; });
  const jahre = distinctSorted(ausgaben.map(function (t) { return isoYear(t.datum); }));

  const realKategorien = distinctSorted(ausgaben.map(function (t) { return t.kategoriengruppe; }).filter(Boolean));
  const budgetKostenPosten = distinctSorted(
    state.budgetPosten.filter(function (r) { return r.betrag < 0; }).map(function (r) { return r.posten; })
  );
  const postenListe = distinctSorted(realKategorien.concat(budgetKostenPosten));

  const zeilen = [];
  jahre.forEach(function (jahr) {
    postenListe.forEach(function (posten) {
      const real = ausgaben
        .filter(function (t) { return t.kategoriengruppe === posten && isoYear(t.datum) === jahr; })
        .reduce(function (s, t) { return s + t.betragChf; }, 0);
      const budget = budgetwertFuerJahr(state.budgetPosten, posten, jahr);
      if (budget === 0 && real === 0) return;
      const abweichung = Math.abs(real) - Math.abs(budget);
      const abweichungPct = budget !== 0 ? (abweichung / Math.abs(budget)) * 100 : null;
      zeilen.push({
        jahr: jahr,
        posten: posten,
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
 * Liefert die einzelnen realen Buchungen, aus denen sich der "Real"-Wert
 * einer Zelle der Abweichungstabelle zusammensetzt (für den Drilldown).
 */
export function buchungenFuerJahrPosten(state, jahr, posten) {
  return state.realTransaktionen
    .filter(function (t) { return !t.istEinnahme && t.kategoriengruppe === posten && isoYear(t.datum) === jahr; })
    .sort(function (a, b) { return a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0; });
}

/**
 * Sinnvolle Einsparungsmöglichkeiten: Kategorien, die im Schnitt über
 * mehrere abgeschlossene Jahre das Budget übersteigen, sowie – als
 * Zusatzinfo – Kategorien mit deutlichen Budgetreserven.
 */
export function berechneSparpotenzial(state) {
  const abweichungen = berechneAbweichungen(state);
  const vollstaendigeZeilen = abweichungen.zeilen.filter(function (z) { return !z.unvollstaendig; });

  const proPosten = {};
  vollstaendigeZeilen.forEach(function (z) {
    (proPosten[z.posten] = proPosten[z.posten] || []).push(z.abweichung);
  });

  const auswertung = Object.keys(proPosten).map(function (posten) {
    const werte = proPosten[posten];
    const durchschnitt = werte.reduce(function (s, v) { return s + v; }, 0) / werte.length;
    return { posten: posten, durchschnittAbweichung: durchschnitt, anzahlJahre: werte.length };
  });

  const ueberschreitungen = auswertung
    .filter(function (a) { return a.durchschnittAbweichung > SCHWELLE_CHF; })
    .sort(function (a, b) { return b.durchschnittAbweichung - a.durchschnittAbweichung; });

  const reserven = auswertung
    .filter(function (a) { return a.durchschnittAbweichung < -SCHWELLE_CHF; })
    .sort(function (a, b) { return a.durchschnittAbweichung - b.durchschnittAbweichung; });

  return {
    basisJahre: distinctSorted(vollstaendigeZeilen.map(function (z) { return z.jahr; })),
    ueberschreitungen: ueberschreitungen,
    reserven: reserven
  };
}
