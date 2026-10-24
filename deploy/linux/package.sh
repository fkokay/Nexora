#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
VERSION="${1:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%dT%H%M%SZ)}"
OUTPUT_DIR="${2:-$REPO_ROOT/artifacts/linux}"

if [[ ! "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Invalid release version: use 1-64 letters, numbers, dots, underscores or hyphens." >&2
  exit 2
fi

for command in dotnet npm tar sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 127; }
done

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aierp-linux-package.XXXXXX")"
trap 'rm -rf -- "$WORK_DIR"' EXIT
BUNDLE_DIR="$WORK_DIR/aierp-linux-$VERSION"
RELEASE_DIR="$BUNDLE_DIR/release"
mkdir -p "$RELEASE_DIR/api" "$RELEASE_DIR/ai-service" "$RELEASE_DIR/web" "$RELEASE_DIR/studio" "$BUNDLE_DIR/systemd" "$BUNDLE_DIR/nginx" "$BUNDLE_DIR/config"

dotnet publish "$REPO_ROOT/src/Hosts/AIERP.Api/AIERP.Api.csproj" \
  --configuration Release --framework net10.0 --self-contained false \
  -p:UseAppHost=false --output "$RELEASE_DIR/api"
dotnet publish "$REPO_ROOT/src/AI/AIERP.AIService/AIERP.AIService.csproj" \
  --configuration Release --framework net10.0 --self-contained false \
  -p:UseAppHost=false --output "$RELEASE_DIR/ai-service"

# The SDK emits IIS web.config files even for Linux publishes. These bundles run
# behind nginx with systemd/Kestrel, so the IIS-only files are neither used nor shipped.
rm -f -- "$RELEASE_DIR/api/web.config" "$RELEASE_DIR/ai-service/web.config"

build_frontend() {
  local source_dir="$1" output_dir="$2" stage_dir="$3"
  mkdir -p "$stage_dir" "$output_dir"
  cp "$source_dir/package.json" "$source_dir/package-lock.json" "$source_dir/index.html" "$source_dir"/vite.config.* "$stage_dir/"
  cp "$source_dir"/tsconfig*.json "$stage_dir/"
  cp -a "$source_dir/src" "$stage_dir/src"
  if [[ -d "$source_dir/public" ]]; then cp -a "$source_dir/public" "$stage_dir/public"; fi
  (cd "$stage_dir" && npm ci && npm run build)
  cp -a "$stage_dir/dist/." "$output_dir/"
}

# Build in temporary clean copies so npm ci never prunes a developer's live node_modules.
build_frontend "$REPO_ROOT/frontend/erp-web" "$RELEASE_DIR/web" "$WORK_DIR/frontend-erp-web"
build_frontend "$REPO_ROOT/frontend/development-studio" "$RELEASE_DIR/studio" "$WORK_DIR/frontend-development-studio"

printf '%s\n' "$VERSION" > "$RELEASE_DIR/VERSION"
cp "$SCRIPT_DIR/install.sh" "$BUNDLE_DIR/install.sh"
cp "$SCRIPT_DIR/preflight.sh" "$BUNDLE_DIR/preflight.sh"
cp "$SCRIPT_DIR/config-preflight.sh" "$BUNDLE_DIR/config-preflight.sh"
cp "$SCRIPT_DIR/health-check.sh" "$BUNDLE_DIR/health-check.sh"
cp "$SCRIPT_DIR/switch-release.sh" "$BUNDLE_DIR/switch-release.sh"
cp "$SCRIPT_DIR/rollback.sh" "$BUNDLE_DIR/rollback.sh"
cp "$SCRIPT_DIR/README.md" "$BUNDLE_DIR/README.md"
cp "$SCRIPT_DIR/systemd/"*.service "$BUNDLE_DIR/systemd/"
cp "$SCRIPT_DIR/nginx/nexora.conf" "$BUNDLE_DIR/nginx/nexora.conf"
cp "$SCRIPT_DIR/config/"*.env.example "$BUNDLE_DIR/config/"
chmod 0755 "$BUNDLE_DIR/"*.sh

(cd "$RELEASE_DIR" && find api ai-service web studio -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum VERSION >> SHA256SUMS)
(cd "$BUNDLE_DIR" && find . -type f ! -name BUNDLE-SHA256SUMS -printf '%P\0' | sort -z | xargs -0 sha256sum > BUNDLE-SHA256SUMS)
(cd "$WORK_DIR" && tar -czf "$OUTPUT_DIR/aierp-linux-$VERSION.tar.gz" "aierp-linux-$VERSION")
(cd "$OUTPUT_DIR" && sha256sum "aierp-linux-$VERSION.tar.gz" > "aierp-linux-$VERSION.tar.gz.sha256")
echo "Created $OUTPUT_DIR/aierp-linux-$VERSION.tar.gz"
