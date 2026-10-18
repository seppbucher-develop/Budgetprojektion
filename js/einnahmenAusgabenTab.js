import { getState, updateState, uid } from "./store.js?v=37";
import { isoYear, formatIsoDate, todayIso } from "./dateUtils.js?v=37";
import { betragFormatter } from "./charts.js?v=37";
import { unterkategorieName, kategorieName } from "./kategorien.js?v=37";
import { vorlagenFuerBezeichnung } from "./transaktionen.js?v=37";
import { holeWechselkurs } from "./fx.js?v=37";
import { openStromAutoQuartal } from "./stromAutoDialog.js?v=37";

const emptyHint = document.getElementById("buchungen-empty-hint");
const table = document.getElementById("buchungen-liste-table");
const rowsContainer = document.getElementById("buchungen-liste-rows");
const jahrSelect = document.getElementById("buchungen-jahr-select");
const sucheInput = document.getElementById("buchungen-suche");
const listeHeadrow = document.querySelector("#buchungen-liste-table .buchungen-liste-headrow");
const listeScroll = document.querySelector("#buchungen-liste-table .buchungen-liste-scroll");

const filterEl = {
  box: document.getElementById("buchungen-filter"),
  badge: document.getElementById("buchungen-filter-badge"),
  kategorie: document.getElementById("filter-kategorie"),
  unterkategorie: document.getElementById("filter-unterkategorie"),
  art: document.getElementById("filter-art"),
  monat: document.getElementById("filter-monat"),
  von: document.getElementById("filter-datum-von"),
  bis: document.getElementById("filter-datum-bis"),
  op: document.getElementById("filter-betrag-op"),
  wert: document.getElementById("filter-betrag-wert"),
  reset: document.getElementById("btn-filter-reset")
};
const trefferHint = document.getElementById("buchungen-treffer-hint");
const ALLE_JAHRE = "alle";

const dialog = document.getElementById("dialog-buchung");
const form = document.getElementById("form-buchung");
const dialogDeleteBtn = document.getElementById("dialog-buchung-delete");
const bezeichnungInput = document.getElementById("buchung-bezeichnung");
const vorlagenListe = document.getElementById("buchung-vorlagen-liste");
const unterkategorieSelect = document.getElementById("buchung-unterkategorie");
const waehrungSelect = document.getElementById("buchung-waehrung");
const betragInput = document.getElementById("buchung-betrag");
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

function sortiere(rows) {
  return rows.sort(function (a, b) {
    if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
    return a.erfasstAm < b.erfasstAm ? 1 : -1;
  });
}

function betragVergleich(op, ist, soll) {
  // Auf Rappen gerundet vergleichen, damit z. B. "= 10.10" nicht an
  // Gleitkomma-Ungenauigkeiten scheitert.
  const a = Math.round(ist * 100);
  const b = Math.round(soll * 100);
  switch (op) {
    case "=": return a === b;
    case "!=": return a !== b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    default: return true;
  }
}

function betragFilterWert() {
  const wert = parseDezimal(filterEl.wert.value);
  return isNaN(wert) ? null : Math.abs(wert);
}

function anzahlAktiveFilter() {
  let n = 0;
  if (filterEl.kategorie.value) n++;
  if (filterEl.unterkategorie.value) n++;
  if (filterEl.art.value) n++;
  if (filterEl.monat.value) n++;
  if (filterEl.von.value) n++;
  if (filterEl.bis.value) n++;
  if (filterEl.op.value && betragFilterWert() !== null) n++;
  return n;
}

// Volltextsuche über Bezeichnung, Kategorie, Unterkategorie und Betrag
// (mehrere Zahlendarstellungen, damit sowohl "2000" als auch "2000.50" als
// Suchtext funktionieren), kombiniert mit den Filtern (UND-verknüpft). Das
// Jahr gilt als Filter, ausser es steht auf "Alle Jahre" -- eine neu
// begonnene Suche schaltet darum automatisch auf alle Jahre um, damit eine
// Buchung gefunden werden kann, ohne ihr Jahr zu kennen.
function zeilenGefiltert(state) {
  const q = suchtext.trim().toLowerCase();
  const monat = filterEl.monat.value ? parseInt(filterEl.monat.value, 10) : null;
  const betragWert = filterEl.op.value ? betragFilterWert() : null;
  return sortiere(state.realTransaktionen.filter(function (t) {
    if (ausgewaehltesJahr !== ALLE_JAHRE && isoYear(t.datum) !== ausgewaehltesJahr) return false;
    if (filterEl.unterkategorie.value && t.unterkategorieId !== filterEl.unterkategorie.value) return false;
    if (filterEl.kategorie.value && t.kategorieId !== filterEl.kategorie.value) return false;
    if (filterEl.art.value === "einnahme" && t.betragChf < 0) return false;
    if (filterEl.art.value === "ausgabe" && t.betragChf >= 0) return false;
    if (monat !== null && parseInt(String(t.datum).slice(5, 7), 10) !== monat) return false;
    if (filterEl.von.value && t.datum < filterEl.von.value) return false;
    if (filterEl.bis.value && t.datum > filterEl.bis.value) return false;
    if (betragWert !== null && !betragVergleich(filterEl.op.value, Math.abs(t.betragChf), betragWert)) return false;
    if (q) {
      const heuhaufen = [t.name || "", kategorieName(state, t.kategorieId) || "", unterkategorieName(state, t.unterkategorieId) || "",
        String(t.betrag), String(t.betragChf), betragFormatter.format(t.betrag), betragFormatter.format(t.betragChf)]
        .join(" ").toLowerCase();
      if (heuhaufen.indexOf(q) === -1) return false;
    }
    return true;
  }));
}

