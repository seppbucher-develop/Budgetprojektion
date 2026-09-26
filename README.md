# Budgetprojektion

Eine rein clientseitige Webapp (kein eigenes Backend, keine Datenübertragung
an Server der App-Betreiberin) für die persönliche Finanzplanung. Die
primären Funktionen erscheinen beim Öffnen als Kartenübersicht (analog dem
Schwesterprojekt „Flugbuch“); Sekundäres wie Backup/Restore steckt gesammelt
unter „Service“:

- **Einnahmen/Ausgaben** – alle Buchungen direkt in der App erfassen und
  pflegen (kein CSV-Import mehr), gefiltert nach Jahr (Default: laufendes
  Jahr) oder per Volltextsuche über Bezeichnung/Betrag (durchsucht alle
  Jahre). Jede Buchung trägt drei Daten: das Buchungsdatum (für den
  Budgetvergleich), das Valutadatum (für die Rendite-Analyse) und einen
  automatisch gesetzten Erfassungszeitpunkt. Beim Eintippen der Bezeichnung
  schlägt ein Typeahead passende frühere Buchungen vor (je Bezeichnung die
  jüngste); Auswahl übernimmt Unterkategorie, Betrag, Vorzeichen und
  Währung. Buchungen können in Fremdwährung erfasst werden (Default CHF);
  bei Fremdwährung schlägt die App automatisch den Kurs vor (siehe
  „Wechselkurse“ unten) – zum Valutadatum, oder den aktuellen Kurs, wenn das
  Valutadatum in der Zukunft liegt oder eine Vorlage gewählt wurde (nie den
  ggf. veralteten Kurs der Vorlage selbst) –, bleibt aber jederzeit manuell
  überschreibbar. Über „Wiederkehrend…“ lassen sich zudem Regeln für
  automatisch zu erzeugende Buchungen pflegen (z. B. Miete, Abos): beim
  Öffnen der App prüft sie, ob seit der letzten Erzeugung ein Termin fällig
  geworden ist (wöchentlich/monatlich/quartalsweise/halbjährlich/jährlich),
  und legt dafür je eine normale, unabhängige Buchung an — auch rückwirkend
  für mehrere verpasste Termine, falls die App länger nicht geöffnet war.
  Bearbeiten oder Löschen einer Regel wirkt sich nur auf künftige
  Erzeugungen aus, nie auf bereits erzeugte Buchungen.
  Über „⚡ Strom Auto…“ werden pro Quartal die Stromrechnung (verrechnete
  kWh + Betrag, optional Zahlungsdatum als Valuta) und die an der
  Ladestation je Monat ans Elektroauto gelieferten kWh erfasst (ersetzt die
  frühere Excel-Tabelle `Strom_Auto.xlsx`). Daraus entstehen automatisch
  Buchungen: je Monat der Auto-Anteil (kWh × Preis/kWh der Rechnung) unter
  der gewählten Kraftstoff-Unterkategorie, Buchungsdatum letzter Tag des
  Monats; die Differenz zum Rechnungsbetrag als Betriebskosten,
  Buchungsdatum letzter Tag des abgerechneten Quartals (Rechnung trifft im
  Folgequartal ein). Beträge sind auf Rappen gerundet, die Summe entspricht
  immer exakt dem Rechnungsbetrag. Die Buchungen werden bei jedem Speichern
  des Quartals neu erzeugt; ein Klick auf eine solche Buchung (⚡) öffnet
  darum das Quartal statt des normalen Buchungsdialogs.
- **Budget** – Kosten und Erträge pro Jahr, pro Kategorie (z. B. Auto, Wohnen,
  AHV/PK, siehe „Kategorien verwalten“). Jeder Posten gilt entweder
  *wiederkehrend* ab einem Datum (bis zur nächsten Änderung derselben
  Kategorie) oder *einmalig* nur in seinem Jahr (z. B. eine Anschaffung).
- **Vermögen** – Kontostände zu einem oder mehreren Stichtagen.
- **Projektion** – 30-Jahres-Hochrechnung des Vermögens auf Basis von
  budgetierten Erträgen und Kosten sowie Rendite- und Inflationsannahmen.
- **Realvergleich** – reale Buchungen mit dem Budget vergleichen (Tabelle +
  Diagramm) und automatisch erkannte Einsparungsmöglichkeiten bzw.
  Budgetreserven anzeigen.
