// Ermittelt beim (wiederholten) CSV-Import, welche Buchungen gegenüber dem
// letzten Import neu dazugekommen, verschwunden oder betragsmässig
// korrigiert wurden — unabhängig vom (oft bewusst auf ein Budgetjahr
// verschobenen) Buchungsdatum. Abgleichs-Schlüssel: Unterkategorie + exakte
// Uhrzeit (Sekunde), siehe importCsv.js. Ergebnis speist den cashflowLog
// (renditeAnalyse.js), der dem tatsächlichen Erfassungs-/Zahlungszeitpunkt
// statt dem Buchungsdatum zugeordnet wird.
import { uid } from "./store.js?v=3";
import { todayIso } from "./dateUtils.js?v=3";

function transaktionsKey(t) {
  return (t.kategorie || "") + "|" + (t.zeit || "");
}

function gruppiereNachKey(transaktionen) {
  const gruppen = {};
  transaktionen.forEach(function (t) {
    const key = transaktionsKey(t);
    (gruppen[key] = gruppen[key] || []).push(t);
  });
  return gruppen;
}

// Entfernt aus beiden Gruppen paarweise Buchungen mit identischem Betrag
// (unverändert) und gibt die jeweils übrig gebliebenen zurück.
function trenneUnveraendert(alteListe, neueListe) {
  const alteRest = alteListe.slice();
  const neueRest = [];
  neueListe.forEach(function (neu) {
    const idx = alteRest.findIndex(function (alt) { return alt.betragChf === neu.betragChf; });
    if (idx !== -1) {
      alteRest.splice(idx, 1);
    } else {
      neueRest.push(neu);
    }
  });
  return { alteRest: alteRest, neueRest: neueRest };
}

/**
 * Vergleicht den zuletzt importierten mit dem neu eingelesenen
 * Transaktions-Satz. Rückgabe:
 * - neu: eindeutig neu hinzugekommene Buchungen
 * - verschwunden: eindeutig nicht mehr vorhandene Buchungen (in Bluecoins
 *   gelöscht/bereinigt)
 * - korrigiert: eindeutige 1:1-Betragsänderungen (gleicher Schlüssel, genau
 *   ein alter und ein neuer Rest-Betrag)
 * - unklar: Gruppen, bei denen sich Rest-Beträge nicht eindeutig 1:1
 *   zuordnen lassen (mehrere Kandidaten je Seite) — erfordert manuelle
 *   Zuordnung durch den Nutzer.
 */
export function berechneCashflowDiff(alteTransaktionen, neueTransaktionen) {
  const alteGruppen = gruppiereNachKey(alteTransaktionen);
  const neueGruppen = gruppiereNachKey(neueTransaktionen);
  const alleKeys = new Set(Object.keys(alteGruppen).concat(Object.keys(neueGruppen)));

  const neu = [];
  const verschwunden = [];
  const korrigiert = [];
  const unklar = [];

  alleKeys.forEach(function (key) {
    const alte = alteGruppen[key] || [];
    const neue = neueGruppen[key] || [];
    const rest = trenneUnveraendert(alte, neue);

    if (rest.alteRest.length === 0 && rest.neueRest.length === 0) {
      return;
    }
    if (rest.alteRest.length === 0) {
      rest.neueRest.forEach(function (t) { neu.push(t); });
    } else if (rest.neueRest.length === 0) {
      rest.alteRest.forEach(function (t) { verschwunden.push(t); });
    } else if (rest.alteRest.length === 1 && rest.neueRest.length === 1) {
      korrigiert.push({ alt: rest.alteRest[0], neu: rest.neueRest[0] });
    } else {
      const beispiel = neue[0] || alte[0];
      unklar.push({
        key: key,
        kategorie: beispiel.kategorie,
        zeit: beispiel.zeit,
        alte: rest.alteRest,
        neue: rest.neueRest
      });
    }
  });

  return { neu: neu, verschwunden: verschwunden, korrigiert: korrigiert, unklar: unklar };
}

function findeLogEintrag(cashflowLog, kategorie, zeit, betrag) {
  return cashflowLog.findIndex(function (e) {
    return e.kategorie === kategorie && e.zeit === zeit && e.betrag === betrag;
  });
}

/**
 * Wendet die eindeutigen Teile eines berechneCashflowDiff()-Ergebnisses
 * (neu/verschwunden/korrigiert) auf state.cashflowLog an. Die "unklar"-Gruppen
 * werden hier bewusst NICHT verarbeitet — dafür siehe wendeUnklarEntscheideAn.
 */
export function wendeAutoDiffAn(state, diff) {
  const heute = todayIso();

  diff.neu.forEach(function (t) {
    state.cashflowLog.push({ id: uid(), kategorie: t.kategorie, zeit: t.zeit, betrag: t.betragChf, erkanntAm: heute });
  });

  diff.verschwunden.forEach(function (t) {
    const idx = findeLogEintrag(state.cashflowLog, t.kategorie, t.zeit, t.betragChf);
    if (idx !== -1) state.cashflowLog.splice(idx, 1);
  });

  diff.korrigiert.forEach(function (paar) {
    const idx = findeLogEintrag(state.cashflowLog, paar.alt.kategorie, paar.alt.zeit, paar.alt.betragChf);
    if (idx !== -1) state.cashflowLog[idx].betrag = paar.neu.betragChf;
  });
}

/**
 * Verarbeitet die vom Nutzer im Unklarheiten-Dialog getroffenen Zuordnungen
 * für diff.unklar. unklarEntscheide: pro Gruppe (gleicher Index wie
 * diff.unklar) ein Array parallel zu gruppe.neue mit je einer Zuordnung:
 *   { art: "neu" } — als neue Buchung erfassen
 *   { art: "korrektur", altBetrag } — Korrektur des bestehenden Log-Eintrags
 *     mit diesem alten Betrag
 * Nicht zugeordnete "alte" Einträge einer unklaren Gruppe bleiben unverändert
 * im Log (sicherer Default statt stillschweigendem Löschen).
 */
export function wendeUnklarEntscheideAn(state, diff, unklarEntscheide) {
  const heute = todayIso();
  diff.unklar.forEach(function (gruppe, i) {
    const entscheide = (unklarEntscheide && unklarEntscheide[i]) || [];
    entscheide.forEach(function (entscheid, j) {
      const neuerEintrag = gruppe.neue[j];
      if (!neuerEintrag) return;
      if (entscheid.art === "korrektur") {
        const idx = findeLogEintrag(state.cashflowLog, gruppe.kategorie, gruppe.zeit, entscheid.altBetrag);
        if (idx !== -1) {
          state.cashflowLog[idx].betrag = neuerEintrag.betragChf;
          return;
        }
      }
      state.cashflowLog.push({ id: uid(), kategorie: gruppe.kategorie, zeit: gruppe.zeit, betrag: neuerEintrag.betragChf, erkanntAm: heute });
    });
  });
}
