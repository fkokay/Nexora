[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$configs = @(
    'deploy/docker/erp-web.nginx.conf',
    'deploy/docker/development-studio.nginx.conf'
)

foreach ($relativePath in $configs) {
    $path = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Nginx configuration is missing: $relativePath"
    }

    $source = Get-Content -LiteralPath $path -Raw
    if ($source -notmatch '(?s)location\s*=\s*/index\.html\s*\{\s*expires\s+-1;\s*\}') {
        throw "$relativePath must disable fresh caching for the exact app shell path /index.html."
    }

    if ($source -notmatch '(?s)location\s+\^~\s+/assets/\s*\{\s*expires\s+1y;\s*\}') {
        throw "$relativePath must keep fingerprinted /assets/ files cacheable for one year."
    }
}

Write-Output "PASS: exact /index.html is revalidated and fingerprinted /assets/ remain cacheable in both Nginx configs ($($configs.Count)/$($configs.Count))."
