function Test-LocalReleaseFailureDrillPassed {
    [CmdletBinding()]
    param(
        [bool]$HasError,
        [bool]$CleanupSucceeded,
        [bool]$MigrationRolledBack,
        [bool]$CorruptRestoreRejected,
        [bool]$TargetSurvivedFailedRestore,
        [bool]$SafetyRestoreSucceeded
    )

    return (-not $HasError) -and $CleanupSucceeded -and $MigrationRolledBack -and
        $CorruptRestoreRejected -and $TargetSurvivedFailedRestore -and $SafetyRestoreSucceeded
}

Export-ModuleMember -Function Test-LocalReleaseFailureDrillPassed
