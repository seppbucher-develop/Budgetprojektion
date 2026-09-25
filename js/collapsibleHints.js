// Erklärungstexte (<p class="hint collapsible">) analog Flugbuch (siehe
// SectionHeader in dessen service.jsx) standardmässig ausgeblendet, über ein
// kleines Symbol pro Block ein-/ausklappbar — kompaktere Darstellung ohne
// den Fliesstext zu verlieren. Rein statisches Markup (kein Re-Render bei
// State-Änderungen nötig), daher einmalig beim Laden verdrahtet.
document.querySelectorAll(".hint.collapsible").forEach(function (hint) {
  hint.hidden = true;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hint-toggle";
  toggle.textContent = "▸ Erklärung";
  toggle.setAttribute("aria-label", "Erklärung ein-/ausblenden");
  toggle.addEventListener("click", function () {
    hint.hidden = !hint.hidden;
    toggle.textContent = (hint.hidden ? "▸" : "▾") + " Erklärung";
  });
  hint.parentNode.insertBefore(toggle, hint);
});
