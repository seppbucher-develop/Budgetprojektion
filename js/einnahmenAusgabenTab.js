import { getState, updateState, uid } from "./store.js?v=13";
import { isoYear, formatIsoDate, todayIso } from "./dateUtils.js?v=13";
import { betragFormatter } from "./charts.js?v=13";
import { unterkategorieName } from "./kategorien.js?v=13";
import { vorlagenFuerBezeichnung } from "./transaktionen.js?v=13";
import { holeWechselkurs } from "./fx.js?v=13";

const emptyHint = document.getElementById("buchungen-empty-hint");
const table = document.getElementById("buchungen-liste-table");
const rowsContainer = document.getElementById("buchungen-liste-rows");
const jahrSelect = document.getElementById("buchungen-jahr-select");
const sucheInput = document.getElementById("buchungen-suche");
const listeHeadrow = document.querySelector("#buchungen-liste-table .buchungen-liste-headrow");
const listeScroll = document.querySelector("#buchungen-liste-table .buchungen-liste-scroll");

const dialog = document.getElementById("dialog-buchung");
const form = document.getElementById("form-buchung");
const bezeichnungInput = document.getElementById("buchung-bezeichnung");
const vorlagenListe = document.getElementById("buchung-vorlagen-liste");
const unterkategorieSelect = document.getElementById("buchung-unterkategorie");
const waehrungSelect = document.getElementById("buchung-waehrung");
const betragInput = document.getElementById("buchung-betrag");
const fremdwaehrungFeld = document.getElementById("buchung-fremdwaehrung-feld");
const fremdwaehrungBetragInput = document.getElementById("buchung-fremdwaehrung-betrag");
const kursFeld = document.getElementById("buchung-kurs-feld");
const kursInput = document.getElementById("buchung-kurs");
const kursStatus = document.getElementById("buchung-kurs-status");

// Erlaubt sowohl "." als auch "," als Dezimaltrennzeichen bei der Eingabe
// (Android zeigt je nach Geräte-/Tastatur-Locale mal das eine, mal das
// andere) -- angezeigt wird dank Textfeldern (statt type="number") überall
// einheitlich mit ".", wie in der Buchungsliste.
function parseDezimal(text) {
  return parseFloat(String(text).trim().replace(",", "."));
}

let editId = null;
let ausgewaehltesJahr = null;
let suchtext = "";
let aktuelleVorschlaege = [];
// Zählt Kurs-Abfragen, damit eine spät eintreffende, inzwischen überholte
// Antwort (z. B. nach schnellem Währungswechsel) das Feld nicht mehr überschreibt.
let kursAnfrageZaehler = 0;

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

// Volltextsuche über Bezeichnung und Betrag (mehrere Zahlendarstellungen,
// damit sowohl "2000" als auch "2000.50" als Suchtext funktionieren). Eine
// aktive Suche durchsucht bewusst alle Jahre statt nur das gewählte, damit
// eine Buchung gefunden werden kann, ohne ihr Jahr zu kennen.
function zeilenGesucht(state, text) {
  const q = text.trim().toLowerCase();
  return state.realTransaktionen
    .filter(function (t) {
      const heuhaufen = [t.name || "", String(t.betrag), String(t.betragChf), betragFormatter.format(t.betrag), betragFormatter.format(t.betragChf)]
        .join(" ").toLowerCase();
      return heuhaufen.indexOf(q) !== -1;
    })
    .sort(function (a, b) {
      if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
      return a.erfasstAm < b.erfasstAm ? 1 : -1;
    });
}

function zeilenGefiltert(state) {
  return suchtext ? zeilenGesucht(state, suchtext) : zeilenFuerJahr(state, ausgewaehltesJahr);
}

export function renderEinnahmenAusgabenTab() {
  const state = getState();
  const hatDaten = state.realTransaktionen.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  table.style.display = hatDaten ? "block" : "none";
  sucheInput.style.display = hatDaten ? "block" : "none";
  if (!hatDaten) { jahrSelect.innerHTML = ""; rowsContainer.innerHTML = ""; return; }

  const jahre = distinctSorted(state.realTransaktionen.map(function (t) { return isoYear(t.datum); })).reverse();
  if (ausgewaehltesJahr === null || jahre.indexOf(ausgewaehltesJahr) === -1) {
    const heuteJahr = new Date().getFullYear();
    ausgewaehltesJahr = jahre.indexOf(heuteJahr) !== -1 ? heuteJahr : jahre[0];
  }
  jahrSelect.innerHTML = jahre.map(function (j) {
    return '<option value="' + j + '"' + (j === ausgewaehltesJahr ? " selected" : "") + ">" + j + "</option>";
  }).join("");

  renderRows(state);
}

