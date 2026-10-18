[CmdletBinding()]
param(
    [Parameter(Mandatory)][uri]$BaseUri,
    [Parameter(Mandatory)][uri]$StudioUri,
    [ValidateRange(1,300)][int]$TimeoutSeconds = 60
)
$ErrorActionPreference = 'Stop'
if ($BaseUri.Scheme -ne 'https') { throw 'Health checks require the public HTTPS URL and its trusted certificate.' }
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$checks = @(
    @{ Path = '/'; Service = $null },
    @{ Path = '/health'; Service = 'platform-api' },
    @{ Path = '/ai-health'; Service = 'ai-development-service' }
)
foreach ($check in $checks) {
    $uri = [uri]::new($BaseUri, $check.Path)
    $lastError = $null
    do {
        try {
            $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 10 -UseBasicParsing
            if ([int]$response.StatusCode -ne 200) { throw "HTTP $([int]$response.StatusCode)" }
            if ($check.Service) {
                $body = $response.Content | ConvertFrom-Json
                if ($body.status -ne 'ready' -or $body.service -ne $check.Service) { throw "Unexpected health payload from $($check.Path)." }
            }
            Write-Host "PASS $($check.Path) HTTP 200"
            $lastError = $null
            break
        }
        catch {
            $lastError = $_
            if ([DateTime]::UtcNow -lt $deadline) { Start-Sleep -Seconds 2 }
        }
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($lastError) { throw "Health check failed for $uri : $($lastError.Exception.Message)" }
}
$studioRoot = [uri]::new($StudioUri, '/')
$lastError = $null
try {
    $response = Invoke-WebRequest -Uri $studioRoot -Method Get -TimeoutSec 10 -UseBasicParsing
    if ([int]$response.StatusCode -ne 200 -or $response.Content -notmatch '<div id="root"') { throw 'Studio static entry point was not served.' }
    Write-Host "PASS $studioRoot Studio static entry point"
}
catch { $lastError = $_ }
if ($lastError) { throw "Studio static health check failed for $studioRoot : $($lastError.Exception.Message)" }
$studioHealth = [uri]::new($StudioUri, '/ai-health')
$response = Invoke-WebRequest -Uri $studioHealth -Method Get -TimeoutSec 10 -UseBasicParsing
if ([int]$response.StatusCode -ne 200) { throw "Studio API proxy health check failed: $studioHealth" }
Write-Host "PASS $studioHealth AI API proxy"
