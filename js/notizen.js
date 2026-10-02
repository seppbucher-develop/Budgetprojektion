// Notizen (Bereich "Service"): einfacher Zeileneditor, in dem jede Zeile
// wahlweise normaler Text oder ein Todo mit Checkbox ist. Gespeichert wird
// als Liste von Zeilen { id, todo, erledigt, text } in state.notizen — damit
// landen die Notizen automatisch im Backup (siehe store.js/backup.js).
import { getState, updateState, onStateChanged, uid } from "./store.js?v=31";

const container = document.getElementById("notizen-editor");
const todoBtn = document.getElementById("notizen-btn-todo");
const aufraeumenBtn = document.getElementById("notizen-btn-aufraeumen");

// Zuletzt fokussierte Zeile (für den Button "☑ Todo"), und die von uns selbst
// zuletzt geschriebene Serialisierung: eigene Änderungen lösen state-changed
// aus, dürfen den Editor aber nicht neu aufbauen (sonst ginge der Fokus
// beim Tippen verloren).
let aktiveId = null;
let zuletztGeschrieben = null;
// Leere Notiz: angezeigt wird eine Platzhalterzeile, die erst beim ersten
// Tippen tatsächlich in den State übernommen wird.
let platzhalter = neueZeile(false);

function zeilen() {
  return getState().notizen;
}

function serialisiere(liste) {
  return JSON.stringify(liste);
}

function neueZeile(todo) {
  return { id: uid(), todo: !!todo, erledigt: false, text: "" };
}

function aendere(mutator) {
  updateState(function (s) {
    if (s.notizen.length === 0) {
      s.notizen.push(platzhalter);
      platzhalter = neueZeile(false);
    }
    mutator(s.notizen);
    // Noch vor dem von updateState() ausgelösten state-changed merken.
    zuletztGeschrieben = serialisiere(s.notizen);
  });
}

function fokussiere(id, ende) {
  const input = container.querySelector('[data-id="' + id + '"] .notizen-text');
  if (!input) return;
  input.focus();
  if (ende) input.setSelectionRange(input.value.length, input.value.length);
}

function render() {
  const liste = zeilen();
  container.innerHTML = "";
  (liste.length ? liste : [platzhalter]).forEach(function (z) {
    const row = document.createElement("div");
    row.className = "notizen-row" + (z.todo && z.erledigt ? " notizen-erledigt" : "");
    row.dataset.id = z.id;

    if (z.todo) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "notizen-check";
      cb.checked = z.erledigt;
      cb.setAttribute("aria-label", "Erledigt");
      cb.addEventListener("change", function () {
        aendere(function (l) { l.find(function (x) { return x.id === z.id; }).erledigt = cb.checked; });
        row.classList.toggle("notizen-erledigt", cb.checked);
      });
      row.appendChild(cb);
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "notizen-text";
    input.value = z.text;
    input.placeholder = liste.length <= 1 ? "Notiz schreiben …" : "";
    input.addEventListener("focus", function () { aktiveId = z.id; });
    input.addEventListener("input", function () {
      aendere(function (l) {
        const ziel = l.find(function (x) { return x.id === z.id; });
        if (ziel) ziel.text = input.value;
      });
    });
    input.addEventListener("keydown", function (e) { tasteInZeile(e, z, input); });
    input.addEventListener("paste", function (e) { einfuegen(e, z, input); });
    row.appendChild(input);
    container.appendChild(row);
  });
}

// Enter: neue Zeile darunter (Todos bleiben Todos); Backspace in leerer
// Zeile: Zeile entfernen bzw. Todo zuerst in normalen Text zurückwandeln.
function tasteInZeile(e, z, input) {
  if (e.key === "Enter") {
    e.preventDefault();
    const neu = neueZeile(z.todo);
    aendere(function (l) {
      l.splice(l.findIndex(function (x) { return x.id === z.id; }) + 1, 0, neu);
    });
    render();
    fokussiere(neu.id, true);
  } else if (e.key === "Backspace" && input.value === "") {
    if (z.todo) {
      e.preventDefault();
      aendere(function (l) {
        const ziel = l.find(function (x) { return x.id === z.id; });
        ziel.todo = false;
        ziel.erledigt = false;
      });
      render();
      fokussiere(z.id, true);
    } else if (zeilen().length > 1) {
      e.preventDefault();
      const vorher = zeilen();
      const index = vorher.findIndex(function (x) { return x.id === z.id; });
      const fokusId = vorher[index > 0 ? index - 1 : 1].id;
      aendere(function (l) { l.splice(index, 1); });
      render();
      fokussiere(fokusId, true);
    }
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    const nachbar = e.key === "ArrowUp" ? input.closest(".notizen-row").previousElementSibling : input.closest(".notizen-row").nextElementSibling;
    if (nachbar) { e.preventDefault(); fokussiere(nachbar.dataset.id, true); }
  }
}

// Mehrzeiliger Text (z. B. aus einer anderen Notiz-App) wird auf mehrere
// Zeilen verteilt, "- [ ] "/"- [x] " am Zeilenanfang ergibt direkt Todos.
function einfuegen(e, z, input) {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (text.indexOf("\n") === -1) return;
  e.preventDefault();
  const teile = text.replace(/\r/g, "").split("\n").filter(function (t, i, arr) { return t !== "" || i < arr.length - 1; });
  const vorne = input.value.slice(0, input.selectionStart);
  const hinten = input.value.slice(input.selectionEnd);
  const neue = teile.map(function (t, i) {
    const k = neueZeile(z.todo);
    const m = /^\s*[-*]\s\[( |x|X)\]\s?(.*)$/.exec(t);
    if (m) { k.todo = true; k.erledigt = m[1] !== " "; k.text = m[2]; } else { k.text = t; }
    if (i === 0) k.text = vorne + k.text;
    if (i === teile.length - 1) k.text += hinten;
    return k;
  });
  aendere(function (l) {
    const index = l.findIndex(function (x) { return x.id === z.id; });
    l.splice.apply(l, [index, 1].concat(neue));
  });
  render();
  fokussiere(neue[neue.length - 1].id, true);
}

todoBtn.addEventListener("click", function () {
  const liste = zeilen();
  const id = liste.some(function (x) { return x.id === aktiveId; }) ? aktiveId : (liste.length ? liste[liste.length - 1].id : null);
  aendere(function (l) {
    const ziel = id ? l.find(function (x) { return x.id === id; }) : l[l.length - 1];
    ziel.todo = !ziel.todo;
    if (!ziel.todo) ziel.erledigt = false;
    aktiveId = ziel.id;
  });
  render();
  fokussiere(aktiveId, true);
});

aufraeumenBtn.addEventListener("click", function () {
  if (!zeilen().some(function (x) { return x.todo && x.erledigt; })) return;
  if (!confirm("Alle erledigten Todos entfernen?")) return;
  aendere(function (l) {
    for (let i = l.length - 1; i >= 0; i--) if (l[i].todo && l[i].erledigt) l.splice(i, 1);
  });
  render();
});

// Fremde Änderungen (Restore, anderer Browser-Tab) übernehmen, eigene nicht.
export function renderNotizen() {
  if (serialisiere(zeilen()) === zuletztGeschrieben) return;
  zuletztGeschrieben = serialisiere(zeilen());
  render();
}

onStateChanged(renderNotizen);
zuletztGeschrieben = serialisiere(zeilen());
render();