- **Analyse** – tatsächliche Vermögensrendite zwischen zwei Vermögens-Stichtagen
  (Vermögensänderung abzüglich des effektiven Netto-Cashflows in der
  Zwischenzeit). Der Cashflow kommt aus dem Valutadatum jeder Buchung, nicht
  aus dem Buchungsdatum (das für den Budgetvergleich massgeblich ist, aber
  vom tatsächlichen Zahlungszeitpunkt abweichen kann).

## Nutzung

Keine Build-Schritte nötig. Lokal servieren, z. B.:

```bash
python3 -m http.server 8000
```

und dann `http://localhost:8000` öffnen (ein direktes Öffnen der
`index.html` per `file://` funktioniert wegen der ES-Module nicht in allen
Browsern zuverlässig).

Alle Daten (Budget, Vermögen, Einnahmen/Ausgaben, Einstellungen) werden
ausschliesslich im `localStorage` des Browsers gespeichert.

### Wechselkurse

Für Buchungen in Fremdwährung ruft die App den Tageskurs zum Valutadatum bei
der [Frankfurter API](https://frankfurter.dev) ab (Kursdaten der
Europäischen Zentralbank, kostenlos, ohne API-Key, mit CORS-Freigabe für
Browser-Aufrufe — siehe `js/fx.js`). Das ist der einzige externe
Netzwerkaufruf der App; schlägt er fehl (kein Netz, Datum in der Zukunft,
Kurs für diesen Tag nicht verfügbar) bleibt der Kurs manuell erfassbar/
korrigierbar. CHF-Buchungen lösen nie einen Aufruf aus (Kurs fest 1).

### Als App aufs Handy

Die App ist als PWA installierbar: auf Android/Chrome über „Zum
Startbildschirm hinzufügen“ (nutzt `manifest.json`), auf iOS/Safari über
„Zum Home-Bildschirm“ (nutzt `icons/apple-touch-icon.png` +
`apple-mobile-web-app-*`-Meta-Tags in `index.html`). Erscheint dort mit dem
Label „Budget“ und öffnet ohne Browser-Chrome (`display: standalone`). Das
Icon (Note + Münzen) liegt als Vektorquelle unter `icons/icon.svg` bzw.
`icons/icon-maskable.svg`; alle PNG-Grössen sind daraus gerendert.

### Offline-Nutzung

Ein Service Worker (`sw.js`, analog zum Schwesterprojekt „Flugbuch“) macht
die App ab dem zweiten Online-Aufruf offline nutzbar: alle eigenen Dateien
(HTML/CSS/JS, Icons, Manifest) werden beim ersten Besuch im Cache abgelegt
und danach nach der Strategie „stale-while-revalidate“ ausgeliefert — sofort
aus dem Cache, während im Hintergrund ein Netzwerk-Update für den nächsten
Aufruf läuft (kein Warten auf einen Netzwerk-Timeout bei schwachem/keinem
Netz). Ist der Browser offline, erscheint unten ein Hinweisbanner „Offline —
zuletzt gespeicherter Stand“. Einzige Ausnahme vom Caching ist die
Wechselkursabfrage (siehe oben) — die App selbst bleibt davon unabhängig
voll nutzbar.

Im Tab „Service“ lässt sich unter „Updates & Offline-Cache“ per Checkbox auf
„network-first“ umschalten: dann lädt die App bei jedem Öffnen zuerst die
neueste Version übers Netz (Updates sofort sichtbar, aber bei schwachem
Empfang potenziell spürbar langsamer) — praktisch zum Testen neuer
Versionen, ohne dafür lokal den Cache manuell zu löschen.

**Bei jeder Änderung an `js/*.js`** erhöht `scripts/bump-js-version.sh`
automatisch auch `CACHE_VERSION` in `sw.js` mit — sonst würde ein bereits
installierter Service Worker seinen alten Cache unverändert weiterverwenden
und Fixes kämen nicht an.

### Kategorien verwalten

Im Tab „Budget“ über „Kategorien verwalten…“: Kategorien (z. B. "Wohnen")
und ihre Unterkategorien (z. B. "Miete") werden mit einer stabilen ID als
Primärschlüssel angelegt/umbenannt/gelöscht (Löschen ist blockiert, solange
sie noch von einem Budget-Posten oder einer realen Buchung referenziert
werden).

