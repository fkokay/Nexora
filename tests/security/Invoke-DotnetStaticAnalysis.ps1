[CmdletBinding()]
param([string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\dotnet-static-analysis.json'))

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$buildOutput = $null
$buildExitCode = -1

Push-Location $repoRoot
try {
    $buildOutput = (& dotnet build AIERP.slnx --no-restore `
        -p:EnableNETAnalyzers=true `
        -p:AnalysisLevel=latest-all `
        -p:AnalysisMode=AllEnabledByDefault `
        -v:minimal 2>&1 | Out-String)
    $buildExitCode = $LASTEXITCODE
} finally { Pop-Location }

$warningIds = @([regex]::Matches($buildOutput, '\bwarning\s+(CA\d{4})\s*:') |
    ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$errorIds = @([regex]::Matches($buildOutput, '\berror\s+(CA\d{4})\s*:') |
    ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$report = [ordered]@{
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    environment = 'local-worktree'
    scanner = '.NET SDK built-in analyzers'
    scope = 'AIERP.slnx C# projects; latest-all, AllEnabledByDefault; restore skipped'
    commandSucceeded = $buildExitCode -eq 0
    analyzerWarningCount = $warningIds.Count
    analyzerWarningRuleIds = $warningIds
    analyzerErrorCount = $errorIds.Count
    analyzerErrorRuleIds = $errorIds
    passed = $buildExitCode -eq 0 -and $warningIds.Count -eq 0 -and $errorIds.Count -eq 0
    limitations = @('C# and .NET SDK analyzers only; this is not dedicated cross-language SAST, dependency scanning, dynamic analysis, or penetration testing.')
}
$resolved = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolved)) | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolved -Encoding utf8
$report | ConvertTo-Json -Depth 8
Write-Output "Result written to $resolved"
if (-not $report.passed) { throw 'The .NET static analyzer build failed or reported analyzer diagnostics.' }
