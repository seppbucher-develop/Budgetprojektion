// Drilldown-Dialog "Buchungen: <Kategorie> <Jahr>" — zeigt die einzelnen
// realen Buchungen hinter einem Real-Kosten-Wert. Wird sowohl vom
// Realvergleich als auch vom Istkostenvergleich verwendet, daher als
// eigenständiges Modul.
import { getState } from "./store.js?v=13";
import { buchungenFuerJahrKategorie } from "./compare.js?v=13";
import { betragFormatter } from "./charts.js?v=13";
import { formatIsoDate } from "./dateUtils.js?v=13";
import { kategorieName, unterkategorieName } from "./kategorien.js?v=13";

const buchungenDialog = document.getElementById("dialog-buchungen");
const buchungenTitle = document.getElementById("dialog-buchungen-title");
const buchungenRows = document.getElementById("buchungen-rows");
const buchungenTotalRow = document.getElementById("buchungen-table-total");
const buchungenScroll = document.getElementById("buchungen-scroll");

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

/**
 * jahr, kategorieId: Pflicht. unterkategorieId: optional, schränkt den
 * Drilldown auf eine einzelne Unterkategorie ein (Istkostenvergleich in der
 * aufgeklappten Ansicht) statt die ganze Kategorie zu zeigen.
 */
export function openBuchungenDialog(jahr, kategorieId, unterkategorieId) {
  const state = getState();
  const buchungen = buchungenFuerJahrKategorie(state, jahr, kategorieId, unterkategorieId);
  const titel = unterkategorieId ? unterkategorieName(state, unterkategorieId) : kategorieName(state, kategorieId);
  buchungenTitle.textContent = "Buchungen: " + titel + " " + jahr;

  if (buchungen.length === 0) {
    buchungenRows.innerHTML = '<div class="buchungen-row"><div style="grid-column: span 4" class="hint">Keine Buchungen gefunden.</div></div>';
  } else {
    buchungenRows.innerHTML = buchungen.map(function (b) {
      return '<div class="buchungen-row">' +
        "<div>" + formatIsoDate(b.datum) + "</div>" +
        "<div>" + betragFormatter.format(b.betragChf) + "</div>" +
        "<div>" + escapeHtml(b.name) + "</div>" +
        "<div>" + escapeHtml(unterkategorieName(state, b.unterkategorieId)) + "</div>" +
        "</div>";
    }).join("");
  }

  const summe = buchungen.reduce(function (s, b) { return s + b.betragChf; }, 0);
  buchungenTotalRow.innerHTML =
    "<div></div>" +
    "<div>" + betragFormatter.format(summe) + "</div>" +
    '<div style="grid-column: span 2">Total (' + buchungen.length + (buchungen.length === 1 ? " Buchung" : " Buchungen") + ")</div>";

  buchungenDialog.showModal();
  // Erst nach showModal() setzen: auf einem geschlossenen/unsichtbaren
  // <dialog> hat scrollTop = 0 mangels Layout keine Wirkung.
  buchungenScroll.scrollTop = 0;
}

document.getElementById("dialog-buchungen-close").addEventListener("click", function () { buchungenDialog.close(); });