### Budget, Vermögen & Buchungen pflegen

Budget-Posten, Vermögens-Stichtage und Einnahmen/Ausgaben-Buchungen werden
direkt in der App gepflegt (hinzufügen, bearbeiten, löschen) — es gibt
keinen Datei-Import dafür.

### Backup & Restore

Im Tab „Service“ lässt sich der gesamte App-Zustand (Budget, Vermögen,
Einnahmen/Ausgaben, Einstellungen) als Datei sichern und wieder
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
Backups (Tab „Service“).

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
- `sw.js` – Service Worker für Offline-Nutzung (siehe „Offline-Nutzung“ oben)
- `css/style.css` – Styling (hell/dunkel via `prefers-color-scheme`)
- `js/store.js` – zentraler Zustand inkl. `localStorage`-Persistenz
- `js/dateUtils.js` – Datumshilfsfunktionen
- `js/kategorien.js` – Kategorie-/Unterkategorie-Stammdaten (find-or-create,
  Namens-Lookup, Verwendungsprüfung) und die einmalige Migration alter
  Freitext-Felder auf IDs
- `js/kategorienDialog.js` – CRUD-Dialog "Kategorien verwalten" (Budget-Tab)
- `js/transaktionen.js` – Migration alter CSV-Import-Felder auf Buchungs-/
  Valuta-/Erfassungsdatum sowie Fremdwährung/Kurs, sowie die Vorlagen-Suche
  für den Typeahead
- `js/fx.js` – Wechselkurs-Abfrage (Frankfurter API) für Fremdwährungs-Buchungen
- `js/einnahmenAusgabenTab.js` – CRUD-UI "Einnahmen/Ausgaben" inkl.
  Erfassungsdialog mit Bezeichnungs-Typeahead und Währungs-/Kurserfassung
- `js/wiederkehrendeBuchungen.js` – Erzeugungslogik für wiederkehrende
  Buchungen (fällige Termine berechnen, Buchungen inkl. Fremdwährungskurs
  erzeugen), aufgerufen beim App-Start (siehe `js/app.js`)
- `js/wiederkehrendDialog.js` – CRUD-UI "Wiederkehrende Buchungen verwalten"
- `js/stromAuto.js` – Berechnung Strom Auto (Preis/kWh, Kraftstoff-Anteil je
  Monat, Betriebskosten) und Erzeugung der zugehörigen Buchungen
- `js/stromAutoDialog.js` – Erfassungsdialog "Strom Auto" (Quartale, Ladung je Monat)
- `js/budgetTab.js`, `js/vermoegenTab.js` – CRUD-UI für Budget/Vermögen
- `js/projection.js`, `js/projectionTab.js` – 30-Jahres-Projektion
- `js/compare.js`, `js/compareTab.js` – Abweichungsanalyse & Sparpotenzial
- `js/istkostenTab.js` – Istkostenvergleich (reale Buchungen über drei Jahre)
- `js/renditeAnalyse.js`, `js/renditeTab.js` – Vermögensrendite zwischen zwei
  Stichtagen (Cashflow aus dem Valutadatum jeder Buchung)
- `js/charts.js` – Canvas-Diagramme (Linien-/Balkendiagramm)
- `js/backup.js`, `js/backupTab.js` – Backup & Restore
- `js/fsapiHandle.js` – IndexedDB-Ablage für den gewählten Backup-Ordner (File System Access API)
- `js/version.js` – lädt `version.json` und zeigt sie im Footer an
- `js/collapsibleHints.js` – macht Erklärungstexte (`.hint.collapsible`)
  standardmässig eingeklappt und über ein Symbol aufklappbar
- `js/app.js` – Kartenübersicht/Tab-Navigation und Bootstrap
- `version.json` – aktuelle Versionsnummer (siehe Abschnitt Versionierung)
- `scripts/update-version.sh` – schreibt den aktuellen Git-Tag nach `version.json`
- `scripts/bump-js-version.sh` – erhöht den JS-Modul-Cache-Buster (`?v=`) in
  `index.html` und allen `js/*.js`-Imports
- `.github/workflows/bump-version.yml` – zählt die Patch-Version bei jedem Push auf `master` automatisch hoch
- `manifest.json`, `icons/` – App-Icon & PWA-Installierbarkeit (siehe Abschnitt „Als App aufs Handy“)
