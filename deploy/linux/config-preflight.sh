#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: config-preflight.sh <config-directory>" >&2
  exit 2
fi

CONFIG_DIR="$1"
PLATFORM_CONFIG="$CONFIG_DIR/platform-api.env"
AI_CONFIG="$CONFIG_DIR/ai-service.env"

fail() {
  echo "Linux deployment config preflight failed: $1" >&2
  exit 1
}

for file in "$PLATFORM_CONFIG" "$AI_CONFIG"; do
  [[ -f "$file" && ! -L "$file" ]] || fail "required regular config file is missing: ${file##*/}"
  grep -Eq 'CHANGE_ME|^ConnectionStrings__Platform=$|^Authentication__SigningKey=$' "$file" \
    && fail "placeholder or required empty value remains in ${file##*/}"
done

read_env_value() {
  local file="$1" key="$2"
  awk -v key="$key" 'index($0, key "=") == 1 { sub(/^[^=]*=/, ""); sub(/\r$/, ""); print; exit }' "$file"
}

platform_signing_key="$(read_env_value "$PLATFORM_CONFIG" Authentication__SigningKey)"
ai_signing_key="$(read_env_value "$AI_CONFIG" Authentication__SigningKey)"
plugin_signing_key="$(read_env_value "$PLATFORM_CONFIG" PluginHost__SigningKey)"
if [[ "$(printf %s "$platform_signing_key" | wc -c)" -lt 32 || "$(printf %s "$ai_signing_key" | wc -c)" -lt 32 ]]; then
  fail "Authentication__SigningKey must contain at least 32 bytes in both service environment files."
fi
[[ "$platform_signing_key" == "$ai_signing_key" ]] || fail "Platform API and AI Service must use the same Authentication__SigningKey."
if [[ "$(printf %s "$plugin_signing_key" | wc -c)" -lt 32 || "$plugin_signing_key" == "$platform_signing_key" ]]; then
  fail "PluginHost__SigningKey must be a separate secret containing at least 32 bytes."
fi

for setting in Issuer Audience; do
  platform_value="$(read_env_value "$PLATFORM_CONFIG" "Authentication__$setting")"
  ai_value="$(read_env_value "$AI_CONFIG" "Authentication__$setting")"
  [[ "$platform_value" =~ [^[:space:]] && "$ai_value" =~ [^[:space:]] ]] || fail "Authentication__$setting must be explicitly configured for both services."
  [[ "$platform_value" == "$ai_value" ]] || fail "Authentication__$setting must match between Platform API and AI Service."
done

api_separation="$(read_env_value "$PLATFORM_CONFIG" Database__SeparationEnabled)"
ai_separation="$(read_env_value "$AI_CONFIG" Database__SeparationEnabled)"
[[ "$api_separation" == "$ai_separation" ]] || fail "Database__SeparationEnabled must match between Platform API and AI Service."
case "$api_separation" in
  true|True|TRUE|1|yes|YES)
    tenant_connection="$(read_env_value "$PLATFORM_CONFIG" ConnectionStrings__Tenant)"
    platform_studio_connection="$(read_env_value "$PLATFORM_CONFIG" ConnectionStrings__AIStudio)"
    studio_connection="$(read_env_value "$AI_CONFIG" ConnectionStrings__AIStudio)"
    [[ "$tenant_connection" =~ [^[:space:]] ]] || fail "ConnectionStrings__Tenant is required when database separation is enabled."
    [[ "$platform_studio_connection" =~ [^[:space:]] ]] || fail "ConnectionStrings__AIStudio is required in Platform API config when database separation is enabled."
    [[ "$studio_connection" =~ [^[:space:]] ]] || fail "ConnectionStrings__AIStudio is required when database separation is enabled."
    ;;
  false|False|FALSE|0|no|NO)
    fail "Shared company databases are unsupported. Complete the controlled backup-and-copy cutover before installing this release."
    ;;
  *) fail "Database__SeparationEnabled must be explicitly true in both service environment files." ;;
esac

integration_key="$(read_env_value "$PLATFORM_CONFIG" IntegrationQueue__EncryptionKey)"
if [[ -n "$integration_key" ]]; then
  decoded_integration_key="$(printf %s "$integration_key" | base64 --decode 2>/dev/null || true)"
  [[ "$(printf %s "$decoded_integration_key" | wc -c)" -eq 32 ]] || fail "IntegrationQueue__EncryptionKey must be base64 for exactly 32 bytes when configured."
fi

echo "Linux deployment config preflight passed (company database isolation and shared token identity verified)."
