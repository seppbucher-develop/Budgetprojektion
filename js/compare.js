import { isoYear } from "./dateUtils.js?v=33";
import { budgetwertFuerJahr, alleBudgetKategorieIds } from "./projection.js?v=33";

const SCHWELLE_CHF = 100; // Abweichungen darunter werden nicht als Einsparpotenzial gewertet

function distinctSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function istUnvollstaendig(jahr) {
  return jahr >= new Date().getFullYear();
}

/**
 * Typ einer Kategorie ("kosten" oder "ertrag"), ermittelt primär aus dem
 * Vorzeichen des Budgetwerts, ersatzweise (Kategorie ohne Budget-Zeile) aus
 * dem Vorzeichen der realen Buchungen.
 */
function kategorieTyp(state, kategorieId) {
  const budgetRow = state.budgetPosten.find(function (r) { return r.kategorieId === kategorieId; });
  if (budgetRow) return budgetRow.betrag < 0 ? "kosten" : "ertrag";
  const txn = state.realTransaktionen.find(function (t) { return t.kategorieId === kategorieId; });
  return txn && txn.betragChf >= 0 ? "ertrag" : "kosten";
}

/**
 * Vergleichstabelle "reale Buchungen vs. Budget" pro Jahr und Kategorie.
 * Umfasst sowohl Kosten- als auch Ertragskategorien (z. B. Renten); Beträge
 * behalten ihr natürliches Vorzeichen. abweichung = real - budget, d. h.
 * positiv = besser fürs Vermögen als budgetiert (weniger ausgegeben bzw.
 * mehr eingenommen).
 */
