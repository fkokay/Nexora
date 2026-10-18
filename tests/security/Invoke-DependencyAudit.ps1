[CmdletBinding()]
param([string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\dependency-audit.json'))

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$audits = [System.Collections.Generic.List[object]]::new()

function Count-NuGetVulnerabilities($Node) {
    if ($null -eq $Node) { return 0 }
    $count = 0
    if ($Node -is [System.Collections.IDictionary]) {
        if ($Node.Contains('vulnerabilities')) {
            $items = $Node['vulnerabilities']
            if ($items -is [System.Collections.IDictionary]) { $count += $items.Count }
            elseif ($items -is [System.Collections.IEnumerable] -and $items -isnot [string]) { $count += @($items).Count }
        }
        foreach ($key in $Node.Keys) { if ($key -ne 'vulnerabilities') { $count += Count-NuGetVulnerabilities $Node[$key] } }
    } elseif ($Node -is [System.Collections.IEnumerable] -and $Node -isnot [string]) {
        foreach ($item in $Node) { $count += Count-NuGetVulnerabilities $item }
    }
    return $count
}

Push-Location $repoRoot
try {
    $nugetText = (& dotnet list AIERP.slnx package --vulnerable --include-transitive --format json 2>&1 | Out-String)
    $nugetExit = $LASTEXITCODE
    if ($nugetExit -ne 0) { throw 'NuGet vulnerability audit command failed.' }
    $nuget = $nugetText | ConvertFrom-Json -AsHashtable
    $nugetCount = Count-NuGetVulnerabilities $nuget
    $audits.Add([ordered]@{ ecosystem = 'NuGet'; scope = 'AIERP.slnx including transitive dependencies'; vulnerabilityCount = $nugetCount; commandSucceeded = $true })

    foreach ($frontend in @('frontend/erp-web', 'frontend/development-studio')) {
        Push-Location (Join-Path $repoRoot $frontend)
        try {
            $npmText = (& npm audit --json 2>&1 | Out-String)
            $npmExit = $LASTEXITCODE
            $npm = $npmText | ConvertFrom-Json -AsHashtable
            $npmCount = [int]$npm.metadata.vulnerabilities.total
            $audits.Add([ordered]@{ ecosystem = 'npm'; scope = $frontend; vulnerabilityCount = $npmCount; commandSucceeded = $npmExit -eq 0 })
        } finally { Pop-Location }
    }
} finally { Pop-Location }

$total = ($audits | Measure-Object -Property vulnerabilityCount -Sum).Sum
$report = [ordered]@{
    dateUtc = [DateTime]::UtcNow.ToString('o')
    environment = 'local-worktree'
    audits = $audits
    totalVulnerabilities = [int]$total
    passed = [int]$total -eq 0 -and @($audits | Where-Object { -not $_.commandSucceeded }).Count -eq 0
    notes = 'NuGet and npm advisory database results at scan time. This dependency audit is not SAST, container image scanning, or penetration testing.'
}
$resolved = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolved)) | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $resolved
$report | ConvertTo-Json -Depth 8
Write-Output "Result written to $resolved"
if (-not $report.passed) { throw 'Dependency audit reported vulnerabilities or a scan command failed.' }
