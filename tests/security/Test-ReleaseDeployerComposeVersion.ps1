$ErrorActionPreference = 'Stop'

$dockerfile = Join-Path $PSScriptRoot '..\..\deploy\docker\ReleaseDeployer.Dockerfile'
$content = Get-Content -LiteralPath $dockerfile -Raw

$versionMatch = [regex]::Match($content, '(?m)^ARG COMPOSE_VERSION=v(?<version>\d+\.\d+\.\d+)\s*$')
if (-not $versionMatch.Success) {
    throw 'ReleaseDeployer must declare a semantic-version-pinned Docker Compose source tag.'
}

$version = [version]$versionMatch.Groups['version'].Value
$minimumFixedVersion = [version]'5.1.0'
if ($version -lt $minimumFixedVersion) {
    throw "Docker Compose $version is below $minimumFixedVersion, the first fixed version for CVE-2025-15558 (GO-2026-4610)."
}

$commitMatch = [regex]::Match($content, '(?m)^ARG COMPOSE_COMMIT=(?<commit>[0-9a-f]{40})\s*$')
if (-not $commitMatch.Success) {
    throw 'ReleaseDeployer must pin the Docker Compose source to a full commit SHA.'
}

Write-Output "PASS: ReleaseDeployer pins Docker Compose $version at commit $($commitMatch.Groups['commit'].Value); minimum fixed version for CVE-2025-15558 is $minimumFixedVersion."
