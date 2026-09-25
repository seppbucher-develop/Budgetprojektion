import { getState, updateState, uid } from "./store.js?v=15";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=15";
import { currencyFormatter } from "./charts.js?v=15";

const tbody = document.querySelector("#vermoegen-table tbody");
const thead = document.querySelector("#vermoegen-table thead tr");
const emptyHint = document.getElementById("vermoegen-empty-hint");
const dialog = document.getElementById("dialog-vermoegen-row");
const form = document.getElementById("form-vermoegen-row");
const kontenFieldsEl = document.getElementById("vermoegen-konten-fields");
const neuesKontoInput = document.getElementById("neues-konto-name");

let editId = null;

function sortedEintraege() {
  return getState().vermoegenEintraege.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
}

export function renderVermoegenTab() {
  const state = getState();
  const konten = state.vermoegenKonten;
  const eintraege = sortedEintraege();

  emptyHint.style.display = eintraege.length === 0 ? "block" : "none";
  document.getElementById("vermoegen-table").style.display = eintraege.length === 0 ? "none" : "table";

  thead.innerHTML = "<th>Stichtag</th>" + konten.map(function (k) { return "<th>" + escapeHtml(k) + "</th>"; }).join("") + "<th>Summe</th><th></th>";

  tbody.innerHTML = "";
  eintraege.forEach(function (row) {
    const summe = konten.reduce(function (s, k) { return s + (Number(row.werte[k]) || 0); }, 0);
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + formatIsoDate(row.datum) + "</td>" +
      konten.map(function (k) { return '<td class="num">' + currencyFormatter.format(row.werte[k] || 0) + "</td>"; }).join("") +
      '<td class="num total">' + currencyFormatter.format(summe) + "</td>" +
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

function buildKontenFields(werte) {
  const konten = getState().vermoegenKonten;
  kontenFieldsEl.innerHTML = "";
  konten.forEach(function (k) {
    const field = document.createElement("div");
    field.className = "field";
    const safeId = "konto-" + k.replace(/[^a-zA-Z0-9]/g, "_");
    field.innerHTML =
      '<label for="' + safeId + '">' + escapeHtml(k) + " (CHF)</label>" +
      '<input type="number" step="0.01" id="' + safeId + '" data-konto="' + escapeHtml(k) + '" value="' + (werte && werte[k] != null ? werte[k] : "") + '">';
    kontenFieldsEl.appendChild(field);
  });
}

function openDialog(row) {
  editId = row ? row.id : null;
  form.datum.value = row ? row.datum : todayIso();
  buildKontenFields(row ? row.werte : null);
  document.getElementById("dialog-vermoegen-row-title").textContent = row ? "Vermögens-Stichtag bearbeiten" : "Neuer Vermögens-Stichtag";
  neuesKontoInput.value = "";
  dialog.showModal();
}

function deleteRow(id) {
  if (!confirm("Diesen Vermögens-Stichtag wirklich löschen?")) return;
  updateState(function (s) {
    s.vermoegenEintraege = s.vermoegenEintraege.filter(function (r) { return r.id !== id; });
  });
}

document.getElementById("btn-add-vermoegen-row").addEventListener("click", function () { openDialog(null); });
document.getElementById("dialog-vermoegen-row-cancel").addEventListener("click", function () { dialog.close(); });

document.getElementById("btn-add-konto").addEventListener("click", function () {
  const name = neuesKontoInput.value.trim();
  if (!name) return;
  updateState(function (s) {
    if (s.vermoegenKonten.indexOf(name) === -1) s.vermoegenKonten.push(name);
  });
  buildKontenFields(null);
  neuesKontoInput.value = "";
});

form.addEventListener("submit", function (e) {
  e.preventDefault();
  if (!form.datum.value) return;
  const werte = {};
  kontenFieldsEl.querySelectorAll("input[data-konto]").forEach(function (input) {
    werte[input.dataset.konto] = parseFloat(input.value) || 0;
  });

  updateState(function (s) {
    if (editId) {
      const row = s.vermoegenEintraege.find(function (r) { return r.id === editId; });
      row.datum = form.datum.value;
      row.werte = werte;
    } else {
      s.vermoegenEintraege.push({ id: uid(), datum: form.datum.value, werte: werte });
    }
  });
  dialog.close();
});
