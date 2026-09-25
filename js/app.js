import { getState, updateState, onStateChanged } from "./store.js?v=15";
import "./kategorienDialog.js?v=15";
import "./wiederkehrendDialog.js?v=15";
import "./collapsibleHints.js?v=15";
import { renderBudgetTab } from "./budgetTab.js?v=15";
import { renderVermoegenTab } from "./vermoegenTab.js?v=15";
import { renderProjectionTab } from "./projectionTab.js?v=15";
import { renderEinnahmenAusgabenTab } from "./einnahmenAusgabenTab.js?v=15";
import { renderCompareTab } from "./compareTab.js?v=15";
import { renderIstkostenTab } from "./istkostenTab.js?v=15";
import { renderRenditeTab } from "./renditeTab.js?v=15";
import { renderBackupTab } from "./backupTab.js?v=15";
import { ladeAppVersion } from "./version.js?v=15";
import { ermittleFaelligeBuchungen, wendeFaelligeBuchungenAn } from "./wiederkehrendeBuchungen.js?v=15";

const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

function activateTab(name) {
  tabPanels.forEach(function (panel) { panel.classList.toggle("active", panel.id === "tab-" + name); });
  window.scrollTo(0, 0);
  renderAll();
}

// Home-Karten UND "‹ zurück"-Buttons in den einzelnen Bereichen tragen
// beide data-tab (analog Flugbuch: Karten-Startmenü + Zurück-Pfeil je
// Unterseite, hier als eine gemeinsame SPA statt echter Unterseiten).
document.querySelectorAll("[data-tab]").forEach(function (el) {
  el.addEventListener("click", function () { activateTab(el.dataset.tab); });
});

function renderAll() {
  renderBudgetTab();
  renderVermoegenTab();
  renderProjectionTab();
  renderEinnahmenAusgabenTab();
  renderCompareTab();
  renderIstkostenTab();
  renderRenditeTab();
  renderBackupTab();
}

onStateChanged(renderAll);
renderAll();
ladeAppVersion();
pruefeWiederkehrendeBuchungenBeimStart();

// Beim App-Start prüfen, ob wiederkehrende Buchungen (Miete, Abos, ...)
// fällig sind und daraus automatisch echte Buchungen erzeugen, siehe
// wiederkehrendeBuchungen.js. Läuft nach dem ersten Rendern im Hintergrund
// weiter (Kursabfragen bei Fremdwährung sind async); state-changed löst
// danach automatisch ein renderAll() aus.
async function pruefeWiederkehrendeBuchungenBeimStart() {
  if (getState().wiederkehrendeBuchungen.length === 0) return;

  const ergebnis = await ermittleFaelligeBuchungen(getState());
  if (ergebnis.neueBuchungen.length > 0) {
    updateState(function (s) { wendeFaelligeBuchungenAn(s, ergebnis); });
  }

  if (ergebnis.unvollstaendig.length > 0) {
    const namen = ergebnis.unvollstaendig.map(function (u) { return u.name; }).join(", ");
    const weiter = confirm(
      "Für folgende wiederkehrende Buchungen gibt es noch mehr fällige Termine, als auf einmal erzeugt werden (mehr als 60 seit dem Startdatum): " +
      namen + ".\n\nAlle weiteren jetzt ebenfalls erzeugen?"
    );
    if (weiter) {
      const regelIds = ergebnis.unvollstaendig.map(function (u) { return u.regelId; });
      const weitereErgebnis = await ermittleFaelligeBuchungen(getState(), { limit: 100000, nurRegelIds: regelIds });
      updateState(function (s) { wendeFaelligeBuchungenAn(s, weitereErgebnis); });
    }
  }
}
