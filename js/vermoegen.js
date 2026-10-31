// Geschäftslogik für Vermögens-Konten (state.vermoegenKonten) und
// -Einträge (state.vermoegenEintraege), siehe vermoegenTab.js für die
// Erfassung. Konten können in Fremdwährung geführt werden (z. B. "Euro",
// "USD"): erfasst wird dann der native Fremdwährungsbetrag
// (eintrag.fremdbetraege[kontoName]), aus dem der CHF-Betrag
// (eintrag.werte[kontoName], wie bisher unverändert für Summe/Rendite/
// Projektion genutzt) beim Erfassen/erstmaligen Speichern EINMALIG mit dem
// dann aktuellen Kurs berechnet wird -- der damalige Kurs bleibt danach
// stehen (nachvollziehbarer historischer Gegenwert), bis er über den Button
// "Währung neu berechnen" (siehe vermoegenTab.js) gezielt aufgefrischt wird.
import { holeWechselkurs } from "./fx.js?v=42";

/**
 * Einmalige, idempotente Migration: vermoegenKonten waren ursprünglich ein
 * einfaches Array von Namen (implizit immer CHF). Neu ist jedes Konto ein
 * Objekt {name, waehrung}, damit Fremdwährungskonten möglich sind.
 */
export function migriereVermoegenKonten(state) {
  let geaendert = false;
  state.vermoegenKonten = state.vermoegenKonten.map(function (k) {
    if (typeof k === "string") {
      geaendert = true;
      return { name: k, waehrung: "CHF" };
    }
    return k;
  });
  return geaendert;
}

export function anlageSpaltenName(kontoName) {
  return kontoName + " Anlage";
}

/**
 * Alle Wert-Spalten der Vermögenstabelle: pro Konto eine Spalte; Konten mit
 * mitAnlage haben zusätzlich die abgeleitete Spalte "<Name> Anlage". In
 * eintrag.werte (und eintrag.fremdbetraege) steht bei solchen Konten unter
 * "<Name>" das Einzelkonto (= Gesamtvermögen - Anlagevermögen) und unter
 * "<Name> Anlage" das Anlagevermögen -- ihre Summe ist das Gesamtvermögen
 * des Instituts, so dass Summe/Rendite/Projektion unverändert funktionieren.
 */
export function vermoegenSpalten(state) {
  const spalten = [];
  state.vermoegenKonten.forEach(function (k) {
    spalten.push(k);
    if (k.mitAnlage) spalten.push({ name: anlageSpaltenName(k.name), waehrung: k.waehrung, anlageVon: k.name });
  });
  return spalten;
}

function fremdwaehrungsKonten(state) {
  return vermoegenSpalten(state).filter(function (k) { return k.waehrung !== "CHF"; });
}

/**
 * Rechnet die übergebenen Fremdwährungsbeträge (eines einzelnen Eintrags)
 * mit dem jeweils aktuellen Kurs in CHF um und schreibt die Ergebnisse in
 * werte -- mutiert werte direkt, gehört darum in den updateState()-Mutator
 * des Aufrufers.
 */
export async function berechneFremdwaehrungBetraege(state, fremdbetraege, werte) {
  const fremdKonten = fremdwaehrungsKonten(state).filter(function (k) { return fremdbetraege[k.name] != null; });
  for (const k of fremdKonten) {
    const ergebnis = await holeWechselkurs(null, k.waehrung);
    if (ergebnis.kurs != null) {
      werte[k.name] = Math.round(fremdbetraege[k.name] * ergebnis.kurs * 100) / 100;
    }
  }
}

/**
 * Button "Währung neu berechnen": frischt die CHF-Beträge der
 * Fremdwährungskonten eines bereits gespeicherten Eintrags mit dem dann
 * aktuellen Kurs auf.
 */
export async function berechneFremdwaehrungEintragNeu(getState, updateState, eintragId) {
  const state = getState();
  const row = state.vermoegenEintraege.find(function (r) { return r.id === eintragId; });
  if (!row || !row.fremdbetraege) return;
  const werte = Object.assign({}, row.werte);
  await berechneFremdwaehrungBetraege(state, row.fremdbetraege, werte);
  updateState(function (s) {
    const r = s.vermoegenEintraege.find(function (x) { return x.id === eintragId; });
    if (r) r.werte = werte;
  });
}

/**
 * Ob ein Eintrag mindestens ein Fremdwährungskonto mit erfasstem Betrag
 * hat -- steuert, ob der Button "Währung neu berechnen" für ihn sinnvoll
 * ist (siehe vermoegenTab.js).
 */
export function hatFremdwaehrungsBetraege(state, row) {
  if (!row.fremdbetraege) return false;
  return fremdwaehrungsKonten(state).some(function (k) { return row.fremdbetraege[k.name] != null; });
}

// ---------------------------------------------------------------------
// TEMPORÄR / EINMALIG: bestehende Paare "<X> Konto" + "<X> Anlagen" in je ein
// Konto "mit Anlagevermögen" überführen. Nach erfolgter Migration samt
// Button (index.html, vermoegenTab.js) wieder entfernen.
// ---------------------------------------------------------------------
export const EINMAL_PAARE = [
  { konto: "yuh Konto", anlagen: "yuh Anlagen" },
  { konto: "EKI Konto", anlagen: "EKI Anlagen" }
];

export function offeneEinmalPaare(state) {
  return EINMAL_PAARE.filter(function (p) {
    const k = state.vermoegenKonten.find(function (x) { return x.name === p.konto; });
    const a = state.vermoegenKonten.find(function (x) { return x.name === p.anlagen; });
    return k && a && k.waehrung === a.waehrung;
  });
}

/**
 * Wendet die Migration auf Kopien an und liefert {konten, eintraege} --
 * oder wirft, wenn sich die Summe eines Stichtags ändern würde. Der Aufrufer
 * übernimmt das Ergebnis erst dann in den State.
 */
export function berechneEinmalMigration(state) {
  const paare = offeneEinmalPaare(state);
  const konten = JSON.parse(JSON.stringify(state.vermoegenKonten));
  const eintraege = JSON.parse(JSON.stringify(state.vermoegenEintraege));
  const summe = function (m) { return Object.values(m || {}).reduce(function (s, v) { return s + (Number(v) || 0); }, 0); };
  const vorher = state.vermoegenEintraege.map(function (r) { return summe(r.werte); });
  paare.forEach(function (p) {
    const k = konten.find(function (x) { return x.name === p.konto; });
    k.mitAnlage = true;
    const ziel = anlageSpaltenName(p.konto);
    eintraege.forEach(function (r) {
      [r.werte, r.fremdbetraege].forEach(function (m) {
        if (m && m[p.anlagen] != null) { m[ziel] = (m[ziel] || 0) + m[p.anlagen]; }
        if (m) delete m[p.anlagen];
      });
    });
    konten.splice(konten.findIndex(function (x) { return x.name === p.anlagen; }), 1);
  });
  eintraege.forEach(function (r, i) {
    if (Math.abs(summe(r.werte) - vorher[i]) > 0.005) throw new Error("Summe von Stichtag " + r.datum + " würde sich ändern -- abgebrochen.");
  });
  return { konten: konten, eintraege: eintraege, paare: paare };
}
