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
- `js/app.js` – Tab-Navigation und Bootstrap
