// Lädt die Versionsnummer aus version.json (siehe scripts/update-version.sh
// und .github/workflows/bump-version.yml) und zeigt sie im Footer an.
// window.APP_VERSION wird zusätzlich im Backup-Dateinamen verwendet
// (siehe backup.js) — Cache-Buster wie bei den Modulen selbst, damit nach
// einem Release nicht die zwischengespeicherte alte Nummer erscheint.
export async function ladeAppVersion() {
  try {
    const res = await fetch("version.json?v=" + Date.now());
    const data = res.ok ? await res.json() : null;
    window.APP_VERSION = data && data.version ? data.version : null;
  } catch (e) {
    window.APP_VERSION = null;
  }
  const el = document.getElementById("version-tag");
  if (el && window.APP_VERSION) el.textContent = window.APP_VERSION;
}
