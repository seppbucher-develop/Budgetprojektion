import { getState, updateState } from "./store.js?v=33";
import { berechneAbweichungen, berechneSparpotenzial, berechneSparpotenzialUnterkategorien, berechneVerzichtsanalyse, VERZICHT_STUFEN } from "./compare.js?v=33";
import { drawGroupedBarChart, currencyFormatter } from "./charts.js?v=33";
import { openBuchungenDialog } from "./buchungenDialog.js?v=33";
import { kategorieName, unterkategorieName } from "./kategorien.js?v=33";

const emptyHint = document.getElementById("vergleich-empty-hint");
const inhalt = document.getElementById("vergleich-inhalt");
const jahrSelect = document.getElementById("vergleich-jahr-select");
const jahrChart = document.getElementById("vergleich-jahr-chart");
const trendChart = document.getElementById("vergleich-trend-chart");
const tbody = document.querySelector("#vergleich-table tbody");
const totalRow = document.getElementById("vergleich-table-total");
const ueberschreitungenEl = document.getElementById("sparpotenzial-ueberschreitungen");
const reservenEl = document.getElementById("sparpotenzial-reserven");
const ukHinweisEl = document.getElementById("sparpotenzial-uk-hinweis");
const ukTabelle = document.getElementById("sparpotenzial-uk-table");
const ukTbody = ukTabelle.querySelector("tbody");

let ausgewaehltesJahr = null;

function pctText(v) {
  if (v == null) return "–";
  return (v >= 0 ? "+" : "") + v.toFixed(0) + " %";
}

function renderJahrTabelleUndChart(abw) {
  const state = getState();
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
      "<td>" + kategorieName(state, z.kategorieId) + "</td>" +
      '<td class="num">' + currencyFormatter.format(z.budget) + "</td>" +
      '<td class="num"><button type="button" class="clickable-value" data-action="buchungen">' + currencyFormatter.format(z.real) + "</button></td>" +
      '<td class="num ' + (z.abweichung < 0 ? "negative" : "positive") + '">' + currencyFormatter.format(z.abweichung) + "</td>" +
      '<td class="num ' + (z.abweichung < 0 ? "negative" : "positive") + '">' + pctText(z.abweichungPct) + "</td>";
    tr.querySelector('[data-action="buchungen"]').addEventListener("click", function () {
      openBuchungenDialog(jahr, z.kategorieId);
    });
    tbody.appendChild(tr);
  });

  const budgetSumme = zeilen.reduce(function (s, z) { return s + z.budget; }, 0);
  const realSumme = zeilen.reduce(function (s, z) { return s + z.real; }, 0);
  const abweichungSumme = zeilen.reduce(function (s, z) { return s + z.abweichung; }, 0);
  const abweichungSummePct = budgetSumme !== 0 ? (abweichungSumme / Math.abs(budgetSumme)) * 100 : null;
  totalRow.innerHTML =
    "<td>Total</td>" +
    '<td class="num total">' + currencyFormatter.format(budgetSumme) + "</td>" +
    '<td class="num total">' + currencyFormatter.format(realSumme) + "</td>" +
    '<td class="num total ' + (abweichungSumme < 0 ? "negative" : "positive") + '">' + currencyFormatter.format(abweichungSumme) + "</td>" +
    '<td class="num total ' + (abweichungSumme < 0 ? "negative" : "positive") + '">' + pctText(abweichungSummePct) + "</td>";

  drawGroupedBarChart(jahrChart, zeilen.map(function (z) { return kategorieName(state, z.kategorieId); }), [
    { name: "Budget", color: "#94a3b8", values: zeilen.map(function (z) { return Math.abs(z.budget); }) },
    { name: "Real", color: "#2563eb", values: zeilen.map(function (z) { return Math.abs(z.real); }) }
  ]);
}

function renderTrendChart(abw) {
  drawGroupedBarChart(
    trendChart,
    abw.summenProJahr.map(function (s) { return String(s.jahr) + (s.unvollstaendig ? "*" : ""); }),
    [{
      name: "Abweichung gesamt (+ = besser als Budget)",
      color: "#7c3aed",
      values: abw.summenProJahr.map(function (s) { return s.abweichung; })
    }]
  );
}

