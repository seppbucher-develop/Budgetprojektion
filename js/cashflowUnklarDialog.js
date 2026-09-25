// Dialog zur manuellen Zuordnung, wenn der CSV-Import-Abgleich (siehe
// cashflowDiff.js) eine Gruppe (gleiche Unterkategorie + Uhrzeit) nicht
// eindeutig 1:1 zuordnen konnte (mehrere unterschiedliche Beträge auf
// beiden Seiten).
import { getState, updateState } from "./store.js?v=4";
import { wendeUnklarEntscheideAn } from "./cashflowDiff.js?v=4";
import { currencyFormatter } from "./charts.js?v=4";
import { unterkategorieName } from "./kategorien.js?v=4";

const dialog = document.getElementById("dialog-cashflow-unklar");
const gruppenContainer = document.getElementById("cashflow-unklar-gruppen");

let aktuellerDiff = null;

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

export function openCashflowUnklarDialog(diff) {
  aktuellerDiff = diff;
  const state = getState();
  gruppenContainer.innerHTML = diff.unklar.map(function (gruppe, i) {
    const alteListe = gruppe.alte.map(function (a) { return currencyFormatter.format(a.betragChf); }).join(", ");
    const zeilen = gruppe.neue.map(function (neu, j) {
      const optionen = ['<option value="neu">Neue Buchung</option>'].concat(
        gruppe.alte.map(function (alt) {
          return '<option value="korrektur:' + alt.betragChf + '">Korrektur von ' + currencyFormatter.format(alt.betragChf) + "</option>";
        })
      );
      return '<div class="unklar-zeile">' +
        "<span>Neu im Export: <strong>" + currencyFormatter.format(neu.betragChf) + "</strong></span>" +
        '<select data-gruppe="' + i + '" data-neu="' + j + '">' + optionen.join("") + "</select>" +
        "</div>";
    }).join("");
    return '<div class="unklar-gruppe">' +
      "<h3>" + escapeHtml(unterkategorieName(state, gruppe.unterkategorieId)) + " · " + escapeHtml(gruppe.zeit) + "</h3>" +
      '<p class="hint">Bisher erfasst: ' + alteListe + "</p>" +
      zeilen +
      "</div>";
  }).join("");

  dialog.showModal();
}

document.getElementById("dialog-cashflow-unklar-cancel").addEventListener("click", function () { dialog.close(); });

document.getElementById("dialog-cashflow-unklar-uebernehmen").addEventListener("click", function () {
  if (!aktuellerDiff) return;
  const unklarEntscheide = aktuellerDiff.unklar.map(function (gruppe, i) {
    return gruppe.neue.map(function (_neu, j) {
      const select = gruppenContainer.querySelector('select[data-gruppe="' + i + '"][data-neu="' + j + '"]');
      const val = select ? select.value : "neu";
      if (val.indexOf("korrektur:") === 0) {
        return { art: "korrektur", altBetrag: parseFloat(val.slice("korrektur:".length)) };
      }
      return { art: "neu" };
    });
  });

  updateState(function (s) {
    wendeUnklarEntscheideAn(s, aktuellerDiff, unklarEntscheide);
  });
  aktuellerDiff = null;
  dialog.close();
});
