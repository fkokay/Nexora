[CmdletBinding()]
param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
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

Invoke-Compose @('config', '-q')
if (-not $Apply) {
    Write-Host 'Preflight passed. No backup, migration, data copy, or local .env change was made.'
    Write-Host 'To run the controlled workflow, invoke this script with -Apply.'
    Write-Host 'The workflow stops Platform API and AI Service, creates and SQL-verifies a fresh checksum full backup, verifies that backup with the application, runs the migrator and separated-mode verification, then starts the services.'
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

    $backupQuery = "BACKUP DATABASE [AIERPPlatform] TO DISK = N'$backupPath' WITH INIT, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'$backupPath' WITH CHECKSUM;"
    Invoke-ComposeSql $backupQuery | Out-Null

    Set-DotEnvValue 'DATABASE_SEPARATION_BACKUP_PATH' $backupPath
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--verify-separation-backup') | Out-Null

    Set-DotEnvValue 'DATABASE_SEPARATION_ENABLED' 'true'
    $separationEnabled = $true
    $migrationStarted = $true
    Invoke-Compose @('run', '--rm', '--no-deps', 'platform-api', '--migrate-only') | Out-Null
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
