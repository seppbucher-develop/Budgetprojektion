import { getState, updateState, uid } from "./store.js?v=4";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=4";
import { currencyFormatter } from "./charts.js?v=4";
import { kategorieName } from "./kategorien.js?v=4";

const rowsContainer = document.getElementById("budget-rows");
const emptyHint = document.getElementById("budget-empty-hint");
const dialog = document.getElementById("dialog-budget-row");
const form = document.getElementById("form-budget-row");

let editId = null;

function sortedRows() {
  const state = getState();
  return state.budgetPosten.slice().sort(function (a, b) {
    const na = kategorieName(state, a.kategorieId);
    const nb = kategorieName(state, b.kategorieId);
    if (na !== nb) return na.localeCompare(nb);
    return a.ab < b.ab ? -1 : a.ab > b.ab ? 1 : 0;
  });
}

export function renderBudgetTab() {
  const state = getState();
  const rows = sortedRows();
  emptyHint.style.display = rows.length === 0 ? "block" : "none";
  document.getElementById("budget-table").style.display = rows.length === 0 ? "none" : "block";

  rowsContainer.innerHTML = "";
  rows.forEach(function (row) {
    const rowEl = document.createElement("div");
    rowEl.className = "budget-row";
    const typSymbol = row.typ === "einmalig"
      ? '<span class="typ-symbol" title="Einmalig (nur im angegebenen Jahr)">1×</span>'
      : '<span class="typ-symbol" title="Wiederkehrend (gilt ab diesem Jahr bis zur nächsten Änderung)">↻</span>';
    rowEl.innerHTML =
      "<div>" + escapeHtml(kategorieName(state, row.kategorieId)) + "</div>" +
      '<div class="' + (row.betrag < 0 ? "negative" : "positive") + '">' + currencyFormatter.format(row.betrag) + "</div>" +
      "<div>" + formatIsoDate(row.ab) + "</div>" +
      "<div>" + typSymbol + "</div>" +
      '<div class="row-actions row-actions-icons">' +
        '<button data-action="edit" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</div>";
    rowEl.querySelector('[data-action="edit"]').addEventListener("click", function () { openDialog(row); });
    rowEl.querySelector('[data-action="delete"]').addEventListener("click", function () { deleteRow(row.id); });
    rowsContainer.appendChild(rowEl);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function fillKategorieSelect(selectedId) {
  const state = getState();
  const kategorien = state.kategorien.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  form.kategorieId.innerHTML = kategorien.map(function (k) {
    return '<option value="' + k.id + '">' + escapeHtml(k.name) + "</option>";
  }).join("");
  if (selectedId) form.kategorieId.value = selectedId;
}

function openDialog(row) {
  editId = row ? row.id : null;
  fillKategorieSelect(row ? row.kategorieId : null);
  form.vorzeichen.value = row && row.betrag > 0 ? "ertrag" : "kosten";
  form.betrag.value = row ? Math.abs(row.betrag) : "";
  form.ab.value = row ? row.ab : todayIso();
  form.typ.value = row ? row.typ : "wiederkehrend";
  document.getElementById("dialog-budget-row-title").textContent = row ? "Posten bearbeiten" : "Neuer Budgetposten";
  dialog.showModal();
}

function deleteRow(id) {
  if (!confirm("Diesen Budgetposten wirklich löschen?")) return;
  updateState(function (s) {
    s.budgetPosten = s.budgetPosten.filter(function (r) { return r.id !== id; });
  });
}

document.getElementById("btn-add-budget-row").addEventListener("click", function () { openDialog(null); });
document.getElementById("dialog-budget-row-cancel").addEventListener("click", function () { dialog.close(); });

form.addEventListener("submit", function (e) {
  e.preventDefault();
  const betragsBetrag = Math.abs(parseFloat(form.betrag.value));
  const data = {
    kategorieId: form.kategorieId.value,
    betrag: form.vorzeichen.value === "kosten" ? -betragsBetrag : betragsBetrag,
    ab: form.ab.value,
    typ: form.typ.value
  };
  if (!data.kategorieId || isNaN(data.betrag) || !data.ab) return;

  updateState(function (s) {
    if (editId) {
      const row = s.budgetPosten.find(function (r) { return r.id === editId; });
      Object.assign(row, data);
    } else {
      s.budgetPosten.push(Object.assign({ id: uid() }, data));
    }
  });
  dialog.close();
});