function renderSparpotenzial(sp) {
  const state = getState();
  function liste(el, items, art) {
    el.innerHTML = "";
    if (items.length === 0) {
      el.innerHTML = '<li class="hint">Keine auffälligen Kategorien gefunden.</li>';
      return;
    }
    items.forEach(function (item) {
      const li = document.createElement("li");
      const betrag = currencyFormatter.format(Math.abs(item.durchschnittAbweichung));
      const name = kategorieName(state, item.kategorieId);
      if (art === "ueberschreitung") {
        li.innerHTML = "<strong>" + name + "</strong>: im Schnitt " + betrag +
          "/Jahr über Budget (" + item.anzahlJahre + " Jahr(e) betrachtet) – Reduktion auf Budgetniveau spart ca. " + betrag + "/Jahr.";
      } else {
        li.innerHTML = "<strong>" + name + "</strong>: im Schnitt " + betrag +
          "/Jahr unter Budget (" + item.anzahlJahre + " Jahr(e) betrachtet) – Budget könnte reduziert oder umverteilt werden.";
      }
      el.appendChild(li);
    });
  }
  liste(ueberschreitungenEl, sp.ueberschreitungen, "ueberschreitung");
  liste(reservenEl, sp.reserven, "reserve");
}

function escapeHtml(t) {
  const div = document.createElement("div");
  div.textContent = t || "";
  return div.innerHTML;
}

// Einsparpotenzial auf Unterkategorie-Ebene für das im Realvergleich
// gewählte Jahr (das Budget gibt es nur je Kategorie, daher der Vergleich
// mit den eigenen Vorjahren, siehe berechneSparpotenzialUnterkategorien).
function renderSparpotenzialUnterkategorien() {
  const state = getState();
  const sp = berechneSparpotenzialUnterkategorien(state, ausgewaehltesJahr);
  ukTbody.innerHTML = "";

  if (sp.referenzJahre.length === 0) {
    ukHinweisEl.textContent = "Für " + ausgewaehltesJahr + " gibt es keine früheren Jahre mit Buchungen zum Vergleich.";
    ukTabelle.style.display = "none";
    return;
  }
  const vergleich = sp.referenzJahre.length === 1
    ? String(sp.referenzJahre[0])
    : "Ø " + sp.referenzJahre[0] + "–" + sp.referenzJahre[sp.referenzJahre.length - 1];
  ukHinweisEl.textContent = "Kosten " + ausgewaehltesJahr + " im Vergleich zu " + vergleich +
    " (nur Unterkategorien, die mehr als " + currencyFormatter.format(sp.schwelle) + " teurer sind)." +
    (ausgewaehltesJahr >= new Date().getFullYear() ? " Das gewählte Jahr ist noch nicht abgeschlossen." : "");

  ukTabelle.style.display = sp.zeilen.length ? "table" : "none";
  if (sp.zeilen.length === 0) {
    ukHinweisEl.textContent += " Keine auffälligen Unterkategorien gefunden.";
    return;
  }
  sp.zeilen.forEach(function (z) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(unterkategorieName(state, z.unterkategorieId)) +
        '<div class="hint">' + escapeHtml(kategorieName(state, z.kategorieId)) + "</div></td>" +
      '<td class="num">' + currencyFormatter.format(z.referenz) + "</td>" +
      '<td class="num"><button type="button" class="clickable-value" data-action="buchungen">' + currencyFormatter.format(z.kosten) + "</button></td>" +
      '<td class="num negative">+' + currencyFormatter.format(z.potenzial) + "</td>";
    tr.querySelector('[data-action="buchungen"]').addEventListener("click", function () {
      openBuchungenDialog(ausgewaehltesJahr, z.kategorieId, z.unterkategorieId);
    });
    ukTbody.appendChild(tr);
  });
}

const verzichtTbody = document.querySelector("#verzicht-table tbody");
const verzichtTotal = document.getElementById("verzicht-table-total");
const verzichtHinweis = document.getElementById("verzicht-hinweis");

