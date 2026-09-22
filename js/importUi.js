import { getState, updateState, hasBudgetData } from "./store.js";
import { importXlsxFile } from "./importXlsx.js";
import { importCsvFile } from "./importCsv.js";
import { todayIso, formatIsoDate } from "./dateUtils.js";

const xlsxDialog = document.getElementById("dialog-import-xlsx");
const xlsxForm = document.getElementById("form-import-xlsx");
const xlsxWarning = document.getElementById("import-xlsx-warning");
const xlsxError = document.getElementById("import-xlsx-error");

const csvDialog = document.getElementById("dialog-import-csv");
const csvForm = document.getElementById("form-import-csv");
const csvError = document.getElementById("import-csv-error");
const csvInfo = document.getElementById("csv-import-info");

function openXlsxDialog() {
  xlsxError.textContent = "";
  xlsxForm.reset();
  xlsxWarning.style.display = hasBudgetData() ? "block" : "none";
  xlsxDialog.showModal();
}

document.getElementById("btn-import-xlsx").addEventListener("click", openXlsxDialog);
document.getElementById("dialog-import-xlsx-cancel").addEventListener("click", function () { xlsxDialog.close(); });

xlsxForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const file = xlsxForm.datei.files[0];
  if (!file) return;
  try {
    const daten = await importXlsxFile(file);
    updateState(function (s) {
      s.budgetPosten = daten.budgetPosten;
      s.vermoegenKonten = daten.vermoegenKonten;
      s.vermoegenEintraege = daten.vermoegenEintraege;
      s.importInfo.xlsxImportiertAm = todayIso();
    });
    xlsxDialog.close();
  } catch (err) {
    xlsxError.textContent = err.message || String(err);
  }
});

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
    const transaktionen = await importCsvFile(file);
    updateState(function (s) {
      s.realTransaktionen = transaktionen;
      s.importInfo.csvImportiertAm = todayIso();
      s.importInfo.csvDateiname = file.name;
      s.importInfo.csvAnzahl = transaktionen.length;
    });
    csvDialog.close();
  } catch (err) {
    csvError.textContent = err.message || String(err);
  }
});

export function renderImportInfo() {
  updateCsvInfo();
}
