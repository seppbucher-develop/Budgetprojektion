import { getState, updateState } from "./store.js";
import { berechneProjektion } from "./projection.js";
import { drawLineChart, currencyFormatter } from "./charts.js";

const form = document.getElementById("form-projektion-einstellungen");
const tbody = document.querySelector("#projektion-table tbody");
const summaryEl = document.getElementById("projektion-summary");
const canvas = document.getElementById("projektion-chart");
const emptyHint = document.getElementById("projektion-empty-hint");

function fillSettingsForm() {
  const s = getState().einstellungen;
  form.horizontJahre.value = s.horizontJahre;
  form.renditePct.value = s.renditePct;
  form.inflationPct.value = s.inflationPct;
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  updateState(function (s) {
    s.einstellungen.horizontJahre = parseInt(form.horizontJahre.value, 10) || 30;
    s.einstellungen.renditePct = parseFloat(form.renditePct.value) || 0;
    s.einstellungen.inflationPct = parseFloat(form.inflationPct.value) || 0;
  });
});

export function renderProjectionTab() {
  fillSettingsForm();
  const state = getState();
  const hatDaten = state.budgetPosten.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  document.getElementById("projektion-inhalt").style.display = hatDaten ? "block" : "none";
  if (!hatDaten) return;

  const proj = berechneProjektion(state);

  const endWert = proj.jahre[proj.jahre.length - 1].vermoegenEnde;
  const aufgebraucht = proj.jahre.find(function (j) { return j.vermoegenEnde <= 0; });
  summaryEl.innerHTML =
    statBlock("Startvermögen" + (proj.startDatum ? " (" + proj.startDatum + ")" : ""), currencyFormatter.format(proj.startVermoegen)) +
    statBlock("Vermögen Ende " + (proj.startJahr + proj.jahre.length - 1), currencyFormatter.format(endWert)) +
    statBlock("Reicht bis", aufgebraucht ? String(aufgebraucht.jahr) : "über gesamten Horizont hinaus");

  tbody.innerHTML = "";
  proj.jahre.forEach(function (j) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + j.jahr + "</td>" +
      '<td class="num positive">' + currencyFormatter.format(j.ertrag) + (j.ertragIstReal ? ' <span class="badge">real</span>' : ' <span class="badge budget">Budget</span>') + "</td>" +
      '<td class="num negative">' + currencyFormatter.format(j.kosten) + "</td>" +
      '<td class="num ' + (j.netto >= 0 ? "positive" : "negative") + '">' + currencyFormatter.format(j.netto) + "</td>" +
      '<td class="num ' + (j.vermoegenEnde >= 0 ? "" : "negative") + '">' + currencyFormatter.format(j.vermoegenEnde) + "</td>";
    tbody.appendChild(tr);
  });

  drawLineChart(canvas, proj.jahre.map(function (j) { return { jahr: j.jahr, value: j.vermoegenEnde }; }));
}

function statBlock(label, value) {
  return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div></div>";
}

window.addEventListener("resize", function () {
  if (document.getElementById("tab-projektion").classList.contains("active")) renderProjectionTab();
});
