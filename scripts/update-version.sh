#!/usr/bin/env bash
# Schreibt die aktuelle Versionsnummer (aus dem letzten Git-Tag) nach
# version.json. Die App liest diese Datei zur Laufzeit (siehe js/version.js)
# und zeigt sie im Footer an bzw. verwendet sie im Backup-Dateinamen
# (siehe js/backup.js) — es gibt keinen Build-Schritt, der das automatisch
# erledigen könnte.
#
# Aufruf bei jedem neuen Release:
#   git tag v1.2.3
#   ./scripts/update-version.sh
#   git add version.json && git commit -m "Version v1.2.3"
#   git push && git push --tags
#
# Ohne erreichbaren Tag (z.B. lokaler Klon ohne Tags) fällt `git describe`
# auf den Commit-Hash zurück, damit version.json trotzdem etwas Sinnvolles
# enthält statt zu scheitern.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(git describe --tags --always --dirty)
cat > version.json <<EOF
{
  "version": "$VERSION"
}
EOF

echo "version.json aktualisiert: $VERSION"
