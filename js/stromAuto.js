// Strom Auto: Aufteilung der quartalsweisen Stromrechnung in den Anteil
// fürs Elektroauto (Kraftstoff) und den Rest (Betriebskosten), analog der
// bisherigen Excel-Tabelle "Strom_Auto.xlsx":
//
//   Preis/kWh        = Rechnungsbetrag / verrechnete kWh des Quartals
//   Kraftstoff Monat = geladene kWh (Ladestation) des Monats × Preis/kWh
//   Betriebskosten   = Rechnungsbetrag − Summe Kraftstoff des Quartals
//
// Aus jedem erfassten Quartal (state.stromAuto.quartale) werden normale
// Buchungen in state.realTransaktionen erzeugt (eine Kraftstoff-Buchung je
// Monat mit Ladung, Buchungsdatum letzter Tag des Monats, plus eine
// Betriebskosten-Buchung auf den letzten Tag des abgerechneten Quartals —
// d. h. des Quartals vor dem, in dem die Rechnung eintrifft). Die Buchungen
// tragen stromAutoQuartalId und werden bei jedem Speichern des Quartals
// komplett neu erzeugt; bearbeitet werden sie darum im Strom-Auto-Dialog,
// nicht einzeln (siehe stromAutoDialog.js).

export function defaultStromAuto() {
  return {
    quartale: [],
    unterkategorieKraftstoffId: null,
    unterkategorieBetriebskostenId: null
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function runden2(x) {
  return Math.round(x * 100) / 100;
}

export function quartalLabel(jahr, quartal) {
  return jahr + " Q" + quartal;
}

// Die drei Monate (1-basiert) eines Quartals, z. B. Q2 -> [4, 5, 6].
export function monateVonQuartal(quartal) {
  const erster = (quartal - 1) * 3 + 1;
  return [erster, erster + 1, erster + 2];
}

export function letzterTagDesMonats(jahr, monat) {
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return jahr + "-" + pad2(monat) + "-" + pad2(tag);
}

export function letzterTagDesQuartals(jahr, quartal) {
  return letzterTagDesMonats(jahr, quartal * 3);
}

// Quartal, in dem ein ISO-Datum liegt.
export function quartalVonDatum(iso) {
  const jahr = parseInt(iso.slice(0, 4), 10);
  const monat = parseInt(iso.slice(5, 7), 10);
  return { jahr: jahr, quartal: Math.floor((monat - 1) / 3) + 1 };
}

// Das Quartal vor dem angegebenen (Rechnung trifft typischerweise im
// Folgequartal ein -> Vorschlag im Erfassungsdialog).
export function vorherigesQuartal(jahr, quartal) {
  return quartal === 1 ? { jahr: jahr - 1, quartal: 4 } : { jahr: jahr, quartal: quartal - 1 };
}

/**
 * Berechnet für ein erfasstes Quartal Preis/kWh, die Kraftstoffanteile je
 * Monat und die Betriebskosten. Beträge werden auf Rappen gerundet; die
 * Betriebskosten sind die Differenz zu den GERUNDETEN Kraftstoffbeträgen,
 * damit die Summe aller Buchungen exakt dem Rechnungsbetrag entspricht.
 * Gibt null zurück, solange die Rechnung (kWh + Betrag) noch fehlt.
 */
export function berechneQuartal(q) {
  if (!(q.rechnungKwh > 0) || !(q.rechnungBetrag >= 0)) return null;
  const preisProKwh = q.rechnungBetrag / q.rechnungKwh;
  const monate = monateVonQuartal(q.quartal).map(function (monat, i) {
    const kwh = (q.ladungKwh && q.ladungKwh[i]) || 0;
    return {
      monat: monat,
      datum: letzterTagDesMonats(q.jahr, monat),
      kwh: kwh,
      betrag: runden2(kwh * preisProKwh)
    };
  });
  const autoKwh = monate.reduce(function (s, m) { return s + m.kwh; }, 0);
  const autoBetrag = runden2(monate.reduce(function (s, m) { return s + m.betrag; }, 0));
  return {
    preisProKwh: preisProKwh,
    monate: monate,
    autoKwh: autoKwh,
    autoBetrag: autoBetrag,
    betriebskosten: runden2(q.rechnungBetrag - autoBetrag),
    betriebskostenDatum: letzterTagDesQuartals(q.jahr, q.quartal)
  };
}

/**
 * Erzeugt die Buchungen (Ausgaben, CHF) für ein Quartal. Monate ohne
 * Ladung und eine Betriebskosten-Differenz von 0 ergeben keine Buchung.
 * Valutadatum ist das Zahlungsdatum der Rechnung (falls erfasst), sonst
 * das Buchungsdatum.
 */
export function buchungenFuerQuartal(state, q, uidFn) {
  const r = berechneQuartal(q);
  if (!r) return [];
  const sa = state.stromAuto;
  const jetzt = new Date().toISOString();

  function buchung(name, betrag, unterkategorieId, datum, art) {
    const u = state.unterkategorien.find(function (u) { return u.id === unterkategorieId; });
    return {
      id: uidFn(),
      name: name,
      betrag: Math.abs(betrag),
      waehrung: "CHF",
      kurs: 1,
      // Negative Differenz (mehr geladen als verrechnet) wird zur Einnahme.
      betragChf: -betrag,
      unterkategorieId: u ? u.id : null,
      kategorieId: u ? u.kategorieId : null,
      datum: datum,
      valutadatum: q.bezahltAm || datum,
      erfasstAm: jetzt,
      stromAutoQuartalId: q.id,
      stromAutoArt: art
    };
  }

  const buchungen = [];
  r.monate.forEach(function (m) {
    if (m.betrag === 0) return;
    buchungen.push(buchung(
      "Strom Auto " + q.jahr + "-" + pad2(m.monat) + " (" + m.kwh + " kWh)",
      m.betrag, sa.unterkategorieKraftstoffId, m.datum, "kraftstoff"));
  });
  if (r.betriebskosten !== 0) {
    buchungen.push(buchung(
      "Strom Betriebskosten " + quartalLabel(q.jahr, q.quartal),
      r.betriebskosten, sa.unterkategorieBetriebskostenId, r.betriebskostenDatum, "betriebskosten"));
  }
  return buchungen;
}

/**
 * Ersetzt alle bisher aus einem Quartal erzeugten Buchungen durch neu
 * berechnete (für updateState()). Ohne `q` werden sie nur entfernt.
 */
export function ersetzeBuchungenFuerQuartal(state, quartalId, q, uidFn) {
  state.realTransaktionen = state.realTransaktionen.filter(function (t) { return t.stromAutoQuartalId !== quartalId; });
  if (q) state.realTransaktionen.push.apply(state.realTransaktionen, buchungenFuerQuartal(state, q, uidFn));
}

// Vorschlag für die Unterkategorien beim ersten Öffnen: vorhandene
// Unterkategorie mit passendem Namen (falls es sie gibt).
export function findeUnterkategorieNachName(state, namen) {
  const kleingeschrieben = namen.map(function (n) { return n.toLowerCase(); });
  const u = state.unterkategorien.find(function (u) { return kleingeschrieben.indexOf(u.name.toLowerCase()) !== -1; });
  return u ? u.id : null;
}
