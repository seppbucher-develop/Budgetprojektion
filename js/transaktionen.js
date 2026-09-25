// Geschäftslogik für Einnahmen/Ausgaben-Buchungen (state.realTransaktionen),
// die direkt in der App gepflegt werden (siehe einnahmenAusgabenTab.js) —
// kein CSV-Import mehr.

/**
 * Einmalige, idempotente Migration: Buchungen aus dem ehemaligen CSV-Import
 * kannten nur ein Buchungsdatum. Für sie werden Valutadatum und
 * Erfassungsdatum auf dieses Buchungsdatum gesetzt (Erfassungs-, Buchungs-
 * und Valutadatum bestehender Records sind identisch). Nicht mehr benötigte
 * Felder aus der CSV-Zeit (Konto, Uhrzeit, Währung, Typ/istEinnahme — der
 * Typ ergibt sich seither aus dem Vorzeichen von betragChf) werden entfernt.
 */
export function migriereTransaktionen(state) {
  let migriert = false;
  state.realTransaktionen.forEach(function (t) {
    if (t.valutadatum === undefined) {
      t.valutadatum = t.datum;
      t.erfasstAm = t.datum + "T00:00:00.000Z";
      migriert = true;
    }
    ["konto", "zeit", "waehrung", "typ", "istEinnahme"].forEach(function (feld) {
      if (t[feld] !== undefined) { delete t[feld]; migriert = true; }
    });
  });
  return migriert;
}

/**
 * Vorlagen-Vorschläge für den Erfassungsdialog: während der Bezeichnung
 * eingegeben wird, alle Buchungen, deren Name den bisher eingegebenen Text
 * enthält, auf je einen Eintrag pro exakter Bezeichnung verdichtet (die
 * jüngste Buchung dieses Namens, nach Buchungsdatum). Wird eine Vorlage
 * gewählt, übernimmt der Dialog davon Unterkategorie, Betrag und Vorzeichen.
 */
export function vorlagenFuerBezeichnung(state, text) {
  const suchtext = text.trim().toLowerCase();
  if (!suchtext) return [];

  const treffer = state.realTransaktionen.filter(function (t) {
    return t.name && t.name.toLowerCase().indexOf(suchtext) !== -1;
  });

  const juengsteProName = {};
  treffer.forEach(function (t) {
    const bisherige = juengsteProName[t.name];
    if (!bisherige || t.datum > bisherige.datum || (t.datum === bisherige.datum && t.erfasstAm > bisherige.erfasstAm)) {
      juengsteProName[t.name] = t;
    }
  });

  return Object.values(juengsteProName)
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .slice(0, 8);
}
