import { onStateChanged } from "./store.js?v=12";
import "./kategorienDialog.js?v=12";
import "./collapsibleHints.js?v=12";
import { renderBudgetTab } from "./budgetTab.js?v=12";
import { renderVermoegenTab } from "./vermoegenTab.js?v=12";
import { renderProjectionTab } from "./projectionTab.js?v=12";
import { renderEinnahmenAusgabenTab } from "./einnahmenAusgabenTab.js?v=12";
import { renderCompareTab } from "./compareTab.js?v=12";
import { renderIstkostenTab } from "./istkostenTab.js?v=12";
import { renderRenditeTab } from "./renditeTab.js?v=12";
import { renderBackupTab } from "./backupTab.js?v=12";
import { ladeAppVersion } from "./version.js?v=12";

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
