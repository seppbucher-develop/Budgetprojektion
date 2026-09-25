// Wechselkurse für Fremdwährungs-Buchungen: Frankfurter API (Kursdaten der
// Europäischen Zentralbank, kostenlos, ohne API-Key, mit CORS-Freigabe für
// Browser-Aufrufe — siehe README für Alternativen/Hintergrund). Für CHF wird
// nie ein Kurs abgefragt (immer 1). Liefert null, wenn kein Kurs ermittelt
// werden kann (z. B. Datum in der Zukunft, kein Netz) — der Kurs bleibt dann
// manuell erfassbar.
import { todayIso } from "./dateUtils.js?v=7";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

export async function holeWechselkurs(datum, waehrung) {
  if (waehrung === "CHF") return 1;
  if (!datum || datum > todayIso()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, 5000);
    const url = FRANKFURTER_BASE + "/" + datum + "?from=" + encodeURIComponent(waehrung) + "&to=CHF";
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const kurs = data && data.rates && data.rates.CHF;
    return typeof kurs === "number" ? kurs : null;
  } catch (e) {
    return null;
  }
}
