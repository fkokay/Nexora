[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$preflight = Join-Path $repoRoot 'deploy\linux\preflight.sh'
$installer = Join-Path $repoRoot 'deploy\linux\install.sh'
$gitBash = Join-Path ${env:ProgramFiles} 'Git\bin\bash.exe'
$bash = if (Test-Path -LiteralPath $gitBash) { $gitBash } else { (Get-Command bash -ErrorAction Stop).Source }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('Nexora-linux-preflight-' + [Guid]::NewGuid().ToString('N'))
$bundleRoot = Join-Path $fixtureRoot 'bundle'
$releaseRoot = Join-Path $bundleRoot 'release'
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleRoot 'config') | Out-Null
foreach ($relative in @('nginx/nexora.conf','systemd/aierp-platform-api.service','systemd/aierp-ai-service.service')) {
    $path = Join-Path $bundleRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
    [IO.File]::WriteAllText($path, "fixture`n", [Text.Encoding]::ASCII)
}
foreach ($name in @('install.sh','preflight.sh','config-preflight.sh','health-check.sh','switch-release.sh','rollback.sh')) {
    [IO.File]::WriteAllText((Join-Path $bundleRoot $name), "#!/usr/bin/env bash`n", [Text.Encoding]::ASCII)
}

function Write-FixtureManifest {
    $files = @(Get-ChildItem -LiteralPath $releaseRoot -File -Recurse | Where-Object Name -ne 'SHA256SUMS' | Sort-Object FullName)
    $lines = foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($releaseRoot, $file.FullName).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $relative"
    }
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS'), (($lines -join "`n") + "`n"), [Text.Encoding]::ASCII)
}

function Write-BundleManifest {
    $files = @(Get-ChildItem -LiteralPath $bundleRoot -File -Recurse | Where-Object Name -ne 'BUNDLE-SHA256SUMS' | Sort-Object FullName)
    $lines = foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($bundleRoot, $file.FullName).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $relative"
    }
    [IO.File]::WriteAllText((Join-Path $bundleRoot 'BUNDLE-SHA256SUMS'), (($lines -join "`n") + "`n"), [Text.Encoding]::ASCII)
}

function Invoke-Preflight {
    $output = @(& $bash $preflight $bundleRoot 2>&1)
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}

function Invoke-ConfigPreflight {
    $config = Join-Path $fixtureRoot 'config'
    $output = @(& $bash (Join-Path $repoRoot 'deploy\linux\config-preflight.sh') $config 2>&1)
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}

