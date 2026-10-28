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
    if [[ "$tenant_connection;$platform_studio_connection;$studio_connection" =~ (^|;)[[:space:]]*(User[[:space:]]*Id|UID|Password|PWD)[[:space:]]*= ]]; then
      fail "Tenant and Studio endpoint templates must not contain SQL username/password values; tenant credentials are resolved from Vault."
    fi
    vault_address="$(read_env_value "$PLATFORM_CONFIG" Vault__Address)"
    ai_vault_address="$(read_env_value "$AI_CONFIG" Vault__Address)"
    [[ "$vault_address" =~ ^https://[^[:space:]]+$ ]] || fail "Vault__Address must be an HTTPS URL in Platform API config."
    [[ "$vault_address" == "$ai_vault_address" ]] || fail "Vault__Address must match between Platform API and AI Service."
    vault_mount="$(read_env_value "$PLATFORM_CONFIG" Vault__Mount)"
    ai_vault_mount="$(read_env_value "$AI_CONFIG" Vault__Mount)"
    [[ "$vault_mount" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] || fail "Vault__Mount must be a valid KV v2 mount name."
    [[ "$vault_mount" == "$ai_vault_mount" ]] || fail "Vault__Mount must match between Platform API and AI Service."
    for role in RoleId SecretId; do
      platform_key="Vault__TenantSqlCredentialReader__${role}File"
      ai_key="$platform_key"
      platform_path="$(read_env_value "$PLATFORM_CONFIG" "$platform_key")"
      ai_path="$(read_env_value "$AI_CONFIG" "$ai_key")"
      [[ "$platform_path" =~ ^/[^[:space:]]+$ && "$platform_path" == "$ai_path" ]] || fail "$platform_key must be the same absolute path in both service configs."
      [[ -f "$platform_path" && ! -L "$platform_path" && -s "$platform_path" ]] || fail "$platform_key must point to a non-empty regular secret file."
      if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* ]]; then
        mode="$(stat -c '%a' "$platform_path" 2>/dev/null || true)"
        [[ "$mode" =~ ^[0-7]{3,4}$ ]] || fail "Could not verify permissions for $platform_key."
        mode_value=$((8#$mode))
        (( (mode_value & 077) == 0 )) || fail "$platform_key must not be readable or writable by group or other users (use mode 600)."
      fi
    done
    [[ "$(read_env_value "$PLATFORM_CONFIG" Vault__AllowHttpForLocalDevelopment)" == "false" && "$(read_env_value "$AI_CONFIG" Vault__AllowHttpForLocalDevelopment)" == "false" ]] || fail "Vault__AllowHttpForLocalDevelopment must be false for production Linux services."
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