function renderRows(state) {
  const rows = zeilenGefiltert(state);
  rowsContainer.innerHTML = rows.map(function (t) {
    return '<div class="buchungen-liste-row" data-id="' + t.id + '">' +
      "<div>" + formatIsoDate(t.datum) + "</div>" +
      "<div>" + escapeHtml(t.name) + "</div>" +
      "<div>" + escapeHtml(unterkategorieName(state, t.unterkategorieId)) + "</div>" +
      '<div class="' + (t.betragChf >= 0 ? "positive" : "negative") + '">' + betragFormatter.format(t.betragChf) + "</div>" +
      '<div class="row-actions row-actions-icons">' +
        '<button data-action="edit" data-id="' + t.id + '" title="Bearbeiten" aria-label="Bearbeiten">✎</button>' +
        '<button data-action="delete" data-id="' + t.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
      "</div>" +
      "</div>";
  }).join("");

  // Klick auf die Zeile selbst öffnet ebenfalls den Bearbeiten-Dialog (nicht
  // nur der Stift), ausser der Klick trifft eine der Aktions-Schaltflächen
  // (die haben ihr eigenes Verhalten, siehe unten).
  rowsContainer.querySelectorAll(".buchungen-liste-row").forEach(function (rowEl) {
    rowEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-action]")) return;
      openDialog(rows.find(function (t) { return t.id === rowEl.dataset.id; }));
    });
  });
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

sucheInput.addEventListener("input", function () {
  suchtext = sucheInput.value;
  renderRows(getState());
});

// Kopfzeile ist sticky (bleibt beim vertikalen Scrollen stehen) und hat
// darum zwangsläufig einen eigenen horizontalen Scroll-Container statt des
// gemeinsamen mit den Zeilen -- Position hier synchron halten, damit die
// Spalten auf schmalen Bildschirmen (horizontaler Scroll nötig) weiterhin
// zur Kopfzeile passen.
let syncSperre = false;
listeScroll.addEventListener("scroll", function () {
  if (syncSperre) return;
  syncSperre = true;
  listeHeadrow.scrollLeft = listeScroll.scrollLeft;
  syncSperre = false;
});
listeHeadrow.addEventListener("scroll", function () {
  if (syncSperre) return;
  syncSperre = true;
  listeScroll.scrollLeft = listeHeadrow.scrollLeft;
  syncSperre = false;
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
  form.datum.value = row ? row.datum : todayIso();
  form.valutadatum.value = row ? row.valutadatum : todayIso();
  waehrungSelect.value = row ? row.waehrung : "CHF";
  kursInput.value = row ? row.kurs : 1;
  fremdwaehrungBetragInput.value = row ? row.betrag : "";
  betragInput.value = row
    ? (row.waehrung === "CHF" ? row.betrag : Math.abs(row.betragChf).toFixed(2))
    : "";
  kursStatus.textContent = "";
  aktualisiereWaehrungsFelder();
  document.getElementById("dialog-buchung-title").textContent = row ? "Buchung bearbeiten" : "Neue Buchung";
  vorlagenListe.hidden = true;
  dialog.showModal();
}

// CHF: Betrag direkt editierbar (kein Kurs nötig, Fremdwährungsfeld
// unnötig). Fremdwährung: Betrag (CHF) wird aus Fremdwährungsbetrag × Kurs
// berechnet und ist darum gesperrt -- editiert werden stattdessen der
// Fremdwährungsbetrag und der Kurs (Vorschlag kommt automatisch aus dem
// Internet, siehe ladeKursVorschlag, bleibt aber manuell übersteuerbar).
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

// Betrag (CHF) live aus Fremdwährungsbetrag × Kurs berechnen (nur bei
// Fremdwährung -- bei CHF bleibt das Feld frei editierbar).
function aktualisiereBetragAusFremdwaehrung() {
  if (waehrungSelect.value === "CHF") return;
  const fremdwaehrungsbetrag = parseDezimal(fremdwaehrungBetragInput.value);
  const kurs = parseDezimal(kursInput.value);
  betragInput.value = (!isNaN(fremdwaehrungsbetrag) && !isNaN(kurs))
    ? (fremdwaehrungsbetrag * kurs).toFixed(2)
    : "";
}

// Kurs automatisch aus dem Internet nachladen (Frankfurter API, siehe
// fx.js), sobald Fremdwährung und Valutadatum bekannt sind. Liegt das
// Valutadatum in der Zukunft (oder ist heute), wird der aktuelle Kurs
// verwendet (die API kennt keine Zukunftskurse). Schlägt die Abfrage fehl
// (kein Netz, ...), bleibt der zuletzt eingetragene Kurs stehen und ein
// Hinweis erscheint.
async function ladeKursVorschlag() {
  const waehrung = waehrungSelect.value;
  const datum = form.valutadatum.value;
  aktualisiereWaehrungsFelder();
  if (waehrung === "CHF") return;

  const anfrageId = ++kursAnfrageZaehler;
  kursStatus.textContent = "Kurs wird geladen …";
  const ergebnis = await holeWechselkurs(datum, waehrung);
  if (anfrageId !== kursAnfrageZaehler) return; // überholt durch neuere Anfrage
  if (ergebnis.kurs != null) {
    kursInput.value = ergebnis.kurs;
    kursStatus.textContent = ergebnis.aktuell
      ? "Aktueller Kurs übernommen (Frankfurter API)."
      : "Kurs vom " + formatIsoDate(ergebnis.datum) + " übernommen (Frankfurter API).";
  } else {
    kursStatus.textContent = "Kurs konnte nicht automatisch geladen werden — bitte manuell erfassen.";
  }
  aktualisiereBetragAusFremdwaehrung();
}

waehrungSelect.addEventListener("change", ladeKursVorschlag);
form.valutadatum.addEventListener("change", ladeKursVorschlag);
fremdwaehrungBetragInput.addEventListener("input", aktualisiereBetragAusFremdwaehrung);
kursInput.addEventListener("input", aktualisiereBetragAusFremdwaehrung);

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
      '<span class="' + (v.betragChf >= 0 ? "positive" : "negative") + '">' + betragFormatter.format(v.betragChf) + "</span>" +
      "</button>";
  }).join("");
  vorlagenListe.hidden = false;
});

