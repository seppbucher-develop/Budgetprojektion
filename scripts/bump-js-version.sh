#!/usr/bin/env bash
# Erhöht den JS-Modul-Cache-Buster ("?v=N") überall dort, wo er vorkommt:
# im <script type="module" src="js/app.js?v=N"> in index.html UND in jedem
# lokalen "from './...js?v=N'"-Import innerhalb von js/*.js. Es gibt keinen
# Build-Schritt, der die Module bündelt oder hasht — als installierte "Zum
# Home-Bildschirm"-App werden sie sonst hartnäckig zwischengespeichert und
# Fixes kommen nicht an (analog zum ?v= bei css/style.css in index.html).
#
# Aufruf bei jeder Änderung an einer js/*.js-Datei:
#   ./scripts/bump-js-version.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ALT=$(grep -o 'js/app\.js?v=[0-9]\+' index.html | head -1 | grep -o '[0-9]\+$')
if [ -z "$ALT" ]; then
  echo "Konnte aktuelle JS-Version nicht in index.html finden." >&2
  exit 1
fi
NEU=$((ALT + 1))

sed -i "s/\.js?v=${ALT}\"/.js?v=${NEU}\"/g" index.html js/*.js

echo "JS-Cache-Buster erhöht: v=${ALT} -> v=${NEU}"
