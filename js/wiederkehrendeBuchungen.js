// Wiederkehrende Buchungen: Vorlagen, aus denen beim App-Start automatisch
// echte Einnahmen/Ausgaben-Buchungen erzeugt werden (z. B. Miete, Abos),
// siehe wiederkehrendDialog.js für die Verwaltung und app.js für den Aufruf
// beim Start. Einmal erzeugte Buchungen sind danach normale, unabhängige
// Buchungen — Bearbeiten/Löschen einer Regel wirkt sich nur auf künftige
// Erzeugungen aus, nie auf bereits erzeugte Buchungen.
import { todayIso } from "./dateUtils.js?v=46";
import { holeWechselkurs } from "./fx.js?v=46";
import { uid } from "./store.js?v=46";
import { werktagAnpassen } from "./feiertage.js?v=46";

export const RHYTHMEN = ["woechentlich", "monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];

// Verhalten, wenn ein Termin auf ein Wochenende oder einen CH-Feiertag
// fällt: exakt belassen, auf den nächsten (Standard) oder den vorhergehenden
// Werktag verschieben, siehe feiertage.js. Regeln ohne dieses Feld (aus
// früheren Versionen) verhalten sich wie der Standard.
export const WERKTAG_MODI = ["exakt", "naechster", "vorheriger"];
export const STANDARD_WERKTAG_MODUS = "naechster";

const STANDARD_LIMIT = 60;

/** Buchungsdatum eines Termins der Regel (Termin ggf. auf einen Werktag verschoben). */
export function buchungsdatumFuerTermin(regel, termin) {
  return werktagAnpassen(termin, regel.werktagModus || STANDARD_WERKTAG_MODUS);
}

const MONATE_PRO_SCHRITT = { monatlich: 1, quartalsweise: 3, halbjaehrlich: 6, jaehrlich: 12 };

/**
 * `monate` Monate nach `datum`; der Tag wird auf das Monatsende gekappt, falls
 * der Zielmonat kürzer ist (z. B. 31. Januar + 1 Monat -> 28./29. Februar
 * statt eines Überlaufs in den März).
 */
function plusMonate(datum, monate) {
  const teile = datum.split("-").map(Number);
  const jahr = teile[0], monat = teile[1], tag = teile[2];
  const monatIndexGesamt = (monat - 1) + monate;
  const zielJahr = jahr + Math.floor(monatIndexGesamt / 12);
  const zielMonat0 = ((monatIndexGesamt % 12) + 12) % 12; // 0-basiert
  const letzterTagZielmonat = new Date(Date.UTC(zielJahr, zielMonat0 + 1, 0)).getUTCDate();
  const zielTag = Math.min(tag, letzterTagZielmonat);
  return zielJahr + "-" + String(zielMonat0 + 1).padStart(2, "0") + "-" + String(zielTag).padStart(2, "0");
}

/**
 * Der n-te Termin (0 = Startdatum `ab`) im gegebenen Rhythmus. Jeder Termin
 * wird direkt aus `ab` berechnet, nicht aus dem vorherigen: sonst würde ein
 * auf den 28. Februar gekappter Termin dauerhaft auf dem 28. hängen bleiben
 * (31. Januar -> 28. Februar -> 28. März ...) statt im März wieder auf den
 * 31. zu fallen.
 */
export function terminNr(ab, rhythmus, n) {
  if (rhythmus === "woechentlich") {
    const teile = ab.split("-").map(Number);
    const d = new Date(Date.UTC(teile[0], teile[1] - 1, teile[2]));
    d.setUTCDate(d.getUTCDate() + 7 * n);
    return d.toISOString().slice(0, 10);
  }
  return plusMonate(ab, MONATE_PRO_SCHRITT[rhythmus] * n);
}

// Index des letzten Termins, der noch zur letzten Erzeugung gehört (-1, falls
// keiner). Bei
// Rhythmen in Monaten zählt der Kalendermonat (Regeln aus früheren Versionen
// tragen als letzte Erzeugung evtl. ein auf den 28. gedriftetes Datum, das
// kein exakter Termin mehr ist -- sie dürfen den Monat nicht doppelt buchen).
function indexAbTermin(ab, rhythmus, letzteErzeugung) {
  const vergleich = rhythmus === "woechentlich"
    ? function (t) { return t > letzteErzeugung; }
    : function (t) { return t.slice(0, 7) > letzteErzeugung.slice(0, 7); };
  let n = 0;
  while (n < 100000 && !vergleich(terminNr(ab, rhythmus, n))) n++;
  return n - 1; // Index des letzten Termins bis einschliesslich letzte Erzeugung
}

/**
 * Fällige Termine einer Regel bis `bisDatum` (inklusive), beginnend nach
 * der letzten Erzeugung (oder ab deren Startdatum, falls noch nie erzeugt).
 * Die Termine selbst sind die rechnerischen Termine (ohne Werktags-
 * Verschiebung, damit z. B. der 31. nicht durch eine Verschiebung driftet);
 * fällig ist ein Termin, sobald sein Buchungsdatum (siehe
 * buchungsdatumFuerTermin) erreicht ist.
 * `limit` begrenzt die Anzahl in einem Durchgang (Sicherheitsnetz, falls
 * "ab" weit in der Vergangenheit liegt) — `weitereVorhanden` zeigt an, ob
 * danach noch mehr fällig wären. Regeln mit "bis"-Datum erzeugen keine
 * Termine nach diesem Datum.
 */
export function faelligeTermine(regel, bisDatum, limit) {
  const termine = [];
  if (!regel.ab) return { termine: termine, weitereVorhanden: false };
  let n = regel.letzteErzeugung ? indexAbTermin(regel.ab, regel.rhythmus, regel.letzteErzeugung) + 1 : 0;
  // Optionales Enddatum ("bis", inklusive): Termine danach entfallen.
  const istFaellig = function (termin) {
    return (!regel.bis || termin <= regel.bis) && buchungsdatumFuerTermin(regel, termin) <= bisDatum;
  };
  while (istFaellig(terminNr(regel.ab, regel.rhythmus, n)) && termine.length < limit) {
    termine.push(terminNr(regel.ab, regel.rhythmus, n));
    n++;
  }
  return { termine: termine, weitereVorhanden: istFaellig(terminNr(regel.ab, regel.rhythmus, n)) };
}

/**
 * Ermittelt für alle aktiven Regeln (oder nur `optionen.nurRegelIds`, falls
 * gesetzt) die fälligen Buchungen bis heute, inkl. Live-Kursabfrage bei
 * Fremdwährung — verändert den State NICHT, siehe wendeFaelligeBuchungenAn
 * für den synchronen zweiten Schritt (async lässt sich nicht direkt in
 * updateState() verwenden, siehe app.js).
 */
export async function ermittleFaelligeBuchungen(state, optionen) {
  const limit = (optionen && optionen.limit) || STANDARD_LIMIT;
  const nurRegelIds = optionen && optionen.nurRegelIds;
  const heute = todayIso();
  const neueBuchungen = [];
  const regelUpdates = [];
  const unvollstaendig = [];

  for (const regel of state.wiederkehrendeBuchungen) {
    if (!regel.aktiv) continue;
    if (nurRegelIds && nurRegelIds.indexOf(regel.id) === -1) continue;

    const ergebnis = faelligeTermine(regel, heute, limit);
    if (ergebnis.termine.length === 0) continue;

    for (const termin of ergebnis.termine) {
      const buchungsdatum = buchungsdatumFuerTermin(regel, termin);
      let kurs = regel.kurs;
      if (regel.waehrung !== "CHF") {
        const kursErgebnis = await holeWechselkurs(buchungsdatum, regel.waehrung);
        if (kursErgebnis.kurs != null) kurs = kursErgebnis.kurs;
      }
      const betragChf = regel.betrag * kurs;
      neueBuchungen.push({
        id: uid(),
        name: regel.name,
        betrag: regel.betrag,
        waehrung: regel.waehrung,
        kurs: kurs,
        betragChf: regel.vorzeichen === "ausgabe" ? -betragChf : betragChf,
        unterkategorieId: regel.unterkategorieId,
        kategorieId: regel.kategorieId,
        datum: buchungsdatum,
        valutadatum: buchungsdatum,
        erfasstAm: new Date().toISOString(),
        wiederkehrendId: regel.id
      });
    }

    regelUpdates.push({ regelId: regel.id, vorherLetzte: regel.letzteErzeugung || null, letzteErzeugung: ergebnis.termine[ergebnis.termine.length - 1] });
    if (ergebnis.weitereVorhanden) unvollstaendig.push({ regelId: regel.id, name: regel.name });
  }

  return { neueBuchungen: neueBuchungen, regelUpdates: regelUpdates, unvollstaendig: unvollstaendig };
}

/**
 * Wendet ein zuvor per ermittleFaelligeBuchungen berechnetes Ergebnis
 * synchron auf den State an (für updateState()). Weil die Ermittlung async
 * ist (Kursabfragen), kann sich der State dazwischen geändert haben (Regel
 * gelöscht/bearbeitet, andere Registerkarte, früherer Durchgang): Buchungen
 * einer Regel werden nur übernommen, wenn die Regel noch existiert und ihre
 * letzte Erzeugung noch dem Stand der Ermittlung entspricht; bereits
 * vorhandene Buchungen (gleiche Regel + Datum) werden nie doppelt angelegt.
 */
export function wendeFaelligeBuchungenAn(state, ergebnis) {
  const gueltigeRegelIds = new Set();
  ergebnis.regelUpdates.forEach(function (u) {
    const regel = state.wiederkehrendeBuchungen.find(function (r) { return r.id === u.regelId; });
    if (!regel || (regel.letzteErzeugung || null) !== u.vorherLetzte) return;
    regel.letzteErzeugung = u.letzteErzeugung;
    gueltigeRegelIds.add(u.regelId);
  });
  const vorhanden = new Set(state.realTransaktionen
    .filter(function (t) { return t.wiederkehrendId; })
    .map(function (t) { return t.wiederkehrendId + "|" + t.datum; }));
  ergebnis.neueBuchungen.forEach(function (b) {
    if (!gueltigeRegelIds.has(b.wiederkehrendId)) return;
    const schluessel = b.wiederkehrendId + "|" + b.datum;
    if (vorhanden.has(schluessel)) return;
    vorhanden.add(schluessel);
    state.realTransaktionen.push(b);
  });
}
