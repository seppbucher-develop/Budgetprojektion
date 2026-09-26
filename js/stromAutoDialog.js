// Dialog "Strom Auto" (Einnahmen/Ausgaben-Tab): Erfassung der
// quartalsweisen Stromrechnung und der monatlich an der Ladestation ans
// Auto gelieferten kWh. Beim Speichern eines Quartals werden dessen
// Buchungen (Kraftstoff je Monat + Betriebskosten) neu erzeugt, siehe
// stromAuto.js für die Berechnung.
import { getState, updateState, uid } from "./store.js?v=23";
import { unterkategorieName } from "./kategorien.js?v=23";
import { formatIsoDate, todayIso } from "./dateUtils.js?v=23";
import { betragFormatter } from "./charts.js?v=23";
import {
  berechneQuartal, buchungenFuerQuartal, ersetzeBuchungenFuerQuartal, monateVonQuartal, quartalLabel,
  quartalVonDatum, vorherigesQuartal, findeUnterkategorieNachName
} from "./stromAuto.js?v=23";

const dialog = document.getElementById("dialog-strom-auto");
const liste = document.getElementById("strom-auto-liste");
const emptyHint = document.getElementById("strom-auto-empty-hint");
const ukKraftstoffSelect = document.getElementById("strom-auto-uk-kraftstoff");
const ukBetriebskostenSelect = document.getElementById("strom-auto-uk-betriebskosten");

const rowDialog = document.getElementById("dialog-strom-auto-row");
const form = document.getElementById("form-strom-auto-row");
const jahrInput = document.getElementById("strom-auto-jahr");
const quartalSelect = document.getElementById("strom-auto-quartal");
const rechnungKwhInput = document.getElementById("strom-auto-rechnung-kwh");
const rechnungBetragInput = document.getElementById("strom-auto-rechnung-betrag");
const bezahltAmInput = document.getElementById("strom-auto-bezahlt-am");
const ladungInputs = [0, 1, 2].map(function (i) { return document.getElementById("strom-auto-ladung-" + i); });
const ladungLabels = [0, 1, 2].map(function (i) { return document.getElementById("strom-auto-ladung-label-" + i); });
const vorschau = document.getElementById("strom-auto-vorschau");
const fehler = document.getElementById("strom-auto-fehler");
const rowDeleteBtn = document.getElementById("dialog-strom-auto-row-delete");
const erfassungTeil = document.getElementById("strom-auto-erfassung");
const bestaetigungTeil = document.getElementById("strom-auto-bestaetigung");
const zurueckBtn = document.getElementById("dialog-strom-auto-row-zurueck");
const submitBtn = document.getElementById("dialog-strom-auto-row-submit");

const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const preisFormatter = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const kwhFormatter = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

let editId = null;
// true = Schritt 2 (Bestätigung): Buchungen werden angezeigt, der nächste
// Klick auf "Buchen" legt sie tatsächlich an.
let bestaetigungAktiv = false;

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

// Leeres Feld = nicht erfasst (null), sonst Zahl (Komma oder Punkt).
function parseDezimalOptional(text) {
  const t = String(text).trim();
  if (!t) return null;
  return parseFloat(t.replace(",", "."));
}

