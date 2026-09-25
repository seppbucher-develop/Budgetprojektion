// Dialog "Kategorien verwalten" (Budget-Tab): CRUD für Kategorien und deren
// Unterkategorien. Löschen ist blockiert, solange die Kategorie/
// Unterkategorie noch irgendwo referenziert wird (Budget-Posten, reale
// Buchungen, Cashflow-Log) — verhindert verwaiste IDs im Datenbestand.
import { getState, updateState, uid } from "./store.js?v=6";
import { unterkategorienVonKategorie, kategorieWirdVerwendet, unterkategorieWirdVerwendet } from "./kategorien.js?v=6";

const dialog = document.getElementById("dialog-kategorien");
const liste = document.getElementById("kategorien-liste");
const neueKategorieInput = document.getElementById("neue-kategorie-name");

// Welche Kategorien aktuell aufgeklappt sind, plus welche Kategorie/
// Unterkategorie gerade per Inline-Eingabe umbenannt wird.
const aufgeklappt = new Set();
let editKategorieId = null;
let editUnterkategorieId = null;

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function render() {
  const state = getState();
  const kategorien = state.kategorien.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

  liste.innerHTML = kategorien.map(function (k) {
    const offen = aufgeklappt.has(k.id);
    const unterkategorien = unterkategorienVonKategorie(state, k.id).sort(function (a, b) { return a.name.localeCompare(b.name); });

    const kopfzeile = editKategorieId === k.id
      ? '<div class="kategorie-editzeile">' +
          '<input type="text" class="kategorie-umbenennen-input" value="' + escapeHtml(k.name) + '" data-id="' + k.id + '">' +
          '<button type="button" class="btn-secondary" data-action="kategorie-speichern" data-id="' + k.id + '">Speichern</button>' +
          '<button type="button" class="btn-secondary" data-action="kategorie-abbrechen">Abbrechen</button>' +
        "</div>"
      : '<div class="kategorie-kopfzeile">' +
          '<button type="button" class="istkosten-toggle" data-action="toggle" data-id="' + k.id + '">' + (offen ? "▾" : "▸") + "</button>" +
          '<span class="kategorie-name">' + escapeHtml(k.name) + " (" + unterkategorien.length + ")</span>" +
          '<div class="row-actions row-actions-icons">' +
            '<button data-action="kategorie-edit" data-id="' + k.id + '" title="Umbenennen" aria-label="Umbenennen">✎</button>' +
            '<button data-action="kategorie-delete" data-id="' + k.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
          "</div>" +
        "</div>";

    const unterliste = offen
      ? '<div class="unterkategorien-liste">' +
          unterkategorien.map(function (u) {
            return editUnterkategorieId === u.id
              ? '<div class="kategorie-editzeile">' +
                  '<input type="text" class="unterkategorie-umbenennen-input" value="' + escapeHtml(u.name) + '" data-id="' + u.id + '">' +
                  '<button type="button" class="btn-secondary" data-action="unterkategorie-speichern" data-id="' + u.id + '">Speichern</button>' +
                  '<button type="button" class="btn-secondary" data-action="unterkategorie-abbrechen">Abbrechen</button>' +
                "</div>"
              : '<div class="unterkategorie-zeile">' +
                  '<span>' + escapeHtml(u.name) + "</span>" +
                  '<div class="row-actions row-actions-icons">' +
                    '<button data-action="unterkategorie-edit" data-id="' + u.id + '" title="Umbenennen" aria-label="Umbenennen">✎</button>' +
                    '<button data-action="unterkategorie-delete" data-id="' + u.id + '" class="btn-danger-text" title="Löschen" aria-label="Löschen">🗑</button>' +
                  "</div>" +
                "</div>";
          }).join("") +
          '<div class="inline-add">' +
            '<input type="text" class="neue-unterkategorie-input" placeholder="Neue Unterkategorie" data-kategorie="' + k.id + '">' +
            '<button type="button" class="btn-secondary" data-action="unterkategorie-add" data-kategorie="' + k.id + '">Hinzufügen</button>' +
          "</div>" +
        "</div>"
      : "";

    return '<div class="kategorie-block">' + kopfzeile + unterliste + "</div>";
  }).join("");

  if (kategorien.length === 0) {
    liste.innerHTML = '<p class="hint">Noch keine Kategorien vorhanden — oben eine anlegen.</p>';
  }
}

