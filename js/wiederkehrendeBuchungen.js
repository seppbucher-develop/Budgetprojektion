// Wiederkehrende Buchungen: Vorlagen, aus denen beim App-Start automatisch
// echte Einnahmen/Ausgaben-Buchungen erzeugt werden (z. B. Miete, Abos),
// siehe wiederkehrendDialog.js für die Verwaltung und app.js für den Aufruf
// beim Start. Einmal erzeugte Buchungen sind danach normale, unabhängige
// Buchungen — Bearbeiten/Löschen einer Regel wirkt sich nur auf künftige
// Erzeugungen aus, nie auf bereits erzeugte Buchungen.
import { todayIso } from "./dateUtils.js?v=15";
import { holeWechselkurs } from "./fx.js?v=15";
import { uid } from "./store.js?v=15";

export const RHYTHMEN = ["woechentlich", "monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];

const STANDARD_LIMIT = 60;

/**
 * Nächster Termin nach `datum` im gegebenen Rhythmus. Bei monatsbasierten
 * Rhythmen (alles ausser wöchentlich) wird der Tag auf das Monatsende
 * gekappt, falls der Zielmonat kürzer ist (z. B. 31. Januar + monatlich ->
 * 28./29. Februar statt eines Überlaufs in den März).
 */
export function naechsterTermin(datum, rhythmus) {
  const teile = datum.split("-").map(Number);
  const jahr = teile[0], monat = teile[1], tag = teile[2];

  if (rhythmus === "woechentlich") {
    const d = new Date(Date.UTC(jahr, monat - 1, tag));
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  const monateProSchritt = { monatlich: 1, quartalsweise: 3, halbjaehrlich: 6, jaehrlich: 12 }[rhythmus];
  const monatIndexGesamt = (monat - 1) + monateProSchritt;
  const zielJahr = jahr + Math.floor(monatIndexGesamt / 12);
  const zielMonat0 = ((monatIndexGesamt % 12) + 12) % 12; // 0-basiert
  const letzterTagZielmonat = new Date(Date.UTC(zielJahr, zielMonat0 + 1, 0)).getUTCDate();
  const zielTag = Math.min(tag, letzterTagZielmonat);
  return zielJahr + "-" + String(zielMonat0 + 1).padStart(2, "0") + "-" + String(zielTag).padStart(2, "0");
}

/**
 * Fällige Termine einer Regel bis `bisDatum` (inklusive), beginnend nach
 * der letzten Erzeugung (oder ab deren Startdatum, falls noch nie erzeugt).
 * `limit` begrenzt die Anzahl in einem Durchgang (Sicherheitsnetz, falls
 * "ab" weit in der Vergangenheit liegt) — `weitereVorhanden` zeigt an, ob
 * danach noch mehr fällig wären.
 */
export function faelligeTermine(regel, bisDatum, limit) {
  const termine = [];
  let naechster = regel.letzteErzeugung ? naechsterTermin(regel.letzteErzeugung, regel.rhythmus) : regel.ab;
  while (naechster <= bisDatum && termine.length < limit) {
    termine.push(naechster);
    naechster = naechsterTermin(naechster, regel.rhythmus);
  }
  return { termine: termine, weitereVorhanden: naechster <= bisDatum };
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
      let kurs = regel.kurs;
      if (regel.waehrung !== "CHF") {
        const kursErgebnis = await holeWechselkurs(termin, regel.waehrung);
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
        datum: termin,
        valutadatum: termin,
        erfasstAm: new Date().toISOString(),
        wiederkehrendId: regel.id
      });
    }

    regelUpdates.push({ regelId: regel.id, letzteErzeugung: ergebnis.termine[ergebnis.termine.length - 1] });
    if (ergebnis.weitereVorhanden) unvollstaendig.push({ regelId: regel.id, name: regel.name });
  }

  return { neueBuchungen: neueBuchungen, regelUpdates: regelUpdates, unvollstaendig: unvollstaendig };
}

/**
 * Wendet ein zuvor per ermittleFaelligeBuchungen berechnetes Ergebnis
 * synchron auf den State an (für updateState()).
 */
export function wendeFaelligeBuchungenAn(state, ergebnis) {
  state.realTransaktionen.push.apply(state.realTransaktionen, ergebnis.neueBuchungen);
  ergebnis.regelUpdates.forEach(function (u) {
    const regel = state.wiederkehrendeBuchungen.find(function (r) { return r.id === u.regelId; });
    if (regel) regel.letzteErzeugung = u.letzteErzeugung;
  });
}
