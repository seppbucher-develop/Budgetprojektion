import { onStateChanged } from "./store.js?v=8";
import "./kategorienDialog.js?v=8";
import "./collapsibleHints.js?v=8";
import { renderBudgetTab } from "./budgetTab.js?v=8";
import { renderVermoegenTab } from "./vermoegenTab.js?v=8";
import { renderProjectionTab } from "./projectionTab.js?v=8";
import { renderEinnahmenAusgabenTab } from "./einnahmenAusgabenTab.js?v=8";
import { renderCompareTab } from "./compareTab.js?v=8";
import { renderIstkostenTab } from "./istkostenTab.js?v=8";
import { renderRenditeTab } from "./renditeTab.js?v=8";
import { renderBackupTab } from "./backupTab.js?v=8";
import { ladeAppVersion } from "./version.js?v=8";

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
