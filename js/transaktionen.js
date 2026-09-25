// Geschäftslogik für Einnahmen/Ausgaben-Buchungen (state.realTransaktionen),
// die direkt in der App gepflegt werden (siehe einnahmenAusgabenTab.js) —
// kein CSV-Import mehr.

/**
 * Einmalige, idempotente Migration: Buchungen aus dem ehemaligen CSV-Import
 * kannten nur ein Buchungsdatum. Für sie werden Valutadatum und
 * Erfassungsdatum auf dieses Buchungsdatum gesetzt (Erfassungs-, Buchungs-
 * und Valutadatum bestehender Records sind identisch).
 *
 * Betrag/Kurs kannten sie noch nicht als eigene Felder — betragChf war der
 * einzige Betrag. Der native Betrag und der Kurs werden darum unabhängig
 * voneinander ergänzt, FALLS SIE FEHLEN (nicht daran gekoppelt, ob z. B.
 * Währung schon gesetzt ist): der alte CSV-Import selbst hatte pro Buchung
 * bereits eine eigene Währung erfasst (z. B. "EUR" bei Fremdwährungsreisen),
 * ganz unabhängig von dieser Migration — Betrag/Kurs blieben bei solchen
 * Buchungen darum bislang unergänzt, wenn die Prüfung an "Währung fehlt"
 * gekoppelt war. Da der native Fremdwährungsbetrag zum Zeitpunkt des
 * Imports nicht aufgezeichnet wurde, ist der historisch korrekte Kurs nicht
 * mehr rekonstruierbar: Betrag wird darum auf |betragChf| und Kurs auf 1
 * gesetzt (betragChf selbst — die einzige Grösse, mit der der Rest der App
 * rechnet — bleibt dabei unverändert, nur Betrag/Kurs sind für solche alten
 * Fremdwährungsbuchungen als Anzeige-/Bearbeitungswerte nicht mehr exakt).
 *
 * Nicht mehr benötigte Felder aus der CSV-Zeit (Konto, Uhrzeit,
 * Typ/istEinnahme — der Typ ergibt sich seither aus dem Vorzeichen von
 * betragChf) werden entfernt.
 */
export function migriereTransaktionen(state) {
  let migriert = false;
  state.realTransaktionen.forEach(function (t) {
    if (t.valutadatum === undefined) {
      t.valutadatum = t.datum;
      t.erfasstAm = t.datum + "T00:00:00.000Z";
      migriert = true;
    }
    if (t.waehrung === undefined) {
      t.waehrung = "CHF";
      migriert = true;
    }
    if (t.betrag === undefined) {
      t.betrag = Math.abs(t.betragChf);
      migriert = true;
    }
    if (t.kurs === undefined) {
      t.kurs = 1;
      migriert = true;
    }
    ["konto", "zeit", "typ", "istEinnahme"].forEach(function (feld) {
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
