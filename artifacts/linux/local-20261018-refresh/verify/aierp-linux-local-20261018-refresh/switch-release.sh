#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/nexora
VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Usage: switch-release.sh <release-version>" >&2
  exit 2
fi
TARGET="$ROOT/releases/$VERSION"
CURRENT="$ROOT/current"
PREVIOUS="$ROOT/previous"
[[ -d "$TARGET" ]] || { echo "Release not found: $TARGET" >&2; exit 1; }

old_target=""
if [[ -L "$CURRENT" ]]; then old_target="$(readlink -f -- "$CURRENT" || true)"; fi
tmp_link="$ROOT/.current.$$"
ln -s -- "$TARGET" "$tmp_link"
mv -Tf -- "$tmp_link" "$CURRENT"

if systemctl restart aierp-platform-api.service aierp-ai-service.service \
  && "$ROOT/bin/health-check.sh" 90; then
  if [[ -n "$old_target" && "$old_target" != "$TARGET" ]]; then
    ln -sfn -- "$old_target" "$PREVIOUS"
  fi
  echo "Activated release $VERSION."
  exit 0
fi

echo "Release $VERSION did not pass health checks; restoring the previous release." >&2
if [[ -n "$old_target" && -d "$old_target" ]]; then
  ln -sfn -- "$old_target" "$ROOT/.current-rollback.$$"
  mv -Tf -- "$ROOT/.current-rollback.$$" "$CURRENT"
  systemctl restart aierp-platform-api.service aierp-ai-service.service || true
  "$ROOT/bin/health-check.sh" 90 || true
else
  rm -f -- "$CURRENT"
  systemctl stop aierp-ai-service.service aierp-platform-api.service || true
fi
exit 1
