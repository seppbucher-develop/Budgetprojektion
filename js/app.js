import { onStateChanged } from "./store.js";
import "./importUi.js";
import { renderBudgetTab } from "./budgetTab.js";
import { renderVermoegenTab } from "./vermoegenTab.js";
import { renderProjectionTab } from "./projectionTab.js";
import { renderCompareTab } from "./compareTab.js";
import { renderIstkostenTab } from "./istkostenTab.js";
import { renderBackupTab } from "./backupTab.js";
import { ladeAppVersion } from "./version.js";

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
