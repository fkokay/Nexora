[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$PurgeLegacyTenantData
)

$ErrorActionPreference = 'Stop'
$preflightModule = Join-Path $PSScriptRoot 'TenantSeparation.Preflight.psm1'
Import-Module $preflightModule -Force
$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$envPath = Join-Path $PSScriptRoot '.env'

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw "Missing $envPath. Copy .env.example there and configure the local secrets first."
}

function Get-DotEnvValue([string]$key) {
    $pattern = '^\s*' + [regex]::Escape($key) + '\s*=\s*(.*?)\s*$'
    foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
        if ($line -match $pattern) { return $Matches[1].Trim([char[]]@('"', "'")) }
    }
    return $null
}

function Set-DotEnvValue([string]$key, [string]$value) {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]][System.IO.File]::ReadAllLines($envPath))
    $pattern = '^\s*' + [regex]::Escape($key) + '\s*='
    $replacement = "$key=$value"
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            if (-not $found) { $lines[$index] = $replacement; $found = $true }
            else { $lines[$index] = "#$($lines[$index])" }
        }
    }
    if (-not $found) { $lines.Add($replacement) }
    [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-Compose([string[]]$ComposeArgs) {
    & docker compose --env-file $envPath --file $composeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE." }
}

function Invoke-ComposeSql([string]$query) {
    $bashCommand = '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -b -h -1 -W -Q "' + $query + '"'
    Invoke-Compose @('exec', '-T', 'sqlserver', '/bin/bash', '-lc', $bashCommand)
}

function Wait-HttpHealth([string]$uri) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri $uri -TimeoutSec 2
            if ($response.status -eq 'healthy') { return }
        }
        catch { }
        Start-Sleep -Seconds 2
    }
    throw "Service did not become healthy: $uri"
}

$currentMode = Get-DotEnvValue 'DATABASE_SEPARATION_ENABLED'
if ($currentMode -match '^(?i:true|1|yes)$') {
    throw 'DATABASE_SEPARATION_ENABLED is already true. This workflow is for a shared-to-separated transition and will not rerun against an already enabled environment.'
}
if ($currentMode -notmatch '^(?i:false|0|no)$') {
    throw 'Set DATABASE_SEPARATION_ENABLED=false explicitly in .env before running this shared-to-separated cutover. The Compose default is separated mode, so an absent value is not accepted as proof of a legacy shared deployment.'
}
if ($PurgeLegacyTenantData -and -not $Apply) {
    throw 'Use -PurgeLegacyTenantData only together with -Apply; the purge is a separate destructive cutover step.'
}

Invoke-Compose @('config', '-q')
if (-not $Apply) {
    Write-Host 'Preflight passed. No backup, migration, data copy, or local .env change was made.'
    Write-Host 'To run the controlled workflow, invoke this script with -Apply.'
    Write-Host 'The workflow stops Platform API and AI Service, creates and SQL-verifies a checksum full backup, verifies that backup with the application, runs the migrator and separated-mode verification.'
    Write-Host 'Add -PurgeLegacyTenantData to create a fresh post-copy backup, preview counts, explicitly purge legacy operational rows, and then start the services.'
    return
}

$runningServices = @(Invoke-Compose @('ps', '--services', '--status', 'running')) | ForEach-Object { "$($_)".Trim() }
$resumeServices = @($runningServices | Where-Object { $_ -in @('platform-api', 'ai-service') })
$writersStopped = $false
$migrationStarted = $false
$separationEnabled = $false
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ', [System.Globalization.CultureInfo]::InvariantCulture)
$backupId = [Guid]::NewGuid().ToString('N')
$backupPath = "/var/opt/mssql/backups/AIERPPlatform-separation-$timestamp-$backupId.bak"

