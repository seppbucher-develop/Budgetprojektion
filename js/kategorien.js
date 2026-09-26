// Stammdaten für Kategorien (z. B. "Wohnen", "Unterhaltung", vormals
// "Kategoriengruppe" in der Bluecoins-CSV) und Unterkategorien (z. B.
// "Miete", "Flugreisen", vormals "Kategorie" in der CSV) mit stabilen IDs
// als Primär-/Fremdschlüssel — Budget-Posten und reale Buchungen
// referenzieren diese IDs statt der Bezeichnung selbst, damit eine spätere
// Umbenennung nicht überall im Datenbestand nachgezogen werden muss.

export function findeOderErstelleKategorie(state, name, uidFn) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  let k = state.kategorien.find(function (k) { return k.name === trimmed; });
  if (!k) {
    k = { id: uidFn(), name: trimmed };
    state.kategorien.push(k);
  }
  return k.id;
}

export function findeOderErstelleUnterkategorie(state, kategorieId, name, uidFn) {
  const trimmed = (name || "").trim();
  if (!trimmed || !kategorieId) return null;
  let u = state.unterkategorien.find(function (u) { return u.kategorieId === kategorieId && u.name === trimmed; });
  if (!u) {
    u = { id: uidFn(), kategorieId: kategorieId, name: trimmed };
    state.unterkategorien.push(u);
  }
  return u.id;
}

export function kategorieName(state, id) {
  const k = state.kategorien.find(function (k) { return k.id === id; });
  return k ? k.name : "";
}

export function unterkategorieName(state, id) {
  const u = state.unterkategorien.find(function (u) { return u.id === id; });
  return u ? u.name : "";
}

export function unterkategorienVonKategorie(state, kategorieId) {
  return state.unterkategorien.filter(function (u) { return u.kategorieId === kategorieId; });
}

export function unterkategorieWirdVerwendet(state, unterkategorieId) {
  return state.realTransaktionen.some(function (t) { return t.unterkategorieId === unterkategorieId; }) ||
    state.wiederkehrendeBuchungen.some(function (r) { return r.unterkategorieId === unterkategorieId; }) ||
    state.stromAuto.unterkategorieKraftstoffId === unterkategorieId ||
    state.stromAuto.unterkategorieBetriebskostenId === unterkategorieId;
}

export function kategorieWirdVerwendet(state, kategorieId) {
  return state.budgetPosten.some(function (r) { return r.kategorieId === kategorieId; }) ||
    state.realTransaktionen.some(function (t) { return t.kategorieId === kategorieId; }) ||
    state.wiederkehrendeBuchungen.some(function (r) { return r.kategorieId === kategorieId; }) ||
    unterkategorienVonKategorie(state, kategorieId).some(function (u) { return unterkategorieWirdVerwendet(state, u.id); });
}

/**
 * Einmalige, idempotente Migration alter Freitext-Felder
 * (budgetPosten[].posten, realTransaktionen[].kategoriengruppe/.kategorie)
 * auf die neuen Kategorie-/Unterkategorie-IDs. Wird beim Laden des States
 * aufgerufen (siehe store.js) und übersprungen, sobald keine Altdaten-Felder
 * mehr vorhanden sind. Gibt zurück, ob etwas migriert wurde (damit store.js
 * das Ergebnis persistieren kann).
 */
export function migriereKategorien(state, uidFn) {
  let migriert = false;

  state.budgetPosten.forEach(function (row) {
    if (row.kategorieId === undefined && row.posten !== undefined) {
      row.kategorieId = findeOderErstelleKategorie(state, row.posten, uidFn);
      delete row.posten;
      migriert = true;
    }
  });

  state.realTransaktionen.forEach(function (t) {
    if (t.kategorieId === undefined && t.kategoriengruppe !== undefined) {
      t.kategorieId = findeOderErstelleKategorie(state, t.kategoriengruppe, uidFn);
      t.unterkategorieId = findeOderErstelleUnterkategorie(state, t.kategorieId, t.kategorie, uidFn);
      delete t.kategoriengruppe;
      delete t.kategorie;
      migriert = true;
    }
  });

  return migriert;
}
