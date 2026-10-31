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
    if ($Service -eq 'erp-web') {
        $composeConfig = docker --context nexora-remote compose --project-name nexora --env-file $environmentFile `
            --file $composeFile config --format json | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not read the ERP web build configuration.'
        }

        $studioUrl = [string]$composeConfig.services.'erp-web'.build.args.VITE_STUDIO_URL
        if ([string]::IsNullOrWhiteSpace($studioUrl)) {
            throw 'The ERP web build is missing VITE_STUDIO_URL.'
        }

        $hadStudioUrl = Test-Path Env:VITE_STUDIO_URL
        $previousStudioUrl = $env:VITE_STUDIO_URL
        try {
            $env:VITE_STUDIO_URL = $studioUrl
            Push-Location (Join-Path $repositoryRoot 'frontend/erp-web')
            npm run build
            if ($LASTEXITCODE -ne 0) {
                throw "Local ERP web build failed (exit code $LASTEXITCODE)."
            }
        }
        finally {
            Pop-Location
            if ($hadStudioUrl) {
                $env:VITE_STUDIO_URL = $previousStudioUrl
            }
            else {
                Remove-Item Env:VITE_STUDIO_URL -ErrorAction SilentlyContinue
            }
        }

        $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
        $candidateName = "nexora-erp-web-deploy-$timestamp"
        $candidateTag = "nexora-erp-web:deploy-$timestamp"
        $activeContainer = docker --context nexora-remote compose --project-name nexora --env-file $environmentFile `
            --file $composeFile ps --quiet erp-web
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($activeContainer | Out-String).Trim())) {
            throw 'The remote ERP web service must be running before its UI can be updated.'
        }

        $activeImage = docker --context nexora-remote inspect --format '{{.Image}}' $activeContainer
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeImage)) {
            throw 'Could not identify the current ERP web image for rollback.'
        }
        docker --context nexora-remote tag $activeImage "nexora-erp-web:rollback-$timestamp"
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not retain the current ERP web image for rollback.'
        }

        docker --context nexora-remote create --name $candidateName nexora-erp-web:latest
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not prepare a remote ERP web image for the local build output.'
        }
        try {
            docker --context nexora-remote cp (Join-Path $repositoryRoot 'frontend/erp-web/dist/.') `
                "${candidateName}:/usr/share/nginx/html"
            if ($LASTEXITCODE -ne 0) {
                throw 'Could not copy the locally built ERP web files to the remote image.'
            }

            docker --context nexora-remote commit $candidateName $candidateTag
            if ($LASTEXITCODE -ne 0) {
                throw 'Could not save the updated ERP web image.'
            }
            docker --context nexora-remote tag $candidateTag nexora-erp-web:latest
            if ($LASTEXITCODE -ne 0) {
                throw 'Could not select the updated ERP web image.'
            }
        }
        finally {
            docker --context nexora-remote rm $candidateName | Out-Null
        }

        docker --context nexora-remote compose --project-name nexora --env-file $environmentFile `
            --file $composeFile up --detach --no-build --no-deps --force-recreate $Service
    }
    else {
        docker --context nexora-remote compose --project-name nexora --env-file $environmentFile `
            --file $composeFile up --detach --build --no-deps $Service
    }
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
