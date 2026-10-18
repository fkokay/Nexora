[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$')][string]$Version,
    [Parameter(Mandatory)][string]$OutputPath,
    [ValidateSet('Release','Debug')][string]$Configuration = 'Release',
    [switch]$NoRestore
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$outputFull = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $outputFull) { throw "Output already exists; choose a new empty path: $outputFull" }
$parent = Split-Path -Parent $outputFull
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "Output parent does not exist: $parent" }

$tempBuild = Join-Path ([IO.Path]::GetTempPath()) ("Nexora-IIS-build-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputFull | Out-Null
New-Item -ItemType Directory -Path $tempBuild | Out-Null

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Write-Host "> $FilePath $($Arguments -join ' ')"
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $FilePath" }
    }
    finally { Pop-Location }
}

try {
    $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
    $publishArgs = @('publish', (Join-Path $repoRoot 'src\Hosts\AIERP.Api\AIERP.Api.csproj'), '--configuration', $Configuration,
        '--framework', 'net10.0', '--self-contained', 'false', '-p:UseAppHost=false', '-o', (Join-Path $outputFull 'platform-api'))
    if ($NoRestore) { $publishArgs += '--no-restore' }
    Invoke-Checked $dotnet $publishArgs $repoRoot

    $publishArgs = @('publish', (Join-Path $repoRoot 'src\AI\AIERP.AIService\AIERP.AIService.csproj'), '--configuration', $Configuration,
        '--framework', 'net10.0', '--self-contained', 'false', '-p:UseAppHost=false', '-o', (Join-Path $outputFull 'ai-service'))
    if ($NoRestore) { $publishArgs += '--no-restore' }
    Invoke-Checked $dotnet $publishArgs $repoRoot

    $frontendSource = Join-Path $repoRoot 'frontend\erp-web'
    $frontendBuild = Join-Path $tempBuild 'erp-web'
    New-Item -ItemType Directory -Path $frontendBuild | Out-Null
    foreach ($name in @('package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json')) {
        Copy-Item -LiteralPath (Join-Path $frontendSource $name) -Destination $frontendBuild
    }
    Copy-Item -LiteralPath (Join-Path $frontendSource 'src') -Destination $frontendBuild -Recurse
    Copy-Item -LiteralPath (Join-Path $frontendSource 'public') -Destination $frontendBuild -Recurse
    Invoke-Checked (Get-Command npm -ErrorAction Stop).Source @('ci','--no-audit','--no-fund') $frontendBuild
    Invoke-Checked (Get-Command npm -ErrorAction Stop).Source @('run','build') $frontendBuild

    $webRoot = Join-Path $outputFull 'erp-web'
    Copy-Item -LiteralPath (Join-Path $frontendBuild 'dist') -Destination $webRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'templates\erp-web.config') -Destination (Join-Path $webRoot 'web.config')

    $studioSource = Join-Path $repoRoot 'frontend\development-studio'
    $studioBuild = Join-Path $tempBuild 'development-studio'
    New-Item -ItemType Directory -Path $studioBuild | Out-Null
    foreach ($name in @('package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json')) {
        Copy-Item -LiteralPath (Join-Path $studioSource $name) -Destination $studioBuild
    }
    Copy-Item -LiteralPath (Join-Path $studioSource 'src') -Destination $studioBuild -Recurse
    if (Test-Path -LiteralPath (Join-Path $studioSource 'public')) { Copy-Item -LiteralPath (Join-Path $studioSource 'public') -Destination $studioBuild -Recurse }
    Invoke-Checked (Get-Command npm -ErrorAction Stop).Source @('ci','--no-audit','--no-fund') $studioBuild
    Invoke-Checked (Get-Command npm -ErrorAction Stop).Source @('run','build') $studioBuild
    $studioRoot = Join-Path $outputFull 'development-studio'
    Copy-Item -LiteralPath (Join-Path $studioBuild 'dist') -Destination $studioRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'templates\erp-web.config') -Destination (Join-Path $studioRoot 'web.config')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'templates\platform-api.web.config') -Destination (Join-Path $outputFull 'platform-api\web.config')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'templates\ai-service.web.config') -Destination (Join-Path $outputFull 'ai-service\web.config')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install-IisBundle.ps1') -Destination $outputFull
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Switch-IisRelease.ps1') -Destination $outputFull
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Test-IisHealth.ps1') -Destination $outputFull
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Rollback-IisBundle.ps1') -Destination $outputFull
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'config\secrets.example.psd1') -Destination $outputFull
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination $outputFull

    $manifest = [ordered]@{
        product = 'Nexora AI ERP IIS Bundle'
        version = $Version
        configuration = $Configuration
        targetFramework = 'net10.0'
        hostingModel = 'framework-dependent IIS ANCM out-of-process'
        builtAtUtc = [DateTime]::UtcNow.ToString('o')
        components = @('platform-api','ai-service','erp-web','development-studio')
        prerequisites = @('Windows Server with IIS 10','ASP.NET Core .NET 10 Hosting Bundle','IIS URL Rewrite 2.1','IIS ARR 3.0')
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputFull 'bundle.json') -Encoding UTF8
    Write-Host "IIS bundle ready: $outputFull"
}
catch {
    Remove-Item -LiteralPath $outputFull -Recurse -Force -ErrorAction SilentlyContinue
    throw
}
finally {
    Remove-Item -LiteralPath $tempBuild -Recurse -Force -ErrorAction SilentlyContinue
}
