param(
    [Parameter(Mandatory = $true)][string]$BundlePath,
    [Parameter(Mandatory = $true)][string]$TargetHistoryPath
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw "Migration release preflight failed: $Message" }

function Resolve-BundleFile([string]$RelativePath, [string]$Description) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath)) {
        Fail "$Description must be a relative path inside the migration bundle."
    }

    $segments = $RelativePath.Replace('\', '/') -split '/'
    if (@($segments | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -in @('.', '..') }).Count -gt 0) {
        Fail "$Description contains an unsafe path segment."
    }

    try { $bundleRoot = [IO.Path]::GetFullPath($bundle) }
    catch { Fail 'migration bundle root is not a valid filesystem path.' }
    $bundlePrefix = $bundleRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $pathComparison = if ([IO.Path]::DirectorySeparatorChar -eq '\') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }

    $resolvedPath = $bundleRoot
    foreach ($segment in $segments) {
        try { $resolvedPath = [IO.Path]::GetFullPath((Join-Path $resolvedPath $segment)) }
        catch { Fail "$Description is not a valid bundle-relative path." }
        if (-not $resolvedPath.StartsWith($bundlePrefix, $pathComparison)) {
            Fail "$Description resolves outside the migration bundle."
        }

        if (Test-Path -LiteralPath $resolvedPath) {
            $item = Get-Item -LiteralPath $resolvedPath -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                try { $target = $item.ResolveLinkTarget($true) }
                catch { Fail "$Description contains an unresolved link." }
                if ($null -eq $target) { Fail "$Description contains an unresolved link." }
                $resolvedPath = [IO.Path]::GetFullPath($target.FullName)
                if (-not $resolvedPath.StartsWith($bundlePrefix, $pathComparison)) {
                    Fail "$Description follows a link outside the migration bundle."
                }
            }
        }
    }

    return $resolvedPath
}

$bundle = (Resolve-Path -LiteralPath $BundlePath).Path
$manifestPath = Join-Path $bundle 'manifest.json'
$history = Get-Content -LiteralPath $TargetHistoryPath -Raw | ConvertFrom-Json -AsHashtable
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable
if ($manifest.status -notin @('generated-not-applied', 'generated-applied-local')) {
    Fail 'manifest status must identify a generated package, optionally applied only to local development databases.'
}

$expectedTargets = @{
    PlatformDbContext = 'AIERPPlatform'
    TenantDbContext = 'AIERPTenant_<tenant-guid>'
    AIStudioDbContext = 'AIERPStudio'
}
$contexts = @($manifest.contexts)
if ($contexts.Count -ne 3) { Fail 'exactly Platform, Tenant, and AIStudio contexts are required.' }
$historyContexts = @($history.Keys | Sort-Object)
if (($historyContexts -join ',') -ne 'AIStudioDbContext,PlatformDbContext,TenantDbContext') {
    Fail 'target history must provide all three context keys, including empty arrays for databases with no migrations.'
}

$summary = [System.Collections.Generic.List[object]]::new()
foreach ($context in $contexts) {
    $name = [string]$context.name
    if (-not $expectedTargets.ContainsKey($name) -or $context.database -ne $expectedTargets[$name]) { Fail "unexpected database mapping for $name." }
    $sqlPath = Resolve-BundleFile ([string]$context.file) "$name script path"
    if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) { Fail "script missing for $name." }
    $sqlBytes = [IO.File]::ReadAllBytes($sqlPath)
    $sha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sqlBytes))
    if ($sha -ne [string]$context.sha256) { Fail "checksum mismatch for $name." }
    $sql = [Text.Encoding]::UTF8.GetString($sqlBytes)
    $releaseIds = @([regex]::Matches($sql, "WHERE\s+\[MigrationId\]\s*=\s*N'([^']+)'", [Text.RegularExpressions.RegexOptions]::IgnoreCase) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    if ($releaseIds.Count -ne [int]$context.migrationCount) { Fail "$name script contains $($releaseIds.Count) distinct migration guards, expected $($context.migrationCount)." }
    if ($releaseIds[-1] -ne [string]$context.latestMigration) { Fail "$name latest script ID does not match its manifest." }

    if ($context.Contains('incrementalFile') -or $context.Contains('incrementalSha256')) {
        if (-not $context.Contains('incrementalFile') -or -not $context.Contains('incrementalSha256')) { Fail "$name incremental script metadata is incomplete." }
        $incrementalPath = Resolve-BundleFile ([string]$context.incrementalFile) "$name incremental script path"
        if (-not (Test-Path -LiteralPath $incrementalPath -PathType Leaf)) { Fail "incremental script missing for $name." }
        $incrementalSha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($incrementalPath)))
        if ($incrementalSha -ne [string]$context.incrementalSha256) { Fail "incremental script checksum mismatch for $name." }
    }

    $installed = @($history[$name] | ForEach-Object { [string]$_ })
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($id in $installed) { if (-not $seen.Add($id)) { Fail "$name target history contains duplicate ID $id." } }
    $releaseSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($id in $releaseIds) { [void]$releaseSet.Add($id) }
    foreach ($id in $installed) { if (-not $releaseSet.Contains($id)) { Fail "$name target contains unknown/orphan migration ID $id; DBA reconciliation is required." } }
    $matched = 0
    foreach ($id in $releaseIds) {
        if ($matched -lt $installed.Count) {
            if ($id -ne $installed[$matched]) { Fail "$name target history is not a prefix of the release; first mismatch at index $matched." }
            $matched++
        }
    }
    $summary.Add([pscustomobject]@{ context = $name; database = $context.database; targetApplied = $installed.Count; releaseMigrations = $releaseIds.Count; pending = $releaseIds.Count - $installed.Count; latest = $releaseIds[-1] })
}

@{
    status = 'passed-static-history-preflight'
    compatibility = 'NOT_PROVEN: migration history ordering and package integrity only; execute on an isolated restore of target data to prove schema/data compatibility.'
    checkedAtUtc = [DateTime]::UtcNow.ToString('O')
    contexts = @($summary)
} | ConvertTo-Json -Depth 5
