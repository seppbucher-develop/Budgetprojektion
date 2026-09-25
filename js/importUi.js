import { getState, updateState, uid } from "./store.js?v=4";
import { importCsvFile, loeseKategorienAuf } from "./importCsv.js?v=4";
import { todayIso, formatIsoDate } from "./dateUtils.js?v=4";
import { berechneCashflowDiff, wendeAutoDiffAn } from "./cashflowDiff.js?v=4";
import { openCashflowUnklarDialog } from "./cashflowUnklarDialog.js?v=4";
import { currencyFormatter } from "./charts.js?v=4";

const csvDialog = document.getElementById("dialog-import-csv");
const csvForm = document.getElementById("form-import-csv");
const csvError = document.getElementById("import-csv-error");
const csvInfo = document.getElementById("csv-import-info");
const csvCashflowInfo = document.getElementById("csv-cashflow-info");

function updateCsvInfo() {
  const info = getState().importInfo;
  if (info.csvImportiertAm) {
    csvInfo.textContent =
      "Letzter Import: " + info.csvDateiname + " am " + formatIsoDate(info.csvImportiertAm) +
      " (" + info.csvAnzahl + " Buchungen).";
  } else {
    csvInfo.textContent = "Noch keine realen Kosten importiert.";
  }
}

function openCsvDialog() {
  csvError.textContent = "";
  csvForm.reset();
  csvDialog.showModal();
}

document.getElementById("btn-import-csv").addEventListener("click", openCsvDialog);
document.getElementById("dialog-import-csv-cancel").addEventListener("click", function () { csvDialog.close(); });

csvForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const file = csvForm.datei.files[0];
  if (!file) return;
  try {
    const rohTransaktionen = await importCsvFile(file);
    let diff;
    updateState(function (s) {
      const transaktionen = loeseKategorienAuf(s, rohTransaktionen, uid);
      diff = berechneCashflowDiff(s.realTransaktionen, transaktionen);
      s.realTransaktionen = transaktionen;
      s.importInfo.csvImportiertAm = todayIso();
      s.importInfo.csvDateiname = file.name;
      s.importInfo.csvAnzahl = transaktionen.length;
      wendeAutoDiffAn(s, diff);
    });
    csvDialog.close();
    zeigeCashflowDiffZusammenfassung(diff);
    if (diff.unklar.length > 0) openCashflowUnklarDialog(diff);
  } catch (err) {
    csvError.textContent = err.message || String(err);
  }
});

function zeigeCashflowDiffZusammenfassung(diff) {
  const summeNeu = diff.neu.reduce(function (s, t) { return s + t.betragChf; }, 0);
  const teile = [
    diff.neu.length + " neue Buchung(en) im Cashflow erfasst (" + currencyFormatter.format(summeNeu) + ")"
  ];
  if (diff.korrigiert.length > 0) teile.push(diff.korrigiert.length + " Korrektur(en) übernommen");
  if (diff.verschwunden.length > 0) teile.push(diff.verschwunden.length + " entfernt (nicht mehr in Bluecoins vorhanden)");
  if (diff.unklar.length > 0) teile.push(diff.unklar.length + " unklare Zuordnung(en) — bitte im Dialog auflösen");
  csvCashflowInfo.textContent = teile.join(", ") + ".";
}

export function renderImportInfo() {
  updateCsvInfo();
}
