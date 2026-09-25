// Hilfsfunktionen rund um Datumswerte. Im Store werden Daten immer als
// ISO-String "YYYY-MM-DD" gespeichert.

export function isoYear(iso) {
  return parseInt(String(iso).slice(0, 4), 10);
}

export function isoToDate(iso) {
  return new Date(iso + "T00:00:00Z");
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Formatiert einen ISO-Zeitstempel (z. B. aus new Date().toISOString())
// wie "22.09.2026, 17:32" für die Anzeige bei Backup/Restore.
export function formatTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatIsoDate(iso) {
  if (!iso) return "";
  const d = isoToDate(iso);
  return d.toLocaleDateString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}
