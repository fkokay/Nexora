#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: preflight.sh <bundle-root>" >&2
  exit 2
fi

BUNDLE_ROOT="$(cd -- "$1" && pwd -P)"
RELEASE_DIR="$BUNDLE_ROOT/release"
MANIFEST="$RELEASE_DIR/SHA256SUMS"
BUNDLE_MANIFEST="$BUNDLE_ROOT/BUNDLE-SHA256SUMS"

fail() {
  echo "Linux bundle preflight failed: $1" >&2
  exit 1
}

[[ -d "$RELEASE_DIR" ]] || fail "release directory is missing."
[[ -f "$MANIFEST" && ! -L "$MANIFEST" ]] || fail "release/SHA256SUMS is missing or not a regular file."
[[ -f "$BUNDLE_MANIFEST" && ! -L "$BUNDLE_MANIFEST" ]] || fail "BUNDLE-SHA256SUMS is missing or not a regular file."
for relative in install.sh preflight.sh config-preflight.sh health-check.sh switch-release.sh rollback.sh nginx/nexora.conf \
  systemd/aierp-platform-api.service systemd/aierp-ai-service.service \
  config/platform-api.env.example config/ai-service.env.example; do
  [[ -f "$BUNDLE_ROOT/$relative" && ! -L "$BUNDLE_ROOT/$relative" ]] || fail "required bundle file is missing or not regular: $relative"
done

# The outer archive sidecar checks downloaded archive integrity when obtained
# from a trusted release channel. This inner bundle manifest detects local
# extraction/tampering, including config
# examples and installer scripts that are outside release/SHA256SUMS.
if find "$BUNDLE_ROOT" -type l -print -quit | grep -q .; then
  fail "bundle contains a symbolic link."
fi
declare -A bundle_seen=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^([[:xdigit:]]{64})[[:space:]][[:space:]*](.+)$ ]] || fail "BUNDLE-SHA256SUMS contains a malformed entry."
  expected="${BASH_REMATCH[1]}"
  relative="${BASH_REMATCH[2]}"
  [[ "$relative" != /* && "$relative" != *$'\r'* && "$relative" != *'\\'* && "$relative" != *':'* ]] || fail "BUNDLE-SHA256SUMS contains an absolute or malformed path."
  IFS='/' read -r -a parts <<< "$relative"
  for part in "${parts[@]}"; do
    [[ -n "$part" && "$part" != '.' && "$part" != '..' ]] || fail "BUNDLE-SHA256SUMS contains an unsafe path: $relative"
  done
  [[ "$relative" != 'BUNDLE-SHA256SUMS' ]] || fail "BUNDLE-SHA256SUMS must not list itself."
  [[ -z "${bundle_seen[$relative]+x}" ]] || fail "BUNDLE-SHA256SUMS contains a duplicate path: $relative"
  bundle_seen["$relative"]=1
  file="$BUNDLE_ROOT/$relative"
  [[ -f "$file" && ! -L "$file" ]] || fail "bundle manifest file is missing or not regular: $relative"
  actual="$(sha256sum -- "$file" | awk '{print $1}')"
  [[ "${actual,,}" == "${expected,,}" ]] || fail "bundle checksum mismatch: $relative"
done < "$BUNDLE_MANIFEST"
[[ ${#bundle_seen[@]} -gt 0 ]] || fail "BUNDLE-SHA256SUMS is empty."
while IFS= read -r -d '' file; do
  relative="${file#"$BUNDLE_ROOT"/}"
  [[ "$relative" == 'BUNDLE-SHA256SUMS' ]] && continue
  [[ -n "${bundle_seen[$relative]+x}" ]] || fail "unmanifested bundle file: $relative"
done < <(find "$BUNDLE_ROOT" -type f -print0)

# Verify the shipped examples themselves have the runtime settings consumed by
# both services. Never source these templates: they contain intentional secrets placeholders.
require_example_key() {
  local file="$1" key="$2"
  awk -v key="$key" '
    { line=$0; sub(/\r$/, "", line); if (index(line, key "=") == 1) { count++; value=substr(line, length(key) + 2) } }
    END { if (count == 1 && value ~ /[^[:space:]]/) exit 0; exit 1 }
  ' "$file" || fail "config example ${file#"$BUNDLE_ROOT"/} must contain exactly one non-empty $key."
}
require_example_value() {
  local file="$1" key="$2" expected="$3"
  awk -v key="$key" -v expected="$expected" '
    { line=$0; sub(/\r$/, "", line); if (index(line, key "=") == 1) { count++; value=substr(line, length(key) + 2) } }
    END { if (count == 1 && value == expected) exit 0; exit 1 }
  ' "$file" || fail "config example ${file#"$BUNDLE_ROOT"/} must set $key=$expected exactly once."
}
platform_example="$BUNDLE_ROOT/config/platform-api.env.example"
ai_example="$BUNDLE_ROOT/config/ai-service.env.example"
for key in ASPNETCORE_URLS ConnectionStrings__Platform ConnectionStrings__Tenant ConnectionStrings__AIStudio Database__SeparationEnabled Vault__Address Vault__Mount Vault__TenantSqlCredentialReader__RoleIdFile Vault__TenantSqlCredentialReader__SecretIdFile Vault__AllowHttpForLocalDevelopment Authentication__Issuer Authentication__Audience Authentication__SigningKey PluginHost__SigningKey; do
  require_example_key "$platform_example" "$key"
done
for key in ASPNETCORE_URLS ConnectionStrings__Platform ConnectionStrings__AIStudio Database__SeparationEnabled Vault__Address Vault__Mount Vault__TenantSqlCredentialReader__RoleIdFile Vault__TenantSqlCredentialReader__SecretIdFile Vault__AllowHttpForLocalDevelopment Authentication__Issuer Authentication__Audience Authentication__SigningKey; do
  require_example_key "$ai_example" "$key"
done
require_example_value "$platform_example" Database__SeparationEnabled true
require_example_value "$ai_example" Database__SeparationEnabled true

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

echo "Linux bundle preflight passed for version $VERSION (${#seen[@]} release checksums, ${#bundle_seen[@]} bundle checksums)."
