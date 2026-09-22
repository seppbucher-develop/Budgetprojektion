# Budgetprojektion

Wie weit reicht das Vermögen? Eine kleine, rein clientseitige Webapp, die anhand von Startvermögen, monatlichen Einnahmen/Ausgaben, erwarteter Rendite und Inflation berechnet, wie lange das Vermögen reicht – inklusive Verlauf als Diagramm.

## Nutzung

Keine Build-Schritte nötig. Einfach `index.html` im Browser öffnen, oder lokal servieren, z. B.:

```bash
python3 -m http.server 8000
```

und dann `http://localhost:8000` öffnen.

Alle Berechnungen laufen im Browser; die zuletzt eingegebenen Werte werden nur lokal (`localStorage`) gespeichert, es gibt kein Backend.

## Struktur

- `index.html` – Seitenstruktur und Formular
- `css/style.css` – Styling (hell/dunkel via `prefers-color-scheme`)
- `js/app.js` – Berechnungslogik (monatliche Simulation) und Diagramm-Rendering (Canvas)
