#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: preflight.sh <bundle-root>" >&2
  exit 2
fi

BUNDLE_ROOT="$(cd -- "$1" && pwd -P)"
RELEASE_DIR="$BUNDLE_ROOT/release"
MANIFEST="$RELEASE_DIR/SHA256SUMS"

fail() {
  echo "Linux bundle preflight failed: $1" >&2
  exit 1
}

[[ -d "$RELEASE_DIR" ]] || fail "release directory is missing."
[[ -f "$MANIFEST" && ! -L "$MANIFEST" ]] || fail "release/SHA256SUMS is missing or not a regular file."
for relative in install.sh health-check.sh switch-release.sh rollback.sh nginx/nexora.conf \
  systemd/aierp-platform-api.service systemd/aierp-ai-service.service \
  config/platform-api.env.example config/ai-service.env.example; do
  [[ -f "$BUNDLE_ROOT/$relative" && ! -L "$BUNDLE_ROOT/$relative" ]] || fail "required bundle file is missing or not regular: $relative"
done

VERSION="$(cat "$RELEASE_DIR/VERSION" 2>/dev/null || true)"
[[ "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || fail "release/VERSION is invalid."

# Reject links before following any manifest entry. A package must not redirect
# checksum verification outside its extracted release tree.
if find "$RELEASE_DIR" -type l -print -quit | grep -q .; then
  fail "release tree contains a symbolic link."
fi

declare -A seen=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^([[:xdigit:]]{64})[[:space:]][[:space:]*](.+)$ ]] || fail "SHA256SUMS contains a malformed entry."
  expected="${BASH_REMATCH[1]}"
  relative="${BASH_REMATCH[2]}"
  [[ "$relative" != /* && "$relative" != *$'\r'* && "$relative" != *'\\'* && "$relative" != *':'* ]] || fail "SHA256SUMS contains an absolute or malformed path."
  IFS='/' read -r -a parts <<< "$relative"
  for part in "${parts[@]}"; do
    [[ -n "$part" && "$part" != '.' && "$part" != '..' ]] || fail "SHA256SUMS contains an unsafe path: $relative"
  done
  [[ -z "${seen[$relative]+x}" ]] || fail "SHA256SUMS contains a duplicate path: $relative"
  seen["$relative"]=1
  file="$RELEASE_DIR/$relative"
  [[ -f "$file" && ! -L "$file" ]] || fail "manifest file is missing or not regular: $relative"
  actual="$(sha256sum -- "$file" | awk '{print $1}')"
  [[ "${actual,,}" == "${expected,,}" ]] || fail "checksum mismatch: $relative"
done < "$MANIFEST"

[[ -f "$RELEASE_DIR/VERSION" ]] || fail "required release file is missing: VERSION"
[[ -n "${seen[VERSION]+x}" ]] || fail "SHA256SUMS does not cover release/VERSION."
for required in api/AIERP.Api.dll ai-service/AIERP.AIService.dll web/index.html studio/index.html; do
  [[ -f "$RELEASE_DIR/$required" && ! -L "$RELEASE_DIR/$required" ]] || fail "required release component file is missing or not regular: $required"
  [[ -n "${seen[$required]+x}" ]] || fail "SHA256SUMS does not cover required release component file: $required"
done
[[ ${#seen[@]} -gt 0 ]] || fail "SHA256SUMS is empty."

while IFS= read -r -d '' file; do
  relative="${file#"$RELEASE_DIR"/}"
  [[ -n "${seen[$relative]+x}" ]] || fail "unmanifested release file: $relative"
done < <(find "$RELEASE_DIR" -type f ! -path "$MANIFEST" -print0)

echo "Linux bundle preflight passed for version $VERSION (${#seen[@]} checksums)."
