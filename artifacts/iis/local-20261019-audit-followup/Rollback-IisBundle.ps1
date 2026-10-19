[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallRoot,
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][string]$StudioHostName,
    [string]$Version,
    [ValidateRange(1,300)][int]$HealthTimeoutSeconds = 60
)
$ErrorActionPreference = 'Stop'
Import-Module WebAdministration
$root = [IO.Path]::GetFullPath($InstallRoot)
if (-not $Version) {
    $currentPath = (Get-ItemProperty 'IIS:\Sites\Nexora-ERP' -Name physicalPath).physicalPath
    $currentVersion = Split-Path -Leaf (Split-Path -Parent $currentPath)
    $Version = Get-ChildItem -LiteralPath (Join-Path $root 'releases') -Directory |
        Where-Object Name -ne $currentVersion |
        Where-Object { Test-Path (Join-Path $_.FullName 'bundle.json') } |
        Sort-Object { (Get-Content (Join-Path $_.FullName 'bundle.json') -Raw | ConvertFrom-Json).builtAtUtc } -Descending |
        Select-Object -First 1 -ExpandProperty Name
    if (-not $Version) { throw 'No prior release is available. Specify -Version to select a retained release explicitly.' }
}
& (Join-Path $PSScriptRoot 'Switch-IisRelease.ps1') -InstallRoot $root -Version $Version -HostName $HostName -StudioHostName $StudioHostName -HealthTimeoutSeconds $HealthTimeoutSeconds