function unterkategorieOptionen(selectedId) {
  const state = getState();
  const kategorien = state.kategorien.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  return '<option value="">— bitte wählen —</option>' + kategorien.map(function (k) {
    const unterkategorien = state.unterkategorien
      .filter(function (u) { return u.kategorieId === k.id; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (unterkategorien.length === 0) return "";
    return '<optgroup label="' + escapeHtml(k.name) + '">' +
      unterkategorien.map(function (u) {
        return '<option value="' + u.id + '"' + (u.id === selectedId ? " selected" : "") + ">" + escapeHtml(u.name) + "</option>";
      }).join("") +
      "</optgroup>";
  }).join("");
}

function sortierteQuartale(state) {
  return state.stromAuto.quartale.slice().sort(function (a, b) {
    return (b.jahr * 10 + b.quartal) - (a.jahr * 10 + a.quartal);
  });
}

function render() {
  const state = getState();
  const sa = state.stromAuto;
  ukKraftstoffSelect.innerHTML = unterkategorieOptionen(sa.unterkategorieKraftstoffId);
  ukBetriebskostenSelect.innerHTML = unterkategorieOptionen(sa.unterkategorieBetriebskostenId);

  const quartale = sortierteQuartale(state);
  emptyHint.style.display = quartale.length === 0 ? "block" : "none";
  liste.innerHTML = quartale.map(function (q) {
    const r = berechneQuartal(q);
    const ladung = (q.ladungKwh || []).reduce(function (s, k) { return s + (k || 0); }, 0);
    const sub = r
      ? kwhFormatter.format(q.rechnungKwh) + " kWh à " + preisFormatter.format(r.preisProKwh) + " · Auto " +
        kwhFormatter.format(r.autoKwh) + " kWh = " + betragFormatter.format(r.autoBetrag) +
        " · Betriebskosten " + betragFormatter.format(r.betriebskosten)
      : '<span class="strom-auto-ausstehend">Rechnung ausstehend</span> · Auto ' + kwhFormatter.format(ladung) + " kWh";
    return '<div class="wiederkehrend-row" data-id="' + q.id + '">' +
      '<div class="wiederkehrend-row-info">' +
        '<div class="wiederkehrend-name">' + quartalLabel(q.jahr, q.quartal) + "</div>" +
        '<div class="wiederkehrend-sub">' + sub + "</div>" +
      "</div>" +
      '<div class="wiederkehrend-betrag negative">' + (r ? betragFormatter.format(-q.rechnungBetrag) : "") + "</div>" +
      '<div class="row-actions row-actions-icons">' +
        '<button data-action="edit" data-id="' + q.id + '" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" data-id="' + q.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</div>" +
      "</div>";
  }).join("");

  liste.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener("click", function () { openStromAutoQuartal(btn.dataset.id); });
  });
  liste.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener("click", function () { if (deleteQuartal(btn.dataset.id)) render(); });
  });
}

// Beim ersten Öffnen passende Unterkategorien vorschlagen (falls vorhanden),
// damit die Auswahl meist nur noch bestätigt werden muss.
function unterkategorienVorbelegen() {
  const state = getState();
  const sa = state.stromAuto;
  const kraftstoff = sa.unterkategorieKraftstoffId || findeUnterkategorieNachName(state, ["Kraftstoff", "Treibstoff", "Benzin", "Strom Auto"]);
  const betriebskosten = sa.unterkategorieBetriebskostenId || findeUnterkategorieNachName(state, ["Betriebskosten", "Nebenkosten", "Strom"]);
  if (kraftstoff !== sa.unterkategorieKraftstoffId || betriebskosten !== sa.unterkategorieBetriebskostenId) {
    updateState(function (s) {
      s.stromAuto.unterkategorieKraftstoffId = kraftstoff;
      s.stromAuto.unterkategorieBetriebskostenId = betriebskosten;
    });
  }
}

export function openStromAutoDialog() {
  unterkategorienVorbelegen();
  render();
  dialog.showModal();
}

// Ändert sich eine Unterkategorie, werden die Buchungen ALLER Quartale neu
// erzeugt, damit sie konsistent unter der gewählten Unterkategorie stehen.
function unterkategorieGeaendert() {
  updateState(function (s) {
    s.stromAuto.unterkategorieKraftstoffId = ukKraftstoffSelect.value || null;
    s.stromAuto.unterkategorieBetriebskostenId = ukBetriebskostenSelect.value || null;
    s.stromAuto.quartale.forEach(function (q) { ersetzeBuchungenFuerQuartal(s, q.id, q, uid); });
  });
}
ukKraftstoffSelect.addEventListener("change", unterkategorieGeaendert);
ukBetriebskostenSelect.addEventListener("change", unterkategorieGeaendert);

document.getElementById("btn-open-strom-auto").addEventListener("click", openStromAutoDialog);
document.getElementById("dialog-strom-auto-close").addEventListener("click", function () { dialog.close(); });
document.getElementById("btn-add-strom-auto").addEventListener("click", function () { openRowDialog(null); });

function aktualisiereMonatsLabels() {
  monateVonQuartal(parseInt(quartalSelect.value, 10)).forEach(function (monat, i) {
    ladungLabels[i].textContent = MONATSNAMEN[monat - 1];
  });
}

function quartalAusFormular() {
  return {
    jahr: parseInt(jahrInput.value, 10),
    quartal: parseInt(quartalSelect.value, 10),
    rechnungKwh: parseDezimalOptional(rechnungKwhInput.value),
    rechnungBetrag: parseDezimalOptional(rechnungBetragInput.value),
    bezahltAm: bezahltAmInput.value || null,
    ladungKwh: ladungInputs.map(function (inp) { return parseDezimalOptional(inp.value); })
  };
}

