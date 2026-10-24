param(
    [string]$BundlePath,
    [string]$PreflightScript = (Join-Path $PSScriptRoot 'Test-MigrationReleaseReadiness.ps1')
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($BundlePath)) {
    $migrationRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\artifacts\migrations')).Path
    $BundlePath = Get-ChildItem -LiteralPath $migrationRoot -Directory | ForEach-Object {
        $manifestPath = Join-Path $_.FullName 'manifest.json'
        if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
            try {
                $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
                if ($manifest.generatedAtUtc -and $manifest.status -in @('generated-not-applied', 'generated-applied-local')) {
                    $generatedAtUtc = if ($manifest.generatedAtUtc -is [DateTime]) {
                        [DateTimeOffset]$manifest.generatedAtUtc
                    } else {
                        [DateTimeOffset]::Parse([string]$manifest.generatedAtUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal)
                    }
                    [pscustomobject]@{ Path = $_.FullName; GeneratedAtUtc = $generatedAtUtc }
                }
            } catch { throw "Could not read migration bundle manifest $manifestPath`: $($_.Exception.Message)" }
        }
    } | Sort-Object GeneratedAtUtc -Descending | Select-Object -First 1 -ExpandProperty Path
    if ([string]::IsNullOrWhiteSpace($BundlePath)) { throw 'No generated migration bundle with a valid manifest was found.' }
}
$bundle = (Resolve-Path -LiteralPath $BundlePath).Path
$manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw | ConvertFrom-Json
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('Nexora-migration-preflight-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-MigrationPreflight([string]$HistoryPath) {
    $output = @(& $PreflightScript -BundlePath $bundle -TargetHistoryPath $HistoryPath 2>&1)
    if (-not $?) { throw ($output -join [Environment]::NewLine) }
    return (($output -join [Environment]::NewLine) | ConvertFrom-Json)
}

try {
    $history = [ordered]@{}
    foreach ($context in $manifest.contexts) {
        $sql = Get-Content -LiteralPath (Join-Path $bundle $context.file) -Raw
        $ids = @([regex]::Matches($sql, "WHERE\s+\[MigrationId\]\s*=\s*N'([^']+)'", [Text.RegularExpressions.RegexOptions]::IgnoreCase) |
            ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
        $history[[string]$context.name] = $ids
    }
    $historyPath = Join-Path $tempRoot 'history.json'
    $history | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $historyPath -Encoding utf8
    $positive = Invoke-MigrationPreflight $historyPath
    if ($positive.status -ne 'passed-static-history-preflight' -or @($positive.contexts | Where-Object pending -ne 0).Count -ne 0) {
        throw 'Matching migration history did not pass with zero pending IDs.'
    }

    $orphanHistory = Get-Content -LiteralPath $historyPath -Raw | ConvertFrom-Json -AsHashtable
    $orphanHistory.PlatformDbContext += '20990101000000_UnknownMigration'
    $orphanPath = Join-Path $tempRoot 'orphan-history.json'
    $orphanHistory | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $orphanPath -Encoding utf8
    try { [void](Invoke-MigrationPreflight $orphanPath); throw 'Unknown migration history ID was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'unknown/orphan') { throw } }

    $unorderedHistory = Get-Content -LiteralPath $historyPath -Raw | ConvertFrom-Json -AsHashtable
    $unorderedHistory.PlatformDbContext = @($unorderedHistory.PlatformDbContext)
    if ($unorderedHistory.PlatformDbContext.Count -gt 1) {
        $first = $unorderedHistory.PlatformDbContext[0]
        $unorderedHistory.PlatformDbContext[0] = $unorderedHistory.PlatformDbContext[1]
        $unorderedHistory.PlatformDbContext[1] = $first
    }
    $unorderedPath = Join-Path $tempRoot 'unordered-history.json'
    $unorderedHistory | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $unorderedPath -Encoding utf8
    try { [void](Invoke-MigrationPreflight $unorderedPath); throw 'Non-prefix migration history was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'not a prefix') { throw } }

    $incrementalContext = @($manifest.contexts | Where-Object { $_.incrementalFile -and $_.incrementalSha256 } | Select-Object -First 1)
    if ($incrementalContext.Count -gt 0) {
        $tamperedBundle = Join-Path $tempRoot 'tampered-bundle'
        New-Item -ItemType Directory -Path $tamperedBundle | Out-Null
        Copy-Item -LiteralPath (Join-Path $bundle 'manifest.json') -Destination $tamperedBundle
        $historyEvidence = @('target-history-before-package.json', 'target-history-before-apply.json') |
            ForEach-Object { Join-Path $bundle $_ } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
        if ($historyEvidence) { Copy-Item -LiteralPath $historyEvidence -Destination $tamperedBundle }
        foreach ($entry in $manifest.contexts) {
            Copy-Item -LiteralPath (Join-Path $bundle ([string]$entry.file)) -Destination $tamperedBundle
            if ($entry.incrementalFile) { Copy-Item -LiteralPath (Join-Path $bundle ([string]$entry.incrementalFile)) -Destination $tamperedBundle }
        }
        Add-Content -LiteralPath (Join-Path $tamperedBundle ([string]$incrementalContext[0].incrementalFile)) -Value '-- tampered incremental script'
        $incrementalFailure = ''
        try {
            [void](& $PreflightScript -BundlePath $tamperedBundle -TargetHistoryPath $historyPath)
            throw 'Tampered incremental SQL was accepted.'
        } catch { $incrementalFailure = $_.Exception.Message }
        if ($incrementalFailure -notmatch 'incremental script checksum mismatch') {
            throw 'Tampered incremental SQL did not fail its manifest checksum check.'
        }
    }

    Write-Output "Migration readiness contract passed: exact histories pass across $(@($manifest.contexts).Count) contexts; orphan and non-prefix histories fail closed; incremental SQL checksums are enforced when packaged."
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
