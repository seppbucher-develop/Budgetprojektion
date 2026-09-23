import { getState } from "./store.js";
import { berechneAbweichungen, berechneSparpotenzial, buchungenFuerJahrPosten } from "./compare.js";
import { drawGroupedBarChart, currencyFormatter, betragFormatter } from "./charts.js";
import { renderImportInfo } from "./importUi.js";
import { formatIsoDate } from "./dateUtils.js";

const buchungenDialog = document.getElementById("dialog-buchungen");
const buchungenTitle = document.getElementById("dialog-buchungen-title");
const buchungenRows = document.getElementById("buchungen-rows");
const buchungenTotalRow = document.getElementById("buchungen-table-total");
const buchungenScroll = document.getElementById("buchungen-scroll");

const emptyHint = document.getElementById("vergleich-empty-hint");
const inhalt = document.getElementById("vergleich-inhalt");
const jahrSelect = document.getElementById("vergleich-jahr-select");
const jahrChart = document.getElementById("vergleich-jahr-chart");
const trendChart = document.getElementById("vergleich-trend-chart");
const tbody = document.querySelector("#vergleich-table tbody");
const totalRow = document.getElementById("vergleich-table-total");
const ueberschreitungenEl = document.getElementById("sparpotenzial-ueberschreitungen");
const reservenEl = document.getElementById("sparpotenzial-reserven");

let ausgewaehltesJahr = null;

function pctText(v) {
  if (v == null) return "–";
  return (v >= 0 ? "+" : "") + v.toFixed(0) + " %";
}

function renderJahrTabelleUndChart(abw) {
  const jahr = ausgewaehltesJahr;
  const zeilen = abw.zeilen.filter(function (z) { return z.jahr === jahr; }).sort(function (a, b) {
    return Math.abs(b.abweichung) - Math.abs(a.abweichung);
  });

  document.getElementById("vergleich-jahr-unvollstaendig").style.display =
    zeilen.length && zeilen[0].unvollstaendig ? "block" : "none";

  tbody.innerHTML = "";
  zeilen.forEach(function (z) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + z.posten + "</td>" +
      '<td class="num">' + currencyFormatter.format(Math.abs(z.budget)) + "</td>" +
      '<td class="num"><button type="button" class="clickable-value" data-action="buchungen">' + currencyFormatter.format(Math.abs(z.real)) + "</button></td>" +
      '<td class="num ' + (z.abweichung > 0 ? "negative" : "positive") + '">' + currencyFormatter.format(z.abweichung) + "</td>" +
      '<td class="num ' + (z.abweichung > 0 ? "negative" : "positive") + '">' + pctText(z.abweichungPct) + "</td>";
    tr.querySelector('[data-action="buchungen"]').addEventListener("click", function () {
      openBuchungenDialog(jahr, z.posten);
    });
    tbody.appendChild(tr);
  });

  const budgetSumme = zeilen.reduce(function (s, z) { return s + Math.abs(z.budget); }, 0);
  const realSumme = zeilen.reduce(function (s, z) { return s + Math.abs(z.real); }, 0);
  const abweichungSumme = zeilen.reduce(function (s, z) { return s + z.abweichung; }, 0);
  const abweichungSummePct = budgetSumme !== 0 ? (abweichungSumme / budgetSumme) * 100 : null;
  totalRow.innerHTML =
    "<td>Total</td>" +
    '<td class="num total">' + currencyFormatter.format(budgetSumme) + "</td>" +
    '<td class="num total">' + currencyFormatter.format(realSumme) + "</td>" +
    '<td class="num total ' + (abweichungSumme > 0 ? "negative" : "positive") + '">' + currencyFormatter.format(abweichungSumme) + "</td>" +
    '<td class="num total ' + (abweichungSumme > 0 ? "negative" : "positive") + '">' + pctText(abweichungSummePct) + "</td>";

  drawGroupedBarChart(jahrChart, zeilen.map(function (z) { return z.posten; }), [
    { name: "Budget", color: "#94a3b8", values: zeilen.map(function (z) { return Math.abs(z.budget); }) },
    { name: "Real", color: "#2563eb", values: zeilen.map(function (z) { return Math.abs(z.real); }) }
  ]);
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function openBuchungenDialog(jahr, posten) {
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

function renderTrendChart(abw) {
  drawGroupedBarChart(
    trendChart,
    abw.summenProJahr.map(function (s) { return String(s.jahr) + (s.unvollstaendig ? "*" : ""); }),
    [{
      name: "Abweichung gesamt (+ = über Budget)",
      color: "#7c3aed",
      values: abw.summenProJahr.map(function (s) { return s.abweichung; })
    }]
  );
}

function renderSparpotenzial(sp) {
  function liste(el, items, art) {
    el.innerHTML = "";
    if (items.length === 0) {
      el.innerHTML = '<li class="hint">Keine auffälligen Kategorien gefunden.</li>';
      return;
    }
    items.forEach(function (item) {
      const li = document.createElement("li");
      const betrag = currencyFormatter.format(Math.abs(item.durchschnittAbweichung));
      if (art === "ueberschreitung") {
        li.innerHTML = "<strong>" + item.posten + "</strong>: im Schnitt " + betrag +
          "/Jahr über Budget (" + item.anzahlJahre + " Jahr(e) betrachtet) – Reduktion auf Budgetniveau spart ca. " + betrag + "/Jahr.";
      } else {
        li.innerHTML = "<strong>" + item.posten + "</strong>: im Schnitt " + betrag +
          "/Jahr unter Budget (" + item.anzahlJahre + " Jahr(e) betrachtet) – Budget könnte reduziert oder umverteilt werden.";
      }
      el.appendChild(li);
    });
  }
  liste(ueberschreitungenEl, sp.ueberschreitungen, "ueberschreitung");
  liste(reservenEl, sp.reserven, "reserve");
}

export function renderCompareTab() {
  renderImportInfo();
  const state = getState();
  const hatDaten = state.realTransaktionen.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  inhalt.style.display = hatDaten ? "block" : "none";
  if (!hatDaten) return;

  const abw = berechneAbweichungen(state);
  if (ausgewaehltesJahr === null || abw.jahre.indexOf(ausgewaehltesJahr) === -1) {
    const vollstaendigeJahre = abw.jahre.filter(function (j) { return j < new Date().getFullYear(); });
    ausgewaehltesJahr = vollstaendigeJahre.length
      ? vollstaendigeJahre[vollstaendigeJahre.length - 1]
      : abw.jahre[abw.jahre.length - 1];
  }

  jahrSelect.innerHTML = abw.jahre.map(function (j) {
    return '<option value="' + j + '"' + (j === ausgewaehltesJahr ? " selected" : "") + ">" + j + "</option>";
  }).join("");

  renderJahrTabelleUndChart(abw);
  renderTrendChart(abw);
  renderSparpotenzial(berechneSparpotenzial(state));
}

jahrSelect.addEventListener("change", function () {
  ausgewaehltesJahr = parseInt(jahrSelect.value, 10);
  renderJahrTabelleUndChart(berechneAbweichungen(getState()));
});

window.addEventListener("resize", function () {
  if (document.getElementById("tab-vergleich").classList.contains("active")) renderCompareTab();
});
