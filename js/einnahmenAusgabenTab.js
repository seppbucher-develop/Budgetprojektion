import { getState, updateState, uid } from "./store.js?v=6";
import { isoYear, formatIsoDate, todayIso } from "./dateUtils.js?v=6";
import { currencyFormatter } from "./charts.js?v=6";
import { unterkategorieName } from "./kategorien.js?v=6";
import { vorlagenFuerBezeichnung } from "./transaktionen.js?v=6";

const emptyHint = document.getElementById("buchungen-empty-hint");
const table = document.getElementById("buchungen-liste-table");
const rowsContainer = document.getElementById("buchungen-liste-rows");
const jahrSelect = document.getElementById("buchungen-jahr-select");

const dialog = document.getElementById("dialog-buchung");
const form = document.getElementById("form-buchung");
const bezeichnungInput = document.getElementById("buchung-bezeichnung");
const vorlagenListe = document.getElementById("buchung-vorlagen-liste");
const unterkategorieSelect = document.getElementById("buchung-unterkategorie");

let editId = null;
let ausgewaehltesJahr = null;
let aktuelleVorschlaege = [];

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function distinctSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function zeilenFuerJahr(state, jahr) {
  return state.realTransaktionen
    .filter(function (t) { return isoYear(t.datum) === jahr; })
    .sort(function (a, b) {
      if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
      return a.erfasstAm < b.erfasstAm ? 1 : -1;
    });
}

export function renderEinnahmenAusgabenTab() {
  const state = getState();
  const hatDaten = state.realTransaktionen.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  table.style.display = hatDaten ? "block" : "none";
  if (!hatDaten) { jahrSelect.innerHTML = ""; rowsContainer.innerHTML = ""; return; }

  const jahre = distinctSorted(state.realTransaktionen.map(function (t) { return isoYear(t.datum); })).reverse();
  if (ausgewaehltesJahr === null || jahre.indexOf(ausgewaehltesJahr) === -1) {
    ausgewaehltesJahr = jahre[0];
  }
  jahrSelect.innerHTML = jahre.map(function (j) {
    return '<option value="' + j + '"' + (j === ausgewaehltesJahr ? " selected" : "") + ">" + j + "</option>";
  }).join("");

  renderRows(state);
}

function renderRows(state) {
  const rows = zeilenFuerJahr(state, ausgewaehltesJahr);
  rowsContainer.innerHTML = rows.map(function (t) {
    return '<div class="buchungen-liste-row">' +
      "<div>" + formatIsoDate(t.datum) + "</div>" +
      "<div>" + escapeHtml(t.name) + "</div>" +
      "<div>" + escapeHtml(unterkategorieName(state, t.unterkategorieId)) + "</div>" +
      '<div class="' + (t.betragChf >= 0 ? "positive" : "negative") + '">' + currencyFormatter.format(t.betragChf) + "</div>" +
      '<div class="row-actions row-actions-icons">' +
        '<button data-action="edit" data-id="' + t.id + '" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" data-id="' + t.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</div>" +
      "</div>";
  }).join("");

  rowsContainer.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      openDialog(rows.find(function (t) { return t.id === btn.dataset.id; }));
    });
  });
  rowsContainer.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener("click", function () { deleteBuchung(btn.dataset.id); });
  });
}

jahrSelect.addEventListener("change", function () {
  ausgewaehltesJahr = parseInt(jahrSelect.value, 10);
  renderRows(getState());
});

