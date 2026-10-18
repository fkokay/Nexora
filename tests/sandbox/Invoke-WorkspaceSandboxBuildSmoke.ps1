[CmdletBinding()]
param(
    [string]$RunnerContainer = 'docker-workspace-runner-1',
    [string]$SandboxContainer = 'docker-workspace-sandbox-1',
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\workspace-build-smoke.json'),
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
foreach ($container in @($RunnerContainer, $SandboxContainer)) {
    $running = & $docker inspect --format '{{.State.Running}}' $container 2>$null
    if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne 'true') { throw "Required running container is unavailable: $container" }
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('aierp-sandbox-build-' + [Guid]::NewGuid().ToString('N'))
$sourceRoot = Join-Path $tempRoot 'source'
$archivePath = Join-Path $tempRoot 'source.zip'
$results = [Collections.Generic.List[object]]::new()
$jobIds = [Collections.Generic.List[string]]::new()
New-Item -ItemType Directory -Force -Path (Join-Path $sourceRoot 'node'), (Join-Path $sourceRoot 'python'), (Join-Path $sourceRoot 'go'), (Join-Path $sourceRoot 'rust\src') | Out-Null
Set-Content -LiteralPath (Join-Path $sourceRoot 'node\package.json') -Value '{"type":"module"}' -Encoding utf8
Set-Content -LiteralPath (Join-Path $sourceRoot 'node\index.js') -Value 'export const ready = true;' -Encoding utf8
Set-Content -LiteralPath (Join-Path $sourceRoot 'python\sample.py') -Value "def ready():`n    return True`n" -Encoding utf8
Set-Content -LiteralPath (Join-Path $sourceRoot 'go\go.mod') -Value "module example.local/sandbox-smoke`ngo 1.20" -Encoding utf8
Set-Content -LiteralPath (Join-Path $sourceRoot 'go\main.go') -Value "package main`nfunc main() {}`n" -Encoding utf8
Set-Content -LiteralPath (Join-Path $sourceRoot 'rust\Cargo.toml') -Value "[package]`nname = `"sandbox-smoke`"`nversion = `"0.1.0`"`nedition = `"2021`"`n" -Encoding utf8
Set-Content -LiteralPath (Join-Path $sourceRoot 'rust\src\main.rs') -Value "fn main() {}`n" -Encoding utf8

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $archivePath)
    $targets = @(
        @{ Ecosystem = 'Node.js'; Path = 'node/package.json' },
        @{ Ecosystem = 'Python'; Path = 'python/sample.py' },
        @{ Ecosystem = 'Go'; Path = 'go/go.mod' },
        @{ Ecosystem = 'Rust'; Path = 'rust/Cargo.toml' }
    )
    foreach ($target in $targets) {
        $jobGuid = [Guid]::NewGuid()
        $workspaceGuid = [Guid]::NewGuid()
        $jobId = $jobGuid.ToString('N')
        $jobIds.Add($jobId)
        $jobDirectory = Join-Path $tempRoot $jobId
        New-Item -ItemType Directory -Force -Path $jobDirectory | Out-Null
        $manifest = [ordered]@{
            id = $jobGuid.ToString('D')
            workspaceId = $workspaceGuid.ToString('D')
            targetPath = $target.Path
            commitSha = ''
            snapshotSha256 = ('0' * 64)
            hasUncommittedChanges = $false
            createdAt = [DateTimeOffset]::UtcNow.ToString('o')
            operation = 'build'
        }
        $manifestPath = Join-Path $jobDirectory 'job.json'
        $manifest | ConvertTo-Json -Compress | Set-Content -LiteralPath $manifestPath -Encoding utf8
        & $docker exec --user 0 $RunnerContainer mkdir -m 700 -p "/test-jobs/$jobId"
        if ($LASTEXITCODE -ne 0) { throw 'Could not create an isolated sandbox smoke job.' }
        & $docker cp $archivePath "${RunnerContainer}:/test-jobs/$jobId/source.zip"
        if ($LASTEXITCODE -ne 0) { throw 'Could not copy the smoke source snapshot into the test queue.' }
        & $docker cp $manifestPath "${RunnerContainer}:/test-jobs/$jobId/job.json"
        if ($LASTEXITCODE -ne 0) { throw 'Could not copy the sandbox job manifest into the test queue.' }
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
        $result = $null
        while ([DateTimeOffset]::UtcNow -lt $deadline) {
            $json = & $docker exec --user 0 $RunnerContainer sh -c "cat /test-jobs/$jobId/result.json 2>/dev/null"
            if ($LASTEXITCODE -eq 0 -and $json) { $jsonText = ($json -join "`n").TrimStart([char]0xFEFF); $result = $jsonText | ConvertFrom-Json; break }
            Start-Sleep -Milliseconds 500
        }
        if ($null -eq $result) { throw "Sandbox build smoke timed out for $($target.Ecosystem)." }
        $results.Add([pscustomobject]@{ ecosystem = $target.Ecosystem; target = $target.Path; status = $result.status; success = $result.success; exitCode = $result.exitCode; durationMilliseconds = $result.durationMilliseconds; message = $result.message })
    }
}
finally {
    foreach ($jobId in $jobIds) {
        & $docker exec --user 0 $RunnerContainer rm -rf -- "/test-jobs/$jobId" 2>$null | Out-Null
    }
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

$passed = $results.Count -eq 4 -and @($results | Where-Object { -not $_.success -or $_.status -ne 'Built' }).Count -eq 0
$report = [ordered]@{
    completedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    runnerContainer = $RunnerContainer
    sandboxContainer = $SandboxContainer
    networkDisabled = $true
    externalDependencies = $false
    results = @($results)
    status = if ($passed) { 'passed' } else { 'failed' }
}
$fullReportPath = [IO.Path]::GetFullPath($ReportPath)
$reportDirectory = Split-Path -Parent $fullReportPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $fullReportPath -Encoding utf8
if (-not $passed) { throw "One or more offline sandbox build checks failed. See $fullReportPath" }
Write-Output ($report | ConvertTo-Json -Depth 5)
