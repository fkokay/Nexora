$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Assert-FrameOptionsDeny([xml]$Config, [string]$Name) {
    $headers = @($Config.configuration.'system.webServer'.httpProtocol.customHeaders.add |
        Where-Object { $_.name -eq 'X-Frame-Options' -and $_.value -eq 'DENY' })
    if ($headers.Count -ne 1) { throw "$Name must contain exactly one X-Frame-Options: DENY header." }
}

$iisTemplate = Join-Path $repoRoot 'deploy/iis/templates/erp-web.config'
$apiTemplate = Join-Path $repoRoot 'deploy/iis/templates/platform-api.web.config'
$aiTemplate = Join-Path $repoRoot 'deploy/iis/templates/ai-service.web.config'
$publisher = Get-Content -LiteralPath (Join-Path $repoRoot 'deploy/iis/Publish-IisBundle.ps1') -Raw
$validator = Get-Content -LiteralPath (Join-Path $repoRoot 'tests/deployment/Invoke-DeploymentBundleValidation.ps1') -Raw

foreach ($name in @('erp-web', 'development-studio')) {
    [xml]$config = Get-Content -LiteralPath $iisTemplate -Raw
    Assert-FrameOptionsDeny $config "IIS $name template"
}
Assert-FrameOptionsDeny ([xml](Get-Content -LiteralPath $apiTemplate -Raw)) 'IIS platform-api template'
Assert-FrameOptionsDeny ([xml](Get-Content -LiteralPath $aiTemplate -Raw)) 'IIS ai-service template'

foreach ($relative in @(
    'templates\erp-web.config',
    'templates\platform-api.web.config',
    'templates\ai-service.web.config'
)) {
    if ($publisher -notmatch [regex]::Escape($relative)) { throw "Windows IIS package publisher no longer includes $relative." }
}
if ($publisher -notmatch 'Destination \(Join-Path \$webRoot ''web\.config''\)' -or
    $publisher -notmatch 'Destination \(Join-Path \$studioRoot ''web\.config''\)') {
    throw 'Windows IIS package publisher must install the secured SPA host template for both web components.'
}

$nginxPath = Join-Path $repoRoot 'deploy/linux/nginx/nexora.conf'
$nginx = Get-Content -LiteralPath $nginxPath -Raw
$serverBlocks = [regex]::Matches($nginx, '(?ms)^\s*server\s*\{(.*?)^\}')
if ($serverBlocks.Count -ne 2) { throw 'Linux nginx source package must define exactly two active host server blocks.' }
foreach ($block in $serverBlocks) {
    $headers = [regex]::Matches($block.Groups[1].Value, '(?im)^\s*add_header\s+X-Frame-Options\s+DENY\s+always;\s*$')
    if ($headers.Count -ne 1) { throw 'Every Linux nginx active host template must define exactly one X-Frame-Options DENY header.' }
}
$linuxPublisher = Get-Content -LiteralPath (Join-Path $repoRoot 'deploy/linux/package.sh') -Raw
if ($linuxPublisher -notmatch 'cp "\$SCRIPT_DIR/nginx/nexora\.conf" "\$BUNDLE_DIR/nginx/nexora\.conf"') {
    throw 'Linux source package publisher must include the checked nginx host template.'
}

foreach ($source in @('src/Hosts/AIERP.Api/Program.cs', 'src/AI/AIERP.AIService/Program.cs')) {
    $program = Get-Content -LiteralPath (Join-Path $repoRoot $source) -Raw
    if ($program -notmatch '(?m)(?:^|;)\s*app\.UseAierpSecurityHeaders\(\);') { throw "$source is missing UseAierpSecurityHeaders middleware wiring." }
}

foreach ($requiredValidatorCheck in @(
    'Assert-IisFrameOptionsDeny',
    'Assert-SecurityHeaderMiddleware',
    'frameHeaderCount -ne $serverBlockCount',
    'Linux package contains obsolete IIS-only service config'
)) {
    if ($validator -notmatch [regex]::Escape($requiredValidatorCheck)) { throw "Deployment package validator is missing security contract: $requiredValidatorCheck" }
}

Write-Output 'Deployment security header source package contracts passed: Windows IIS and Linux source builders include protected active host templates; both ASP.NET services wire security header middleware.'
