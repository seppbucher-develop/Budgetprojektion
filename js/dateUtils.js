// Hilfsfunktionen rund um Datumswerte. Im Store werden Daten immer als
// ISO-String "YYYY-MM-DD" gespeichert.

// Excel speichert Datumswerte als fortlaufende Seriennummer ab dem
// 30.12.1899 (inkl. des bekannten 1900-Schaltjahr-Fehlers).
export function excelSerialToIso(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = Tage zwischen 1899-12-30 und 1970-01-01
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

export function isoYear(iso) {
  return parseInt(String(iso).slice(0, 4), 10);
}

export function isoToDate(iso) {
  return new Date(iso + "T00:00:00Z");
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetweenIso(isoA, isoB) {
  const a = isoToDate(isoA).getTime();
  const b = isoToDate(isoB).getTime();
  return Math.abs(Math.round((a - b) / 86400000));
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
