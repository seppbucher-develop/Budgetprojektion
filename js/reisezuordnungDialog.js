// Dialog "Flugreisekosten zuordnen": listet Buchungen der Unterkategorie
// "Flugreisen", die nicht eindeutig einer Reise der Flugbuch-Reiseanalyse
// zugeordnet werden konnten (siehe reisezuordnung.js) — ausserhalb jeder
// Reise, in der Pufferzeit davor/danach oder mehrdeutig. Pro Buchung kann
// die Reise gewählt und/oder das Buchungsdatum geändert werden; die
// Datumsänderung gilt direkt für die Buchung im Budget.
import { getState, updateState, onStateChanged } from "./store.js?v=27";
import { formatIsoDate, isoToDate } from "./dateUtils.js?v=27";
import { betragFormatter } from "./charts.js?v=27";
import {
  KEINE_REISE, ladeReisen, offeneBuchungen, pufferEinstellung, wendeAutomatischeZuordnungAn
} from "./reisezuordnung.js?v=27";

const dialog = document.getElementById("dialog-reisezuordnung");
const titel = document.getElementById("dialog-reisezuordnung-title");
const hinweis = document.getElementById("reisezuordnung-hinweis");
const liste = document.getElementById("reisezuordnung-liste");
const pufferVorInput = document.getElementById("reise-puffer-vor");
const pufferNachInput = document.getElementById("reise-puffer-nach");
const oeffnenBtn = document.getElementById("btn-open-reisezuordnung");

const DAY_MS = 24 * 3600 * 1000;
let reisen = [];

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function reiseLabel(r) {
  return r.title + " (" + formatIsoDate(r.startDate) + (r.endDate !== r.startDate ? "–" + formatIsoDate(r.endDate) : "") + ")";
}

// Abstand der Buchung zur Reise in Tagen (0 = innerhalb).
function abstandTage(datum, r) {
  const t = isoToDate(datum).getTime();
  if (t < r.start) return Math.round((r.start - t) / DAY_MS);
  if (t >= r.endExclusive) return Math.round((t - r.endExclusive) / DAY_MS) + 1;
  return 0;
}

function statusText(klasse, buchung) {
  if (klasse.status === "puffer") {
    const d = abstandTage(buchung.datum, klasse.reise);
    const t = isoToDate(buchung.datum).getTime();
    return d + " Tage " + (t < klasse.reise.start ? "vor" : "nach") + " «" + klasse.reise.title + "»";
  }
  if (klasse.status === "mehrdeutig") return "passt zu mehreren Reisen";
  return "keiner Reise zuordenbar";
}

function optionen(buchung, klasse) {
  const sortiert = reisen.slice().sort(function (a, b) {
    return abstandTage(buchung.datum, a) - abstandTage(buchung.datum, b);
  });
  const vorgabe = klasse.status === "puffer" ? klasse.reise.id : "";
  return '<option value="">– Reise wählen –</option>' +
    sortiert.map(function (r) {
      return '<option value="' + escapeHtml(r.id) + '"' + (r.id === vorgabe ? " selected" : "") + ">" + escapeHtml(reiseLabel(r)) + "</option>";
    }).join("") +
    '<option value="' + KEINE_REISE + '">Keine Reisekosten</option>';
}

function render() {
  const state = getState();
  const puffer = pufferEinstellung(state);
  pufferVorInput.value = puffer.vor;
  pufferNachInput.value = puffer.nach;

  const offen = offeneBuchungen(state, reisen);
  titel.textContent = "Flugreisekosten zuordnen (" + offen.length + " offen)";
  oeffnenBtn.textContent = offen.length ? "✈ Flugreisen zuordnen… (" + offen.length + ")" : "✈ Flugreisen zuordnen…";

  if (reisen.length === 0) {
    hinweis.textContent = "Keine Reisen gefunden. Im Flugbuch unter Statistik → Reiseanalyse mit dem Google Kalender synchronisieren, dann hier erneut öffnen.";
    hinweis.hidden = false;
  } else {
    hinweis.hidden = true;
  }

  if (offen.length === 0) {
    liste.innerHTML = '<p class="hint">' + (reisen.length ? "Alle Flugreisekosten sind zugeordnet. ✓" : "") + "</p>";
    return;
  }

  liste.innerHTML = offen.map(function (x) {
    const b = x.buchung;
    return '<div class="reise-zeile" data-id="' + b.id + '">' +
      '<div class="reise-zeile-kopf">' +
        "<strong>" + escapeHtml(b.name) + "</strong>" +
        '<span class="' + (b.betragChf >= 0 ? "positive" : "negative") + '">' + betragFormatter.format(b.betragChf) + "</span>" +
      "</div>" +
      '<div class="hint">' + escapeHtml(statusText(x.klasse, b)) + "</div>" +
      '<div class="reise-zeile-felder">' +
        '<label>Buchungsdatum <input type="date" class="reise-datum" value="' + b.datum + '"></label>' +
        '<label>Reise <select class="reise-select">' + optionen(b, x.klasse) + "</select></label>" +
        '<button type="button" class="btn-primary reise-speichern">Übernehmen</button>' +
      "</div>" +
      "</div>";
  }).join("");
}

liste.addEventListener("click", function (e) {
  const btn = e.target.closest(".reise-speichern");
  if (!btn) return;
  const zeile = btn.closest(".reise-zeile");
  const datum = zeile.querySelector(".reise-datum").value;
  const reiseId = zeile.querySelector(".reise-select").value;
  const id = zeile.dataset.id;
  if (!datum) return;

  updateState(function (s) {
    const b = s.realTransaktionen.find(function (t) { return t.id === id; });
    if (!b) return;
    if (datum !== b.datum) {
      if (!b.datumOriginal) b.datumOriginal = b.datum;
      b.datum = datum;
    }
    if (reiseId) b.reiseId = reiseId;
    // Liegt das (geänderte) Datum jetzt eindeutig in einer Reise, greift die
    // Automatik auch ohne Reisenauswahl.
    wendeAutomatischeZuordnungAn(s, reisen);
  });
  render();
});

function pufferGeaendert() {
  const vor = parseInt(pufferVorInput.value, 10);
  const nach = parseInt(pufferNachInput.value, 10);
  if (!(vor >= 0) || !(nach >= 0)) return;
  updateState(function (s) {
    s.einstellungen.reisePufferVorTage = vor;
    s.einstellungen.reisePufferNachTage = nach;
  });
  render();
}
pufferVorInput.addEventListener("change", pufferGeaendert);
pufferNachInput.addEventListener("change", pufferGeaendert);

oeffnenBtn.addEventListener("click", async function () {
  reisen = await ladeReisen();
  updateState(function (s) { wendeAutomatischeZuordnungAn(s, reisen); });
  render();
  dialog.showModal();
});
document.getElementById("dialog-reisezuordnung-close").addEventListener("click", function () { dialog.close(); });

// Beim Start Reisen laden und eindeutige Fälle (Buchung innerhalb genau
// einer Reise) automatisch zuordnen; danach Zähler am Button aktuell halten.
export async function initReisezuordnung() {
  reisen = await ladeReisen();
  const state = getState();
  if (state.realTransaktionen.length) {
    let n = 0;
    updateState(function (s) { n = wendeAutomatischeZuordnungAn(s, reisen); });
  }
  render();
}

onStateChanged(function () { if (!dialog.open) render(); });
