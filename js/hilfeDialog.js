// Hilfe & Dokumentation: Button "?" oben rechts im Bereich "Service" öffnet
// einen Dialog mit der (statisch in index.html hinterlegten) Anleitung.
const dialog = document.getElementById("dialog-hilfe");
const body = dialog.querySelector(".hilfe-body");

document.getElementById("btn-open-hilfe").addEventListener("click", function () {
  const versionEl = document.getElementById("hilfe-version");
  if (versionEl) versionEl.textContent = window.APP_VERSION || "–";
  dialog.showModal();
  body.scrollTop = 0;
});

document.getElementById("dialog-hilfe-close").addEventListener("click", function () { dialog.close(); });

// Klick auf den Hintergrund (::backdrop) schliesst den Dialog. Ein Klick in
// den Innenabstand des Dialogs hat ebenfalls target === dialog, daher
// zusätzlich prüfen, ob er ausserhalb des Dialog-Rechtecks liegt.
dialog.addEventListener("click", function (e) {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  const ausserhalb = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  if (ausserhalb) dialog.close();
});

// Inhaltsverzeichnis: innerhalb des Dialogs scrollen statt die URL (#hash)
// zu ändern, was die Tab-Navigation der SPA nicht stören soll.
dialog.querySelectorAll(".hilfe-toc a").forEach(function (a) {
  a.addEventListener("click", function (e) {
    e.preventDefault();
    const ziel = dialog.querySelector(a.getAttribute("href"));
    if (ziel) body.scrollTo({ top: ziel.offsetTop, behavior: "smooth" });
  });
});
