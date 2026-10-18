[CmdletBinding()]
param(
    [string]$PrometheusUrl = 'http://localhost:9090',
    [string]$PlatformMetricsUrl = 'http://localhost:5080/metrics',
    [ValidateRange(15, 600)][int]$MaximumScrapeAgeSeconds = 90,
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\prometheus-runtime-acceptance.json')
)

$ErrorActionPreference = 'Stop'
$expectedJobs = @(
    'aierp-platform-api',
    'aierp-ai-service',
    'aierp-integration-host',
    'aierp-release-deployer'
)
$targetsUri = "$($PrometheusUrl.TrimEnd('/'))/api/v1/targets?state=active"
$targetsResponse = Invoke-RestMethod -Method Get -Uri $targetsUri -TimeoutSec 10
if ($targetsResponse.status -ne 'success') { throw 'Prometheus did not return a successful targets response.' }

$activeTargets = @($targetsResponse.data.activeTargets)
$targetResults = foreach ($job in $expectedJobs) {
    $target = @($activeTargets | Where-Object { $_.labels.job -eq $job }) | Select-Object -First 1
    if (-not $target) { throw "Prometheus target is missing: $job" }
    $lastScrape = if ($target.lastScrape -is [datetime]) {
        [DateTimeOffset]$target.lastScrape
    } else {
        [DateTimeOffset]::Parse([string]$target.lastScrape, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal)
    }
    $ageSeconds = [Math]::Round(([DateTimeOffset]::UtcNow - $lastScrape.ToUniversalTime()).TotalSeconds, 1)
    if ($target.health -ne 'up' -or $target.lastError) { throw "Prometheus target is not healthy: $job" }
    if ($ageSeconds -lt 0 -or $ageSeconds -gt $MaximumScrapeAgeSeconds) { throw "Prometheus target scrape is stale: $job" }
    [pscustomobject]@{ job = $job; health = $target.health; scrapeAgeSeconds = $ageSeconds; errorPresent = [bool]$target.lastError }
}

$metrics = (Invoke-WebRequest -Method Get -Uri $PlatformMetricsUrl -TimeoutSec 10).Content
if ($metrics -notmatch '(?m)^# TYPE aierp_http_server_request_duration_seconds histogram\s*$') {
    throw 'Platform API request-duration histogram is missing from the metrics endpoint.'
}
if ($metrics -notmatch '(?m)^aierp_http_server_request_duration_seconds_count\{[^\r\n]*\}\s+[1-9][0-9]*\s*$') {
    throw 'Platform API request-duration histogram has no observed requests.'
}

$result = [ordered]@{
    observedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    environment = 'local-docker-compose'
    prometheus = [ordered]@{ endpoint = $PrometheusUrl.TrimEnd('/'); checkedJobs = $targetResults.Count; targets = @($targetResults) }
    platformApiMetrics = [ordered]@{ endpoint = $PlatformMetricsUrl; requestDurationHistogramPresent = $true; requestsObserved = $true }
    result = 'passed'
    notes = 'Target labels and scrape timings plus metric-presence booleans only; no request labels, credentials, tenant IDs, or business data are stored.'
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $resolvedOutput
$targetResults | Select-Object job,health,scrapeAgeSeconds,errorPresent | Format-Table -AutoSize
Write-Output "Prometheus runtime acceptance passed. Result: $resolvedOutput"