export function berechneAbweichungen(state) {
  const jahre = distinctSorted(state.realTransaktionen.map(function (t) { return isoYear(t.datum); }));

  const realKategorieIds = distinctSorted(state.realTransaktionen.map(function (t) { return t.kategorieId; }).filter(Boolean));
  const budgetKategorieIds = alleBudgetKategorieIds(state.budgetPosten);
  const kategorieIds = distinctSorted(realKategorieIds.concat(budgetKategorieIds));

  const zeilen = [];
  jahre.forEach(function (jahr) {
    kategorieIds.forEach(function (kategorieId) {
      const real = state.realTransaktionen
        .filter(function (t) { return t.kategorieId === kategorieId && isoYear(t.datum) === jahr; })
        .reduce(function (s, t) { return s + t.betragChf; }, 0);
      const budget = budgetwertFuerJahr(state.budgetPosten, kategorieId, jahr);
      if (budget === 0 && real === 0) return;
      const abweichung = real - budget;
      const abweichungPct = budget !== 0 ? (abweichung / Math.abs(budget)) * 100 : null;
      zeilen.push({
        jahr: jahr,
        kategorieId: kategorieId,
        typ: kategorieTyp(state, kategorieId),
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

  return { jahre: jahre, kategorieIds: kategorieIds, zeilen: zeilen, summenProJahr: summenProJahr };
}

/**
 * Istkostenvergleich: reale Buchungen pro Kategorie über drei Jahre
 * nebeneinander (gewähltes Jahr sowie die zwei vorangehenden), ohne
 * Budget-Bezug oder Abweichung — reiner Trend der tatsächlichen Buchungen
 * (Kosten und Erträge, z. B. Renten, mit natürlichem Vorzeichen). Jede Zeile
 * enthält zusätzlich eine Aufschlüsselung nach Unterkategorie (unterzeilen)
 * für die aufklappbare Detailansicht.
 */
export function berechneIstkosten(state, bisJahr) {
  const jahre = [bisJahr - 2, bisJahr - 1, bisJahr];
  const kategorieIds = distinctSorted(state.realTransaktionen.map(function (t) { return t.kategorieId; }).filter(Boolean));

  function summeImJahr(transaktionen, jahr) {
    return transaktionen
      .filter(function (t) { return isoYear(t.datum) === jahr; })
      .reduce(function (s, t) { return s + t.betragChf; }, 0);
  }

  const zeilen = kategorieIds.map(function (kategorieId) {
    const transaktionenDerKategorie = state.realTransaktionen.filter(function (t) { return t.kategorieId === kategorieId; });
    const werte = jahre.map(function (jahr) { return summeImJahr(transaktionenDerKategorie, jahr); });

    const unterkategorieIds = distinctSorted(transaktionenDerKategorie.map(function (t) { return t.unterkategorieId; }).filter(Boolean));
    const unterzeilen = unterkategorieIds.map(function (unterkategorieId) {
      const transaktionenDerUnterkategorie = transaktionenDerKategorie.filter(function (t) { return t.unterkategorieId === unterkategorieId; });
      return {
        unterkategorieId: unterkategorieId,
        werte: jahre.map(function (jahr) { return summeImJahr(transaktionenDerUnterkategorie, jahr); })
      };
    }).filter(function (u) { return u.werte.some(function (w) { return w !== 0; }); });

    return { kategorieId: kategorieId, werte: werte, unterzeilen: unterzeilen };
  }).filter(function (z) { return z.werte.some(function (w) { return w !== 0; }); });

  const summenProJahr = jahre.map(function (_jahr, i) {
    return zeilen.reduce(function (s, z) { return s + z.werte[i]; }, 0);
  });

  return { jahre: jahre, zeilen: zeilen, summenProJahr: summenProJahr };
}

/**
 * Liefert die einzelnen realen Buchungen eines Jahres für eine Kategorie,
 * optional zusätzlich auf eine Unterkategorie eingeschränkt (für den
 * Drilldown-Dialog).
 */
export function buchungenFuerJahrKategorie(state, jahr, kategorieId, unterkategorieId) {
  return state.realTransaktionen
    .filter(function (t) {
      if (t.kategorieId !== kategorieId) return false;
      if (unterkategorieId && t.unterkategorieId !== unterkategorieId) return false;
      return isoYear(t.datum) === jahr;
    })
    .sort(function (a, b) { return a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0; });
}

/**
 * Sinnvolle Einsparungsmöglichkeiten: Kosten-Kategorien, die im Schnitt über
 * mehrere abgeschlossene Jahre das Budget übersteigen, sowie – als
 * Zusatzinfo – Kategorien mit deutlichen Budgetreserven. Nur Kostenkategorien
 * (Ertragskategorien wie Renten sind hier nicht relevant, da "Einsparung"
 * nur bei Ausgaben Sinn ergibt).
 */
export function berechneSparpotenzial(state) {
  const abweichungen = berechneAbweichungen(state);
  const vollstaendigeZeilen = abweichungen.zeilen.filter(function (z) { return !z.unvollstaendig && z.typ === "kosten"; });

  const proKategorie = {};
  vollstaendigeZeilen.forEach(function (z) {
    (proKategorie[z.kategorieId] = proKategorie[z.kategorieId] || []).push(z.abweichung);
  });

  const auswertung = Object.keys(proKategorie).map(function (kategorieId) {
    const werte = proKategorie[kategorieId];
    const durchschnitt = werte.reduce(function (s, v) { return s + v; }, 0) / werte.length;
    return { kategorieId: kategorieId, durchschnittAbweichung: durchschnitt, anzahlJahre: werte.length };
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

/**
 * Einsparpotenzial auf Ebene der Unterkategorien (das Budget kennt nur
 * Kategorien, daher kein Budgetvergleich): Kosten einer Unterkategorie im
 * Jahr `jahr` gegenüber dem Durchschnitt der bis zu drei vorangehenden Jahre
 * mit Buchungen in dieser Kategorie. Liegen die Kosten um mehr als
 * SCHWELLE_CHF darüber, gilt die Differenz als Potenzial (Rückkehr auf das
 * frühere Niveau). Nur Kostenkategorien; Kosten werden als positive Beträge
 * geführt (Rückerstattungen mindern sie).
 */
export function berechneSparpotenzialUnterkategorien(state, jahr) {
  const kosten = {}; // unterkategorieId -> { kategorieId, proJahr: { jahr: summe } }
  state.realTransaktionen.forEach(function (t) {
    if (!t.unterkategorieId || !t.kategorieId || kategorieTyp(state, t.kategorieId) !== "kosten") return;
    const eintrag = kosten[t.unterkategorieId] || (kosten[t.unterkategorieId] = { kategorieId: t.kategorieId, proJahr: {} });
    const j = isoYear(t.datum);
    eintrag.proJahr[j] = (eintrag.proJahr[j] || 0) - t.betragChf;
  });

  const vorherigeJahre = distinctSorted(state.realTransaktionen.map(function (t) { return isoYear(t.datum); }))
    .filter(function (j) { return j < jahr; })
    .slice(-3);

  const zeilen = Object.keys(kosten).map(function (unterkategorieId) {
    const e = kosten[unterkategorieId];
    const istKosten = e.proJahr[jahr] || 0;
    const referenz = vorherigeJahre.length
      ? vorherigeJahre.reduce(function (s, j) { return s + (e.proJahr[j] || 0); }, 0) / vorherigeJahre.length
      : 0;
    return { unterkategorieId: unterkategorieId, kategorieId: e.kategorieId, kosten: istKosten, referenz: referenz, potenzial: istKosten - referenz };
  }).filter(function (z) { return vorherigeJahre.length > 0 && z.potenzial > SCHWELLE_CHF; })
    .sort(function (a, b) { return b.potenzial - a.potenzial; });

  return { jahr: jahr, referenzJahre: vorherigeJahre, schwelle: SCHWELLE_CHF, zeilen: zeilen };
}

// Verzichtsanalyse: Einstufung der Unterkategorien nach ihrem Zweck.
// Jede Stufe hat eine sinnvolle Reduktion (in % der Jahreskosten):
//  - notwendig:  Existenz, Verträge, Pflichtausgaben -> nicht reduzierbar
//  - flexibel:   nützlich/Komfort, Spielraum durch bewussteres Ausgeben
//  - verzichtbar: Luxus/Freizeit, im Notfall ganz streichbar (hier: 50 %)
export const VERZICHT_STUFEN = {
  notwendig: { label: "Notwendig", reduktionPct: 0 },
  flexibel: { label: "Flexibel", reduktionPct: 15 },
  verzichtbar: { label: "Verzichtbar", reduktionPct: 50 }
};

// Stichwörter (Kleinbuchstaben) auf Unter- und Kategoriename; Reihenfolge
// = Priorität: zuerst verzichtbar, dann notwendig, sonst flexibel.
const VERZICHT_STICHWOERTER = [
  ["verzichtbar", ["restaurant", "café", "cafe", "take", "ausgang", "bar", "kino", "konzert", "streaming", "netflix", "spotify", "abo", "zeitschrift", "zeitung", "ferien", "urlaub", "reise", "flug", "hotel", "unterhaltung", "spiel", "game", "gadget", "elektronik", "alkohol", "tabak", "kiosk", "lotto", "luxus", "hobby", "freizeit", "schmuck", "wellness", "genuss"]],
  ["notwendig", ["miete", "hypothek", "zins", "nebenkosten", "strom", "heizung", "wasser", "energie", "krankenkasse", "krankenversicherung", "arzt", "zahn", "medikament", "apotheke", "gesundheit", "versicherung", "steuer", "abgabe", "gebühr", "serafe", "lebensmittel", "supermarkt", "grundbedarf", "telefon", "internet", "handy", "kinder", "betreuung", "schule", "ausbildung", "alimente", "unterhalt", "reparatur", "öv", "ga "]]
];

export function standardVerzichtStufe(state, unterkategorieId) {
  const u = state.unterkategorien.find(function (u) { return u.id === unterkategorieId; });
  if (!u) return "flexibel";
  if (VERZICHT_STUFEN[u.verzichtStufe]) return u.verzichtStufe;
  // Nur der Name der Unterkategorie entscheidet (der Kategoriename ist zu
  // grob, z. B. "Kleider" unter "Freizeit").
  const text = (u.name || "").toLowerCase();
  for (const eintrag of VERZICHT_STICHWOERTER) {
    if (eintrag[1].some(function (w) { return text.indexOf(w) !== -1; })) return eintrag[0];
  }
  return "flexibel";
}

/**
 * Pro Unterkategorie mit Kosten im Jahr `jahr`: Einstufung, Jahreskosten,
 * sinnvolle Reduktion (%) und daraus folgende Einsparung (CHF). Nur
 * Kostenkategorien; Rückerstattungen mindern die Kosten.
 */
export function berechneVerzichtsanalyse(state, jahr) {
  const kosten = {};
  state.realTransaktionen.forEach(function (t) {
    if (!t.unterkategorieId || !t.kategorieId || isoYear(t.datum) !== jahr) return;
    if (kategorieTyp(state, t.kategorieId) !== "kosten") return;
    const e = kosten[t.unterkategorieId] || (kosten[t.unterkategorieId] = { kategorieId: t.kategorieId, kosten: 0 });
    e.kosten -= t.betragChf;
  });
  const zeilen = Object.keys(kosten).map(function (id) {
    const stufe = standardVerzichtStufe(state, id);
    const pct = VERZICHT_STUFEN[stufe].reduktionPct;
    return {
      unterkategorieId: id,
      kategorieId: kosten[id].kategorieId,
      stufe: stufe,
      kosten: kosten[id].kosten,
      reduktionPct: pct,
      einsparung: Math.max(kosten[id].kosten, 0) * pct / 100
    };
  }).filter(function (z) { return z.kosten > 0; })
    .sort(function (a, b) { return b.einsparung - a.einsparung || b.kosten - a.kosten; });
  return { jahr: jahr, zeilen: zeilen };
}
