import { getState, updateState, uid } from "./store.js?v=41";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=41";
import { currencyFormatter } from "./charts.js?v=41";
import { berechneFremdwaehrungBetraege, berechneFremdwaehrungEintragNeu, hatFremdwaehrungsBetraege, vermoegenSpalten, anlageSpaltenName } from "./vermoegen.js?v=41";

const tbody = document.querySelector("#vermoegen-table tbody");
const thead = document.querySelector("#vermoegen-table thead tr");
const emptyHint = document.getElementById("vermoegen-empty-hint");
const dialog = document.getElementById("dialog-vermoegen-row");
const form = document.getElementById("form-vermoegen-row");
const kontenFieldsEl = document.getElementById("vermoegen-konten-fields");
const neuesKontoInput = document.getElementById("neues-konto-name");
const neuesKontoWaehrungSelect = document.getElementById("neues-konto-waehrung");
const neuesKontoAnlageCheckbox = document.getElementById("neues-konto-anlage");

let editId = null;

function sortedEintraege() {
  return getState().vermoegenEintraege.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
}

export function renderVermoegenTab() {
  const state = getState();
  const konten = vermoegenSpalten(state);
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
      '<td class="row-actions row-actions-icons">' +
        (hatFremdwaehrungsBetraege(state, row) ? '<button data-action="recalc" title="Währung neu berechnen" aria-label="Währung neu berechnen">🔄</button>' : "") +
        '<button data-action="edit" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</td>";
    const recalcBtn = tr.querySelector('[data-action="recalc"]');
    if (recalcBtn) recalcBtn.addEventListener("click", function () { berechneFremdwaehrungEintragNeu(getState, updateState, row.id); });
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

function nativBetrag(k, werte, fremdbetraege) {
  const istFremdwaehrung = k.waehrung !== "CHF";
  const quelle = istFremdwaehrung ? fremdbetraege : werte;
  return quelle && quelle[k.name] != null ? Number(quelle[k.name]) || 0 : null;
}

function fieldHtml(id, label, konto, rolle, wert) {
  return '<div class="field"><label for="' + id + '">' + label + '</label>' +
    '<input type="number" step="0.01" id="' + id + '" data-konto="' + escapeHtml(konto.name) + '" data-rolle="' + rolle + '" data-waehrung="' + konto.waehrung + '" value="' + wert + '"></div>';
}

function buildKontenFields(werte, fremdbetraege) {
  const konten = getState().vermoegenKonten;
  kontenFieldsEl.innerHTML = "";
  konten.forEach(function (k) {
    // Bei Fremdwährungskonten wird der native Betrag erfasst (nicht der
    // CHF-Gegenwert) -- der wird aus diesem Betrag beim Speichern bzw.
    // Öffnen der App mit dem aktuellen Kurs neu berechnet, siehe vermoegen.js.
    const safeId = "konto-" + k.name.replace(/[^a-zA-Z0-9]/g, "_");
    const box = document.createElement("div");
    box.className = "konto-gruppe";
    const einzel = nativBetrag(k, werte, fremdbetraege);
    const toggle = '<label class="checkbox-row"><input type="checkbox" data-anlage-toggle="' + escapeHtml(k.name) + '"' + (k.mitAnlage ? " checked" : "") + '> mit Anlagevermögen</label>';
    if (k.mitAnlage) {
      const anlage = nativBetrag({ name: anlageSpaltenName(k.name), waehrung: k.waehrung }, werte, fremdbetraege);
      const gesamt = einzel == null && anlage == null ? "" : Math.round(((einzel || 0) + (anlage || 0)) * 100) / 100;
      box.innerHTML =
        fieldHtml(safeId + "-gesamt", escapeHtml(k.name) + " – Gesamtvermögen (" + k.waehrung + ")", k, "gesamt", gesamt) +
        fieldHtml(safeId + "-anlage", escapeHtml(k.name) + " – Anlagevermögen (" + k.waehrung + ")", k, "anlage", anlage == null ? "" : anlage) +
        '<p class="hint" data-einzel-hint="' + escapeHtml(k.name) + '"></p>' + toggle;
      const aktualisiere = function () {
        const g = parseFloat(box.querySelector('[data-rolle="gesamt"]').value) || 0;
        const a = parseFloat(box.querySelector('[data-rolle="anlage"]').value) || 0;
        const hint = box.querySelector("[data-einzel-hint]");
        hint.textContent = "Einzelkonto = Gesamt − Anlage: " + (Math.round((g - a) * 100) / 100).toFixed(2) + " " + k.waehrung + (a > g ? " ⚠ Anlagevermögen ist grösser als das Gesamtvermögen" : "");
      };
      box.querySelectorAll("input[type=number]").forEach(function (i) { i.addEventListener("input", aktualisiere); });
      aktualisiere();
    } else {
      box.innerHTML = fieldHtml(safeId, escapeHtml(k.name) + " (" + k.waehrung + ")", k, "einzel", einzel == null ? "" : einzel) + toggle;
    }
    // Umschalten übernimmt die bereits eingegebenen Beträge des Dialogs.
    box.querySelector("[data-anlage-toggle]").addEventListener("change", function (e) {
      const aktuell = leseDialogWerte();
      const anlageName = anlageSpaltenName(k.name);
      const aus = !e.target.checked;
      // Beim Ausschalten wird das Anlagevermögen wieder ins Einzelkonto
      // zurückgerechnet (in allen Stichtagen und im Dialog), damit die
      // Gesamtsumme gleich bleibt und keine versteckte Spalte übrig bleibt.
      if (aus) {
        [aktuell.werte, aktuell.fremdbetraege].forEach(function (m) {
          if (m[anlageName] != null) { m[k.name] = Math.round(((m[k.name] || 0) + m[anlageName]) * 100) / 100; delete m[anlageName]; }
        });
      }
      updateState(function (st) {
        const konto = st.vermoegenKonten.find(function (x) { return x.name === k.name; });
        if (konto) { if (aus) delete konto.mitAnlage; else konto.mitAnlage = true; }
        if (aus) {
          st.vermoegenEintraege.forEach(function (r) {
            [r.werte, r.fremdbetraege].forEach(function (m) {
              if (m && m[anlageName] != null) { m[k.name] = Math.round(((m[k.name] || 0) + m[anlageName]) * 100) / 100; delete m[anlageName]; }
            });
          });
        }
      });
      buildKontenFields(aktuell.werte, aktuell.fremdbetraege);
    });
    kontenFieldsEl.appendChild(box);
  });
}

/**
 * Liest die Dialogfelder und liefert werte (CHF-Konten) / fremdbetraege
 * (Fremdwährungskonten) in der Spaltenstruktur der Tabelle. Bei Konten mit
 * Anlagevermögen: Einzelkonto = Gesamt - Anlage, plus Spalte "<Name> Anlage".
 */
function leseDialogWerte() {
  const werte = {};
  const fremdbetraege = {};
  const konten = getState().vermoegenKonten;
  function setze(konto, name, betrag) {
    if (konto.waehrung === "CHF") werte[name] = betrag; else fremdbetraege[name] = betrag;
  }
  konten.forEach(function (k) {
    const feld = function (rolle) {
      const el = kontenFieldsEl.querySelector('input[data-konto="' + CSS.escape(k.name) + '"][data-rolle="' + rolle + '"]');
      return el ? (parseFloat(el.value) || 0) : 0;
    };
    if (k.mitAnlage) {
      const gesamt = feld("gesamt"), anlage = feld("anlage");
      setze(k, k.name, Math.round((gesamt - anlage) * 100) / 100);
      setze(k, anlageSpaltenName(k.name), anlage);
    } else {
      setze(k, k.name, feld("einzel"));
    }
  });
  return { werte: werte, fremdbetraege: fremdbetraege };
}

function openDialog(row) {
  editId = row ? row.id : null;
  // Beim Anlegen eines neuen Stichtags dienen die Werte des zuletzt
  // erfassten Stichtags als Vorlage (meist ändern sich nur wenige Konten),
  // das Datum bleibt aber auf heute -- nicht auf das des Vorlage-Stichtags.
  const vorlage = row || sortedEintraege()[0] || null;
  form.datum.value = row ? row.datum : todayIso();
  buildKontenFields(vorlage ? vorlage.werte : null, vorlage ? vorlage.fremdbetraege : null);
  document.getElementById("dialog-vermoegen-row-title").textContent = row ? "Vermögens-Stichtag bearbeiten" : "Neuer Vermögens-Stichtag";
  neuesKontoInput.value = "";
  neuesKontoWaehrungSelect.value = "CHF";
  neuesKontoAnlageCheckbox.checked = false;
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
  const mitAnlage = neuesKontoAnlageCheckbox.checked;
  const aktuell = leseDialogWerte();
  updateState(function (s) {
    if (!s.vermoegenKonten.some(function (k) { return k.name === name; })) {
      const konto = { name: name, waehrung: waehrung };
      if (mitAnlage) konto.mitAnlage = true;
      s.vermoegenKonten.push(konto);
    }
  });
  buildKontenFields(aktuell.werte, aktuell.fremdbetraege);
  neuesKontoInput.value = "";
  neuesKontoWaehrungSelect.value = "CHF";
  neuesKontoAnlageCheckbox.checked = false;
});

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!form.datum.value) return;
  const bestehendeWerte = editId
    ? (getState().vermoegenEintraege.find(function (r) { return r.id === editId; }) || {}).werte || {}
    : {};
  const gelesen = leseDialogWerte();
  const werte = gelesen.werte;
  const fremdbetraege = gelesen.fremdbetraege;
  // Fallback, falls die Kursabfrage gleich unten fehlschlägt (kein Netz
  // o. Ä.) -- dann bleibt der zuletzt bekannte CHF-Betrag stehen, statt auf
  // 0 zu fallen.
  vermoegenSpalten(getState()).forEach(function (k) {
    if (k.waehrung !== "CHF") werte[k.name] = bestehendeWerte[k.name] != null ? bestehendeWerte[k.name] : 0;
  });

  // Die Umrechnung der Fremdwährungsbeträge erfolgt einmalig hier beim
  // Erfassen/Speichern mit dem dann aktuellen Kurs -- nicht mehr laufend im
  // Hintergrund (App-Start, andere Stichtage). Der damalige Kurs bleibt so
  // nachvollziehbar erhalten, bis er gezielt über "Währung neu berechnen"
  // aufgefrischt wird.
  await berechneFremdwaehrungBetraege(getState(), fremdbetraege, werte);

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
});
