import { getState, updateState, uid } from "./store.js?v=4";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=4";
import { currencyFormatter } from "./charts.js?v=4";
import { berechneRendite, fruehesterCashflowLogEintrag } from "./renditeAnalyse.js?v=4";

const emptyHint = document.getElementById("rendite-empty-hint");
const inhalt = document.getElementById("rendite-inhalt");
const vonSelect = document.getElementById("rendite-von");
const bisSelect = document.getElementById("rendite-bis");
const summaryEl = document.getElementById("rendite-summary");
const vorLogHinweis = document.getElementById("rendite-vor-log-hinweis");
const cashflowRows = document.getElementById("rendite-cashflow-rows");
const cashflowEmpty = document.getElementById("rendite-cashflow-empty");
const cashflowTable = document.getElementById("rendite-cashflow-table");

const korrekturRows = document.getElementById("korrektur-rows");
const korrekturEmptyHint = document.getElementById("korrektur-empty-hint");
const korrekturTable = document.getElementById("korrektur-table");
const korrekturDialog = document.getElementById("dialog-korrektur-row");
const korrekturForm = document.getElementById("form-korrektur-row");

let editKorrekturId = null;

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function statBlock(label, value) {
  return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div></div>";
}

function pctText(v) {
  if (v == null) return "–";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + " %";
}

function sortierteStichtage() {
  return getState().vermoegenEintraege
    .slice()
    .sort(function (a, b) { return a.datum < b.datum ? -1 : 1; })
    .map(function (e) { return e.datum; });
}

export function renderRenditeTab() {
  const state = getState();
  renderKorrekturtabelle(state);

  const stichtage = sortierteStichtage();
  const hatGenugStichtage = stichtage.length >= 2;
  emptyHint.style.display = hatGenugStichtage ? "none" : "block";
  inhalt.style.display = hatGenugStichtage ? "block" : "none";
  if (!hatGenugStichtage) return;

  const bisherVon = vonSelect.value;
  const bisherBis = bisSelect.value;
  const optionenHtml = stichtage.map(function (d) { return '<option value="' + d + '">' + formatIsoDate(d) + "</option>"; }).join("");
  vonSelect.innerHTML = optionenHtml;
  bisSelect.innerHTML = optionenHtml;
  vonSelect.value = stichtage.indexOf(bisherVon) !== -1 ? bisherVon : stichtage[0];
  bisSelect.value = stichtage.indexOf(bisherBis) !== -1 ? bisherBis : stichtage[stichtage.length - 1];

  renderErgebnis();
}

function renderErgebnis() {
  const state = getState();
  const von = vonSelect.value;
  const bis = bisSelect.value;

  if (!von || !bis || von >= bis) {
    summaryEl.innerHTML = '<p class="hint">„Von“ muss vor „Bis“ liegen.</p>';
    cashflowRows.innerHTML = "";
    cashflowTable.style.display = "none";
    cashflowEmpty.style.display = "none";
    vorLogHinweis.style.display = "none";
    return;
  }

  const rendite = berechneRendite(state, von, bis);

  const fruehesterLog = fruehesterCashflowLogEintrag(state);
  if (fruehesterLog && von < fruehesterLog) {
    vorLogHinweis.style.display = "block";
    vorLogHinweis.textContent =
      "Der Von-Stichtag (" + formatIsoDate(von) + ") liegt vor dem ersten erfassten Cashflow-Eintrag (" +
      formatIsoDate(fruehesterLog) + "). Für die Zeit davor fehlen Cashflow-Daten aus dem CSV-Import-Abgleich " +
      "— die Rendite für diesen Zeitraum ist entsprechend nicht aussagekräftig.";
  } else {
    vorLogHinweis.style.display = "none";
  }

  summaryEl.innerHTML =
    statBlock("Vermögen " + formatIsoDate(von), rendite.vermoegenStart != null ? currencyFormatter.format(rendite.vermoegenStart) : "–") +
    statBlock("Vermögen " + formatIsoDate(bis), rendite.vermoegenEnde != null ? currencyFormatter.format(rendite.vermoegenEnde) : "–") +
    statBlock("Effektiver Cashflow", currencyFormatter.format(rendite.effektiverCashflow)) +
    statBlock("Rendite (CHF)", rendite.renditeChf != null ? currencyFormatter.format(rendite.renditeChf) : "–") +
    statBlock("Rendite (%)", pctText(rendite.renditePct));

  if (rendite.cashflowPosten.length === 0) {
    cashflowRows.innerHTML = "";
    cashflowTable.style.display = "block";
    cashflowEmpty.style.display = "block";
  } else {
    cashflowEmpty.style.display = "none";
    cashflowTable.style.display = "block";
    cashflowRows.innerHTML = rendite.cashflowPosten.map(function (p) {
      return '<div class="rendite-cashflow-row">' +
        "<div>" + formatIsoDate(p.datum) + "</div>" +
        "<div>" + escapeHtml(p.bezeichnung) + "</div>" +
        "<div>" + (p.quelle === "import" ? "Import" : "Korrektur") + "</div>" +
        '<div class="' + (p.betrag >= 0 ? "positive" : "negative") + '">' + currencyFormatter.format(p.betrag) + "</div>" +
        "</div>";
    }).join("");
  }
}

