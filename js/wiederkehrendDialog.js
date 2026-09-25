// Dialog "Wiederkehrende Buchungen verwalten" (Einnahmen/Ausgaben-Tab):
// CRUD für Regeln, aus denen beim App-Start automatisch echte Buchungen
// erzeugt werden (siehe wiederkehrendeBuchungen.js für die Erzeugungslogik,
// app.js für den Aufruf beim Start).
import { getState, updateState, uid } from "./store.js?v=18";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=18";
import { betragFormatter } from "./charts.js?v=18";
import { holeWechselkurs } from "./fx.js?v=18";

const dialog = document.getElementById("dialog-wiederkehrend");
const liste = document.getElementById("wiederkehrend-liste");
const emptyHint = document.getElementById("wiederkehrend-empty-hint");

const rowDialog = document.getElementById("dialog-wiederkehrend-row");
const form = document.getElementById("form-wiederkehrend-row");
const nameInput = document.getElementById("wiederkehrend-name");
const unterkategorieSelect = document.getElementById("wiederkehrend-unterkategorie");
const waehrungSelect = document.getElementById("wiederkehrend-waehrung");
const betragInput = document.getElementById("wiederkehrend-betrag");
const fremdwaehrungFeld = document.getElementById("wiederkehrend-fremdwaehrung-feld");
const fremdwaehrungBetragInput = document.getElementById("wiederkehrend-fremdwaehrung-betrag");
const kursFeld = document.getElementById("wiederkehrend-kurs-feld");
const kursInput = document.getElementById("wiederkehrend-kurs");
const rhythmusSelect = document.getElementById("wiederkehrend-rhythmus");
const abInput = document.getElementById("wiederkehrend-ab");
const aktivCheckbox = document.getElementById("wiederkehrend-aktiv");
const rowDeleteBtn = document.getElementById("dialog-wiederkehrend-row-delete");

let editId = null;
let kursAnfrageZaehler = 0;

const RHYTHMUS_LABEL = {
  woechentlich: "Wöchentlich",
  monatlich: "Monatlich",
  quartalsweise: "Quartalsweise",
  halbjaehrlich: "Halbjährlich",
  jaehrlich: "Jährlich"
};

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function parseDezimal(text) {
  return parseFloat(String(text).trim().replace(",", "."));
}

function render() {
  const state = getState();
  const regeln = state.wiederkehrendeBuchungen.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  emptyHint.style.display = regeln.length === 0 ? "block" : "none";

  liste.innerHTML = regeln.map(function (r) {
    const betragChf = (r.vorzeichen === "ausgabe" ? -1 : 1) * r.betrag * r.kurs;
    return '<div class="wiederkehrend-row' + (r.aktiv ? "" : " wiederkehrend-inaktiv") + '" data-id="' + r.id + '">' +
      '<div class="wiederkehrend-row-info">' +
        '<div class="wiederkehrend-name">' + escapeHtml(r.name) + (r.aktiv ? "" : " (pausiert)") + "</div>" +
        '<div class="wiederkehrend-sub">' + RHYTHMUS_LABEL[r.rhythmus] + ", ab " + formatIsoDate(r.ab) + "</div>" +
      "</div>" +
      '<div class="wiederkehrend-betrag ' + (betragChf >= 0 ? "positive" : "negative") + '">' + betragFormatter.format(betragChf) + "</div>" +
      '<div class="row-actions row-actions-icons">' +
        '<button data-action="edit" data-id="' + r.id + '" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" data-id="' + r.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</div>" +
      "</div>";
  }).join("");

  liste.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      openRowDialog(regeln.find(function (r) { return r.id === btn.dataset.id; }));
    });
  });
  liste.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener("click", function () { if (deleteRegel(btn.dataset.id)) render(); });
  });
}

export function openWiederkehrendDialog() {
  render();
  dialog.showModal();
}

document.getElementById("btn-open-wiederkehrend").addEventListener("click", openWiederkehrendDialog);
document.getElementById("dialog-wiederkehrend-close").addEventListener("click", function () { dialog.close(); });
document.getElementById("btn-add-wiederkehrend").addEventListener("click", function () { openRowDialog(null); });

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

// Analog zum Buchungsdialog (einnahmenAusgabenTab.js): CHF direkt editierbar,
// bei Fremdwährung wird Betrag (CHF) aus Fremdwährungsbetrag × Kurs
// berechnet. Der Kurs hier ist nur ein Richtwert für die Anzeige — bei jeder
// tatsächlichen Erzeugung wird er live neu abgefragt.
function aktualisiereWaehrungsFelder() {
  const istChf = waehrungSelect.value === "CHF";
  fremdwaehrungFeld.hidden = istChf;
  fremdwaehrungBetragInput.disabled = istChf;
  kursFeld.hidden = istChf;
  kursInput.disabled = istChf;
  betragInput.disabled = !istChf;
  if (istChf) {
    kursInput.value = "1";
  } else {
    aktualisiereBetragAusFremdwaehrung();
  }
}