// Live-Vorschau der Buchungen, die beim Speichern entstehen.
function aktualisiereVorschau() {
  aktualisiereMonatsLabels();
  fehler.textContent = "";
  const q = quartalAusFormular();
  if (isNaN(q.jahr)) { vorschau.innerHTML = ""; return; }
  const r = berechneQuartal(q);
  submitBtn.textContent = r ? "Weiter ›" : "Speichern";
  if (!r) {
    vorschau.innerHTML = '<p class="hint">Ohne Rechnung (kWh + Betrag) werden noch keine Buchungen erzeugt — die Ladung kann aber schon erfasst werden.</p>';
    return;
  }
  vorschau.innerHTML = '<p class="hint">Preis ' + preisFormatter.format(r.preisProKwh) + " CHF/kWh · Auto " +
    betragFormatter.format(r.autoBetrag) + " · Betriebskosten " + betragFormatter.format(r.betriebskosten) +
    " — mit „Weiter“ die Buchungen prüfen.</p>";
  if (r.autoKwh > q.rechnungKwh) {
    fehler.textContent = "Achtung: mehr ans Auto geladen (" + kwhFormatter.format(r.autoKwh) + " kWh) als verrechnet — Betriebskosten werden negativ.";
  }
}

[jahrInput, quartalSelect, rechnungKwhInput, rechnungBetragInput].concat(ladungInputs).forEach(function (el) {
  el.addEventListener("input", aktualisiereVorschau);
});

// Schritt 1 (Erfassung) bzw. Schritt 2 (Bestätigung) anzeigen.
function zeigeSchritt(bestaetigung) {
  bestaetigungAktiv = bestaetigung;
  erfassungTeil.hidden = bestaetigung;
  bestaetigungTeil.hidden = !bestaetigung;
  zurueckBtn.hidden = !bestaetigung;
  rowDeleteBtn.hidden = bestaetigung || !editId;
  fehler.textContent = "";
  if (!bestaetigung) aktualisiereVorschau();
  else submitBtn.textContent = "Buchen";
}

// Zeigt exakt die Buchungen, die "Buchen" anlegen wird (gleiche Funktion
// wie beim Anlegen, siehe stromAuto.js), inkl. Hinweis, wie viele bisher
// erzeugte Buchungen dieses Quartals dadurch ersetzt werden.
function renderBestaetigung(data) {
  const state = getState();
  const buchungen = buchungenFuerQuartal(state, data, function () { return ""; });
  const summe = buchungen.reduce(function (s, b) { return s + b.betragChf; }, 0);
  const bisherige = editId
    ? state.realTransaktionen.filter(function (t) { return t.stromAutoQuartalId === editId; }).length
    : 0;
  bestaetigungTeil.innerHTML =
    '<p style="margin:0 0 6px"><strong>Folgende ' + buchungen.length + " Buchungen werden erstellt:</strong></p>" +
    "<table>" +
    buchungen.map(function (b) {
      return "<tr><td>" + formatIsoDate(b.datum) + "</td><td>" + escapeHtml(b.name) +
        '<br><span class="hint">' + escapeHtml(unterkategorieName(state, b.unterkategorieId)) +
        (b.valutadatum !== b.datum ? " · Valuta " + formatIsoDate(b.valutadatum) : "") + "</span></td>" +
        '<td class="' + (b.betragChf >= 0 ? "positive" : "negative") + '">' + betragFormatter.format(b.betragChf) + "</td></tr>";
    }).join("") +
    '<tr class="strom-auto-total"><td></td><td>Total (= Rechnung)</td><td>' + betragFormatter.format(summe) + "</td></tr>" +
    "</table>" +
    (bisherige > 0
      ? '<p class="hint">Ersetzt die ' + bisherige + " bisher für " + quartalLabel(data.jahr, data.quartal) + " erzeugten Buchungen.</p>"
      : "");
}

zurueckBtn.addEventListener("click", function () { zeigeSchritt(false); });

function formatZahl(x) {
  return x == null ? "" : String(x);
}

