param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^(?=.{8,128}$)[A-Za-z0-9][A-Za-z0-9._:-]*$')]
  [string]$TraceId,

  [ValidatePattern('^[1-9][0-9]{0,3}[smhd]$')]
  [string]$Since = '24h'
)

$ErrorActionPreference = 'Stop'

# Pin the daemon context, Compose project, file, and service allowlist. Never fall back to Docker's current context.
$dockerContext = 'nexora-remote'
$expectedDockerHost = 'ssh://Administrator@212.18.121.24'
$composeProject = 'nexora-remote'
$composeFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'deploy/docker/docker-compose.yml'
$services = @('platform-api', 'ai-service')

if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
  throw 'Nexora Compose file was not found; log lookup stopped.'
}

$contextResult = @(& docker --context $dockerContext context inspect $dockerContext --format '{{.Name}}|{{.Endpoints.docker.Host}}' 2>$null)
if ($LASTEXITCODE -ne 0 -or $contextResult.Count -ne 1) {
  throw 'Docker context nexora-remote could not be inspected; log lookup stopped.'
}

$contextParts = $contextResult[0].Trim() -split '\|', 2
if ($contextParts.Count -ne 2 -or $contextParts[0] -cne $dockerContext -or $contextParts[1] -cne $expectedDockerHost) {
  throw 'Docker context nexora-remote did not resolve to the authorized SSH endpoint; log lookup stopped.'
}

$logLines = @(& docker --context $dockerContext compose --project-name $composeProject --file $composeFile logs --no-color --timestamps --since $Since --tail 5000 @services 2>$null)
if ($LASTEXITCODE -ne 0) {
  throw 'Docker log lookup failed; no output was displayed.'
}

$tracePattern = '(?i)(?<![A-Za-z0-9._:-])' + [regex]::Escape($TraceId) + '(?![A-Za-z0-9._:-])'
$metadataPattern = '^(?<service>platform-api|ai-service)(?:-\d+)?\s+\|\s+(?<timestamp>\S+)\s+(?<message>.*)$'
$timestampPattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$'
$matchCount = 0

foreach ($line in $logLines) {
  $metadata = [regex]::Match($line, $metadataPattern)
  if (-not $metadata.Success -or $metadata.Groups['timestamp'].Value -notmatch $timestampPattern) {
    continue
  }

  if (-not [regex]::IsMatch($metadata.Groups['message'].Value, $tracePattern)) {
    continue
  }

  $service = $metadata.Groups['service'].Value
  $timestamp = $metadata.Groups['timestamp'].Value
  Write-Host ("service={0} timestamp={1} traceId={2} [REDACTED]" -f $service, $timestamp, $TraceId)
  $matchCount++
}

if ($matchCount -eq 0) {
  Write-Host 'No safely parseable matching trace metadata found in platform-api or ai-service for the selected time window.'
}
