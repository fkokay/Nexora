$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\..\deploy\iis\BundleValidation.psm1') -Force
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('Nexora-IIS-manifest-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null

function Write-FixtureManifest {
    param([string]$Root)
    $required = @(
        'platform-api/AIERP.Api.dll','platform-api/web.config',
        'ai-service/AIERP.AIService.dll','ai-service/web.config',
        'erp-web/index.html','erp-web/web.config',
        'development-studio/index.html','development-studio/web.config',
        'Install-IisBundle.ps1','Switch-IisRelease.ps1','Rollback-IisBundle.ps1','Test-IisHealth.ps1',
        'BundleValidation.psm1','README.md','secrets.example.psd1'
    )
    foreach ($relative in $required) {
        $path = Join-Path $Root ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
        [IO.File]::WriteAllText($path, "fixture:$relative`n", [Text.Encoding]::UTF8)
    }
    $files = @(Get-ChildItem -LiteralPath $Root -File -Recurse | Where-Object Name -ne 'bundle.json' | ForEach-Object {
        [ordered]@{
            path = [IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\', '/')
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
    [ordered]@{
        product = 'Nexora AI ERP IIS Bundle'
        version = 'fixture-1'
        configuration = 'Release'
        targetFramework = 'net10.0'
        hostingModel = 'framework-dependent IIS ANCM out-of-process'
        components = @('platform-api','ai-service','erp-web','development-studio')
        files = $files
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Root 'bundle.json') -Encoding utf8
}

try {
    Write-FixtureManifest $fixture
    [void](Assert-IisBundleIntegrity -BundlePath $fixture)

    [IO.File]::AppendAllText((Join-Path $fixture 'platform-api\AIERP.Api.dll'), 'tampered')
    try { [void](Assert-IisBundleIntegrity -BundlePath $fixture); throw 'Tampered file was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'checksum mismatch') { throw } }

    Write-FixtureManifest $fixture
    Remove-Item -LiteralPath (Join-Path $fixture 'ai-service\AIERP.AIService.dll')
    try { [void](Assert-IisBundleIntegrity -BundlePath $fixture); throw 'Missing file was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'file is missing') { throw } }

    Write-FixtureManifest $fixture
    [IO.File]::WriteAllText((Join-Path $fixture 'untracked.txt'), 'untracked')
    try { [void](Assert-IisBundleIntegrity -BundlePath $fixture); throw 'Unmanifested file was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'unmanifested file') { throw } }

    Write-FixtureManifest $fixture
    $manifest = Get-Content -LiteralPath (Join-Path $fixture 'bundle.json') -Raw | ConvertFrom-Json
    $manifest.files[0].path = '../outside.txt'
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fixture 'bundle.json') -Encoding utf8
    try { [void](Assert-IisBundleIntegrity -BundlePath $fixture); throw 'Traversal path was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'unsafe path') { throw } }

    Write-FixtureManifest $fixture
    $manifest = Get-Content -LiteralPath (Join-Path $fixture 'bundle.json') -Raw | ConvertFrom-Json
    $manifest.files += $manifest.files[0]
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fixture 'bundle.json') -Encoding utf8
    try { [void](Assert-IisBundleIntegrity -BundlePath $fixture); throw 'Duplicate manifest entry was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'duplicate path') { throw } }

    Write-Output 'IIS bundle integrity fixture smoke passed: valid package accepted; tampering, missing and unmanifested files, traversal paths and duplicate entries rejected.'
}
finally {
    Remove-Module BundleValidation -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
