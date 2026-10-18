param(
    [string[]]$Images = @(
        'docker-platform-api:latest',
        'docker-ai-service:latest',
        'docker-workspace-runner:latest',
        'docker-workspace-sandbox:latest',
        'docker-release-deployer:latest',
        'docker-plugin-host:latest',
        'docker-integration-host:latest',
        'docker-development-studio:latest'
    ),
    [string]$ReportPath = 'docs/container-image-scan.json'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required.' }
$scanRoot = Join-Path ([IO.Path]::GetTempPath()) ("aierp-scout-" + [Guid]::NewGuid().ToString('N'))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$scanRoot = [IO.Path]::GetFullPath($scanRoot)
if (-not $scanRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary scan path escaped the system temp directory.' }
New-Item -ItemType Directory -Path $scanRoot | Out-Null

try {
    $imageReports = [Collections.Generic.List[object]]::new()
    foreach ($image in $Images) {
        $safeName = $image -replace '[^A-Za-z0-9_.-]', '_'
        $sarifPath = Join-Path $scanRoot "$safeName.sarif"
        & docker scout cves --format sarif --output $sarifPath "local://$image" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Docker Scout failed for $image (exit $LASTEXITCODE). Confirm the local image exists and Scout is available." }

        $sarif = Get-Content -LiteralPath $sarifPath -Raw | ConvertFrom-Json
        $run = $sarif.runs | Select-Object -First 1
        $severityCounts = [ordered]@{ critical = 0; high = 0; medium = 0; low = 0; unspecified = 0 }
        $cves = [Collections.Generic.List[string]]::new()
        foreach ($finding in $run.results) {
            $rule = $run.tool.driver.rules[$finding.ruleIndex]
            $severity = [string]$rule.properties.tags[0]
            if ([string]::IsNullOrWhiteSpace($severity)) { $severity = 'unspecified' }
            $severity = $severity.ToLowerInvariant()
            if (-not $severityCounts.Contains($severity)) { $severity = 'unspecified' }
            $severityCounts[$severity]++
            $cves.Add([string]$finding.ruleId)
        }
        $imageReports.Add([pscustomobject]@{
            image = $image
            digest = (& docker image inspect $image --format '{{.Id}}').Trim()
            vulnerabilityCount = $cves.Count
            bySeverity = $severityCounts
            cves = @($cves | Sort-Object -Unique)
        })
    }

    $totals = [ordered]@{ critical = 0; high = 0; medium = 0; low = 0; unspecified = 0 }
    $severityKeys = @($totals.Keys)
    foreach ($report in $imageReports) {
        foreach ($severity in $severityKeys) { $totals[$severity] += [int]$report.bySeverity[$severity] }
    }
    $result = [pscustomobject]@{
        scannedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
        scanner = 'Docker Scout CLI'
        imagesScanned = $imageReports.Count
        totals = $totals
        images = @($imageReports)
    }
    $resolvedReport = [IO.Path]::GetFullPath($ReportPath)
    $parent = Split-Path -Parent $resolvedReport
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedReport -Encoding utf8
    Write-Output $result | ConvertTo-Json -Depth 8
    if ($totals.critical -gt 0 -or $totals.high -gt 0) { exit 2 }
}
finally {
    foreach ($file in Get-ChildItem -LiteralPath $scanRoot -File -ErrorAction SilentlyContinue) { Remove-Item -LiteralPath $file.FullName -Force }
    if (Test-Path -LiteralPath $scanRoot) { Remove-Item -LiteralPath $scanRoot -Force }
}
