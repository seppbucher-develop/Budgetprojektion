// Wechselkurse für Fremdwährungs-Buchungen: Frankfurter API (Kursdaten der
// Europäischen Zentralbank, kostenlos, ohne API-Key, mit CORS-Freigabe für
// Browser-Aufrufe — siehe README für Alternativen/Hintergrund). Für CHF wird
// nie ein Kurs abgefragt (immer 1).
import { todayIso } from "./dateUtils.js?v=18";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

/**
 * Liefert {kurs, datum, aktuell} für die gegebene Währung/das gegebene
 * Datum. `datum` im Ergebnis ist das tatsächlich verwendete Datum, `aktuell`
 * ist true, wenn der neueste verfügbare (heutige) Kurs verwendet wurde. Das
 * ist immer dann der Fall, wenn kein Datum, das heutige Datum oder ein
 * Datum in der Zukunft angefragt wird (die API kennt keine Zukunftskurse;
 * der aktuelle Kurs ist dafür die beste verfügbare Näherung). `kurs` ist
 * null, wenn keiner ermittelt werden konnte (kein Netz, kein Kurs für den
 * Tag) — der Kurs bleibt dann manuell erfassbar.
 */
export async function holeWechselkurs(datum, waehrung) {
  const heute = todayIso();
  const istAktuell = !datum || datum >= heute;
  const verwendetesDatum = istAktuell ? heute : datum;
  if (waehrung === "CHF") return { kurs: 1, datum: verwendetesDatum, aktuell: istAktuell };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, 5000);
    const pfad = istAktuell ? "latest" : datum;
    const url = FRANKFURTER_BASE + "/" + pfad + "?from=" + encodeURIComponent(waehrung) + "&to=CHF";
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { kurs: null, datum: verwendetesDatum, aktuell: istAktuell };
    const data = await res.json();
    const kurs = data && data.rates && data.rates.CHF;
    return { kurs: typeof kurs === "number" ? kurs : null, datum: verwendetesDatum, aktuell: istAktuell };
  } catch (e) {
    return { kurs: null, datum: verwendetesDatum, aktuell: istAktuell };
  }
}
