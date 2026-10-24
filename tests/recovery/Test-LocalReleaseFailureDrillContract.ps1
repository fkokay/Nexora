$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'LocalReleaseFailureDrillContract.psm1'
Import-Module $modulePath -Force

$requiredEvidence = @{
    HasError = $false
    CleanupSucceeded = $true
    MigrationRolledBack = $true
    CorruptRestoreRejected = $true
    TargetSurvivedFailedRestore = $true
    SafetyRestoreSucceeded = $true
}

if (-not (Test-LocalReleaseFailureDrillPassed @requiredEvidence)) {
    throw 'A drill with all required evidence must pass.'
}

foreach ($failedEvidence in @('CleanupSucceeded', 'MigrationRolledBack', 'CorruptRestoreRejected', 'TargetSurvivedFailedRestore', 'SafetyRestoreSucceeded')) {
    $case = $requiredEvidence.Clone()
    $case[$failedEvidence] = $false
    if (Test-LocalReleaseFailureDrillPassed @case) {
        throw "The drill must fail when '$failedEvidence' is false."
    }
}

$errorCase = $requiredEvidence.Clone()
$errorCase.HasError = $true
if (Test-LocalReleaseFailureDrillPassed @errorCase) {
    throw 'The drill must fail when an error was recorded.'
}

Write-Output 'Local release failure drill contract passed: 7/7 cases.'
