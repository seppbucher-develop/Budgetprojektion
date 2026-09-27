// Geschäftslogik für Vermögens-Konten (state.vermoegenKonten) und
// -Einträge (state.vermoegenEintraege), siehe vermoegenTab.js für die
// Erfassung. Konten können in Fremdwährung geführt werden (z. B. "Euro",
// "USD"): erfasst wird dann der native Fremdwährungsbetrag
// (eintrag.fremdbetraege[kontoName]), aus dem der CHF-Betrag
// (eintrag.werte[kontoName], wie bisher unverändert für Summe/Rendite/
// Projektion genutzt) bei jeder Aktualisierung (App-Start, Speichern eines
// Stichtags) mit dem AKTUELLEN Kurs neu berechnet wird -- bewusst nicht mit
// dem historischen Kurs zum jeweiligen Stichtag, da es hier um den
// heutigen Gegenwert eines bestehenden Fremdwährungskontos geht, nicht um
// eine einzelne Zahlung wie bei den Einnahmen/Ausgaben-Buchungen.
import { holeWechselkurs } from "./fx.js?v=25";

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
 * Fragt für jede in vermoegenKonten verwendete Fremdwährung, für die auch
 * mindestens ein Fremdwährungsbetrag erfasst ist, den aktuellen Kurs ab.
 * Liefert {WAEHRUNG: kurs}, ohne den state zu verändern.
 */
export async function ermittleAktuelleFremdwaehrungskurse(state) {
  const fremdKonten = fremdwaehrungsKonten(state);
  const hatFremdbetraege = state.vermoegenEintraege.some(function (row) {
    return fremdKonten.some(function (k) { return row.fremdbetraege && row.fremdbetraege[k.name] != null; });
  });
  if (!hatFremdbetraege) return {};

  const waehrungen = Array.from(new Set(fremdKonten.map(function (k) { return k.waehrung; })));
  const kurse = {};
  for (const w of waehrungen) {
    const ergebnis = await holeWechselkurs(null, w);
    if (ergebnis.kurs != null) kurse[w] = ergebnis.kurs;
  }
  return kurse;
}

/**
 * Berechnet mit den übergebenen Kursen (siehe ermittleAktuelleFremdwaehrungskurse)
 * für alle Vermögens-Einträge die CHF-Beträge der Fremdwährungskonten aus
 * deren erfasstem Fremdwährungsbetrag neu -- mutiert state direkt, gehört
 * darum in den updateState()-Mutator des Aufrufers.
 */
export function wendeFremdwaehrungskurseAn(state, kurse) {
  if (Object.keys(kurse).length === 0) return;
  const fremdKonten = fremdwaehrungsKonten(state);
  state.vermoegenEintraege.forEach(function (row) {
    fremdKonten.forEach(function (k) {
      const fremdbetrag = row.fremdbetraege && row.fremdbetraege[k.name];
      const kurs = kurse[k.waehrung];
      if (fremdbetrag != null && kurs != null) {
        row.werte[k.name] = Math.round(fremdbetrag * kurs * 100) / 100;
      }
    });
  });
}

/**
 * Komfort-Funktion für app.js (beim App-Start) und vermoegenTab.js (nach
 * dem Speichern eines Stichtags): holt die aktuellen Kurse und wendet sie
 * an, falls es überhaupt Fremdwährungsbeträge gibt. getState/updateState
 * werden übergeben statt importiert, um einen Kreis-Import mit store.js
 * (das migriereVermoegenKonten von hier importiert) zu vermeiden.
 */
export async function aktualisiereFremdwaehrungVermoegen(getState, updateState) {
  const kurse = await ermittleAktuelleFremdwaehrungskurse(getState());
  if (Object.keys(kurse).length > 0) {
    updateState(function (s) { wendeFremdwaehrungskurseAn(s, kurse); });
  }
}
