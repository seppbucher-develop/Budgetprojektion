// Service Worker: ermöglicht Offline-Nutzung ab dem zweiten Online-Start,
// analog zum Schwesterprojekt "Flugbuch" (siehe dessen sw.js). Strategie:
// "stale-while-revalidate" -- antwortet sofort aus dem Cache (falls
// vorhanden) und stösst parallel im Hintergrund einen Netzwerk-Request an,
// der den Cache fürs nächste Mal aktualisiert. Kein Warten auf einen
// Netzwerk-Timeout mehr, egal ob offline oder nur langsames Netz.
//
// WICHTIG bei Änderungen an CORE_ASSETS (z. B. eine neue js/*.js-Datei
// hinzugefügt): CACHE_VERSION hochzählen, sonst verwenden bereits
// installierte Service-Worker weiter ihren alten Cache unverändert.
// scripts/bump-js-version.sh erledigt das automatisch mit.
const CACHE_VERSION = "v20";
const CACHE_NAME = "budgetprojektion-cache-" + CACHE_VERSION;

const CORE_ASSETS = [
  "index.html",
  "css/style.css",
  "manifest.json",
  "version.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-96.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/icon-header-128.png",
  "icons/apple-touch-icon.png",
  "js/app.js",
  "js/backup.js",
  "js/backupTab.js",
  "js/buchungenDialog.js",
  "js/budgetTab.js",
  "js/charts.js",
  "js/collapsibleHints.js",
  "js/compare.js",
  "js/compareTab.js",
  "js/dateUtils.js",
  "js/einnahmenAusgabenTab.js",
  "js/fsapiHandle.js",
  "js/fx.js",
  "js/istkostenTab.js",
  "js/kategorien.js",
  "js/kategorienDialog.js",
  "js/projection.js",
  "js/projectionTab.js",
  "js/renditeAnalyse.js",
  "js/renditeTab.js",
  "js/store.js",
  "js/transaktionen.js",
  "js/vermoegenTab.js",
  "js/version.js",
  "js/wiederkehrendDialog.js",
  "js/wiederkehrendeBuchungen.js"
];

const INDEX_URL = new URL("index.html", self.location.href).href;

// Query-String (Cache-Buster wie "?v=17") ignorieren, damit die Basis-Datei
// unter ihrer eigentlichen URL unabhängig vom gerade referenzierten
// Versions-Stand wiedergefunden wird. Ein Aufruf des Verzeichnisses selbst
// (Pfad endet auf "/") wird auf index.html abgebildet -- als Single-Page-
// App läuft ohnehin alles über diese eine Seite.
function cacheKeyFor(url) {
  const ohneQuery = url.origin + url.pathname;
  return ohneQuery.endsWith("/") ? ohneQuery + "index.html" : ohneQuery;
}

// Per Checkbox im Service-Tab umschaltbar auf "network-first" (siehe
// js/backupTab.js): Standard "stale-while-revalidate" zeigt ein Update erst
// beim ÜBERNÄCHSTEN Öffnen (dafür immer sofort da, auch offline/bei
// schwachem Netz) -- praktisch für den normalen Gebrauch, aber verwirrend
// beim aktiven Testen neuer Versionen. "network-first" lädt stattdessen bei
// jedem Öffnen zuerst über das Netz. Eigener, unversionierter Cache-Name
// (übersteht anders als CACHE_NAME auch einen CACHE_VERSION-Bump, da die
// activate-Bereinigung oben nur Caches mit dem Präfix
// "budgetprojektion-cache-" löscht).
const SETTINGS_CACHE_NAME = "budgetprojektion-settings";
const CACHE_STRATEGY_KEY = "/__meta__/cache-strategy";

async function getStrategyOverride() {
  try {
    const cache = await caches.open(SETTINGS_CACHE_NAME);
    const resp = await cache.match(CACHE_STRATEGY_KEY);
    if (!resp) return "stale-while-revalidate";
    const text = await resp.text();
    return text === "network-first" ? "network-first" : "stale-while-revalidate";
  } catch (e) {
    return "stale-while-revalidate";
  }
}

// Nimmt die Checkbox-Auswahl von js/backupTab.js entgegen (per
// navigator.serviceWorker.getRegistration() -> reg.active.postMessage(...)
// gesendet, sowohl beim Umschalten als auch einmal beim Laden der Seite,
// damit ein evtl. verlorener Cache-Eintrag repariert wird).
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "setCacheStrategy") return;
  const value = event.data.value === "network-first" ? "network-first" : "stale-while-revalidate";
  event.waitUntil(
    caches.open(SETTINGS_CACHE_NAME).then((cache) => cache.put(CACHE_STRATEGY_KEY, new Response(value)))
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Datei für Datei mit eigenem catch, damit z. B. eine fehlende Datei
      // nicht die komplette Offline-Funktion verhindert.
      Promise.all(
        CORE_ASSETS.map((relUrl) => {
          const absUrl = new URL(relUrl, self.location.href).href;
          return fetch(absUrl)
            .then((resp) => cache.put(absUrl, resp))
            .catch((err) => console.warn("SW: Konnte nicht cachen:", relUrl, err));
        })
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("budgetprojektion-cache-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Nur eigene GET-Requests behandeln -- die Frankfurter-Wechselkurs-API
  // (und alles sonst Fremde) unangetastet durchreichen; die App kommt bei
  // deren Ausfall ohnehin schon klar (siehe fx.js: manueller Kurs bleibt
  // jederzeit möglich).
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const cacheKey = cacheKeyFor(url);

  const respondStaleWhileRevalidate = () =>
    caches.match(cacheKey).then((cached) => {
      const networkUpdate = fetch(req)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        // Auf das Netzwerk-Ergebnis NICHT warten -- der Cache-Eintrag wird
        // im Hintergrund fürs nächste Mal aktualisiert.
        event.waitUntil(networkUpdate);
        return cached;
      }
      // Nichts im Cache (z. B. beim allerersten Aufruf) -- auf das Netzwerk
      // warten; schlägt auch das fehl, auf index.html zurückfallen.
      return networkUpdate.then((networkResponse) => networkResponse || caches.match(INDEX_URL));
    });

  // "network-first" (per Checkbox aktivierbar): erst das Netzwerk versuchen,
  // erst wenn DAS scheitert, kommt der Cache zum Zug.
  const respondNetworkFirst = () =>
    fetch(req)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        return networkResponse;
      })
      .catch(() =>
        caches.match(cacheKey).then((cached) => cached || caches.match(INDEX_URL))
      );

  event.respondWith(
    getStrategyOverride().then((strategy) =>
      strategy === "network-first" ? respondNetworkFirst() : respondStaleWhileRevalidate()
    )
  );
});
