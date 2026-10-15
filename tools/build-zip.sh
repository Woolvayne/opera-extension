#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-zip.sh -- baut die beiden Download-ZIPs
#
#   bash tools/build-zip.sh 1.0.0
#
# Ergebnis:
#   release/arena-pc-bridge-komplett-v1.0.0.zip    (ganzes Projekt inkl. Starter)
#   release/arena-pc-bridge-extension-v1.0.0.zip   (nur die Erweiterung,
#                                                   manifest.json liegt oben)
# ---------------------------------------------------------------------------
set -euo pipefail

VERSION="${1:-1.0.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/release"
mkdir -p "$OUT"

command -v zip >/dev/null 2>&1 || { echo "Bitte 'zip' installieren." >&2; exit 1; }

KOMPLETT="$OUT/arena-pc-bridge-komplett-v$VERSION.zip"
EXTZIP="$OUT/arena-pc-bridge-extension-v$VERSION.zip"
rm -f "$KOMPLETT" "$EXTZIP"

# --- 1) Komplettpaket ------------------------------------------------------
(
  cd "$ROOT"
  zip -q -r "$KOMPLETT" . \
    -x '.git/*' \
    -x '.git' \
    -x 'release/*' \
    -x 'node_modules/*' \
    -x '.vscode/*' \
    -x '.idea/*' \
    -x '*.DS_Store' \
    -x '.arena-bridge/*'
)

# --- 2) Nur die Erweiterung ------------------------------------------------
(
  cd "$ROOT/extension"
  zip -q -r "$EXTZIP" . -x '*.DS_Store'
)

echo "Fertig:"
for f in "$KOMPLETT" "$EXTZIP"; do
  printf '  %-55s %8s  %s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)" "$(cd "$(dirname "$f")" && pwd)"
done
echo
echo "Inhalt der Erweiterungs-ZIP (muss manifest.json auf oberster Ebene haben):"
unzip -l "$EXTZIP" | head -20
