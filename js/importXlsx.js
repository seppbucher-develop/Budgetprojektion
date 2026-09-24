import { readXlsxSheets } from "./xlsxReader.js?v=3";
import { excelSerialToIso, daysBetweenIso } from "./dateUtils.js?v=3";
import { uid } from "./store.js?v=3";

const SHEET_BUDGET = "Budget";
const SHEET_VERMOEGEN = "Vermögen";

// Zeilen ohne "typ"-Spalte in der Quelldatei: Einträge, die zeitlich nah
// (innerhalb dieser Anzahl Tage) an einem anderen Eintrag derselben Kategorie
// liegen, werden als "einmalig" (z. B. Anschaffung) eingestuft. Alleinstehende
// Einträge gelten als "wiederkehrend" (gültig ab diesem Datum, bis zur
// nächsten Änderung derselben Kategorie).
const EINMALIG_CLUSTER_TAGE = 60;

function classifyTyp(rowsForPosten, row) {
  return rowsForPosten.some(function (other) {
    return other !== row && daysBetweenIso(other.ab, row.ab) <= EINMALIG_CLUSTER_TAGE;
  }) ? "einmalig" : "wiederkehrend";
}

function parseBudgetSheet(rows) {
  const posten = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] == null || row[1] == null || row[2] == null) continue;
    posten.push({
      posten: String(row[0]).trim(),
      betrag: Number(row[1]),
      ab: excelSerialToIso(Number(row[2]))
    });
  }
  const grouped = {};
  posten.forEach(function (r) {
    (grouped[r.posten] = grouped[r.posten] || []).push(r);
  });
  return posten.map(function (r) {
    return {
      id: uid(),
      posten: r.posten,
      betrag: r.betrag,
      ab: r.ab,
      typ: classifyTyp(grouped[r.posten], r)
    };
  });
}

function parseVermoegenSheet(rows) {
  const header = rows[0] || [];
  const konten = [];
  for (let c = 1; c < header.length; c++) {
    if (header[c] != null && String(header[c]).trim() !== "") konten.push(String(header[c]).trim());
  }
  const eintraege = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] == null) continue;
    const werte = {};
    for (let c = 1; c < header.length; c++) {
      const kontoName = header[c] != null ? String(header[c]).trim() : null;
      if (!kontoName) continue;
      werte[kontoName] = Number(row[c]) || 0;
    }
    eintraege.push({ id: uid(), datum: excelSerialToIso(Number(row[0])), werte: werte });
  }
  return { konten, eintraege };
}

/**
 * Liest eine Budget_Pension.xlsx-Datei (Tab "Budget" + Tab "Vermögen") und
 * gibt die für den Store aufbereiteten Strukturen zurück. Wirft bei
 * unerwartetem Format eine Error mit verständlicher Meldung.
 */
export async function importXlsxFile(file) {
  const buffer = await file.arrayBuffer();
  const sheets = await readXlsxSheets(buffer, [SHEET_BUDGET, SHEET_VERMOEGEN]);

  if (!sheets[SHEET_BUDGET]) throw new Error('Tab "' + SHEET_BUDGET + '" wurde in der Datei nicht gefunden.');
  if (!sheets[SHEET_VERMOEGEN]) throw new Error('Tab "' + SHEET_VERMOEGEN + '" wurde in der Datei nicht gefunden.');

  const budgetPosten = parseBudgetSheet(sheets[SHEET_BUDGET]);
  const vermoegen = parseVermoegenSheet(sheets[SHEET_VERMOEGEN]);

  if (budgetPosten.length === 0) throw new Error('Tab "' + SHEET_BUDGET + '" enthält keine gültigen Datenzeilen.');

  return {
    budgetPosten: budgetPosten,
    vermoegenKonten: vermoegen.konten,
    vermoegenEintraege: vermoegen.eintraege
  };
}
