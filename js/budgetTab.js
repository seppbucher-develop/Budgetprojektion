import { getState, updateState, uid } from "./store.js";
import { formatIsoDate, todayIso } from "./dateUtils.js";
import { currencyFormatter } from "./charts.js";

const tbody = document.querySelector("#budget-table tbody");
const emptyHint = document.getElementById("budget-empty-hint");
const dialog = document.getElementById("dialog-budget-row");
const form = document.getElementById("form-budget-row");

let editId = null;

function sortedRows() {
  return getState().budgetPosten.slice().sort(function (a, b) {
    if (a.posten !== b.posten) return a.posten.localeCompare(b.posten);
    return a.ab < b.ab ? -1 : a.ab > b.ab ? 1 : 0;
  });
}

export function renderBudgetTab() {
  const rows = sortedRows();
  emptyHint.style.display = rows.length === 0 ? "block" : "none";
  document.getElementById("budget-table").style.display = rows.length === 0 ? "none" : "table";

  tbody.innerHTML = "";
  rows.forEach(function (row) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(row.posten) + "</td>" +
      '<td class="num ' + (row.betrag < 0 ? "negative" : "positive") + '">' + currencyFormatter.format(row.betrag) + "</td>" +
      "<td>" + formatIsoDate(row.ab) + "</td>" +
      "<td>" + (row.typ === "einmalig" ? "Einmalig" : "Wiederkehrend") + "</td>" +
      '<td class="row-actions"><button data-action="edit">Bearbeiten</button><button data-action="delete" class="btn-danger-text">Löschen</button></td>';
    tr.querySelector('[data-action="edit"]').addEventListener("click", function () { openDialog(row); });
    tr.querySelector('[data-action="delete"]').addEventListener("click", function () { deleteRow(row.id); });
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function fillPostenDatalist() {
  const namen = Array.from(new Set(getState().budgetPosten.map(function (r) { return r.posten; })));
  document.getElementById("budget-posten-liste").innerHTML =
    namen.map(function (n) { return '<option value="' + n.replace(/"/g, "&quot;") + '">'; }).join("");
}

function openDialog(row) {
  editId = row ? row.id : null;
  fillPostenDatalist();
  form.posten.value = row ? row.posten : "";
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
    posten: form.posten.value.trim(),
    betrag: form.vorzeichen.value === "kosten" ? -betragsBetrag : betragsBetrag,
    ab: form.ab.value,
    typ: form.typ.value
  };
  if (!data.posten || isNaN(data.betrag) || !data.ab) return;

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
