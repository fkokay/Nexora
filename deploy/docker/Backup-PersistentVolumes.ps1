[CmdletBinding()]
param(
    [string]$EnvFile = (Join-Path $PSScriptRoot '.env'),
    [string]$ComposeFile = (Join-Path $PSScriptRoot 'docker-compose.yml'),
    [string]$RestoreFrom
)

$ErrorActionPreference = 'Stop'
$composeFilePath = (Resolve-Path -LiteralPath $ComposeFile).Path
$envFilePath = (Resolve-Path -LiteralPath $EnvFile).Path
$compose = @('compose', '--profile', 'public-ingress', '--file', $composeFilePath, '--env-file', $envFilePath)
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $docker) { throw 'Docker CLI was not found.' }

if (-not [string]::IsNullOrWhiteSpace($RestoreFrom)) {
    $RestoreFrom = [IO.Path]::GetFileName($RestoreFrom)
    if ($RestoreFrom -notmatch '^nexora-volumes-\d{8}T\d{6}Z-\d+\.tar\.gz$') {
        throw 'RestoreFrom must be the basename of a Nexora volume archive.'
    }
    $expected = "RESTORE $RestoreFrom"
    $confirmation = Read-Host "This replaces workspaces, test jobs, release packages, release state, and Caddy data/config. SQL data is separate. Type '$expected' to continue"
    if ($confirmation -cne $expected) { throw 'Restore confirmation did not match.' }
}

$writers = @('platform-api', 'ai-service', 'development-studio', 'public-ingress', 'workspace-runner', 'workspace-sandbox', 'release-deployer')
$running = @(& $docker.Source @compose ps --services --status running)
if ($LASTEXITCODE -ne 0) { throw 'Could not determine running Compose services.' }
$toStop = @($running | Where-Object { $_ -in $writers })
$profileCompose = @('compose', '--profile', 'volume-backup', '--file', $composeFilePath, '--env-file', $envFilePath)
$safetyArchive = $null
$safeToRestart = $true

try {
    if ($toStop.Count -gt 0) {
        & $docker.Source @compose stop @toStop | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop all volume writers.' }
    }

    $backupOutput = @(& $docker.Source @profileCompose run --rm --no-deps `
        -e PERSISTENT_VOLUME_MODE=backup persistent-volume-archive)
    if ($LASTEXITCODE -ne 0) { throw 'Persistent volume safety backup failed.' }
    foreach ($line in $backupOutput) {
        if ($line -match 'Created /backups/(nexora-volumes-\d{8}T\d{6}Z-\d+\.tar\.gz)') { $safetyArchive = $Matches[1]; break }
    }
    if ($null -eq $safetyArchive) { throw 'Could not identify the completed safety archive.' }

    if (-not [string]::IsNullOrWhiteSpace($RestoreFrom)) {
        & $docker.Source @profileCompose run --rm --no-deps `
            -e PERSISTENT_VOLUME_MODE=restore -e "PERSISTENT_VOLUME_ARCHIVE=$RestoreFrom" `
            persistent-volume-archive | Out-Null
        if ($LASTEXITCODE -ne 0) {
            & $docker.Source @profileCompose run --rm --no-deps `
                -e PERSISTENT_VOLUME_MODE=restore -e "PERSISTENT_VOLUME_ARCHIVE=$safetyArchive" `
                persistent-volume-archive | Out-Null
            if ($LASTEXITCODE -ne 0) { $safeToRestart = $false; throw 'Restore failed and automatic recovery from the safety archive also failed. Services were left stopped; recover manually.' }
            throw "Restore failed; the pre-restore snapshot $safetyArchive was restored."
        }
    }
}
finally {
    if ($toStop.Count -gt 0 -and $safeToRestart) {
        & $docker.Source @compose start @toStop | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Error 'Some previously running services did not restart.' }
    }
}

if ([string]::IsNullOrWhiteSpace($RestoreFrom)) {
    Write-Host 'Persistent volume snapshot created. It is included in the configured offsite backup sync.'
}
else {
    Write-Host "Persistent volume snapshot restored from $RestoreFrom. SQL data was not changed."
}