try {
    Invoke-Compose @('build', 'platform-api')
    Invoke-Compose @('stop', 'platform-api', 'ai-service')
    $writersStopped = $true
    Invoke-Compose @('up', '-d', '--wait', '--wait-timeout', '180', 'sqlserver')

    $preflightQuery = "SET NOCOUNT ON; IF (OBJECT_ID(N'[AIERPPlatform].[dbo].[TenantDatabaseCatalog]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog])) THROW 51000, 'Existing tenant database catalog entries require manual recovery review.', 1; IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'AIERPStudio' OR name LIKE N'AIERPTenant[_]%') THROW 51001, 'Existing separated databases require manual recovery review.', 1; SELECT COUNT_BIG(*) FROM [AIERPPlatform].[dbo].[Tenants];"
    $tenantCountOutput = @(Invoke-ComposeSql $preflightQuery)
    $tenantCountText = $tenantCountOutput | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1
    if (-not $tenantCountText -or [long]$tenantCountText -lt 1) {
        throw 'AIERPPlatform has no tenant rows; the expected existing-data migration source was not found.'
    }

    # Estimate a no-compression full backup conservatively from the current database
    # file allocation, then require both a 20% margin and at least 1 GiB reserve.
    $allocatedSizeQuery = "SET NOCOUNT ON; SELECT CAST(SUM(CAST(size AS decimal(38,0)) * 8192) AS bigint) FROM sys.master_files WHERE database_id = DB_ID(N'AIERPPlatform');"
    $allocatedSizeOutput = @(Invoke-ComposeSql $allocatedSizeQuery)
    $allocatedSizeText = $allocatedSizeOutput | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1
    if (-not $allocatedSizeText) { throw 'Could not parse the allocated AIERPPlatform database size; refusing to start a full backup.' }
    $allocatedDatabaseBytes = ConvertFrom-PreflightByteCount -Value $allocatedSizeText -Label 'Allocated AIERPPlatform database size'
    if ($allocatedDatabaseBytes -le 0) { throw 'AIERPPlatform reported no allocated database files; refusing to start a full backup.' }

    # Check free bytes from inside SQL Server against the exact mount receiving the
    # backup, rather than checking the host or the deployer container filesystem.
    $freeBytesCommand = "df -B1 --output=avail /var/opt/mssql/backups | tail -n 1"
    $freeBytesOutput = @(Invoke-Compose @('exec', '-T', 'sqlserver', '/bin/bash', '-lc', $freeBytesCommand))
    $freeBytesText = $freeBytesOutput | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1
    if (-not $freeBytesText) { throw 'Could not parse free bytes on /var/opt/mssql/backups; refusing to start a full backup.' }
    $availableBackupBytes = ConvertFrom-PreflightByteCount -Value $freeBytesText -Label 'Available bytes on /var/opt/mssql/backups'
    $requiredBackupBytes = Assert-TenantSeparationBackupSpace -AvailableBytes $availableBackupBytes -AllocatedDatabaseBytes $allocatedDatabaseBytes
    Write-Host ("Backup space preflight passed: {0:N2} GiB available; requirement {1:N2} GiB (allocated database plus reserve)." -f ($availableBackupBytes / 1GB), ($requiredBackupBytes / 1GB))

    $backupQuery = "BACKUP DATABASE [AIERPPlatform] TO DISK = N'$backupPath' WITH INIT, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'$backupPath' WITH CHECKSUM;"
    Invoke-ComposeSql $backupQuery | Out-Null

    Set-DotEnvValue 'DATABASE_SEPARATION_BACKUP_PATH' $backupPath
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--verify-separation-backup') | Out-Null

    # Shared Compose starts with an administrator connection and does not create
    # the tenant data runtime login until this migration path is selected. Create
    # that login before the provisioner grants per-database roles to it.
    $dataRuntimeLogin = 'aierp_data_runtime'
    $loginExistsOutput = @(Invoke-ComposeSql "SET NOCOUNT ON; SELECT CASE WHEN SUSER_ID(N'$dataRuntimeLogin') IS NULL THEN 0 ELSE 1 END;")
    $loginExistsText = $loginExistsOutput | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^[01]$' } | Select-Object -Last 1
    if ($null -eq $loginExistsText) { throw 'Could not determine whether the tenant data runtime SQL login exists.' }
    $runtimePassword = Get-DotEnvValue 'AIERP_DATA_RUNTIME_PASSWORD'
    if ([string]::IsNullOrWhiteSpace($runtimePassword)) {
        if ($loginExistsText -eq '1') {
            throw 'The tenant data runtime SQL login exists but AIERP_DATA_RUNTIME_PASSWORD is not configured. Set the matching secret in .env before retrying.'
        }
        $runtimePassword = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        Set-DotEnvValue 'AIERP_DATA_RUNTIME_PASSWORD' $runtimePassword
    }
    Invoke-ComposeSql "IF SUSER_ID(N'$dataRuntimeLogin') IS NULL CREATE LOGIN [$dataRuntimeLogin] WITH PASSWORD=N'$runtimePassword', CHECK_POLICY=OFF;" | Out-Null

    Set-DotEnvValue 'DATABASE_SEPARATION_ENABLED' 'true'
    $separationEnabled = $true
    $migrationStarted = $true
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--migrate-only') | Out-Null
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--verify-separation') | Out-Null
    if (-not $PurgeLegacyTenantData) {
        Write-Host 'Tenant database provisioning is Ready, but cutover is incomplete: legacy operational rows remain in AIERPPlatform.'
        Write-Host 'Platform API and AI Service remain stopped. After review, take a fresh checksum full backup, set DATABASE_SEPARATION_BACKUP_PATH, run the purge preview and confirmed purge commands with docker compose, then start the services.'
        return
    }

    # The backup used to copy rows may predate the migration and catalog changes.
    # Take a distinct, fresh full backup after all isolated copies have verified.
    $purgeTimestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ', [System.Globalization.CultureInfo]::InvariantCulture)
    $purgeBackupPath = "/var/opt/mssql/backups/AIERPPlatform-before-legacy-purge-$purgeTimestamp-$backupId.bak"
    Invoke-ComposeSql "BACKUP DATABASE [AIERPPlatform] TO DISK = N'$purgeBackupPath' WITH INIT, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'$purgeBackupPath' WITH CHECKSUM;" | Out-Null
    Set-DotEnvValue 'DATABASE_SEPARATION_BACKUP_PATH' $purgeBackupPath
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--legacy-tenant-data-purge-preview') | Out-Null
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--purge-legacy-tenant-data', '--confirm-legacy-tenant-data-purge=I_HAVE_VERIFIED_BACKUP_AND_COPIES') | Out-Null
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--verify-separation') | Out-Null
    $servicesToStart = if ($resumeServices.Count -gt 0) { $resumeServices } else { @('platform-api', 'ai-service') }
    Invoke-Compose (@('up', '-d') + $servicesToStart) | Out-Null
    if ($servicesToStart -contains 'platform-api') { Wait-HttpHealth 'http://127.0.0.1:5080/health' }
    if ($servicesToStart -contains 'ai-service') { Wait-HttpHealth 'http://127.0.0.1:5081/health' }
    Write-Host 'Tenant database provisioning and separated-mode verification completed. Platform API and AI Service were started.'
}
catch {
    if ($migrationStarted) {
        try { Invoke-Compose @('stop', 'platform-api', 'ai-service') | Out-Null } catch { }
        Write-Error 'Migration or separated-mode verification failed. Separation remains enabled and the API/AI services were stopped to prevent fallback to mixed data. Preserve the source database and backup, inspect the catalog, and repair before restarting.'
    }
    else {
        if ($separationEnabled) { Set-DotEnvValue 'DATABASE_SEPARATION_ENABLED' 'false' }
        if ($writersStopped -and $resumeServices.Count -gt 0) {
            try { Invoke-Compose (@('up', '-d') + $resumeServices) | Out-Null } catch { Write-Warning 'Could not restart the previously running API services.' }
        }
    }
    throw
}