// Wird eine Vorlage gewählt, übernimmt der Dialog Unterkategorie, Betrag,
// Vorzeichen und Währung der gewählten Buchung — der Kurs aber NICHT den
// damaligen (Vorlage kann alt sein): stattdessen wird der aktuelle Kurs neu
// nachgeladen, siehe ladeKursVorschlag.
let vorlageUebernommen = false;

function vorlageWaehlen(id) {
  const vorlage = aktuelleVorschlaege.find(function (v) { return v.id === id; });
  if (!vorlage) return;
  bezeichnungInput.value = vorlage.name;
  fillUnterkategorieSelect(vorlage.unterkategorieId);
  form.vorzeichen.value = vorlage.betragChf >= 0 ? "einnahme" : "ausgabe";
  waehrungSelect.value = vorlage.waehrung;
  if (vorlage.waehrung === "CHF") {
    betragInput.value = vorlage.betrag;
  } else {
    fremdwaehrungBetragInput.value = vorlage.betrag;
  }
  vorlagenListe.hidden = true;
  ladeKursVorschlag();
}

// Absichtlich zusätzlich auf "pointerdown" (nicht nur "click"): ein Tap auf
// den Vorschlag lässt das Bezeichnungsfeld zuerst den Fokus verlieren
// (blur), bevor "click" feuert. Auf Android/Chrome kann dieses blur ein
// zusätzliches, vom Tastatur-IME ausgelöstes "input"-Event auf dem
// Bezeichnungsfeld nach sich ziehen, das die Vorschlagsliste
// (aktuelleVorschlaege + ihr DOM) neu aufbaut, bevor der "click" verarbeitet
// wird — mit dem Ergebnis, dass nur ein Teil der Felder übernommen wird.
// preventDefault() auf "pointerdown" verhindert den Fokuswechsel überhaupt,
// bevor die Auswahl hier synchron und vollständig verarbeitet ist. "click"
// bleibt zusätzlich bestehen für Tastatur-Bedienung (Enter/Space auf einem
// per Tab fokussierten Vorschlag), wo kein pointerdown vorausgeht.
vorlagenListe.addEventListener("pointerdown", function (e) {
  const btn = e.target.closest("[data-id]");
  if (!btn) return;
  e.preventDefault();
  vorlageUebernommen = true;
  vorlageWaehlen(btn.dataset.id);
});

vorlagenListe.addEventListener("click", function (e) {
  const btn = e.target.closest("[data-id]");
  if (!btn) return;
  if (vorlageUebernommen) { vorlageUebernommen = false; return; }
  vorlageWaehlen(btn.dataset.id);
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
  const istChf = waehrungSelect.value === "CHF";
  const kurs = istChf ? 1 : Math.abs(parseDezimal(kursInput.value));
  const betrag = Math.abs(istChf ? parseDezimal(betragInput.value) : parseDezimal(fremdwaehrungBetragInput.value));
  const betragChf = betrag * kurs;
  const data = {
    name: bezeichnungInput.value.trim(),
    betrag: betrag,
    waehrung: waehrungSelect.value,
    kurs: kurs,
    betragChf: form.vorzeichen.value === "ausgabe" ? -betragChf : betragChf,
    unterkategorieId: unterkategorie ? unterkategorie.id : null,
    kategorieId: unterkategorie ? unterkategorie.kategorieId : null,
    datum: form.datum.value,
    valutadatum: form.valutadatum.value
  };
  if (!data.name || isNaN(betrag) || isNaN(kurs) || !data.unterkategorieId || !data.datum || !data.valutadatum) return;

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
