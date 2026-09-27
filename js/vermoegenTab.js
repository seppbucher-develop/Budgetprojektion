import { getState, updateState, uid } from "./store.js?v=25";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=25";
import { currencyFormatter } from "./charts.js?v=25";
import { aktualisiereFremdwaehrungVermoegen } from "./vermoegen.js?v=25";

const tbody = document.querySelector("#vermoegen-table tbody");
const thead = document.querySelector("#vermoegen-table thead tr");
const emptyHint = document.getElementById("vermoegen-empty-hint");
const dialog = document.getElementById("dialog-vermoegen-row");
const form = document.getElementById("form-vermoegen-row");
const kontenFieldsEl = document.getElementById("vermoegen-konten-fields");
const neuesKontoInput = document.getElementById("neues-konto-name");
const neuesKontoWaehrungSelect = document.getElementById("neues-konto-waehrung");

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

  thead.innerHTML = "<th>Stichtag</th>" + konten.map(function (k) { return "<th>" + escapeHtml(k.name) + (k.waehrung !== "CHF" ? " (" + k.waehrung + "→CHF)" : "") + "</th>"; }).join("") + "<th>Summe</th><th></th>";

  tbody.innerHTML = "";
  eintraege.forEach(function (row) {
    const summe = konten.reduce(function (s, k) { return s + (Number(row.werte[k.name]) || 0); }, 0);
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + formatIsoDate(row.datum) + "</td>" +
      konten.map(function (k) { return '<td class="num">' + currencyFormatter.format(row.werte[k.name] || 0) + "</td>"; }).join("") +
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

function buildKontenFields(werte, fremdbetraege) {
  const konten = getState().vermoegenKonten;
  kontenFieldsEl.innerHTML = "";
  konten.forEach(function (k) {
    const istFremdwaehrung = k.waehrung !== "CHF";
    const safeId = "konto-" + k.name.replace(/[^a-zA-Z0-9]/g, "_");
    // Bei Fremdwährungskonten wird der native Betrag erfasst (nicht der
    // CHF-Gegenwert) -- der wird aus diesem Betrag beim Speichern bzw.
    // Öffnen der App mit dem aktuellen Kurs neu berechnet, siehe vermoegen.js.
    const wert = istFremdwaehrung
      ? (fremdbetraege && fremdbetraege[k.name] != null ? fremdbetraege[k.name] : "")
      : (werte && werte[k.name] != null ? werte[k.name] : "");
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML =
      '<label for="' + safeId + '">' + escapeHtml(k.name) + " (" + k.waehrung + ")</label>" +
      '<input type="number" step="0.01" id="' + safeId + '" data-konto="' + escapeHtml(k.name) + '" data-waehrung="' + k.waehrung + '" value="' + wert + '">';
    kontenFieldsEl.appendChild(field);
  });
}

function openDialog(row) {
  editId = row ? row.id : null;
  form.datum.value = row ? row.datum : todayIso();
  buildKontenFields(row ? row.werte : null, row ? row.fremdbetraege : null);
  document.getElementById("dialog-vermoegen-row-title").textContent = row ? "Vermögens-Stichtag bearbeiten" : "Neuer Vermögens-Stichtag";
  neuesKontoInput.value = "";
  neuesKontoWaehrungSelect.value = "CHF";
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
  const waehrung = neuesKontoWaehrungSelect.value;
  updateState(function (s) {
    if (!s.vermoegenKonten.some(function (k) { return k.name === name; })) {
      s.vermoegenKonten.push({ name: name, waehrung: waehrung });
    }
  });
  buildKontenFields(null, null);
  neuesKontoInput.value = "";
  neuesKontoWaehrungSelect.value = "CHF";
});

form.addEventListener("submit", function (e) {
  e.preventDefault();
  if (!form.datum.value) return;
  const bestehendeWerte = editId
    ? (getState().vermoegenEintraege.find(function (r) { return r.id === editId; }) || {}).werte || {}
    : {};
  const werte = {};
  const fremdbetraege = {};
  kontenFieldsEl.querySelectorAll("input[data-konto]").forEach(function (input) {
    const name = input.dataset.konto;
    const wert = parseFloat(input.value) || 0;
    if (input.dataset.waehrung === "CHF") {
      werte[name] = wert;
    } else {
      fremdbetraege[name] = wert;
      // Vorläufig den zuletzt bekannten CHF-Betrag übernehmen, bis
      // aktualisiereFremdwaehrungVermoegen() ihn gleich im Anschluss mit
      // dem aktuellen Kurs neu berechnet -- sonst würde die Summe für
      // einen kurzen Moment auf 0 fallen.
      werte[name] = bestehendeWerte[name] != null ? bestehendeWerte[name] : 0;
    }
  });

  updateState(function (s) {
    if (editId) {
      const row = s.vermoegenEintraege.find(function (r) { return r.id === editId; });
      row.datum = form.datum.value;
      row.werte = werte;
      row.fremdbetraege = fremdbetraege;
    } else {
      s.vermoegenEintraege.push({ id: uid(), datum: form.datum.value, werte: werte, fremdbetraege: fremdbetraege });
    }
  });
  dialog.close();
  aktualisiereFremdwaehrungVermoegen(getState, updateState);
});
