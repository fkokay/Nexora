[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$LinuxArchive,
    [Parameter(Mandatory)][string]$IisBundlePath,
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\deployment-bundle-validation.json')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$linuxArchivePath = (Resolve-Path -LiteralPath $LinuxArchive).Path
$iisBundleRoot = (Resolve-Path -LiteralPath $IisBundlePath).Path
$bashCommand = (Get-Command bash -ErrorAction Stop).Source
$gitBash = Join-Path ${env:ProgramFiles} 'Git\bin\bash.exe'
$bash = if (Test-Path -LiteralPath $gitBash) { $gitBash } else { $bashCommand }
$tar = (Get-Command tar -ErrorAction Stop).Source
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("Nexora-bundle-validation-" + [Guid]::NewGuid().ToString('N'))
$checks = [System.Collections.Generic.List[object]]::new()
$components = @('platform-api', 'ai-service', 'erp-web', 'development-studio')
$linuxComponents = @('api', 'ai-service', 'web', 'studio')

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
    $checks.Add([ordered]@{ name = $Name; passed = $Passed; detail = $Detail })
    if (-not $Passed) { throw "Validation failed: $Name. $Detail" }
}

function Assert-File([string]$Root, [string]$RelativePath) {
    $path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required package file missing: $RelativePath" }
    return $path
}

