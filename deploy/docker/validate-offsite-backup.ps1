param(
    [string]$EnvFile = (Join-Path $PSScriptRoot '.env'),
    [switch]$ProbeRemote
)

$ErrorActionPreference = 'Stop'
$resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile -ErrorAction Stop).Path
$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$values = @{}

foreach ($line in Get-Content -LiteralPath $resolvedEnvFile) {
    if ($line -match '^\s*(?:#|$)') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { continue }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
}

$required = @(
    'OFFSITE_BACKUP_ENDPOINT',
    'OFFSITE_BACKUP_BUCKET',
    'OFFSITE_BACKUP_ACCESS_KEY_ID',
    'OFFSITE_BACKUP_SECRET_ACCESS_KEY',
    'OFFSITE_BACKUP_CRYPT_PASSWORD_OBSCURED'
)
$errors = [System.Collections.Generic.List[string]]::new()
foreach ($key in $required) {
    if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$values[$key])) {
        $errors.Add("$key is empty")
        continue
    }
    if ([string]$values[$key] -match '(?i)replace-with|example\.com|change-me|your[-_ ]') {
        $errors.Add("$key still contains a sample value")
    }
}

if ($values.ContainsKey('OFFSITE_BACKUP_ENDPOINT') -and -not [string]::IsNullOrWhiteSpace([string]$values['OFFSITE_BACKUP_ENDPOINT'])) {
    $endpoint = $null
    if (-not [Uri]::TryCreate([string]$values['OFFSITE_BACKUP_ENDPOINT'], [UriKind]::Absolute, [ref]$endpoint) -or $endpoint.Scheme -ne 'https') {
        $errors.Add('OFFSITE_BACKUP_ENDPOINT must be an absolute HTTPS URL')
    }
}

$interval = '900'
if ($values.ContainsKey('OFFSITE_BACKUP_SYNC_INTERVAL_SECONDS') -and $values['OFFSITE_BACKUP_SYNC_INTERVAL_SECONDS']) {
    $interval = [string]$values['OFFSITE_BACKUP_SYNC_INTERVAL_SECONDS']
}
$parsedInterval = 0
if (-not [int]::TryParse($interval, [ref]$parsedInterval) -or $parsedInterval -le 0) {
    $errors.Add('OFFSITE_BACKUP_SYNC_INTERVAL_SECONDS must be a positive integer')
}

if ($errors.Count -gt 0) {
    Write-Error ('Offsite backup configuration is incomplete: ' + ($errors -join '; '))
    exit 1
}

& docker compose --env-file $resolvedEnvFile -f $composeFile config -q 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker Compose configuration validation failed. Values were suppressed; review the compose file and required local settings.'
    exit 1
}
Write-Output 'Compose configuration is valid; required offsite fields are present.'

if ($ProbeRemote) {
    & docker compose --profile offsite-backup --env-file $resolvedEnvFile -f $composeFile run --rm --no-deps --entrypoint rclone offsite-restore lsf crypt: --config /dev/null --max-depth 1 --log-level ERROR 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Remote probe failed. Check provider, endpoint, bucket, credentials, and obscured crypt password; values were suppressed.'
        exit 1
    }
    Write-Output 'Remote probe succeeded; S3 access and crypt configuration are usable.'
}
