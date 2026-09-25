import { getState } from "./store.js?v=15";
import { formatIsoDate } from "./dateUtils.js?v=15";
import { currencyFormatter } from "./charts.js?v=15";
import { berechneRendite } from "./renditeAnalyse.js?v=15";

const emptyHint = document.getElementById("rendite-empty-hint");
const inhalt = document.getElementById("rendite-inhalt");
const vonSelect = document.getElementById("rendite-von");
const bisSelect = document.getElementById("rendite-bis");
const summaryEl = document.getElementById("rendite-summary");
const cashflowRows = document.getElementById("rendite-cashflow-rows");
const cashflowEmpty = document.getElementById("rendite-cashflow-empty");
const cashflowTable = document.getElementById("rendite-cashflow-table");

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function statBlock(label, value) {
  return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div></div>";
}

function pctText(v) {
  if (v == null) return "–";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + " %";
}

function sortierteStichtage() {
  return getState().vermoegenEintraege
    .slice()
    .sort(function (a, b) { return a.datum < b.datum ? -1 : 1; })
    .map(function (e) { return e.datum; });
}

export function renderRenditeTab() {
  const stichtage = sortierteStichtage();
  const hatGenugStichtage = stichtage.length >= 2;
  emptyHint.style.display = hatGenugStichtage ? "none" : "block";
  inhalt.style.display = hatGenugStichtage ? "block" : "none";
  if (!hatGenugStichtage) return;

  const bisherVon = vonSelect.value;
  const bisherBis = bisSelect.value;
  const optionenHtml = stichtage.map(function (d) { return '<option value="' + d + '">' + formatIsoDate(d) + "</option>"; }).join("");
  vonSelect.innerHTML = optionenHtml;
  bisSelect.innerHTML = optionenHtml;
  vonSelect.value = stichtage.indexOf(bisherVon) !== -1 ? bisherVon : stichtage[0];
  bisSelect.value = stichtage.indexOf(bisherBis) !== -1 ? bisherBis : stichtage[stichtage.length - 1];

  renderErgebnis();
}

function renderErgebnis() {
  const state = getState();
  const von = vonSelect.value;
  const bis = bisSelect.value;

  if (!von || !bis || von >= bis) {
    summaryEl.innerHTML = '<p class="hint">„Von“ muss vor „Bis“ liegen.</p>';
    cashflowRows.innerHTML = "";
    cashflowTable.style.display = "none";
    cashflowEmpty.style.display = "none";
    return;
  }

  const rendite = berechneRendite(state, von, bis);

  summaryEl.innerHTML =
    statBlock("Vermögen " + formatIsoDate(von), rendite.vermoegenStart != null ? currencyFormatter.format(rendite.vermoegenStart) : "–") +
    statBlock("Vermögen " + formatIsoDate(bis), rendite.vermoegenEnde != null ? currencyFormatter.format(rendite.vermoegenEnde) : "–") +
    statBlock("Effektiver Cashflow", currencyFormatter.format(rendite.effektiverCashflow)) +
    statBlock("Rendite (CHF)", rendite.renditeChf != null ? currencyFormatter.format(rendite.renditeChf) : "–") +
    statBlock("Rendite (%)", pctText(rendite.renditePct));

  if (rendite.cashflowPosten.length === 0) {
    cashflowRows.innerHTML = "";
    cashflowTable.style.display = "block";
    cashflowEmpty.style.display = "block";
  } else {
    cashflowEmpty.style.display = "none";
    cashflowTable.style.display = "block";
    cashflowRows.innerHTML = rendite.cashflowPosten.map(function (p) {
      return '<div class="rendite-cashflow-row">' +
        "<div>" + formatIsoDate(p.datum) + "</div>" +
        "<div>" + escapeHtml(p.bezeichnung) + "</div>" +
        '<div class="' + (p.betrag >= 0 ? "positive" : "negative") + '">' + currencyFormatter.format(p.betrag) + "</div>" +
        "</div>";
    }).join("");
  }
}

vonSelect.addEventListener("change", renderErgebnis);
bisSelect.addEventListener("change", renderErgebnis);

window.addEventListener("resize", function () {
  if (document.getElementById("tab-analyse").classList.contains("active")) renderRenditeTab();
});
