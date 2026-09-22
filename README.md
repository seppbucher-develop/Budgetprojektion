# Budgetprojektion

Eine rein clientseitige Webapp (kein Backend, keine Datenübertragung) für die
persönliche Finanzplanung:

- **Budget** – Kosten und Erträge pro Jahr, pro Posten (z. B. Auto, Wohnen,
  AHV/PK). Jeder Posten gilt entweder *wiederkehrend* ab einem Datum (bis zur
  nächsten Änderung derselben Kategorie) oder *einmalig* nur in seinem Jahr
  (z. B. eine Anschaffung).
- **Vermögen** – Kontostände zu einem oder mehreren Stichtagen.
- **Projektion** – 30-Jahres-Hochrechnung des Vermögens auf Basis von
  Erträgen (real, falls Transaktionen vorhanden, sonst budgetiert),
  budgetierten Kosten, Rendite- und Inflationsannahmen.
- **Realvergleich** – reale Kosten aus einem Bluecoins-CSV-Export mit dem
  Budget vergleichen (Tabelle + Diagramm) und automatisch erkannte
  Einsparungsmöglichkeiten bzw. Budgetreserven anzeigen.

## Nutzung

Keine Build-Schritte nötig. Lokal servieren, z. B.:

```bash
python3 -m http.server 8000
```

und dann `http://localhost:8000` öffnen (ein direktes Öffnen der
`index.html` per `file://` funktioniert wegen der ES-Module nicht in allen
Browsern zuverlässig).

Alle Daten (Budget, Vermögen, importierte Transaktionen, Einstellungen)
werden ausschliesslich im `localStorage` des Browsers gespeichert.

### Als App aufs Handy

Die App ist als PWA installierbar: auf Android/Chrome über „Zum
Startbildschirm hinzufügen“ (nutzt `manifest.json`), auf iOS/Safari über
„Zum Home-Bildschirm“ (nutzt `icons/apple-touch-icon.png` +
`apple-mobile-web-app-*`-Meta-Tags in `index.html`). Erscheint dort mit dem
Label „Budget“ und öffnet ohne Browser-Chrome (`display: standalone`). Das
Icon (Note + Münzen) liegt als Vektorquelle unter `icons/icon.svg` bzw.
`icons/icon-maskable.svg`; alle PNG-Grössen sind daraus gerendert.

### Budget & Vermögen importieren

Im Tab „Budget“ kann einmalig eine `Budget_Pension.xlsx`-Datei importiert
werden (Tab „Budget“ mit Spalten *Posten*, *Budget*, *ab*; Tab „Vermögen“
mit Spalte *Datum* und beliebig vielen Kontospalten). Der xlsx-Reader ist
selbst geschrieben (kein externer Netzwerk-Dependency) und liest die Datei
direkt im Browser. Nach dem Import werden beide Tabs vollständig in der App
gepflegt (Posten/Stichtage hinzufügen, bearbeiten, löschen); ein erneuter
Excel-Import ist jederzeit möglich, überschreibt aber die aktuellen Daten.

### Reale Kosten importieren

Im Tab „Realvergleich“ kann wiederholt eine Transaktions-CSV aus
`bluecoins/reports` importiert werden. Jeder Import ersetzt sämtliche
zuvor importierten Buchungen vollständig (kein Zusammenführen), damit die
Daten immer dem aktuellen Export entsprechen.

### Backup & Restore

Im Tab „Sicherung“ lässt sich der gesamte App-Zustand (Budget, Vermögen,
importierte Transaktionen, Einstellungen) als Datei sichern und wieder
einspielen — z. B. vor grösseren Änderungen oder zum Übertragen auf ein
anderes Gerät. Das Backup sichert generisch jeden `localStorage`-Schlüssel
der App (Präfix `budgetprojektion.`), neue Daten werden also automatisch
mitgesichert. Der Dateiname enthält App-Version und Datum
(`budgetprojektion-backup-v0.1.0-2026-09-22.json.gz`, bei fehlender
gzip-Unterstützung unkomprimiert als `.json`). Ein roter Punkt am Tab zeigt
ungesicherte Änderungen seit dem letzten Backup an.

