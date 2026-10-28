param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('erp-web', 'development-studio')]
    [string] $Service
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repositoryRoot 'deploy/docker/docker-compose.yml'
$environmentFile = Join-Path $repositoryRoot 'deploy/docker/.env'

foreach ($requiredPath in @($composeFile, $environmentFile)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required deployment file is missing: $requiredPath"
    }
}

Push-Location $repositoryRoot
$injectParseOnlyRuntimePassword = [string]::IsNullOrWhiteSpace($env:AIERP_PLATFORM_RUNTIME_PASSWORD)
if ($injectParseOnlyRuntimePassword) {
    # Compose interpolates required variables for every service, even though this
    # script only permits UI services and starts them with --no-deps.
    $env:AIERP_PLATFORM_RUNTIME_PASSWORD = 'ui-only-compose-parse-placeholder'
}

try {
    docker --context nexora-remote compose --project-name nexora --env-file $environmentFile `
        --file $composeFile up --detach --build --no-deps $Service
    if ($LASTEXITCODE -ne 0) {
        throw "Remote Docker update failed for service '$Service' (exit code $LASTEXITCODE)."
    }

    docker --context nexora-remote compose --project-name nexora --env-file $environmentFile `
        --file $composeFile ps $Service
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read remote service status for '$Service' (exit code $LASTEXITCODE)."
    }
}
finally {
    if ($injectParseOnlyRuntimePassword) {
        Remove-Item Env:AIERP_PLATFORM_RUNTIME_PASSWORD -ErrorAction SilentlyContinue
    }
    Pop-Location
}
