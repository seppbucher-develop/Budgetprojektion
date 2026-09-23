import { onStateChanged } from "./store.js?v=1";
import "./importUi.js?v=1";
import { renderBudgetTab } from "./budgetTab.js?v=1";
import { renderVermoegenTab } from "./vermoegenTab.js?v=1";
import { renderProjectionTab } from "./projectionTab.js?v=1";
import { renderCompareTab } from "./compareTab.js?v=1";
import { renderIstkostenTab } from "./istkostenTab.js?v=1";
import { renderBackupTab } from "./backupTab.js?v=1";
import { ladeAppVersion } from "./version.js?v=1";

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

function activateTab(name) {
  tabButtons.forEach(function (btn) { btn.classList.toggle("active", btn.dataset.tab === name); });
  tabPanels.forEach(function (panel) { panel.classList.toggle("active", panel.id === "tab-" + name); });
  renderAll();
}

tabButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { activateTab(btn.dataset.tab); });
});

function renderAll() {
  renderBudgetTab();
  renderVermoegenTab();
  renderProjectionTab();
  renderCompareTab();
  renderIstkostenTab();
  renderBackupTab();
}

onStateChanged(renderAll);
renderAll();
ladeAppVersion();
