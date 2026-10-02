// Gesamtschweizerische Feiertage und Werktags-Verschiebung für
// wiederkehrende Buchungen (siehe wiederkehrendeBuchungen.js). Berücksichtigt
// werden nur Feiertage, die (fast) überall in der Schweiz gelten: Neujahr,
// Karfreitag, Ostermontag, Auffahrt, Pfingstmontag, 1. August, Weihnachten
// und Stephanstag — kantonale Feiertage (Berchtoldstag, Fronleichnam, ...)
// bleiben bewusst aussen vor.

function isoVon(date) {
  return date.toISOString().slice(0, 10);
}

function plusTage(date, tage) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + tage);
  return d;
}

// Ostersonntag nach dem Anonymen Gregorianischen Algorithmus (Meeus/Jones/Butcher).
function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

const feiertageCache = {};

/** Set mit den ISO-Daten aller gesamtschweizerischen Feiertage eines Jahres. */
export function feiertageCh(jahr) {
  if (!feiertageCache[jahr]) {
    const ostern = ostersonntag(jahr);
    feiertageCache[jahr] = new Set([
      jahr + "-01-01",
      isoVon(plusTage(ostern, -2)),  // Karfreitag
      isoVon(plusTage(ostern, 1)),   // Ostermontag
      isoVon(plusTage(ostern, 39)),  // Auffahrt
      isoVon(plusTage(ostern, 50)),  // Pfingstmontag
      jahr + "-08-01",
      jahr + "-12-25",
      jahr + "-12-26"
    ]);
  }
  return feiertageCache[jahr];
}

export function istWerktag(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const wochentag = d.getUTCDay(); // 0 = Sonntag, 6 = Samstag
  if (wochentag === 0 || wochentag === 6) return false;
  return !feiertageCh(d.getUTCFullYear()).has(iso);
}

/**
 * Verschiebt `iso` gemäss `modus` auf einen Werktag: "exakt" lässt das Datum
 * unverändert, "naechster" nimmt den nächsten und "vorheriger" den
 * vorhergehenden Werktag, falls das Datum auf ein Wochenende oder einen
 * Feiertag fällt (ein Werktag bleibt immer unverändert).
 */
export function werktagAnpassen(iso, modus) {
  if (modus === "exakt" || istWerktag(iso)) return iso;
  const schritt = modus === "vorheriger" ? -1 : 1;
  let d = new Date(iso + "T00:00:00Z");
  do {
    d = plusTage(d, schritt);
  } while (!istWerktag(isoVon(d)));
  return isoVon(d);
}
