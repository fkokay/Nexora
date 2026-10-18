$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot '..\..\deploy\docker\TenantSeparation.Preflight.psm1'
Import-Module $modulePath -Force

function Assert-Equal([long]$Actual, [long]$Expected, [string]$Name) {
    if ($Actual -ne $Expected) { throw "$Name failed: expected $Expected, got $Actual." }
}

function Assert-Throws([scriptblock]$Action, [string]$ExpectedText, [string]$Name) {
    try { & $Action } catch {
        if ($_.Exception.Message -notlike "*$ExpectedText*") { throw "$Name failed with unexpected error: $($_.Exception.Message)" }
        return
    }
    throw "$Name failed: expected an exception containing '$ExpectedText'."
}

$parsed = ConvertFrom-PreflightByteCount -Value "`n 10737418240 `n" -Label 'fixture bytes'
Assert-Equal $parsed 10GB 'strict byte parsing'
Assert-Throws { ConvertFrom-PreflightByteCount -Value '10 GiB' -Label 'fixture bytes' } 'whole number of bytes' 'malformed byte output'
Assert-Throws { ConvertFrom-PreflightByteCount -Value '999999999999999999999999999999' -Label 'fixture bytes' } 'supported byte-count range' 'overflow byte output'

# 10 GiB allocated requires 12 GiB (20% reserve); 2 GiB allocated still
# requires the 1 GiB minimum reserve, for 3 GiB total.
Assert-Equal (Get-TenantSeparationBackupRequiredBytes -AllocatedDatabaseBytes 10GB) 12GB 'percentage reserve sizing'
Assert-Equal (Get-TenantSeparationBackupRequiredBytes -AllocatedDatabaseBytes 2GB) 3GB 'minimum reserve sizing'
Assert-Equal (Assert-TenantSeparationBackupSpace -AvailableBytes 12GB -AllocatedDatabaseBytes 10GB) 12GB 'sufficient space acceptance'
Assert-Throws { Assert-TenantSeparationBackupSpace -AvailableBytes (12GB - 1) -AllocatedDatabaseBytes 10GB } 'No full backup was started' 'fail-closed insufficient space'
Assert-Throws { Assert-TenantSeparationBackupSpace -AvailableBytes 20GB -AllocatedDatabaseBytes 0 } 'greater than zero' 'fail-closed invalid database size'

Write-Host 'Tenant separation backup preflight regression passed (offline; no Docker or SQL used).'