Ein Restore ersetzt alle aktuellen Daten vollständig durch den Inhalt der
Backup-Datei (nach Bestätigung).

**Backup-Ordner (automatisch, nur Chrome/Edge Desktop):** Über die File
System Access API lässt sich einmalig ein lokaler Ordner festlegen (z. B.
ein Cloud-Sync-Ordner) — künftige Backups landen danach automatisch dort,
ganz ohne Dialog. Der Ordner wird (getrennt von den App-Daten) in einer
eigenen IndexedDB-Datenbank gemerkt, gilt nur für diesen Browser auf diesem
Gerät und zeigt vorhandene Backups im Ordner direkt zum Wiederherstellen an.
Auf Browsern ohne diese API (Safari, Firefox, alle mobilen Browser) bleibt
es beim Teilen-/Download-Weg oben.

## Versionierung

Die Version der App wird aus Git-Tags abgeleitet und in `version.json`
festgehalten (es gibt keinen Build-Server, der das für die App selbst
automatisch könnte). Sie erscheint im Footer sowie im Dateinamen jedes
Backups (Tab „Sicherung“).

**Patch-Version (v0.1.0 → v0.1.1 → v0.1.2 → …): automatisch.** Der
GitHub-Actions-Workflow `.github/workflows/bump-version.yml` läuft nach
jedem Push auf `master` (z. B. jedem PR-Merge), zählt die Patch-Stelle des
letzten Tags eins hoch, committet die neue `version.json` und setzt den
passenden Tag — ganz ohne manuellen Schritt.

**Minor/Major-Version (z. B. v0.2.0 oder v1.0.0): manuell**, wenn ein
größerer Sprung gewünscht ist. Der nächste automatische Patch-Bump zählt
danach ab diesem neuen Tag weiter:

```sh
git tag v1.0.0
./scripts/update-version.sh
git add version.json
git commit -m "Version v1.0.0"
git push && git push --tags
```

Der Workflow braucht Schreibrechte für den `GITHUB_TOKEN` (Repo-Einstellung
**Settings → Actions → General → Workflow permissions → "Read and write
permissions"**) sowie einen `master`, der direkte Pushes von GitHub Actions
zulässt (keine Branch-Protection-Regel, die das verhindert).

## Struktur

- `index.html` – Tabs, Formulare, Dialoge
- `css/style.css` – Styling (hell/dunkel via `prefers-color-scheme`)
- `js/store.js` – zentraler Zustand inkl. `localStorage`-Persistenz
- `js/dateUtils.js` – Datumshilfsfunktionen (u. a. Excel-Serial-Daten)
- `js/xlsxReader.js` – minimaler, abhängigkeitsfreier xlsx-Reader (ZIP + XML)
- `js/importXlsx.js` – einmaliger Import aus der Excel-Datei
- `js/importCsv.js` – wiederholbarer Import der Bluecoins-CSV
- `js/budgetTab.js`, `js/vermoegenTab.js` – CRUD-UI für Budget/Vermögen
- `js/projection.js`, `js/projectionTab.js` – 30-Jahres-Projektion
- `js/compare.js`, `js/compareTab.js` – Abweichungsanalyse & Sparpotenzial
- `js/charts.js` – Canvas-Diagramme (Linien-/Balkendiagramm)
- `js/backup.js`, `js/backupTab.js` – Backup & Restore
- `js/fsapiHandle.js` – IndexedDB-Ablage für den gewählten Backup-Ordner (File System Access API)
- `js/version.js` – lädt `version.json` und zeigt sie im Footer an
- `js/app.js` – Tab-Navigation und Bootstrap
- `version.json` – aktuelle Versionsnummer (siehe Abschnitt Versionierung)
- `scripts/update-version.sh` – schreibt den aktuellen Git-Tag nach `version.json`
- `.github/workflows/bump-version.yml` – zählt die Patch-Version bei jedem Push auf `master` automatisch hoch
- `manifest.json`, `icons/` – App-Icon & PWA-Installierbarkeit (siehe Abschnitt „Als App aufs Handy“)