// Verzichtsanalyse (Abschnitt C): Einstufung nach Zweck der Unterkategorie
// mit sinnvoller Reduktion, siehe berechneVerzichtsanalyse in compare.js.
function renderVerzichtsanalyse() {
  const state = getState();
  const va = berechneVerzichtsanalyse(state, ausgewaehltesJahr);
  verzichtTbody.innerHTML = "";
  verzichtHinweis.textContent = "Kosten " + ausgewaehltesJahr + "." +
    (ausgewaehltesJahr >= new Date().getFullYear() ? " Das Jahr ist noch nicht abgeschlossen, die Werte sind unvollständig." : "");
  va.zeilen.forEach(function (z) {
    const tr = document.createElement("tr");
    const optionen = Object.keys(VERZICHT_STUFEN).map(function (key) {
      return '<option value="' + key + '"' + (key === z.stufe ? " selected" : "") + ">" + VERZICHT_STUFEN[key].label + "</option>";
    }).join("");
    tr.innerHTML =
      "<td>" + escapeHtml(unterkategorieName(state, z.unterkategorieId)) +
        '<div class="hint">' + escapeHtml(kategorieName(state, z.kategorieId)) + "</div></td>" +
      '<td><select aria-label="Einstufung">' + optionen + "</select></td>" +
      '<td class="num"><button type="button" class="clickable-value" data-action="buchungen">' + currencyFormatter.format(z.kosten) + "</button></td>" +
      '<td class="num">' + z.reduktionPct + " %</td>" +
      '<td class="num ' + (z.einsparung > 0 ? "positive" : "") + '">' + currencyFormatter.format(z.einsparung) + "</td>";
    tr.querySelector("select").addEventListener("change", function (e) {
      updateState(function (s) {
        const u = s.unterkategorien.find(function (u) { return u.id === z.unterkategorieId; });
        if (u) u.verzichtStufe = e.target.value;
      });
    });
    tr.querySelector('[data-action="buchungen"]').addEventListener("click", function () {
      openBuchungenDialog(ausgewaehltesJahr, z.kategorieId, z.unterkategorieId);
    });
    verzichtTbody.appendChild(tr);
  });
  const kostenSumme = va.zeilen.reduce(function (s, z) { return s + z.kosten; }, 0);
  const einsparungSumme = va.zeilen.reduce(function (s, z) { return s + z.einsparung; }, 0);
  verzichtTotal.innerHTML = va.zeilen.length
    ? "<td>Total</td><td></td>" +
      '<td class="num total">' + currencyFormatter.format(kostenSumme) + "</td>" +
      '<td class="num total">' + (kostenSumme ? (einsparungSumme / kostenSumme * 100).toFixed(0) : 0) + " %</td>" +
      '<td class="num total positive">' + currencyFormatter.format(einsparungSumme) + "</td>"
    : '<td colspan="5" class="hint">Keine Kosten in diesem Jahr.</td>';
}

export function renderCompareTab() {
  const state = getState();
  const hatDaten = state.realTransaktionen.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  inhalt.style.display = hatDaten ? "block" : "none";
  if (!hatDaten) return;

  const abw = berechneAbweichungen(state);
  if (ausgewaehltesJahr === null || abw.jahre.indexOf(ausgewaehltesJahr) === -1) {
    // Default: laufendes Jahr, sofern es Buchungen gibt, sonst das jüngste Jahr.
    const heuteJahr = new Date().getFullYear();
    ausgewaehltesJahr = abw.jahre.indexOf(heuteJahr) !== -1 ? heuteJahr : abw.jahre[abw.jahre.length - 1];
  }

  jahrSelect.innerHTML = abw.jahre.map(function (j) {
    return '<option value="' + j + '"' + (j === ausgewaehltesJahr ? " selected" : "") + ">" + j + "</option>";
  }).join("");

  renderJahrTabelleUndChart(abw);
  renderTrendChart(abw);
  renderSparpotenzial(berechneSparpotenzial(state));
  renderSparpotenzialUnterkategorien();
  renderVerzichtsanalyse();
}

jahrSelect.addEventListener("change", function () {
  ausgewaehltesJahr = parseInt(jahrSelect.value, 10);
  renderJahrTabelleUndChart(berechneAbweichungen(getState()));
  renderSparpotenzialUnterkategorien();
  renderVerzichtsanalyse();
});

window.addEventListener("resize", function () {
  if (document.getElementById("tab-vergleich").classList.contains("active")) renderCompareTab();
});