function fillFilterSelects(state) {
  const katAlt = filterEl.kategorie.value;
  const ukAlt = filterEl.unterkategorie.value;
  const kategorien = state.kategorien.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  filterEl.kategorie.innerHTML = '<option value="">Alle Kategorien</option>' + kategorien.map(function (k) {
    return '<option value="' + k.id + '">' + escapeHtml(k.name) + "</option>";
  }).join("");
  if (kategorien.some(function (k) { return k.id === katAlt; })) filterEl.kategorie.value = katAlt;

  const unterkategorien = state.unterkategorien
    .filter(function (u) { return !filterEl.kategorie.value || u.kategorieId === filterEl.kategorie.value; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  filterEl.unterkategorie.innerHTML = '<option value="">Alle Unterkategorien</option>' + unterkategorien.map(function (u) {
    return '<option value="' + u.id + '">' + escapeHtml(u.name) + "</option>";
  }).join("");
  if (unterkategorien.some(function (u) { return u.id === ukAlt; })) filterEl.unterkategorie.value = ukAlt;
}

export function renderEinnahmenAusgabenTab() {
  const state = getState();
  const hatDaten = state.realTransaktionen.length > 0;
  emptyHint.style.display = hatDaten ? "none" : "block";
  table.style.display = hatDaten ? "block" : "none";
  sucheInput.style.display = hatDaten ? "block" : "none";
  filterEl.box.style.display = hatDaten ? "block" : "none";
  if (!hatDaten) { jahrSelect.innerHTML = ""; rowsContainer.innerHTML = ""; trefferHint.textContent = ""; return; }

  const jahre = distinctSorted(state.realTransaktionen.map(function (t) { return isoYear(t.datum); })).reverse();
  if (ausgewaehltesJahr === null || (ausgewaehltesJahr !== ALLE_JAHRE && jahre.indexOf(ausgewaehltesJahr) === -1)) {
    const heuteJahr = new Date().getFullYear();
    ausgewaehltesJahr = jahre.indexOf(heuteJahr) !== -1 ? heuteJahr : jahre[0];
  }
  jahrSelect.innerHTML = '<option value="' + ALLE_JAHRE + '"' + (ausgewaehltesJahr === ALLE_JAHRE ? " selected" : "") + ">Alle Jahre</option>" +
    jahre.map(function (j) {
      return '<option value="' + j + '"' + (j === ausgewaehltesJahr ? " selected" : "") + ">" + j + "</option>";
    }).join("");

  fillFilterSelects(state);
  renderRows(state);
}

function renderRows(state) {
  const rows = zeilenGefiltert(state);
  const aktiv = anzahlAktiveFilter();
  filterEl.badge.hidden = aktiv === 0;
  filterEl.badge.textContent = aktiv;
  const gefiltert = aktiv > 0 || suchtext.trim() !== "";
  const summe = rows.reduce(function (acc, t) { return acc + t.betragChf; }, 0);
  trefferHint.textContent = gefiltert
    ? rows.length + (rows.length === 1 ? " Treffer" : " Treffer") + (rows.length ? " · Summe " + betragFormatter.format(summe) : "")
    : "";
  rowsContainer.innerHTML = rows.map(function (t) {
    return '<div class="buchungen-liste-row" data-id="' + t.id + '">' +
      "<div>" + formatIsoDate(t.datum) + "</div>" +
      "<div>" + (t.stromAutoQuartalId ? "⚡ " : "") + escapeHtml(t.name) + "</div>" +
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
  ausgewaehltesJahr = jahrSelect.value === ALLE_JAHRE ? ALLE_JAHRE : parseInt(jahrSelect.value, 10);
  renderRows(getState());
});

sucheInput.addEventListener("input", function () {
  const warLeer = suchtext.trim() === "";
  suchtext = sucheInput.value;
  if (warLeer && suchtext.trim() !== "" && ausgewaehltesJahr !== ALLE_JAHRE) {
    ausgewaehltesJahr = ALLE_JAHRE;
    jahrSelect.value = ALLE_JAHRE;
  }
  renderRows(getState());
});

filterEl.kategorie.addEventListener("change", function () {
  filterEl.unterkategorie.value = "";
  fillFilterSelects(getState());
  renderRows(getState());
});
[filterEl.unterkategorie, filterEl.art, filterEl.monat, filterEl.von, filterEl.bis, filterEl.op].forEach(function (el) {
  el.addEventListener("change", function () { renderRows(getState()); });
});
filterEl.wert.addEventListener("input", function () { renderRows(getState()); });
filterEl.reset.addEventListener("click", function () {
  [filterEl.kategorie, filterEl.unterkategorie, filterEl.art, filterEl.monat, filterEl.von, filterEl.bis, filterEl.op, filterEl.wert]
    .forEach(function (el) { el.value = ""; });
  fillFilterSelects(getState());
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
  // Aus "Strom Auto" erzeugte Buchungen werden beim Speichern des Quartals
  // neu berechnet -- darum dort bearbeiten statt im normalen Buchungsdialog.
  if (row && row.stromAutoQuartalId) { openStromAutoQuartal(row.stromAutoQuartalId); return; }
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
  dialogDeleteBtn.hidden = !row;
  vorlagenListe.hidden = true;
  dialog.showModal();
  // <dialog> fokussiert ohne [autofocus] sich selbst statt eines Feldes --
  // Bezeichnung ist im Regelfall das erste einzugebende Feld, daher direkt
  // dorthin springen (select() erlaubt beim Bearbeiten sofortiges Überschreiben).
  bezeichnungInput.focus();
  bezeichnungInput.select();
}

// CHF: Betrag direkt editierbar (kein Kurs nötig, Fremdwährungsfeld
// unnötig). Fremdwährung: Betrag (CHF) wird aus Fremdwährungsbetrag × Kurs
// berechnet und ist darum gesperrt -- editiert werden stattdessen der
// Fremdwährungsbetrag und der Kurs (Vorschlag kommt automatisch aus dem
// Internet, siehe ladeKursVorschlag, bleibt aber manuell übersteuerbar).
function aktualisiereWaehrungsFelder() {
  const istChf = waehrungSelect.value === "CHF";
  fremdwaehrungBetragInput.hidden = istChf;
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

// Beim Wechsel auf eine Fremdwährung übernimmt der Fremdwährungsbetrag den
// bisherigen Wert aus dem Betragsfeld (statt leer zu bleiben) -- direkt
// danach berechnet ladeKursVorschlag() den umgerechneten CHF-Betrag daraus
// neu und schreibt ihn ins Betragsfeld zurück.
waehrungSelect.addEventListener("change", function () {
  if (waehrungSelect.value !== "CHF" && betragInput.value !== "") {
    fremdwaehrungBetragInput.value = betragInput.value;
  }
  ladeKursVorschlag();
});
form.valutadatum.addEventListener("change", ladeKursVorschlag);
fremdwaehrungBetragInput.addEventListener("input", aktualisiereBetragAusFremdwaehrung);
kursInput.addEventListener("input", aktualisiereBetragAusFremdwaehrung);

// Klick ins Betragsfeld wählt den bestehenden Betrag aus, damit er sich
// direkt überschreiben lässt (ohne preventDefault auf mouseup würde der
// Klick die Auswahl sofort wieder aufheben und nur den Cursor setzen).
function selectAlleBeiFokus(input) {
  input.addEventListener("focus", function () { input.select(); });
  input.addEventListener("mouseup", function (e) { e.preventDefault(); });
}
selectAlleBeiFokus(betragInput);
selectAlleBeiFokus(fremdwaehrungBetragInput);

function deleteBuchung(id) {
  if (!confirm("Diese Buchung wirklich löschen?")) return false;
  updateState(function (s) {
    s.realTransaktionen = s.realTransaktionen.filter(function (t) { return t.id !== id; });
  });
  return true;
}

document.getElementById("btn-add-buchung").addEventListener("click", function () { openDialog(null); });
document.getElementById("dialog-buchung-cancel").addEventListener("click", function () { dialog.close(); });
dialogDeleteBtn.addEventListener("click", function () {
  if (!editId) return;
  if (deleteBuchung(editId)) dialog.close();
});

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
