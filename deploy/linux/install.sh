#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/preflight.sh" "$SCRIPT_DIR"
VERSION="$(cat "$SCRIPT_DIR/release/VERSION")"
ROOT=/opt/nexora
CONFIG=/etc/nexora

if [[ ! "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Invalid release/VERSION; refusing to modify the host." >&2
  exit 2
fi
if [[ $EUID -ne 0 ]]; then echo "Run with sudo: $0" >&2; exit 1; fi
for command in systemctl nginx curl dotnet sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Install the required command first: $command" >&2; exit 127; }
done
dotnet --list-runtimes | grep -Eq '^Microsoft\.AspNetCore\.App 10\.' || {
  echo "Install the .NET 10 ASP.NET Core Runtime before installation." >&2; exit 1;
}
[[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]] || {
  echo "This installer expects nginx sites-available and sites-enabled directories." >&2; exit 1;
}
install -d -m 0750 "$CONFIG"
getent group nexora >/dev/null || groupadd --system nexora
id nexora >/dev/null 2>&1 || useradd --system --gid nexora --home-dir /var/lib/nexora --shell /usr/sbin/nologin nexora
chown root:nexora "$CONFIG"
chmod 0750 "$CONFIG"
if [[ ! -e "$CONFIG/platform-api.env" ]]; then install -m 0600 "$SCRIPT_DIR/config/platform-api.env.example" "$CONFIG/platform-api.env"; fi
if [[ ! -e "$CONFIG/ai-service.env" ]]; then install -m 0600 "$SCRIPT_DIR/config/ai-service.env.example" "$CONFIG/ai-service.env"; fi
chown root:nexora "$CONFIG/platform-api.env" "$CONFIG/ai-service.env"
chmod 0640 "$CONFIG/platform-api.env" "$CONFIG/ai-service.env"
if grep -Eq 'CHANGE_ME|^ConnectionStrings__Platform=$|^Authentication__SigningKey=$' "$CONFIG/platform-api.env" \
  || grep -Eq 'CHANGE_ME|^ConnectionStrings__Platform=$|^Authentication__SigningKey=$' "$CONFIG/ai-service.env"; then
  echo "Secret templates were installed under $CONFIG. Configure SQL and secrets there, then rerun install.sh." >&2
  exit 2
fi
read_env_value() {
  local file="$1" key="$2"
  awk -v key="$key" 'index($0, key "=") == 1 { sub(/^[^=]*=/, ""); print; exit }' "$file"
}
platform_signing_key="$(read_env_value "$CONFIG/platform-api.env" Authentication__SigningKey)"
ai_signing_key="$(read_env_value "$CONFIG/ai-service.env" Authentication__SigningKey)"
plugin_signing_key="$(read_env_value "$CONFIG/platform-api.env" PluginHost__SigningKey)"
if [[ "$(printf %s "$platform_signing_key" | wc -c)" -lt 32 || "$(printf %s "$ai_signing_key" | wc -c)" -lt 32 ]]; then
  echo "Authentication__SigningKey must contain at least 32 bytes in both service environment files." >&2
  exit 2
fi
if [[ "$platform_signing_key" != "$ai_signing_key" ]]; then
  echo "Platform API and AI Service must use the same Authentication__SigningKey." >&2
  exit 2
fi
if [[ "$(printf %s "$plugin_signing_key" | wc -c)" -lt 32 || "$plugin_signing_key" == "$platform_signing_key" ]]; then
  echo "PluginHost__SigningKey must be a separate secret containing at least 32 bytes." >&2
  exit 2
fi
integration_key="$(read_env_value "$CONFIG/platform-api.env" IntegrationQueue__EncryptionKey)"
if [[ -n "$integration_key" ]]; then
  decoded_integration_key="$(printf %s "$integration_key" | base64 --decode 2>/dev/null || true)"
  if [[ "$(printf %s "$decoded_integration_key" | wc -c)" -ne 32 ]]; then
    echo "IntegrationQueue__EncryptionKey must be base64 for exactly 32 bytes when configured." >&2
    exit 2
  fi
fi
if [[ ! -f "$SCRIPT_DIR/nginx/nexora.conf" ]]; then echo "nginx site configuration is missing." >&2; exit 1; fi
if grep -Eq '(^|[[:space:]])(erp|studio)\.example\.com([[:space:];]|$)' "$SCRIPT_DIR/nginx/nexora.conf"; then
  echo "Replace both example server names in $SCRIPT_DIR/nginx/nexora.conf before installing." >&2
  exit 2
fi
if [[ -e /etc/nginx/sites-available/nexora ]] && grep -Eq '(^|[[:space:]])(erp|studio)\.example\.com([[:space:];]|$)' /etc/nginx/sites-available/nexora; then
  echo "Replace both example server names in /etc/nginx/sites-available/nexora before installing." >&2
  exit 2
fi

install -d -m 0755 "$ROOT" "$ROOT/releases" "$ROOT/bin" /var/lib/nexora /var/log/nexora
chown nexora:nexora /var/lib/nexora /var/log/nexora

if [[ -e "$ROOT/releases/$VERSION" ]]; then
  echo "Release already exists: $ROOT/releases/$VERSION (use a new version identifier)." >&2
  exit 1
fi
install -d -m 0755 "$ROOT/releases/$VERSION"
cp -a "$SCRIPT_DIR/release/." "$ROOT/releases/$VERSION/"
chown -R root:nexora "$ROOT/releases/$VERSION"
find "$ROOT/releases/$VERSION" -type d -exec chmod 0750 {} +
find "$ROOT/releases/$VERSION" -type f -exec chmod 0640 {} +
chmod 0755 "$ROOT/releases/$VERSION"
find "$ROOT/releases/$VERSION/web" -type d -exec chmod 0755 {} +
find "$ROOT/releases/$VERSION/web" -type f -exec chmod 0644 {} +
find "$ROOT/releases/$VERSION/studio" -type d -exec chmod 0755 {} +
find "$ROOT/releases/$VERSION/studio" -type f -exec chmod 0644 {} +

install -m 0755 "$SCRIPT_DIR/health-check.sh" "$ROOT/bin/health-check.sh"
install -m 0755 "$SCRIPT_DIR/switch-release.sh" "$ROOT/bin/switch-release.sh"
install -m 0755 "$SCRIPT_DIR/rollback.sh" "$ROOT/bin/rollback.sh"
install -m 0644 "$SCRIPT_DIR/systemd/aierp-platform-api.service" /etc/systemd/system/aierp-platform-api.service
install -m 0644 "$SCRIPT_DIR/systemd/aierp-ai-service.service" /etc/systemd/system/aierp-ai-service.service
if [[ ! -e /etc/nginx/sites-available/nexora ]]; then
  install -m 0644 "$SCRIPT_DIR/nginx/nexora.conf" /etc/nginx/sites-available/nexora
fi
ln -sfn /etc/nginx/sites-available/nexora /etc/nginx/sites-enabled/nexora
nginx -t
systemctl daemon-reload
systemctl enable aierp-platform-api.service aierp-ai-service.service
systemctl reload nginx
"$ROOT/bin/switch-release.sh" "$VERSION"