export function openKategorienDialog() {
  editKategorieId = null;
  editUnterkategorieId = null;
  render();
  dialog.showModal();
}

document.getElementById("btn-open-kategorien").addEventListener("click", openKategorienDialog);
document.getElementById("dialog-kategorien-close").addEventListener("click", function () { dialog.close(); });

document.getElementById("btn-add-kategorie").addEventListener("click", function () {
  const name = neueKategorieInput.value.trim();
  if (!name) return;
  updateState(function (s) {
    if (!s.kategorien.some(function (k) { return k.name === name; })) {
      s.kategorien.push({ id: uid(), name: name });
    }
  });
  neueKategorieInput.value = "";
  render();
});

liste.addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const state = getState();

  if (action === "toggle") {
    if (aufgeklappt.has(btn.dataset.id)) aufgeklappt.delete(btn.dataset.id); else aufgeklappt.add(btn.dataset.id);
    render();
  } else if (action === "kategorie-edit") {
    editKategorieId = btn.dataset.id;
    render();
  } else if (action === "kategorie-abbrechen") {
    editKategorieId = null;
    render();
  } else if (action === "kategorie-speichern") {
    const input = liste.querySelector('.kategorie-umbenennen-input[data-id="' + btn.dataset.id + '"]');
    const name = input.value.trim();
    if (name) {
      updateState(function (s) {
        const k = s.kategorien.find(function (k) { return k.id === btn.dataset.id; });
        if (k) k.name = name;
      });
    }
    editKategorieId = null;
    render();
  } else if (action === "kategorie-delete") {
    if (kategorieWirdVerwendet(state, btn.dataset.id)) {
      alert("Diese Kategorie wird noch verwendet (Budget-Posten oder reale Buchungen) und kann nicht gelöscht werden.");
      return;
    }
    if (!confirm("Diese Kategorie wirklich löschen?")) return;
    updateState(function (s) {
      s.unterkategorien = s.unterkategorien.filter(function (u) { return u.kategorieId !== btn.dataset.id; });
      s.kategorien = s.kategorien.filter(function (k) { return k.id !== btn.dataset.id; });
    });
    render();
  } else if (action === "unterkategorie-add") {
    const input = liste.querySelector('.neue-unterkategorie-input[data-kategorie="' + btn.dataset.kategorie + '"]');
    const name = input.value.trim();
    if (!name) return;
    updateState(function (s) {
      if (!s.unterkategorien.some(function (u) { return u.kategorieId === btn.dataset.kategorie && u.name === name; })) {
        s.unterkategorien.push({ id: uid(), kategorieId: btn.dataset.kategorie, name: name });
      }
    });
    render();
  } else if (action === "unterkategorie-edit") {
    editUnterkategorieId = btn.dataset.id;
    render();
  } else if (action === "unterkategorie-abbrechen") {
    editUnterkategorieId = null;
    render();
  } else if (action === "unterkategorie-speichern") {
    const input = liste.querySelector('.unterkategorie-umbenennen-input[data-id="' + btn.dataset.id + '"]');
    const name = input.value.trim();
    if (name) {
      updateState(function (s) {
        const u = s.unterkategorien.find(function (u) { return u.id === btn.dataset.id; });
        if (u) u.name = name;
      });
    }
    editUnterkategorieId = null;
    render();
  } else if (action === "unterkategorie-delete") {
    if (unterkategorieWirdVerwendet(state, btn.dataset.id)) {
      alert("Diese Unterkategorie wird noch verwendet (reale Buchungen) und kann nicht gelöscht werden.");
      return;
    }
    if (!confirm("Diese Unterkategorie wirklich löschen?")) return;
    updateState(function (s) {
      s.unterkategorien = s.unterkategorien.filter(function (u) { return u.id !== btn.dataset.id; });
    });
    render();
  }
});
