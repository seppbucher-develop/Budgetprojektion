import { getState } from "./store.js?v=2";
import { berechneAbweichungen, berechneIstkosten } from "./compare.js?v=2";
import { drawGroupedBarChart, currencyFormatter } from "./charts.js?v=2";
import { openBuchungenDialog } from "./buchungenDialog.js?v=2";

const emptyHint = document.getElementById("istkosten-empty-hint");
const inhalt = document.getElementById("istkosten-inhalt");
const jahrSelect = document.getElementById("istkosten-jahr-select");
const headrow = document.getElementById("istkosten-headrow");
const rowsContainer = document.getElementById("istkosten-rows");
const totalRow = document.getElementById("istkosten-total-row");
const chart = document.getElementById("istkosten-chart");

const JAHR_FARBEN = ["#94a3b8", "#60a5fa", "#2563eb"];

let ausgewaehltesJahr = null;

export function renderIstkostenTab() {
  const state = getState();
  const hatDaten = state.realTransaktionen.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  inhalt.style.display = hatDaten ? "block" : "none";
  if (!hatDaten) return;

  const verfuegbareJahre = berechneAbweichungen(state).jahre;
  if (ausgewaehltesJahr === null || verfuegbareJahre.indexOf(ausgewaehltesJahr) === -1) {
    const heuteJahr = new Date().getFullYear();
    const vollstaendigeJahre = verfuegbareJahre.filter(function (j) { return j < heuteJahr; });
    ausgewaehltesJahr = vollstaendigeJahre.length
      ? vollstaendigeJahre[vollstaendigeJahre.length - 1]
      : verfuegbareJahre[verfuegbareJahre.length - 1];
  }

  jahrSelect.innerHTML = verfuegbareJahre.map(function (j) {
    return '<option value="' + j + '"' + (j === ausgewaehltesJahr ? " selected" : "") + ">" + j + "</option>";
  }).join("");

  renderTabelleUndChart(berechneIstkosten(state, ausgewaehltesJahr));
}

function renderTabelleUndChart(daten) {
  headrow.innerHTML = "<div>Kategorie</div>" + daten.jahre.map(function (j) { return "<div>" + j + "</div>"; }).join("");

  rowsContainer.innerHTML = "";
  daten.zeilen.forEach(function (z) {
    const rowEl = document.createElement("div");
    rowEl.className = "istkosten-row";
    rowEl.innerHTML =
      "<div>" + z.posten + "</div>" +
      z.werte.map(function (w, i) {
        return '<div><button type="button" class="clickable-value" data-jahr="' + daten.jahre[i] + '">' +
          currencyFormatter.format(w) + "</button></div>";
      }).join("");
    Array.from(rowEl.querySelectorAll("[data-jahr]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        openBuchungenDialog(parseInt(btn.dataset.jahr, 10), z.posten);
      });
    });
    rowsContainer.appendChild(rowEl);
  });

  totalRow.innerHTML = "<div>Total</div>" +
    daten.summenProJahr.map(function (s) { return "<div>" + currencyFormatter.format(s) + "</div>"; }).join("");

  drawGroupedBarChart(chart, daten.zeilen.map(function (z) { return z.posten; }),
    daten.jahre.map(function (jahr, i) {
      return {
        name: String(jahr),
        color: JAHR_FARBEN[i],
        values: daten.zeilen.map(function (z) { return Math.abs(z.werte[i]); })
      };
    })
  );
}

jahrSelect.addEventListener("change", function () {
  ausgewaehltesJahr = parseInt(jahrSelect.value, 10);
  renderTabelleUndChart(berechneIstkosten(getState(), ausgewaehltesJahr));
});

window.addEventListener("resize", function () {
  if (document.getElementById("tab-istkosten").classList.contains("active")) renderIstkostenTab();
});
