// Tests für die reine Rechenlogik (ohne Browser): node --test tests/rechnen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// Minimale Browser-Stubs, damit store.js & Co. importierbar sind.
const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
  key: (i) => Array.from(speicher.keys())[i] ?? null,
  get length() { return speicher.size; }
};
globalThis.window = { addEventListener() {}, crypto: globalThis.crypto };
globalThis.document = { addEventListener() {}, dispatchEvent() {} };

const W = await import("../js/wiederkehrendeBuchungen.js");
const P = await import("../js/projection.js");
const B = await import("../js/backup.js");
const C = await import("../js/compare.js");

test("Monatsregel ab dem 31. fällt nach dem Februar wieder auf den 31.", () => {
  const regel = { ab: "2026-01-31", rhythmus: "monatlich", werktagModus: "exakt", letzteErzeugung: null, aktiv: true };
  const r = W.faelligeTermine(regel, "2026-06-30", 100);
  assert.deepEqual(r.termine, ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
});

test("Altregel mit auf den 28. gedrifteter letzter Erzeugung bucht den März nicht doppelt", () => {
  const regel = { ab: "2026-01-31", rhythmus: "monatlich", werktagModus: "exakt", letzteErzeugung: "2026-03-28" };
  const r = W.faelligeTermine(regel, "2026-05-31", 100);
  assert.deepEqual(r.termine, ["2026-04-30", "2026-05-31"]);
});

test("wöchentlich, Limit und weitereVorhanden", () => {
  const regel = { ab: "2026-01-05", rhythmus: "woechentlich", werktagModus: "exakt", letzteErzeugung: null };
  const r = W.faelligeTermine(regel, "2026-02-02", 3);
  assert.deepEqual(r.termine, ["2026-01-05", "2026-01-12", "2026-01-19"]);
  assert.equal(r.weitereVorhanden, true);
  const weiter = W.faelligeTermine({ ...regel, letzteErzeugung: "2026-01-19" }, "2026-02-02", 10);
  assert.deepEqual(weiter.termine, ["2026-01-26", "2026-02-02"]);
});

test("Regel mit bis-Datum erzeugt nichts danach", () => {
  const regel = { ab: "2026-01-15", bis: "2026-03-15", rhythmus: "monatlich", werktagModus: "exakt", letzteErzeugung: null };
  assert.equal(W.faelligeTermine(regel, "2026-12-31", 100).termine.length, 3);
});

test("wendeFaelligeBuchungenAn: veraltetes Ergebnis, gelöschte Regel und Duplikate werden übersprungen", () => {
  const buchung = (id, regelId, datum) => ({ id, wiederkehrendId: regelId, datum });
  const ergebnis = {
    neueBuchungen: [buchung("a", "r1", "2026-01-01"), buchung("b", "r2", "2026-01-01"), buchung("c", "r3", "2026-01-01")],
    regelUpdates: [
      { regelId: "r1", vorherLetzte: null, letzteErzeugung: "2026-01-01" },
      { regelId: "r2", vorherLetzte: null, letzteErzeugung: "2026-01-01" }, // inzwischen geändert
      { regelId: "r3", vorherLetzte: null, letzteErzeugung: "2026-01-01" }  // inzwischen gelöscht
    ]
  };
  const state = {
    wiederkehrendeBuchungen: [{ id: "r1", letzteErzeugung: null }, { id: "r2", letzteErzeugung: "2025-12-01" }],
    realTransaktionen: []
  };
  W.wendeFaelligeBuchungenAn(state, ergebnis);
  assert.deepEqual(state.realTransaktionen.map((t) => t.id), ["a"]);
  assert.equal(state.wiederkehrendeBuchungen[0].letzteErzeugung, "2026-01-01");
  assert.equal(state.wiederkehrendeBuchungen[1].letzteErzeugung, "2025-12-01");
  // zweiter Durchlauf mit demselben Ergebnis: nichts doppelt
  state.wiederkehrendeBuchungen[0].letzteErzeugung = null;
  W.wendeFaelligeBuchungenAn(state, ergebnis);
  assert.equal(state.realTransaktionen.length, 1);
});

test("Restanteil des Stichtag-Jahres", () => {
  assert.ok(Math.abs(P.restanteilDesJahres("2026-11-15") - 46 / 365) < 1e-9);
  assert.equal(P.restanteilDesJahres("2026-12-31"), 0);
  assert.ok(Math.abs(P.restanteilDesJahres("2026-01-01") - 364 / 365) < 1e-9);
  assert.ok(Math.abs(P.restanteilDesJahres("2028-02-29") - (366 - 60) / 366) < 1e-9); // Schaltjahr
});

function projektionsState(datum, summe) {
  const jetzt = new Date().getFullYear();
  return {
    budgetPosten: [{ id: "1", kategorieId: "k", betrag: 20000, ab: (jetzt - 5) + "-01-01", typ: "wiederkehrend" }],
    vermoegenEintraege: [{ datum, werte: { K: summe } }],
    einstellungen: { horizontJahre: 3, renditePct: 2, inflationPct: 0 }
  };
}

test("Projektion: Stichtag im laufenden Jahr rechnet nur den Rest des Jahres", () => {
  const jahr = new Date().getFullYear();
  const p = P.berechneProjektion(projektionsState(jahr + "-11-15", 500000));
  const a = 46 / 365;
  assert.equal(p.jahre[0].jahr, jahr);
  assert.ok(Math.abs(p.jahre[0].anteil - a) < 1e-9);
  assert.ok(Math.abs(p.jahre[0].netto - 20000 * a) < 1e-6);
  const erwartet = 500000 * Math.pow(1.02, a) + 20000 * a;
  assert.ok(Math.abs(p.jahre[0].vermoegenEnde - erwartet) < 1e-6);
  assert.equal(p.jahre[p.jahre.length - 1].jahr, jahr + 2);
  assert.equal(p.jahre[1].anteil, 1);
});

test("Projektion: älterer Stichtag projiziert die Zwischenjahre mit", () => {
  const jahr = new Date().getFullYear();
  const p = P.berechneProjektion(projektionsState((jahr - 2) + "-06-30", 100000));
  assert.equal(p.jahre[0].jahr, jahr - 2);
  assert.ok(p.jahre[0].anteil < 1);
  assert.ok(p.jahre.some((j) => j.jahr === jahr - 1 && j.anteil === 1));
  assert.equal(p.jahre[p.jahre.length - 1].jahr, jahr + 2);
});

test("Projektion: Stichtag 31.12. startet im Folgejahr ohne Teiljahr", () => {
  const jahr = new Date().getFullYear();
  const p = P.berechneProjektion(projektionsState((jahr - 1) + "-12-31", 100000));
  assert.equal(p.jahre[0].jahr, jahr);
  assert.equal(p.jahre[0].anteil, 1);
});

test("Backup-Prüfung", () => {
  const key = "budgetprojektion.state.v2";
  assert.throws(() => B.pruefeBackupDaten(null), /Ungültiges/);
  assert.throws(() => B.pruefeBackupDaten({ entries: [] }), /Ungültiges/);
  assert.throws(() => B.pruefeBackupDaten({ entries: { fremd: "x" } }), /keine Daten/);
  assert.throws(() => B.pruefeBackupDaten({ entries: { [key]: { a: 1 } } }), /kein Text/);
  assert.throws(() => B.pruefeBackupDaten({ entries: { [key]: "{kaputt" } }), /beschädigt/);
  assert.throws(() => B.pruefeBackupDaten({ entries: { [key]: "[]" } }), /beschädigt/);
  const ok = B.pruefeBackupDaten({ entries: { [key]: "{}", fremd: "x", "budgetprojektion.backupmeta.v1": "{}" } });
  assert.deepEqual(ok.map((e) => e[0]).sort(), [key, "budgetprojektion.backupmeta.v1"].sort());
});

test("Verzichtsanalyse: 'bar' nur als ganzes Wort", () => {
  const state = (name) => ({ unterkategorien: [{ id: "u", name }] });
  assert.equal(C.standardVerzichtStufe(state("Bar"), "u"), "verzichtbar");
  assert.equal(C.standardVerzichtStufe(state("Barbezug"), "u"), "flexibel");
  assert.equal(C.standardVerzichtStufe(state("Miete"), "u"), "notwendig");
});
