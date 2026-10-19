[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallRoot,
    [Parameter(Mandatory)][ValidatePattern('^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$')][string]$Version,
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][string]$StudioHostName,
    [int]$HealthTimeoutSeconds = 60
)
$ErrorActionPreference = 'Stop'
Import-Module WebAdministration
$releasePath = Join-Path ([IO.Path]::GetFullPath($InstallRoot)) (Join-Path 'releases' $Version)
$manifestPath = Join-Path $releasePath 'bundle.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Release $Version does not exist or has no manifest." }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne $Version) { throw 'Release manifest version does not match the requested version.' }
$sites = @{
    'Nexora-PlatformApi' = Join-Path $releasePath 'platform-api'
    'Nexora-AIService' = Join-Path $releasePath 'ai-service'
    'Nexora-ERP' = Join-Path $releasePath 'erp-web'
    'Nexora-Studio' = Join-Path $releasePath 'development-studio'
}
$previous = @{}
foreach ($name in $sites.Keys) {
    if (-not (Test-Path "IIS:\Sites\$name")) { throw "IIS site is not installed: $name" }
    $previous[$name] = (Get-ItemProperty "IIS:\Sites\$name" -Name physicalPath).physicalPath
    if (-not (Test-Path -LiteralPath $sites[$name])) { throw "Component output missing for $name" }
}
try {
    foreach ($name in $sites.Keys) { Set-ItemProperty "IIS:\Sites\$name" -Name physicalPath -Value $sites[$name] }
    foreach ($pool in @('Nexora-PlatformApi','Nexora-AIService','Nexora-ERP','Nexora-Studio')) { & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool "/apppool.name:$pool" | Out-Null }
    & (Join-Path $releasePath 'Test-IisHealth.ps1') -BaseUri "https://$HostName" -StudioUri "https://$StudioHostName" -TimeoutSeconds $HealthTimeoutSeconds
    Write-Host "IIS sites switched to release $Version and health checks passed."
}
catch {
    $hasUsablePrevious = $true
    foreach ($name in $sites.Keys) {
        $oldPath = [IO.Path]::GetFullPath($previous[$name]).TrimEnd('\')
        $newPath = [IO.Path]::GetFullPath($sites[$name]).TrimEnd('\')
        if ($oldPath.Equals($newPath,[StringComparison]::OrdinalIgnoreCase) -or $oldPath.StartsWith($newPath + '\',[StringComparison]::OrdinalIgnoreCase)) { $hasUsablePrevious = $false }
    }
    if ($hasUsablePrevious) {
        foreach ($name in $sites.Keys) { Set-ItemProperty "IIS:\Sites\$name" -Name physicalPath -Value $previous[$name] }
        foreach ($pool in @('Nexora-PlatformApi','Nexora-AIService','Nexora-ERP','Nexora-Studio')) { & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool "/apppool.name:$pool" | Out-Null }
        Write-Error "Release $Version failed health checks; previous IIS physical paths were restored."
    }
    else {
        foreach ($name in @('Nexora-ERP','Nexora-Studio','Nexora-PlatformApi','Nexora-AIService')) { Stop-WebSite -Name $name -ErrorAction SilentlyContinue }
        Write-Error "Initial release $Version failed health checks and no previous release exists; all Nexora IIS sites were stopped fail-closed."
    }
    throw
}
