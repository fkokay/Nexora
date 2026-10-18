#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/nexora
if [[ $# -gt 1 ]]; then
  echo "Usage: rollback.sh [release-version]" >&2
  exit 2
fi
if [[ $# -eq 1 ]]; then
  VERSION="$1"
else
  [[ -L "$ROOT/previous" ]] || { echo "No previous release is recorded." >&2; exit 1; }
  VERSION="$(basename -- "$(readlink -f -- "$ROOT/previous")")"
fi
exec "$ROOT/bin/switch-release.sh" "$VERSION"