function Test-ChecksumManifest([string]$ReleaseRoot) {
    $manifestPath = Assert-File $ReleaseRoot 'SHA256SUMS'
    $manifestLines = @(Get-Content -LiteralPath $manifestPath)
    if ($manifestLines.Count -lt 5) { throw 'Linux SHA256SUMS is unexpectedly short.' }
    $listed = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($line in $manifestLines) {
        if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') { throw 'Linux SHA256SUMS contains a malformed line.' }
        $relative = $Matches[2].Replace('\', '/')
        if ([IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..' -or $relative.StartsWith('/')) {
            throw "Unsafe path in Linux SHA256SUMS: $relative"
        }
        if (-not $listed.Add($relative)) { throw "Duplicate path in Linux SHA256SUMS: $relative" }
        $file = Join-Path $ReleaseRoot ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Checksum entry points to missing file: $relative" }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
        if ($actual -ne $Matches[1]) { throw "Checksum mismatch: $relative" }
    }
    $actualFiles = @(Get-ChildItem -LiteralPath $ReleaseRoot -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($ReleaseRoot, $_.FullName).Replace('\', '/') })
    $expectedFiles = @($actualFiles | Where-Object { $_ -ne 'SHA256SUMS' })
    foreach ($file in $expectedFiles) { if (-not $listed.Contains($file)) { throw "Unmanifested release file: $file" } }
    if ($listed.Count -ne $expectedFiles.Count) { throw 'Linux checksum manifest contains an unexpected file count.' }
    return $listed.Count
}

function Test-IisBundle([string]$Root) {
    $manifestPath = Assert-File $Root 'bundle.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.product -ne 'Nexora AI ERP IIS Bundle' -or $manifest.version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$' -or
        $manifest.configuration -ne 'Release' -or $manifest.targetFramework -ne 'net10.0' -or
        $manifest.hostingModel -ne 'framework-dependent IIS ANCM out-of-process') { throw 'IIS bundle manifest metadata is invalid.' }
    $manifestComponents = @($manifest.components | Sort-Object)
    if (($manifestComponents -join ',') -ne (($components | Sort-Object) -join ',')) { throw 'IIS manifest does not identify all four required components exactly once.' }
    $componentFiles = @{
        'platform-api' = @('AIERP.Api.dll', 'web.config')
        'ai-service' = @('AIERP.AIService.dll', 'web.config')
        'erp-web' = @('index.html', 'web.config')
        'development-studio' = @('index.html', 'web.config')
    }
    foreach ($component in $components) {
        foreach ($relative in $componentFiles[$component]) { [void](Assert-File $Root (Join-Path $component $relative)) }
    }
    $apiConfig = [xml](Get-Content -LiteralPath (Join-Path $Root 'platform-api\web.config') -Raw)
    $aiConfig = [xml](Get-Content -LiteralPath (Join-Path $Root 'ai-service\web.config') -Raw)
    foreach ($config in @($apiConfig, $aiConfig)) {
        $aspNetCore = $config.configuration.'system.webServer'.aspNetCore
        if ($aspNetCore.processPath -ne 'dotnet' -or $aspNetCore.hostingModel -ne 'outofprocess' -or $aspNetCore.environmentVariables.ChildNodes.Count -ne 0) {
            throw 'Packaged IIS service web.config has invalid process/hosting settings or embedded environment values.'
        }
    }
    if ($apiConfig.configuration.'system.webServer'.aspNetCore.arguments -ne '.\AIERP.Api.dll' -or
        $aiConfig.configuration.'system.webServer'.aspNetCore.arguments -ne '.\AIERP.AIService.dll') { throw 'IIS ANCM DLL arguments do not match their components.' }
    foreach ($component in @('erp-web', 'development-studio')) {
        $webConfig = [xml](Get-Content -LiteralPath (Join-Path $Root "$component\web.config") -Raw)
        $rewriteText = $webConfig.configuration.'system.webServer'.rewrite.OuterXml
        if ($rewriteText -notmatch '127\.0\.0\.1:5080/api' -or $rewriteText -notmatch '127\.0\.0\.1:5081/studio' -or
            $rewriteText -notmatch 'React SPA fallback') { throw "IIS $component rewrite config is missing API, Studio, or SPA routing." }
    }
    $unexpectedSecrets = @(Get-ChildItem -LiteralPath $Root -File -Recurse | Where-Object { $_.Name -match '\.env$|secrets\.json$' })
    if ($unexpectedSecrets.Count -gt 0) { throw 'IIS bundle contains a secret-bearing environment file.' }
    return [ordered]@{ version = [string]$manifest.version; components = $manifestComponents; filesPresent = ($componentFiles.Values | ForEach-Object Count | Measure-Object -Sum).Sum }
}

try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    $powershellScripts = @(
        (Get-ChildItem (Join-Path $repoRoot 'deploy\iis') -Filter '*.ps1' -File),
        (Get-Item (Join-Path $repoRoot 'deploy\iis\config\secrets.example.psd1'))
    ) | ForEach-Object { $_ }
    foreach ($script in $powershellScripts) {
        $tokens = $null; $parseErrors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$parseErrors)
        if ($parseErrors.Count -gt 0) { throw "PowerShell syntax error in $($script.FullName): $($parseErrors[0].Message)" }
    }
    Add-Check 'IIS PowerShell syntax' $true "$($powershellScripts.Count) deployment scripts/data files parsed without errors."

    $linuxScripts = @('package.sh','install.sh','health-check.sh','switch-release.sh','rollback.sh') | ForEach-Object { Join-Path $repoRoot "deploy/linux/$_" }
    foreach ($script in $linuxScripts) {
        & $bash -n $script
        if ($LASTEXITCODE -ne 0) { throw "Bash syntax check failed: $script" }
    }
    Add-Check 'Linux Bash syntax' $true "$($linuxScripts.Count) deployment scripts pass bash -n."

    $iis = Test-IisBundle $iisBundleRoot
    Add-Check 'IIS bundle manifest/components/config' $true "Version $($iis.version); four required components and routing/ANCM configuration verified."

    $sidecar = "$linuxArchivePath.sha256"
    if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { throw 'Linux archive SHA-256 sidecar is missing.' }
    $sidecarText = (Get-Content -LiteralPath $sidecar -Raw).Trim()
    if ($sidecarText -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') { throw 'Linux archive SHA-256 sidecar is malformed.' }
    $sidecarName = [IO.Path]::GetFileName($Matches[2])
    if ($sidecarName -ne [IO.Path]::GetFileName($linuxArchivePath)) { throw 'Linux archive sidecar names a different archive.' }
    $archiveHash = (Get-FileHash -LiteralPath $linuxArchivePath -Algorithm SHA256).Hash
    if ($archiveHash -ne $Matches[1]) { throw 'Linux archive SHA-256 sidecar does not match the archive.' }

    $entries = @(& $tar -tzf $linuxArchivePath 2>&1)
    if ($LASTEXITCODE -ne 0 -or $entries.Count -eq 0) { throw 'Linux package is not a readable gzip tar archive.' }
    foreach ($entry in $entries) {
        $normalized = ([string]$entry).Replace('\', '/')
        if ([IO.Path]::IsPathRooted($normalized) -or $normalized.StartsWith('/') -or $normalized.Split('/') -contains '..') {
            throw "Linux archive contains an unsafe path: $entry"
        }
    }
    $topNames = @($entries | ForEach-Object { ([string]$_).TrimEnd('/').Split('/')[0] } | Select-Object -Unique)
    if ($topNames.Count -ne 1 -or $topNames[0] -notmatch '^aierp-linux-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') { throw 'Linux archive must contain one versioned top-level directory.' }
    $extractRoot = Join-Path $tempRoot 'linux'
    New-Item -ItemType Directory -Path $extractRoot | Out-Null
    & $tar -xzf $linuxArchivePath -C $extractRoot
    if ($LASTEXITCODE -ne 0) { throw 'Linux package extraction failed.' }
    $linuxRoot = Join-Path $extractRoot $topNames[0]
    $releaseRoot = Join-Path $linuxRoot 'release'
    $version = [IO.File]::ReadAllText((Assert-File $releaseRoot 'VERSION')).Trim()
    if ($version -ne $topNames[0].Substring('aierp-linux-'.Length)) { throw 'Linux archive name and release/VERSION do not match.' }
    foreach ($component in $linuxComponents) {
        if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot $component) -PathType Container) -or
            -not (Get-ChildItem -LiteralPath (Join-Path $releaseRoot $component) -File -Recurse | Select-Object -First 1)) {
            throw "Linux package component is missing or empty: $component"
        }
    }
    $checksumCount = Test-ChecksumManifest $releaseRoot
    Add-Check 'Linux archive checksum/version/components' $true "Version $version; outer SHA-256 matches; four components present; $checksumCount release file checksums verified with exact manifest coverage."

    $expectedEnv = @{
        'config/platform-api.env.example' = @('ASPNETCORE_URLS=http://127.0.0.1:5080','ConnectionStrings__Platform=','Authentication__SigningKey=','PluginHost__SigningKey=','AIService__BaseUrl=http://127.0.0.1:5081')
        'config/ai-service.env.example' = @('ASPNETCORE_URLS=http://127.0.0.1:5081','ConnectionStrings__Platform=','Authentication__SigningKey=','PlatformApi__BaseUrl=http://127.0.0.1:5080')
    }
    foreach ($entry in $expectedEnv.GetEnumerator()) {
        $content = Get-Content -LiteralPath (Assert-File $linuxRoot $entry.Key) -Raw
        foreach ($required in $entry.Value) { if ($content -notmatch [regex]::Escape($required)) { throw "Linux config template $($entry.Key) is missing $required" } }
    }
    $apiEnv = Get-Content -LiteralPath (Join-Path $linuxRoot 'config/platform-api.env.example') -Raw
    $aiEnv = Get-Content -LiteralPath (Join-Path $linuxRoot 'config/ai-service.env.example') -Raw
    if ($apiEnv -notmatch 'PluginHost__SigningKey=CHANGE_ME_DIFFERENT_SECRET' -or $apiEnv -notmatch 'IntegrationQueue__EncryptionKey=') { throw 'Linux API example must mark separate plugin signing key and optional encryption key.' }
    if ($aiEnv -notmatch 'Authentication__SigningKey=CHANGE_ME_USE_THE_SAME_VALUE_AS_PLATFORM_API') { throw 'Linux AI example must state that signing key is shared with Platform API.' }
    $nginx = Get-Content -LiteralPath (Assert-File $linuxRoot 'nginx/nexora.conf') -Raw
    if ($nginx -notmatch 'server_name erp\.example\.com' -or $nginx -notmatch 'server_name studio\.example\.com' -or
        $nginx -notmatch 'root /opt/nexora/current/web' -or $nginx -notmatch 'root /opt/nexora/current/studio' -or
        $nginx -notmatch 'location /studio/' -or $nginx -notmatch 'try_files \$uri \$uri/ /index\.html') { throw 'Linux nginx template is missing separate ERP/Studio routing or SPA fallback.' }
    foreach ($service in @('aierp-platform-api.service', 'aierp-ai-service.service')) {
        $serviceText = Get-Content -LiteralPath (Assert-File $linuxRoot "systemd/$service") -Raw
        if ($serviceText -notmatch 'User=nexora' -or $serviceText -notmatch 'EnvironmentFile=/etc/nexora/' -or
            $serviceText -notmatch 'NoNewPrivileges=true' -or $serviceText -notmatch 'ProtectSystem=strict') { throw "Linux systemd service is missing expected hardening: $service" }
    }
    Add-Check 'Linux config semantics' $true 'Environment examples, loopback service URLs, separate signing-key intent, dual-site nginx routes and systemd hardening verified.'

    $report = [ordered]@{
        completedAtUtc = [DateTime]::UtcNow.ToString('o')
        mode = 'offline-package-validation'
        linuxArchive = [IO.Path]::GetFileName($linuxArchivePath)
        iisBundleVersion = $iis.version
        checks = @($checks)
        result = 'passed'
        limitation = 'Validates local package contents and configuration semantics only; does not establish live IIS/Linux host behavior, TLS/DNS, service startup, SQL connectivity, or production deployment compatibility.'
    }
    $fullReportPath = [IO.Path]::GetFullPath($ReportPath)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fullReportPath) | Out-Null
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $fullReportPath -Encoding utf8
    Write-Output ($report | ConvertTo-Json -Depth 6)
}
finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
