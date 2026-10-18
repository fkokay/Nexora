[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$preflight = Join-Path $repoRoot 'deploy\linux\preflight.sh'
$gitBash = Join-Path ${env:ProgramFiles} 'Git\bin\bash.exe'
$bash = if (Test-Path -LiteralPath $gitBash) { $gitBash } else { (Get-Command bash -ErrorAction Stop).Source }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('Nexora-linux-preflight-' + [Guid]::NewGuid().ToString('N'))
$bundleRoot = Join-Path $fixtureRoot 'bundle'
$releaseRoot = Join-Path $bundleRoot 'release'
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
foreach ($relative in @('nginx/nexora.conf','systemd/aierp-platform-api.service','systemd/aierp-ai-service.service','config/platform-api.env.example','config/ai-service.env.example')) {
    $path = Join-Path $bundleRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
    [IO.File]::WriteAllText($path, "fixture`n", [Text.Encoding]::ASCII)
}
foreach ($name in @('install.sh','health-check.sh','switch-release.sh','rollback.sh')) {
    [IO.File]::WriteAllText((Join-Path $bundleRoot $name), "#!/usr/bin/env bash`n", [Text.Encoding]::ASCII)
}

function Write-FixtureManifest {
    $files = @(Get-ChildItem -LiteralPath $releaseRoot -File -Recurse | Where-Object Name -ne 'SHA256SUMS' | Sort-Object FullName)
    $lines = foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($releaseRoot, $file.FullName).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $relative"
    }
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS'), (($lines -join "`n") + "`n"), [Text.Encoding]::ASCII)
}

function Invoke-Preflight {
    $output = @(& $bash $preflight $bundleRoot 2>&1)
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}

try {
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'VERSION'), "fixture-1`n", [Text.Encoding]::ASCII)
    foreach ($componentFile in @('api/AIERP.Api.dll','ai-service/AIERP.AIService.dll','web/index.html','studio/index.html')) {
        $path = Join-Path $releaseRoot $componentFile
        New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
        [IO.File]::WriteAllText($path, "$componentFile fixture`n", [Text.Encoding]::ASCII)
    }
    Write-FixtureManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -ne 0 -or $result.Output -notmatch 'preflight passed') { throw "Valid temporary bundle was rejected: $($result.Output)" }

    [IO.File]::AppendAllText((Join-Path $releaseRoot 'api\AIERP.Api.dll'), 'tampered')
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'checksum mismatch') { throw 'Modified payload did not fail checksum validation.' }

    Write-FixtureManifest
    $manifest = Join-Path $releaseRoot 'SHA256SUMS'
    $manifestLine = Get-Content -LiteralPath $manifest | Where-Object { $_ -match 'VERSION$' } | Select-Object -First 1
    $hash = $manifestLine.Substring(0,64)
    [IO.File]::AppendAllText($manifest, "$hash  ../outside`n", [Text.Encoding]::ASCII)
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'unsafe path') { throw "Path traversal in the checksum manifest was not rejected: $($result.Output)" }

    Write-FixtureManifest
    $versionLines = @(Get-Content -LiteralPath $manifest | Where-Object { $_ -notmatch '\sVERSION$' })
    [IO.File]::WriteAllText($manifest, (($versionLines -join "`n") + "`n"), [Text.Encoding]::ASCII)
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'does not cover release/VERSION') { throw 'An unchecksummed release version was accepted.' }

    Write-FixtureManifest
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'unmanifested.txt'), 'not in checksum list', [Text.Encoding]::ASCII)
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'unmanifested release file') { throw 'An unmanifested release file was accepted.' }

    Write-Output 'Linux installer preflight fixture smoke passed: valid bundle accepted; changed payload, traversal path, missing version checksum, and unmanifested file rejected.'
}
finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
