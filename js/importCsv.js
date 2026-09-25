import { uid } from "./store.js?v=4";
import { findeOderErstelleKategorie, findeOderErstelleUnterkategorie } from "./kategorien.js?v=4";

// Generischer CSV-Parser (RFC4180-ähnlich): kommagetrennt, Felder optional in
// doppelten Anführungszeichen, "" als Escape für ein Anführungszeichen im Feld,
// Zeilenumbrüche innerhalb von Anführungszeichen werden respektiert.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { endField(); i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows.filter(function (r) { return !(r.length === 1 && r[0] === ""); });
}

const TYP_EINNAHMEN = ["einnahmen", "income"];
const TYP_AUSSCHLIESSEN = ["umbuchung", "transfer", "startguthaben"];

/**
 * Liest eine Bluecoins-Transaktions-CSV (bluecoins/reports Export) ein.
 * Gibt eine flache Liste normalisierter Transaktionen zurück (Beträge in CHF
 * umgerechnet über die Spalte "Wechselkurs"). Buchungen vom Typ "Umbuchung"
 * oder "Startguthaben" werden verworfen, da sie keine echten Kosten/Erträge sind.
 */
export async function importCsvFile(file) {
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Die CSV-Datei enthält keine Datenzeilen.");

  const header = rows[0].map(function (h) { return h.trim(); });
  const idx = {};
  ["Typ", "Datum", "Betrag", "Währung", "Wechselkurs", "Kategoriengruppe", "Kategorie", "Konto"].forEach(function (name) {
    idx[name] = header.indexOf(name);
  });
  const nameIdx = header.indexOf("Name"); // optional, für die Detailanzeige im Realvergleich
  const missing = Object.keys(idx).filter(function (name) { return idx[name] === -1; });
  if (missing.length) {
    throw new Error("Erwartete Spalten fehlen in der CSV-Datei: " + missing.join(", "));
  }

  const transaktionen = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    const typRoh = (row[idx.Typ] || "").trim();
    if (TYP_AUSSCHLIESSEN.indexOf(typRoh.toLowerCase()) !== -1) continue;

    const betrag = parseFloat(row[idx.Betrag]);
    const wechselkurs = parseFloat(row[idx.Wechselkurs]) || 1;
    if (isNaN(betrag)) continue;

    const datumRoh = (row[idx.Datum] || "").trim();

    transaktionen.push({
      id: uid(),
      typ: typRoh,
      istEinnahme: TYP_EINNAHMEN.indexOf(typRoh.toLowerCase()) !== -1,
      datum: datumRoh.slice(0, 10),
      // Sekundengenaue Uhrzeit aus "Datum" (nicht die redundante Spalte
      // "Zeit einstellen") — dient als Teil des Abgleichs-Schlüssels beim
      // CSV-Import (siehe cashflowDiff.js), da sie im Gegensatz zum Datum
      // nicht bewusst auf ein Budgetjahr verschoben wird.
      zeit: datumRoh.slice(11, 19),
      name: nameIdx !== -1 ? (row[nameIdx] || "").trim() : "",
      // Bluecoins schreibt den Wechselkurs als "Fremdwährung je 1 CHF"
      // (z. B. USD ~1.14, BRL ~6.69, HKD ~9.96 je CHF), nicht als
      // CHF-Gegenwert je Fremdwährungseinheit — daher hier dividieren,
      // nicht multiplizieren.
      betragChf: betrag / wechselkurs,
      waehrung: row[idx.Währung] || "",
      // Rohe Bezeichnungen aus der CSV — werden erst in loeseKategorienAuf()
      // zu Kategorie-/Unterkategorie-IDs aufgelöst (braucht Zugriff auf den
      // aktuellen State, siehe importUi.js).
      kategoriengruppeRoh: (row[idx.Kategoriengruppe] || "").trim(),
      kategorieRoh: (row[idx.Kategorie] || "").trim(),
      konto: (row[idx.Konto] || "").trim()
    });
  }

  if (transaktionen.length === 0) throw new Error("Es konnten keine gültigen Transaktionen aus der Datei gelesen werden.");

  return transaktionen;
}

/**
 * Löst die rohen Kategorie-/Unterkategorie-Bezeichnungen einer frisch
 * importierten CSV gegen den aktuellen State auf (find-or-create, siehe
 * kategorien.js) und gibt die finalen Transaktionen mit kategorieId/
 * unterkategorieId statt Freitext zurück. Muss innerhalb von updateState()
 * aufgerufen werden, da sie state.kategorien/state.unterkategorien um neu
 * gesehene Bezeichnungen ergänzt.
 */
export function loeseKategorienAuf(state, rohTransaktionen, uidFn) {
  return rohTransaktionen.map(function (t) {
    const kategorieId = findeOderErstelleKategorie(state, t.kategoriengruppeRoh, uidFn);
    const unterkategorieId = findeOderErstelleUnterkategorie(state, kategorieId, t.kategorieRoh, uidFn);
    const kopie = Object.assign({}, t);
    delete kopie.kategoriengruppeRoh;
    delete kopie.kategorieRoh;
    kopie.kategorieId = kategorieId;
    kopie.unterkategorieId = unterkategorieId;
    return kopie;
  });
}