function openRowDialog(q) {
  editId = q ? q.id : null;
  let jahr, quartal;
  if (q) {
    jahr = q.jahr; quartal = q.quartal;
  } else {
    // Vorschlag: das Quartal vor dem aktuellen (Rechnung trifft im
    // Folgequartal ein), sofern es noch nicht erfasst ist.
    const vq = vorherigesQuartal(quartalVonDatum(todayIso()).jahr, quartalVonDatum(todayIso()).quartal);
    jahr = vq.jahr; quartal = vq.quartal;
  }
  jahrInput.value = jahr;
  quartalSelect.value = String(quartal);
  rechnungKwhInput.value = q ? formatZahl(q.rechnungKwh) : "";
  rechnungBetragInput.value = q ? formatZahl(q.rechnungBetrag) : "";
  bezahltAmInput.value = q && q.bezahltAm ? q.bezahltAm : "";
  ladungInputs.forEach(function (inp, i) { inp.value = q && q.ladungKwh ? formatZahl(q.ladungKwh[i]) : ""; });
  document.getElementById("dialog-strom-auto-row-title").textContent = q
    ? "Stromrechnung " + quartalLabel(q.jahr, q.quartal)
    : "Stromrechnung erfassen";
  zeigeSchritt(false);
  rowDialog.showModal();
}

// Öffnet ein bestehendes Quartal direkt (auch aus der Buchungsliste heraus,
// wenn eine daraus erzeugte Buchung angeklickt wird).
export function openStromAutoQuartal(quartalId) {
  const q = getState().stromAuto.quartale.find(function (x) { return x.id === quartalId; });
  if (q) openRowDialog(q);
}

document.getElementById("dialog-strom-auto-row-cancel").addEventListener("click", function () { rowDialog.close(); });

function deleteQuartal(id) {
  if (!confirm("Dieses Quartal wirklich löschen? Die daraus erzeugten Buchungen werden ebenfalls gelöscht.")) return false;
  updateState(function (s) {
    s.stromAuto.quartale = s.stromAuto.quartale.filter(function (q) { return q.id !== id; });
    ersetzeBuchungenFuerQuartal(s, id, null, uid);
  });
  return true;
}

rowDeleteBtn.addEventListener("click", function () {
  if (!editId) return;
  if (deleteQuartal(editId)) { rowDialog.close(); if (dialog.open) render(); }
});

form.addEventListener("submit", function (e) {
  e.preventDefault();
  const state = getState();
  const data = quartalAusFormular();
  const zahlen = [data.rechnungKwh, data.rechnungBetrag].concat(data.ladungKwh);
  if (isNaN(data.jahr) || zahlen.some(function (z) { return z !== null && (isNaN(z) || z < 0); })) {
    fehler.textContent = "Bitte nur positive Zahlen erfassen.";
    return;
  }
  if ((data.rechnungKwh === null) !== (data.rechnungBetrag === null) || data.rechnungKwh === 0) {
    fehler.textContent = "Rechnung bitte vollständig erfassen (kWh und Betrag) oder ganz leer lassen.";
    return;
  }
  const doppelt = state.stromAuto.quartale.some(function (q) {
    return q.id !== editId && q.jahr === data.jahr && q.quartal === data.quartal;
  });
  if (doppelt) {
    fehler.textContent = quartalLabel(data.jahr, data.quartal) + " ist bereits erfasst.";
    return;
  }
  if (berechneQuartal(data) && (!state.stromAuto.unterkategorieKraftstoffId || !state.stromAuto.unterkategorieBetriebskostenId)) {
    fehler.textContent = "Bitte zuerst im Strom-Auto-Dialog die Unterkategorien für Kraftstoff und Betriebskosten wählen.";
    return;
  }
  // Mit Rechnung zuerst die Buchungen zur Bestätigung zeigen; erst der
  // zweite Klick ("Buchen") speichert und bucht.
  if (berechneQuartal(data) && !bestaetigungAktiv) {
    renderBestaetigung(data);
    zeigeSchritt(true);
    return;
  }

  updateState(function (s) {
    let q;
    if (editId) {
      q = s.stromAuto.quartale.find(function (x) { return x.id === editId; });
      Object.assign(q, data);
    } else {
      q = Object.assign({ id: uid() }, data);
      s.stromAuto.quartale.push(q);
    }
    ersetzeBuchungenFuerQuartal(s, q.id, q, uid);
  });
  rowDialog.close();
  if (dialog.open) render();
});