function aktualisiereBetragAusFremdwaehrung() {
  if (waehrungSelect.value === "CHF") return;
  const fremdwaehrungsbetrag = parseDezimal(fremdwaehrungBetragInput.value);
  const kurs = parseDezimal(kursInput.value);
  betragInput.value = (!isNaN(fremdwaehrungsbetrag) && !isNaN(kurs))
    ? (fremdwaehrungsbetrag * kurs).toFixed(2)
    : "";
}

async function ladeKursVorschlag() {
  const waehrung = waehrungSelect.value;
  aktualisiereWaehrungsFelder();
  if (waehrung === "CHF") return;
  const anfrageId = ++kursAnfrageZaehler;
  const ergebnis = await holeWechselkurs(todayIso(), waehrung);
  if (anfrageId !== kursAnfrageZaehler) return;
  if (ergebnis.kurs != null) kursInput.value = ergebnis.kurs;
  aktualisiereBetragAusFremdwaehrung();
}

waehrungSelect.addEventListener("change", ladeKursVorschlag);
fremdwaehrungBetragInput.addEventListener("input", aktualisiereBetragAusFremdwaehrung);
kursInput.addEventListener("input", aktualisiereBetragAusFremdwaehrung);

function openRowDialog(regel) {
  editId = regel ? regel.id : null;
  fillUnterkategorieSelect(regel ? regel.unterkategorieId : null);
  nameInput.value = regel ? regel.name : "";
  form.vorzeichen.value = regel ? regel.vorzeichen : "ausgabe";
  waehrungSelect.value = regel ? regel.waehrung : "CHF";
  kursInput.value = regel ? regel.kurs : 1;
  fremdwaehrungBetragInput.value = regel ? regel.betrag : "";
  betragInput.value = regel
    ? (regel.waehrung === "CHF" ? regel.betrag : (regel.betrag * regel.kurs).toFixed(2))
    : "";
  rhythmusSelect.value = regel ? regel.rhythmus : "monatlich";
  abInput.value = regel ? regel.ab : todayIso();
  aktivCheckbox.checked = regel ? regel.aktiv : true;
  aktualisiereWaehrungsFelder();
  document.getElementById("dialog-wiederkehrend-row-title").textContent = regel ? "Wiederkehrende Buchung bearbeiten" : "Neue wiederkehrende Buchung";
  rowDeleteBtn.hidden = !regel;
  rowDialog.showModal();
}

document.getElementById("dialog-wiederkehrend-row-cancel").addEventListener("click", function () { rowDialog.close(); });

function deleteRegel(id) {
  if (!confirm("Diese wiederkehrende Buchung wirklich löschen? Bereits erzeugte Buchungen bleiben erhalten.")) return false;
  updateState(function (s) {
    s.wiederkehrendeBuchungen = s.wiederkehrendeBuchungen.filter(function (r) { return r.id !== id; });
  });
  return true;
}

rowDeleteBtn.addEventListener("click", function () {
  if (!editId) return;
  if (deleteRegel(editId)) { rowDialog.close(); render(); }
});

form.addEventListener("submit", function (e) {
  e.preventDefault();
  const state = getState();
  const unterkategorie = state.unterkategorien.find(function (u) { return u.id === form.unterkategorieId.value; });
  const istChf = waehrungSelect.value === "CHF";
  const kurs = istChf ? 1 : Math.abs(parseDezimal(kursInput.value));
  const betrag = Math.abs(istChf ? parseDezimal(betragInput.value) : parseDezimal(fremdwaehrungBetragInput.value));
  const data = {
    name: nameInput.value.trim(),
    vorzeichen: form.vorzeichen.value,
    betrag: betrag,
    waehrung: waehrungSelect.value,
    kurs: kurs,
    unterkategorieId: unterkategorie ? unterkategorie.id : null,
    kategorieId: unterkategorie ? unterkategorie.kategorieId : null,
    rhythmus: rhythmusSelect.value,
    ab: abInput.value,
    aktiv: aktivCheckbox.checked
  };
  if (!data.name || isNaN(betrag) || isNaN(kurs) || !data.unterkategorieId || !data.ab) return;

  updateState(function (s) {
    if (editId) {
      const regel = s.wiederkehrendeBuchungen.find(function (r) { return r.id === editId; });
      Object.assign(regel, data);
    } else {
      s.wiederkehrendeBuchungen.push(Object.assign({ id: uid(), letzteErzeugung: null }, data));
    }
  });
  rowDialog.close();
  render();
});
