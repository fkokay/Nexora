Set-StrictMode -Version Latest

function ConvertFrom-PreflightByteCount {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Value,
        [Parameter(Mandatory)][string]$Label
    )

    $text = $Value.Trim()
    if ($text -notmatch '^\d+$') {
        throw "$Label must be a non-negative whole number of bytes; received '$text'."
    }

    $parsed = [long]0
    if (-not [long]::TryParse($text, [System.Globalization.NumberStyles]::None, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
        throw "$Label is outside the supported byte-count range."
    }
    return $parsed
}

function Get-TenantSeparationBackupRequiredBytes {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$AllocatedDatabaseBytes,
        [long]$ReserveFloorBytes = 1GB,
        [ValidateRange(1, 100)][int]$ReservePercent = 20
    )

    if ($AllocatedDatabaseBytes -le 0) { throw 'Allocated database size must be greater than zero.' }
    if ($ReserveFloorBytes -lt 0) { throw 'Backup reserve floor cannot be negative.' }

    $percentReserve = [decimal]::Ceiling(([decimal]$AllocatedDatabaseBytes * $ReservePercent) / 100)
    $reserve = [decimal][Math]::Max([decimal]$ReserveFloorBytes, $percentReserve)
    $required = [decimal]$AllocatedDatabaseBytes + $reserve
    if ($required -gt [long]::MaxValue) { throw 'Calculated backup requirement exceeds the supported byte-count range.' }
    return [long]$required
}

function Assert-TenantSeparationBackupSpace {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$AvailableBytes,
        [Parameter(Mandatory)][long]$AllocatedDatabaseBytes,
        [long]$ReserveFloorBytes = 1GB,
        [ValidateRange(1, 100)][int]$ReservePercent = 20
    )

    if ($AvailableBytes -lt 0) { throw 'Available backup space cannot be negative.' }
    $requiredBytes = Get-TenantSeparationBackupRequiredBytes -AllocatedDatabaseBytes $AllocatedDatabaseBytes -ReserveFloorBytes $ReserveFloorBytes -ReservePercent $ReservePercent
    if ($AvailableBytes -lt $requiredBytes) {
        $freeGiB = [Math]::Round($AvailableBytes / 1GB, 2)
        $requiredGiB = [Math]::Round($requiredBytes / 1GB, 2)
        throw "Insufficient free space on the SQL Server backup mount: $freeGiB GiB available, at least $requiredGiB GiB required (allocated AIERPPlatform size plus reserve). No full backup was started."
    }
    return $requiredBytes
}

Export-ModuleMember -Function ConvertFrom-PreflightByteCount, Get-TenantSeparationBackupRequiredBytes, Assert-TenantSeparationBackupSpace
