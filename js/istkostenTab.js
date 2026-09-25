import { getState } from "./store.js?v=17";
import { berechneAbweichungen, berechneIstkosten } from "./compare.js?v=17";
import { drawGroupedBarChart, currencyFormatter } from "./charts.js?v=17";
import { openBuchungenDialog } from "./buchungenDialog.js?v=17";
import { kategorieName, unterkategorieName } from "./kategorien.js?v=17";

const emptyHint = document.getElementById("istkosten-empty-hint");
const inhalt = document.getElementById("istkosten-inhalt");
const jahrSelect = document.getElementById("istkosten-jahr-select");
const headrow = document.getElementById("istkosten-headrow");
const rowsContainer = document.getElementById("istkosten-rows");
const totalRow = document.getElementById("istkosten-total-row");
const chart = document.getElementById("istkosten-chart");

const JAHR_FARBEN = ["#94a3b8", "#60a5fa", "#2563eb"];

let ausgewaehltesJahr = null;
// Welche Kategorien aktuell aufgeklappt sind (zeigt ihre Unterkategorien
// mit eigener Summenaufschlüsselung darunter an).
const aufgeklappt = new Set();

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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function werteZellen(jahre, werte, kategorieId, unterkategorieId) {
  return werte.map(function (w, i) {
    return '<div><button type="button" class="clickable-value" data-jahr="' + jahre[i] +
      '" data-kategorie="' + kategorieId + '"' +
      (unterkategorieId ? ' data-unterkategorie="' + unterkategorieId + '"' : "") +
      ">" + currencyFormatter.format(w) + "</button></div>";
  }).join("");
}

function bindeDrilldownButtons(rowEl) {
  Array.from(rowEl.querySelectorAll("[data-jahr]")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      openBuchungenDialog(parseInt(btn.dataset.jahr, 10), btn.dataset.kategorie, btn.dataset.unterkategorie || null);
    });
  });
}

function renderTabelleUndChart(daten) {
  const state = getState();
  headrow.innerHTML = "<div>Kategorie</div>" + daten.jahre.map(function (j) { return "<div>" + j + "</div>"; }).join("");

  rowsContainer.innerHTML = "";
  daten.zeilen.forEach(function (z) {
    const hatUnterkategorien = z.unterzeilen.length > 0;
    const offen = aufgeklappt.has(z.kategorieId);

    const rowEl = document.createElement("div");
    rowEl.className = "istkosten-row";
    rowEl.innerHTML =
      "<div>" +
        (hatUnterkategorien
          ? '<button type="button" class="istkosten-toggle" data-toggle="' + z.kategorieId + '">' + (offen ? "▾" : "▸") + "</button> "
          : "") +
        escapeHtml(kategorieName(state, z.kategorieId)) +
      "</div>" +
      werteZellen(daten.jahre, z.werte, z.kategorieId, null);
    bindeDrilldownButtons(rowEl);
    if (hatUnterkategorien) {
      rowEl.querySelector("[data-toggle]").addEventListener("click", function () {
        if (offen) aufgeklappt.delete(z.kategorieId); else aufgeklappt.add(z.kategorieId);
        renderTabelleUndChart(daten);
      });
    }
    rowsContainer.appendChild(rowEl);

    if (hatUnterkategorien && offen) {
      z.unterzeilen.forEach(function (u) {
        const subRowEl = document.createElement("div");
        subRowEl.className = "istkosten-row istkosten-subrow";
        subRowEl.innerHTML =
          "<div>" + escapeHtml(unterkategorieName(state, u.unterkategorieId)) + "</div>" +
          werteZellen(daten.jahre, u.werte, z.kategorieId, u.unterkategorieId);
        bindeDrilldownButtons(subRowEl);
        rowsContainer.appendChild(subRowEl);
      });
    }
  });

  totalRow.innerHTML = "<div>Total</div>" +
    daten.summenProJahr.map(function (s) { return "<div>" + currencyFormatter.format(s) + "</div>"; }).join("");

  drawGroupedBarChart(chart, daten.zeilen.map(function (z) { return kategorieName(state, z.kategorieId); }),
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