function fillUnterkategorieSelect(selectedId) {
  const state = getState();
  const kategorien = state.kategorien.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  unterkategorieSelect.innerHTML = kategorien.map(function (k) {
    const unterkategorien = state.unterkategorien
      .filter(function (u) { return u.kategorieId === k.id; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (unterkategorien.length === 0) return "";
    return '<optgroup label="' + escapeHtml(k.name) + '">' +
      unterkategorien.map(function (u) { return '<option value="' + u.id + '">' + escapeHtml(u.name) + "</option>"; }).join("") +
      "</optgroup>";
  }).join("");
  if (selectedId) unterkategorieSelect.value = selectedId;
}

function openDialog(row) {
  editId = row ? row.id : null;
  fillUnterkategorieSelect(row ? row.unterkategorieId : null);
  bezeichnungInput.value = row ? row.name : "";
  form.vorzeichen.value = row && row.betragChf >= 0 ? "einnahme" : "ausgabe";
  form.betrag.value = row ? Math.abs(row.betragChf) : "";
  form.datum.value = row ? row.datum : todayIso();
  form.valutadatum.value = row ? row.valutadatum : todayIso();
  document.getElementById("dialog-buchung-title").textContent = row ? "Buchung bearbeiten" : "Neue Buchung";
  vorlagenListe.hidden = true;
  dialog.showModal();
}

function deleteBuchung(id) {
  if (!confirm("Diese Buchung wirklich löschen?")) return;
  updateState(function (s) {
    s.realTransaktionen = s.realTransaktionen.filter(function (t) { return t.id !== id; });
  });
}

document.getElementById("btn-add-buchung").addEventListener("click", function () { openDialog(null); });
document.getElementById("dialog-buchung-cancel").addEventListener("click", function () { dialog.close(); });

// Vorlagen-Typeahead: bei jeder Eingabe die passenden früheren Buchungen
// (je Bezeichnung nur die jüngste) als Auswahlliste anzeigen. Übernommen
// werden Unterkategorie, Betrag und Vorzeichen der gewählten Vorlage.
bezeichnungInput.addEventListener("input", function () {
  aktuelleVorschlaege = vorlagenFuerBezeichnung(getState(), bezeichnungInput.value);
  if (aktuelleVorschlaege.length === 0) {
    vorlagenListe.hidden = true;
    vorlagenListe.innerHTML = "";
    return;
  }
  vorlagenListe.innerHTML = aktuelleVorschlaege.map(function (v) {
    return '<button type="button" class="vorlagen-eintrag" data-id="' + v.id + '">' +
      '<span class="vorlagen-name">' + escapeHtml(v.name) + "</span>" +
      '<span class="' + (v.betragChf >= 0 ? "positive" : "negative") + '">' + currencyFormatter.format(v.betragChf) + "</span>" +
      "</button>";
  }).join("");
  vorlagenListe.hidden = false;
});

vorlagenListe.addEventListener("click", function (e) {
  const btn = e.target.closest("[data-id]");
  if (!btn) return;
  const vorlage = aktuelleVorschlaege.find(function (v) { return v.id === btn.dataset.id; });
  if (!vorlage) return;
  bezeichnungInput.value = vorlage.name;
  fillUnterkategorieSelect(vorlage.unterkategorieId);
  form.vorzeichen.value = vorlage.betragChf >= 0 ? "einnahme" : "ausgabe";
  form.betrag.value = Math.abs(vorlage.betragChf);
  vorlagenListe.hidden = true;
});

document.addEventListener("click", function (e) {
  if (e.target !== bezeichnungInput && !vorlagenListe.contains(e.target)) {
    vorlagenListe.hidden = true;
  }
});

form.addEventListener("submit", function (e) {
  e.preventDefault();
  const state = getState();
  const unterkategorie = state.unterkategorien.find(function (u) { return u.id === form.unterkategorieId.value; });
  const betragsBetrag = Math.abs(parseFloat(form.betrag.value));
  const data = {
    name: bezeichnungInput.value.trim(),
    betragChf: form.vorzeichen.value === "ausgabe" ? -betragsBetrag : betragsBetrag,
    unterkategorieId: unterkategorie ? unterkategorie.id : null,
    kategorieId: unterkategorie ? unterkategorie.kategorieId : null,
    datum: form.datum.value,
    valutadatum: form.valutadatum.value
  };
  if (!data.name || isNaN(data.betragChf) || !data.unterkategorieId || !data.datum || !data.valutadatum) return;

  updateState(function (s) {
    if (editId) {
      const row = s.realTransaktionen.find(function (t) { return t.id === editId; });
      Object.assign(row, data);
    } else {
      s.realTransaktionen.push(Object.assign({ id: uid(), erfasstAm: new Date().toISOString() }, data));
    }
  });
  dialog.close();
});

window.addEventListener("resize", function () {
  if (document.getElementById("tab-buchungen").classList.contains("active")) renderEinnahmenAusgabenTab();
});
