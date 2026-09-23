// Drilldown-Dialog "Buchungen: <Posten> <Jahr>" — zeigt die einzelnen realen
// Buchungen hinter einem Real-Kosten-Wert. Wird sowohl vom Realvergleich als
// auch vom Istkostenvergleich verwendet, daher als eigenständiges Modul.
import { getState } from "./store.js";
import { buchungenFuerJahrPosten } from "./compare.js";
import { betragFormatter } from "./charts.js";
import { formatIsoDate } from "./dateUtils.js";

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

export function openBuchungenDialog(jahr, posten) {
  const buchungen = buchungenFuerJahrPosten(getState(), jahr, posten);
  buchungenTitle.textContent = "Buchungen: " + posten + " " + jahr;

  if (buchungen.length === 0) {
    buchungenRows.innerHTML = '<div class="buchungen-row"><div style="grid-column: span 4" class="hint">Keine Buchungen gefunden.</div></div>';
  } else {
    buchungenRows.innerHTML = buchungen.map(function (b) {
      return '<div class="buchungen-row">' +
        "<div>" + formatIsoDate(b.datum) + "</div>" +
        "<div>" + betragFormatter.format(b.betragChf) + "</div>" +
        "<div>" + escapeHtml(b.name) + "</div>" +
        "<div>" + escapeHtml(b.kategorie) + "</div>" +
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
