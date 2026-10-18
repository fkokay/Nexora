param(
    [string]$Container = "docker-workspace-sandbox-1"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$cacheDirectory = Join-Path $repoRoot "deploy/docker/sandbox-package-cache-runtime/python-wheels"
New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
$cacheRoot = (Resolve-Path (Join-Path $repoRoot "deploy/docker/sandbox-package-cache-runtime")).Path
$cacheDirectory = (Resolve-Path $cacheDirectory).Path
if (-not $cacheDirectory.StartsWith($cacheRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The package cache path resolved outside its expected directory."
}

$jobId = [guid]::NewGuid().ToString("N")
$workspaceId = [guid]::NewGuid()
$packageName = "aierp-cache-smoke-$($jobId.Substring(0, 8))"
$moduleName = $packageName.Replace('-', '_')
$normalizedPackageName = $packageName.Replace('-', '_')
$wheelName = "$normalizedPackageName-1.0.0-py3-none-any.whl"
$wheelPath = Join-Path $cacheDirectory $wheelName
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "aierp-sandbox-cache-$jobId"
$sourceZip = Join-Path $tempRoot "source.zip"
$manifestPath = Join-Path $tempRoot "job.json"
$containerJobPath = "/test-jobs/$jobId"
$resultCreated = $false
$jobSucceeded = $false

function Add-ZipTextEntry([IO.Compression.ZipArchive]$Archive, [string]$Path, [string]$Content) {
    $entry = $Archive.CreateEntry($Path, [IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    try {
        $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($false))
        try { $writer.Write($Content) } finally { $writer.Dispose() }
    } finally { $stream.Dispose() }
}

function Get-WheelRecordHash([string]$Content) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Content)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [Convert]::ToBase64String($sha.ComputeHash($bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    finally { $sha.Dispose() }
    return "sha256=$hash,$($bytes.Length)"
}

try {
    $running = docker inspect --format '{{.State.Running}}' $Container
    if ($LASTEXITCODE -ne 0 -or $running -ne "true") { throw "Workspace Sandbox container is not running." }
    $pending = docker exec $Container sh -c 'find /test-jobs -mindepth 2 -maxdepth 2 -type f -name job.json | while read f; do d=$(dirname "$f"); if [ ! -f "$d/result.json" ]; then echo pending; fi; done | wc -l'
    if ($LASTEXITCODE -ne 0 -or [int]$pending -gt 0) { throw "Workspace Sandbox already has pending work; smoke test was not queued." }
    if (Test-Path -LiteralPath $wheelPath) { throw "The generated smoke wheel path already exists." }

    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $wheelStream = [IO.File]::Open($wheelPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $wheelArchive = [IO.Compression.ZipArchive]::new($wheelStream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            $moduleContent = "def marker():`n    return 'operator-wheelhouse-ok'`n"
            $metadataContent = "Metadata-Version: 2.1`nName: $packageName`nVersion: 1.0.0`n"
            $wheelContent = "Wheel-Version: 1.0`nGenerator: aierp-package-cache-smoke`nRoot-Is-Purelib: true`nTag: py3-none-any`n"
            $wheelFiles = [ordered]@{
                "$moduleName/__init__.py" = $moduleContent
                "$normalizedPackageName-1.0.0.dist-info/METADATA" = $metadataContent
                "$normalizedPackageName-1.0.0.dist-info/WHEEL" = $wheelContent
            }
            foreach ($item in $wheelFiles.GetEnumerator()) { Add-ZipTextEntry $wheelArchive $item.Key $item.Value }
            $record = foreach ($item in $wheelFiles.GetEnumerator()) { "$($item.Key),$(Get-WheelRecordHash $item.Value)" }
            $record += "$normalizedPackageName-1.0.0.dist-info/RECORD,,"
            Add-ZipTextEntry $wheelArchive "$normalizedPackageName-1.0.0.dist-info/RECORD" ($record -join "`n")
        } finally { $wheelArchive.Dispose() }
    } finally { $wheelStream.Dispose() }

    $projectStream = [IO.File]::Open($sourceZip, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $projectArchive = [IO.Compression.ZipArchive]::new($projectStream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            Add-ZipTextEntry $projectArchive "requirements.txt" "$packageName==1.0.0"
            Add-ZipTextEntry $projectArchive "tests/test_operator_cache.py" "from $moduleName import marker`n`ndef test_operator_wheelhouse():`n    assert marker() == 'operator-wheelhouse-ok'`n"
        } finally { $projectArchive.Dispose() }
    } finally { $projectStream.Dispose() }

    $manifest = @{
        id = [guid]::ParseExact($jobId, "N")
        workspaceId = $workspaceId
        targetPath = "tests/test_operator_cache.py"
        createdAt = [DateTimeOffset]::UtcNow.ToString("O")
        operation = "test"
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))

    docker exec $Container mkdir -p $containerJobPath
    if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated sandbox smoke-job directory." }
    docker cp $sourceZip "${Container}:$containerJobPath/source.zip"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy the smoke source snapshot to the sandbox queue." }
    docker cp $manifestPath "${Container}:$containerJobPath/job.json.upload"
    if ($LASTEXITCODE -ne 0) { throw "Could not queue the isolated sandbox smoke job." }
    docker exec $Container mv "$containerJobPath/job.json.upload" "$containerJobPath/job.json"
    if ($LASTEXITCODE -ne 0) { throw "Could not atomically publish the sandbox smoke manifest." }

    $deadline = (Get-Date).AddSeconds(120)
    do {
        docker exec $Container test -f "$containerJobPath/result.json" 2>$null
        if ($LASTEXITCODE -eq 0) { $resultCreated = $true; break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    if (-not $resultCreated) { throw "Sandbox smoke job did not produce a result before timeout; queued files were preserved for inspection." }

    $resultJson = docker exec $Container cat "$containerJobPath/result.json"
    if ($LASTEXITCODE -ne 0) { throw "Could not read the sandbox smoke result." }
    $resultText = ($resultJson -join "`n").TrimStart([char]0xFEFF)
    $result = $resultText | ConvertFrom-Json
    if (-not $result.success -or $result.status -ne "Passed" -or $result.output -notmatch "1 passed") {
        throw "Sandbox operator-cache smoke failed: $($result.status) $($result.message) $($result.output)"
    }
    $jobSucceeded = $true

    Write-Output "Workspace Sandbox consumed the staged operator wheelhouse and passed the dependency-backed Python test."
}
finally {
    if ($jobSucceeded -and $jobId -match '^[0-9a-f]{32}$') {
        docker exec $Container rm -rf -- $containerJobPath
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove the completed smoke job directory $containerJobPath." }
    }
    if (Test-Path -LiteralPath $wheelPath -PathType Leaf) { Remove-Item -LiteralPath $wheelPath -Force }
    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
        $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
        $resolvedTempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (-not $resolvedTemp.StartsWith($resolvedTempBase, [StringComparison]::OrdinalIgnoreCase)) { throw "Temporary cleanup path resolved outside the system temp directory." }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
