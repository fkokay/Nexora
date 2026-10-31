[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BundlePath,
    [Parameter(Mandatory)][string]$InstallRoot,
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][string]$StudioHostName,
    [Parameter(Mandatory)][string]$CertificateThumbprint,
    [Parameter(Mandatory)][string]$SecretsFile
)

$ErrorActionPreference = 'Stop'
function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this installer from an elevated Windows PowerShell session.' }
}
function New-OrUpdate-AppPool([string]$Name) {
    if (-not (Test-Path "IIS:\AppPools\$Name")) { New-WebAppPool -Name $Name | Out-Null }
    Set-ItemProperty "IIS:\AppPools\$Name" -Name managedRuntimeVersion -Value ''
    Set-ItemProperty "IIS:\AppPools\$Name" -Name enable32BitAppOnWin64 -Value $false
    Set-ItemProperty "IIS:\AppPools\$Name" -Name startMode -Value 'AlwaysRunning'
    Set-ItemProperty "IIS:\AppPools\$Name" -Name processModel.identityType -Value 'ApplicationPoolIdentity'
}
function Write-AncmEnvironment([string]$WebConfigPath, [string]$AssemblyName, [hashtable]$Environment) {
    [xml]$xml = Get-Content -LiteralPath $WebConfigPath -Raw
    $aspNetCore = $xml.configuration.'system.webServer'.aspNetCore
    if ($null -eq $aspNetCore) { throw "ANCM configuration missing from $WebConfigPath" }
    $variables = $aspNetCore.SelectSingleNode('environmentVariables')
    if ($null -eq $variables) { $variables = $xml.CreateElement('environmentVariables'); [void]$aspNetCore.AppendChild($variables) }
    $all = @{}
    foreach ($key in $Environment.Keys) { $all[[string]$key] = [string]$Environment[$key] }
    $all['ASPNETCORE_ENVIRONMENT'] = 'Production'
    foreach ($key in ($all.Keys | Sort-Object)) {
        $element = $xml.CreateElement('environmentVariable')
        $element.SetAttribute('name', [string]$key)
        $element.SetAttribute('value', [string]$all[$key])
        [void]$variables.AppendChild($element)
    }
    $aspNetCore.SetAttribute('arguments', ".\$AssemblyName.dll")
    $xml.Save($WebConfigPath)
}
function Protect-ReleaseTree([string]$Path, [string]$PoolName) {
    $systemSid = '*S-1-5-18'
    $adminsSid = '*S-1-5-32-544'
    $poolIdentity = "IIS AppPool\${PoolName}:(OI)(CI)(RX)"
    & "$env:windir\system32\icacls.exe" $Path '/inheritance:r' '/grant:r' "$systemSid`:(OI)(CI)(F)" "$adminsSid`:(OI)(CI)(F)" $poolIdentity '/T' '/C' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not secure release files for $PoolName (icacls exit $LASTEXITCODE)." }
}
function Protect-VaultReaderFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Vault reader credential file is missing.' }
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -le 0) { throw 'Vault reader credential paths must be non-empty regular files, not reparse points.' }
    $systemSid = '*S-1-5-18'
    $adminsSid = '*S-1-5-32-544'
    $platformPool = 'IIS AppPool\Nexora-PlatformApi:(R)'
    $aiPool = 'IIS AppPool\Nexora-AIService:(R)'
    & "$env:windir\system32\icacls.exe" $Path '/inheritance:r' '/grant:r' "$systemSid`:(F)" "$adminsSid`:(F)" $platformPool $aiPool | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict Vault reader credential file ACL.' }
}
function Assert-ProtectedSecretsFile([string]$Path) {
    $acl = Get-Acl -LiteralPath $Path
    if ($acl.AreAccessRulesProtected -ne $true) { throw 'Secrets file ACL inheritance must be disabled; grant access explicitly to SYSTEM, Administrators, and the deployment identity.' }
    $allowedSids = @(
        [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
        [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'),
        [Security.Principal.WindowsIdentity]::GetCurrent().User
    ) | ForEach-Object Value | Select-Object -Unique
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
            try { $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value }
            catch { throw "Secrets file ACL contains an unresolvable principal: $($rule.IdentityReference)" }
            if ($sid -notin $allowedSids) { throw "Secrets file grants access to an unapproved principal: $($rule.IdentityReference). Restrict it to SYSTEM, Administrators, and the deployment identity." }
        }
    }
    if (-not ($acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-18' })) { throw 'Secrets file must grant SYSTEM access.' }
    if (-not ($acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-32-544' })) { throw 'Secrets file must grant Administrators access.' }
}
function Ensure-Site([string]$Name, [string]$Pool, [string]$Path, [string]$Protocol, [string]$Binding) {
    New-OrUpdate-AppPool $Pool
    if (-not (Test-Path "IIS:\Sites\$Name")) {
        $isSsl = $Protocol -eq 'https'
        New-Website -Name $Name -PhysicalPath $Path -ApplicationPool $Pool -IPAddress ($Binding.Split(':')[0]) `
            -Port ([int]$Binding.Split(':')[1]) -HostHeader ($Binding.Split(':',3)[2]) -Ssl:$isSsl | Out-Null
    }
    Set-ItemProperty "IIS:\Sites\$Name" -Name applicationPool -Value $Pool
    $existing = Get-WebBinding -Name $Name -Protocol $Protocol -ErrorAction SilentlyContinue |
        Where-Object { $_.bindingInformation -eq $Binding }
    if (-not $existing) {
        if ($Protocol -eq 'https') {
            $bindingParts = $Binding.Split(':', 3)
            New-WebBinding -Name $Name -Protocol https -Port ([int]$bindingParts[1]) -IPAddress $bindingParts[0] -HostHeader $bindingParts[2] -SslFlags 1
        }
        else { New-WebBinding -Name $Name -Protocol http -Port ([int]$Binding.Split(':')[1]) -IPAddress 127.0.0.1 -HostHeader '' }
    }
}

Assert-Administrator
Import-Module WebAdministration
$bundleFull = (Resolve-Path -LiteralPath $BundlePath).Path
$validationModule = Join-Path $bundleFull 'BundleValidation.psm1'
if (-not (Test-Path -LiteralPath $validationModule -PathType Leaf)) { throw 'IIS bundle validation module is missing.' }
Import-Module $validationModule -Force
$manifest = Assert-IisBundleIntegrity -BundlePath $bundleFull
$rootFull = [IO.Path]::GetFullPath($InstallRoot)
$secretFull = (Resolve-Path -LiteralPath $SecretsFile).Path
Assert-ProtectedSecretsFile $secretFull
$manifest = Assert-IisBundleIntegrity -BundlePath $bundleFull
$version = [string]$manifest.version
if ($version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$') { throw 'Bundle version is invalid.' }
foreach ($protectedRoot in @($bundleFull, $rootFull)) {
    $normalizedRoot = $protectedRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if ($secretFull.StartsWith($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Secrets file must remain outside the bundle and release directories.' }
}
foreach ($host in @($HostName,$StudioHostName)) { if ($host -notmatch '^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$') { throw 'Use DNS host names for the HTTPS bindings.' } }
if (-not (Get-WebGlobalModule | Where-Object Name -eq 'RewriteModule')) { throw 'Install IIS URL Rewrite 2.1 before deployment.' }
try { $null = Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' }
catch { throw 'Install IIS Application Request Routing 3.0 before deployment.' }
$certificate = Get-Item -LiteralPath "Cert:\LocalMachine\My\$($CertificateThumbprint.Replace(' ',''))" -ErrorAction Stop
Assert-IisCertificateCoverage -Certificate $certificate -HostName $HostName -StudioHostName $StudioHostName
$secrets = Import-PowerShellDataFile -LiteralPath $secretFull
if ($null -eq $secrets.Common -or $null -eq $secrets.PlatformApi -or $null -eq $secrets.AIService) { throw 'Secrets file must define Common, PlatformApi and AIService hashtables.' }

$platformEnvironment = @{}
$aiEnvironment = @{}
foreach ($key in $secrets.Common.Keys) { $platformEnvironment[$key] = $secrets.Common[$key]; $aiEnvironment[$key] = $secrets.Common[$key] }
foreach ($key in $secrets.PlatformApi.Keys) { $platformEnvironment[$key] = $secrets.PlatformApi[$key] }
foreach ($key in $secrets.AIService.Keys) { $aiEnvironment[$key] = $secrets.AIService[$key] }
$requiredPlatform = @('Authentication__SigningKey','ConnectionStrings__Platform','PluginHost__SigningKey','IntegrationQueue__EncryptionKey','AIService__BaseUrl')
$requiredAI = @('Authentication__SigningKey','ConnectionStrings__Platform','PlatformApi__BaseUrl')
foreach ($key in $requiredPlatform) { if ([string]::IsNullOrWhiteSpace([string]$platformEnvironment[$key]) -or [string]$platformEnvironment[$key] -match 'CHANGE-ME') { throw "PlatformApi setting is required: $key" } }
foreach ($key in $requiredAI) { if ([string]::IsNullOrWhiteSpace([string]$aiEnvironment[$key]) -or [string]$aiEnvironment[$key] -match 'CHANGE-ME') { throw "AIService setting is required: $key" } }
if ($platformEnvironment['Database__SeparationEnabled'] -ne 'true' -or $aiEnvironment['Database__SeparationEnabled'] -ne 'true') { throw 'Both PlatformApi and AIService must explicitly set Database__SeparationEnabled=true. Shared company databases are unsupported; perform the controlled backup-and-copy cutover before installing this release.' }
foreach ($key in @('ConnectionStrings__Tenant','ConnectionStrings__AIStudio')) { if ([string]::IsNullOrWhiteSpace([string]$platformEnvironment[$key]) -or [string]$platformEnvironment[$key] -match 'CHANGE-ME') { throw "PlatformApi setting is required: $key" } }
if ([string]::IsNullOrWhiteSpace([string]$aiEnvironment['ConnectionStrings__AIStudio']) -or [string]$aiEnvironment['ConnectionStrings__AIStudio'] -match 'CHANGE-ME') { throw 'AIService setting is required: ConnectionStrings__AIStudio' }
foreach ($key in @('ConnectionStrings__Tenant','ConnectionStrings__AIStudio')) {
    if ([string]$platformEnvironment[$key] -match '(?i)(^|;)\s*(user\s*id|uid|password|pwd)\s*=' -or ([string]$key -eq 'ConnectionStrings__AIStudio' -and [string]$aiEnvironment[$key] -match '(?i)(^|;)\s*(user\s*id|uid|password|pwd)\s*=')) { throw "Tenant SQL endpoint template must not contain shared SQL credentials: $key" }
}
foreach ($environment in @($platformEnvironment, $aiEnvironment)) {
    if ([string]$environment['Vault__Address'] -notmatch '^https://[^\s/]+(?::\d+)?/?$' -or [string]$environment['Vault__AllowHttpForLocalDevelopment'] -ne 'false') { throw 'PlatformApi and AIService require an HTTPS Vault__Address and Vault__AllowHttpForLocalDevelopment=false.' }
    if ([string]$environment['Vault__Mount'] -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') { throw 'PlatformApi and AIService require a valid Vault__Mount.' }
}
foreach ($key in @('Vault__TenantSqlCredentialReader__RoleIdFile','Vault__TenantSqlCredentialReader__SecretIdFile')) {
    $readerFile = [string]$platformEnvironment[$key]
    if ([string]::IsNullOrWhiteSpace($readerFile) -or $readerFile -ne [string]$aiEnvironment[$key] -or -not [IO.Path]::IsPathRooted($readerFile)) { throw "Both services require the same absolute Vault reader file path: $key" }
    if (-not (Test-Path -LiteralPath $readerFile -PathType Leaf)) { throw "Vault reader credential file is missing: $key" }
}
foreach ($key in @('Authentication__SigningKey','PluginHost__SigningKey')) {
    if ([Text.Encoding]::UTF8.GetByteCount([string]$platformEnvironment[$key]) -lt 32) { throw "$key must be at least 32 UTF-8 bytes." }
}
if ($platformEnvironment['Authentication__SigningKey'] -eq $platformEnvironment['PluginHost__SigningKey']) { throw 'PluginHost__SigningKey must be a separate secret from Authentication__SigningKey.' }
try { $integrationQueueKey = [Convert]::FromBase64String([string]$platformEnvironment['IntegrationQueue__EncryptionKey']) }
catch { throw 'IntegrationQueue__EncryptionKey must be base64 for exactly 32 random bytes.' }
if ($integrationQueueKey.Length -ne 32) { throw 'IntegrationQueue__EncryptionKey must be base64 for exactly 32 random bytes.' }
if ($platformEnvironment['Authentication__SigningKey'] -ne $aiEnvironment['Authentication__SigningKey']) { throw 'Platform API and AI Service must use the same Authentication__SigningKey.' }
$platformEnvironment['Frontend__Origins__0'] = "https://$HostName"
$platformEnvironment['Frontend__Origins__1'] = "https://$StudioHostName"
$aiEnvironment['Frontend__Origins__0'] = "https://$HostName"
$aiEnvironment['Frontend__Origins__1'] = "https://$StudioHostName"
$platformEnvironment['Database__ApplyMigrationsOnStartup'] = 'false'

$releaseRoot = Join-Path $rootFull 'releases'
$releasePath = Join-Path $releaseRoot $version
if (Test-Path -LiteralPath $releasePath) { throw "Release already exists; versioned release paths are immutable: $releasePath" }
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
New-Item -ItemType Directory -Path $releasePath | Out-Null
try {
    Get-ChildItem -LiteralPath $bundleFull -Force | Copy-Item -Destination $releasePath -Recurse -Force
    Write-AncmEnvironment (Join-Path $releasePath 'platform-api\web.config') 'AIERP.Api' $platformEnvironment
    Write-AncmEnvironment (Join-Path $releasePath 'ai-service\web.config') 'AIERP.AIService' $aiEnvironment
    Protect-ReleaseTree (Join-Path $releasePath 'platform-api') 'Nexora-PlatformApi'
    Protect-ReleaseTree (Join-Path $releasePath 'ai-service') 'Nexora-AIService'
    Protect-ReleaseTree (Join-Path $releasePath 'erp-web') 'Nexora-ERP'
    Protect-ReleaseTree (Join-Path $releasePath 'development-studio') 'Nexora-Studio'

    Ensure-Site 'Nexora-PlatformApi' 'Nexora-PlatformApi' (Join-Path $releasePath 'platform-api') 'http' '127.0.0.1:5080:'
    Ensure-Site 'Nexora-AIService' 'Nexora-AIService' (Join-Path $releasePath 'ai-service') 'http' '127.0.0.1:5081:'
    Protect-VaultReaderFile ([string]$platformEnvironment['Vault__TenantSqlCredentialReader__RoleIdFile'])
    Protect-VaultReaderFile ([string]$platformEnvironment['Vault__TenantSqlCredentialReader__SecretIdFile'])
    Ensure-Site 'Nexora-ERP' 'Nexora-ERP' (Join-Path $releasePath 'erp-web') 'https' "*:443:$HostName"
    Ensure-Site 'Nexora-Studio' 'Nexora-Studio' (Join-Path $releasePath 'development-studio') 'https' "*:443:$StudioHostName"
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value $true
    $https = Get-WebBinding -Name 'Nexora-ERP' -Protocol https | Where-Object { $_.bindingInformation -eq "*:443:$HostName" } | Select-Object -First 1
    if ($null -eq $https) { throw 'The HTTPS ingress binding was not created.' }
    $https.AddSslCertificate($certificate.Thumbprint, 'My')
    $studioHttps = Get-WebBinding -Name 'Nexora-Studio' -Protocol https | Where-Object { $_.bindingInformation -eq "*:443:$StudioHostName" } | Select-Object -First 1
    if ($null -eq $studioHttps) { throw 'The Studio HTTPS ingress binding was not created.' }
    $studioHttps.AddSslCertificate($certificate.Thumbprint, 'My')

    & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:Nexora-PlatformApi | Out-Null
    & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:Nexora-AIService | Out-Null
    & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:Nexora-ERP | Out-Null
    & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:Nexora-Studio | Out-Null
    & (Join-Path $releasePath 'Switch-IisRelease.ps1') -InstallRoot $rootFull -Version $version -HostName $HostName -StudioHostName $StudioHostName
}
catch {
    Write-Error "Installation of release $version failed. The immutable release files were kept for inspection: $releasePath"
    throw
}