vonSelect.addEventListener("change", renderErgebnis);
bisSelect.addEventListener("change", renderErgebnis);

function renderKorrekturtabelle(state) {
  const rows = state.korrekturen.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
  korrekturEmptyHint.style.display = rows.length === 0 ? "block" : "none";
  korrekturTable.style.display = rows.length === 0 ? "none" : "block";

  korrekturRows.innerHTML = rows.map(function (k) {
    return '<div class="korrektur-row">' +
      "<div>" + formatIsoDate(k.datum) + "</div>" +
      '<div class="' + (k.betrag >= 0 ? "positive" : "negative") + '">' + currencyFormatter.format(k.betrag) + "</div>" +
      "<div>" + escapeHtml(k.beschreibung) + "</div>" +
      '<div class="row-actions row-actions-icons">' +
        '<button data-action="edit" data-id="' + k.id + '" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" data-id="' + k.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</div>" +
      "</div>";
  }).join("");

  korrekturRows.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      openKorrekturDialog(rows.find(function (k) { return k.id === btn.dataset.id; }));
    });
  });
  korrekturRows.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener("click", function () { deleteKorrektur(btn.dataset.id); });
  });
}

function openKorrekturDialog(row) {
  editKorrekturId = row ? row.id : null;
  korrekturForm.datum.value = row ? row.datum : todayIso();
  korrekturForm.betrag.value = row ? row.betrag : "";
  korrekturForm.beschreibung.value = row ? row.beschreibung : "";
  document.getElementById("dialog-korrektur-row-title").textContent = row ? "Korrektur bearbeiten" : "Neue Korrekturbuchung";
  korrekturDialog.showModal();
}

function deleteKorrektur(id) {
  if (!confirm("Diese Korrekturbuchung wirklich löschen?")) return;
  updateState(function (s) {
    s.korrekturen = s.korrekturen.filter(function (k) { return k.id !== id; });
  });
}

document.getElementById("btn-add-korrektur").addEventListener("click", function () { openKorrekturDialog(null); });
document.getElementById("dialog-korrektur-row-cancel").addEventListener("click", function () { korrekturDialog.close(); });

korrekturForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const data = {
    datum: korrekturForm.datum.value,
    betrag: parseFloat(korrekturForm.betrag.value),
    beschreibung: korrekturForm.beschreibung.value.trim()
  };
  if (!data.datum || isNaN(data.betrag) || !data.beschreibung) return;

  updateState(function (s) {
    if (editKorrekturId) {
      const row = s.korrekturen.find(function (k) { return k.id === editKorrekturId; });
      Object.assign(row, data);
    } else {
      s.korrekturen.push(Object.assign({ id: uid() }, data));
    }
  });
  korrekturDialog.close();
});

window.addEventListener("resize", function () {
  if (document.getElementById("tab-analyse").classList.contains("active")) renderRenditeTab();
});