try {
    $installerSource = [IO.File]::ReadAllText($installer)
    $permissionMutation = $installerSource.IndexOf('chown root:nexora "$CONFIG"', [StringComparison]::Ordinal)
    foreach ($guard in @(
        'if [[ -L "$CONFIG" ]]; then',
        'if [[ -e "$CONFIG" && ! -d "$CONFIG" ]]; then',
        'if [[ -L "$config_file" ]]; then',
        'if [[ -e "$config_file" && ! -f "$config_file" ]]; then'
    )) {
        $guardPosition = $installerSource.IndexOf($guard, [StringComparison]::Ordinal)
        if ($guardPosition -lt 0 -or $guardPosition -gt $permissionMutation) {
            throw "Installer path guard is missing or appears after ownership changes: $guard"
        }
    }

    [IO.File]::WriteAllText((Join-Path $releaseRoot 'VERSION'), "fixture-1`n", [Text.Encoding]::ASCII)
    foreach ($componentFile in @('api/AIERP.Api.dll','ai-service/AIERP.AIService.dll','web/index.html','studio/index.html')) {
        $path = Join-Path $releaseRoot $componentFile
        New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
        [IO.File]::WriteAllText($path, "$componentFile fixture`n", [Text.Encoding]::ASCII)
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot 'deploy/linux/config/platform-api.env.example') -Destination (Join-Path $bundleRoot 'config/platform-api.env.example')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'deploy/linux/config/ai-service.env.example') -Destination (Join-Path $bundleRoot 'config/ai-service.env.example')
    Write-FixtureManifest
    Write-BundleManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -ne 0 -or $result.Output -notmatch 'preflight passed') { throw "Valid temporary bundle was rejected: $($result.Output)" }

    $platformExample = Join-Path $bundleRoot 'config/platform-api.env.example'
    $validPlatformExample = [IO.File]::ReadAllText($platformExample)
    [IO.File]::WriteAllText($platformExample, ($validPlatformExample -replace '(?m)^ConnectionStrings__AIStudio=.*\r?\n', ''), [Text.Encoding]::ASCII)
    Write-BundleManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'config example .* must contain exactly one non-empty ConnectionStrings__AIStudio') { throw "Platform template without Studio connection string was accepted: $($result.Output)" }
    [IO.File]::WriteAllText($platformExample, $validPlatformExample, [Text.Encoding]::ASCII)
    Write-BundleManifest

    $configRoot = Join-Path $fixtureRoot 'config'
    New-Item -ItemType Directory -Path $configRoot | Out-Null
    $readerRoleId = Join-Path $fixtureRoot 'vault-reader-role-id'
    $readerSecretId = Join-Path $fixtureRoot 'vault-reader-secret-id'
    [IO.File]::WriteAllText($readerRoleId, "fixture-role-id`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText($readerSecretId, "fixture-secret-id`n", [Text.Encoding]::ASCII)
    $readerRoleIdUnix = (& $bash -lc "cygpath -u '$readerRoleId'").Trim()
    $readerSecretIdUnix = (& $bash -lc "cygpath -u '$readerSecretId'").Trim()
    & $bash -lc "chmod 600 '$readerRoleIdUnix' '$readerSecretIdUnix'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not secure temporary Vault reader fixtures.' }
    $sharedKey = 'fixture-shared-signing-key-with-at-least-32-bytes'
    $pluginKey = 'fixture-distinct-plugin-key-with-at-least-32-bytes'
    $platformConfig = @("ConnectionStrings__Platform=Server=fixture;Database=fixture;Encrypt=True;TrustServerCertificate=False", "ConnectionStrings__Tenant=Server=fixture;Database=AIERPPlatform;Encrypt=True;TrustServerCertificate=False", "ConnectionStrings__AIStudio=Server=fixture;Database=AIERPStudio;Encrypt=True;TrustServerCertificate=False", "Database__SeparationEnabled=true", "Vault__Address=https://vault.fixture", "Vault__Mount=secret", "Vault__TenantSqlCredentialReader__RoleIdFile=$readerRoleIdUnix", "Vault__TenantSqlCredentialReader__SecretIdFile=$readerSecretIdUnix", "Vault__AllowHttpForLocalDevelopment=false", "Authentication__Issuer=fixture-issuer", "Authentication__Audience=fixture-audience", "Authentication__SigningKey=$sharedKey", "PluginHost__SigningKey=$pluginKey") -join "`n"
    $aiConfig = @("ConnectionStrings__AIStudio=Server=fixture;Database=AIERPStudio;Encrypt=True;TrustServerCertificate=False", "Database__SeparationEnabled=true", "Vault__Address=https://vault.fixture", "Vault__Mount=secret", "Vault__TenantSqlCredentialReader__RoleIdFile=$readerRoleIdUnix", "Vault__TenantSqlCredentialReader__SecretIdFile=$readerSecretIdUnix", "Vault__AllowHttpForLocalDevelopment=false", "Authentication__Issuer=fixture-issuer", "Authentication__Audience=fixture-audience", "Authentication__SigningKey=$sharedKey") -join "`n"
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $platformConfig + "`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), $aiConfig + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -ne 0 -or $result.Output -notmatch 'config preflight passed') { throw "Matching identity configuration was rejected: $($result.Output)" }

    $missingTenantConnection = $platformConfig -replace "(?m)^ConnectionStrings__Tenant=.*`n", ''
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $missingTenantConnection + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'ConnectionStrings__Tenant is required') { throw "Separated mode without a tenant connection string was accepted: $($result.Output)" }
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $platformConfig + "`n", [Text.Encoding]::ASCII)

    $missingPlatformStudioConnection = $platformConfig -replace "(?m)^ConnectionStrings__AIStudio=.*`n", ''
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $missingPlatformStudioConnection + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'ConnectionStrings__AIStudio is required in Platform API config') { throw "Platform API without its Studio retention connection string was accepted: $($result.Output)" }
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $platformConfig + "`n", [Text.Encoding]::ASCII)

    $legacyPlatformConfig = $platformConfig -replace 'Database__SeparationEnabled=true', 'Database__SeparationEnabled=false'
    $legacyAiConfig = $aiConfig -replace 'Database__SeparationEnabled=true', 'Database__SeparationEnabled=false'
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $legacyPlatformConfig + "`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), $legacyAiConfig + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'Shared company databases are unsupported') { throw "Legacy shared database mode was accepted: $($result.Output)" }
    [IO.File]::WriteAllText((Join-Path $configRoot 'platform-api.env'), $platformConfig + "`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), $aiConfig + "`n", [Text.Encoding]::ASCII)
    $mismatchedTopology = $aiConfig -replace 'Database__SeparationEnabled=true', 'Database__SeparationEnabled=false'
    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), $mismatchedTopology + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'Database__SeparationEnabled must match') { throw "Mismatched database topology was accepted: $($result.Output)" }
    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), $aiConfig + "`n", [Text.Encoding]::ASCII)

    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), ($aiConfig -replace 'fixture-audience', 'mismatched-audience') + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'Authentication__Audience must match') { throw "Mismatched token audiences were not rejected: $($result.Output)" }

    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), ($aiConfig -replace 'fixture-issuer', 'mismatched-issuer') + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'Authentication__Issuer must match') { throw "Mismatched token issuers were not rejected: $($result.Output)" }

    $mismatchedKeyConfig = $aiConfig -replace [regex]::Escape($sharedKey), 'different-signing-key-that-is-long-enough-for-fixture'
    [IO.File]::WriteAllText((Join-Path $configRoot 'ai-service.env'), $mismatchedKeyConfig + "`n", [Text.Encoding]::ASCII)
    $result = Invoke-ConfigPreflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'must use the same Authentication__SigningKey') { throw "Mismatched service signing keys were not rejected: $($result.Output)" }

    [IO.File]::AppendAllText((Join-Path $releaseRoot 'api\AIERP.Api.dll'), 'tampered')
    Write-BundleManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'checksum mismatch') { throw 'Modified payload did not fail checksum validation.' }

    Write-FixtureManifest
    Write-BundleManifest
    $manifest = Join-Path $releaseRoot 'SHA256SUMS'
    $manifestLine = Get-Content -LiteralPath $manifest | Where-Object { $_ -match 'VERSION$' } | Select-Object -First 1
    $hash = $manifestLine.Substring(0,64)
    [IO.File]::AppendAllText($manifest, "$hash  ../outside`n", [Text.Encoding]::ASCII)
    Write-BundleManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'unsafe path') { throw "Path traversal in the checksum manifest was not rejected: $($result.Output)" }

    Write-FixtureManifest
    Write-BundleManifest
    $versionLines = @(Get-Content -LiteralPath $manifest | Where-Object { $_ -notmatch '\sVERSION$' })
    [IO.File]::WriteAllText($manifest, (($versionLines -join "`n") + "`n"), [Text.Encoding]::ASCII)
    Write-BundleManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'does not cover release/VERSION') { throw 'An unchecksummed release version was accepted.' }

    Write-FixtureManifest
    Write-BundleManifest
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'unmanifested.txt'), 'not in checksum list', [Text.Encoding]::ASCII)
    Write-BundleManifest
    $result = Invoke-Preflight
    if ($result.ExitCode -eq 0 -or $result.Output -notmatch 'unmanifested release file') { throw 'An unmanifested release file was accepted.' }

    Write-Output 'Linux installer preflight fixture smoke passed: full bundle/release manifests, separated-database templates, missing Studio configuration, mismatched topology and service identity, payload tampering, unsafe manifest paths, missing checksum coverage, and unmanifested files rejected.'
}
finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
