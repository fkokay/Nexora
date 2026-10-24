[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$generatorPath = Join-Path $repoRoot 'deploy\docker\Generate-OperatorPackageCacheManifest.ps1'
$expectedNames = @('npm', 'python-wheels', 'go-mod', 'cargo-home', 'nuget')
$pwshPath = (Get-Command pwsh -ErrorAction Stop).Source
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("nexora-package-cache-contract-{0}" -f [Guid]::NewGuid().ToString('N'))

function Assert-Contract([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Contract failed: $Message" }
}

function Invoke-Generator([string]$CacheRoot) {
    $output = @(& $pwshPath -NoLogo -NoProfile -File $generatorPath -CacheRoot $CacheRoot 2>&1)
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join [Environment]::NewLine) }
}

function New-CacheRoot([string]$Path) {
    [void](New-Item -ItemType Directory -Path $Path -Force)
    foreach ($name in $expectedNames) { [void](New-Item -ItemType Directory -Path (Join-Path $Path $name) -Force) }
}

try {
    Assert-Contract (Test-Path -LiteralPath $generatorPath -PathType Leaf) 'generator script exists'
    [void](New-Item -ItemType Directory -Path $tempRoot)

    # Generate twice from the same fixture and require byte-for-byte deterministic JSON.
    $fixture = Join-Path $tempRoot 'populated'
    New-CacheRoot $fixture
    $nested = Join-Path $fixture 'npm\nested'
    [void](New-Item -ItemType Directory -Path $nested)
    [IO.File]::WriteAllText((Join-Path $nested 'package.tgz'), 'synthetic npm package')
    [IO.File]::WriteAllText((Join-Path $fixture 'nuget\sample.nupkg'), 'synthetic nuget package')

    $first = Invoke-Generator $fixture
    Assert-Contract ($first.ExitCode -eq 0) "populated generation succeeds: $($first.Output)"
    $manifestPath = Join-Path $fixture 'package-cache-manifest.json'
    $firstBytes = [IO.File]::ReadAllBytes($manifestPath)
    $firstJson = [Text.Encoding]::UTF8.GetString($firstBytes) | ConvertFrom-Json -AsHashtable
    Assert-Contract ($firstJson.schemaVersion -eq 1) 'schemaVersion is 1'
    Assert-Contract (($firstJson.caches.Keys -join '|') -ceq ($expectedNames -join '|')) 'cache keys are the exact five names in canonical order'
    Assert-Contract ($firstJson.caches.npm.Count -eq 1) 'nested npm file is included exactly once'
    Assert-Contract ($firstJson.caches.npm[0].path -ceq 'nested/package.tgz') 'nested path uses forward slashes and is relative to its cache root'
    $expectedHash = (Get-FileHash -LiteralPath (Join-Path $nested 'package.tgz') -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Contract ($firstJson.caches.npm[0].sha256 -ceq $expectedHash) 'nested file has its lowercase SHA-256 digest'
    Assert-Contract ($firstJson.caches.nuget[0].path -ceq 'sample.nupkg') 'root-level package path is relative'
    Assert-Contract ($firstJson.caches.nuget[0].sha256 -cmatch '^[0-9a-f]{64}$') 'digest is lowercase hexadecimal SHA-256'
    foreach ($name in @('python-wheels', 'go-mod', 'cargo-home')) {
        Assert-Contract ($firstJson.caches[$name].Count -eq 0) "$name empty cache serializes as an empty list"
    }

    Remove-Item -LiteralPath $manifestPath -Force
    $second = Invoke-Generator $fixture
    Assert-Contract ($second.ExitCode -eq 0) "second generation succeeds: $($second.Output)"
    $secondBytes = [IO.File]::ReadAllBytes($manifestPath)
    Assert-Contract ([Linq.Enumerable]::SequenceEqual[byte]($firstBytes, $secondBytes)) 'same fixture produces byte-for-byte deterministic JSON'

    # The existing manifest must be preserved exactly when overwrite is attempted.
    $beforeOverwrite = [IO.File]::ReadAllBytes($manifestPath)
    $overwrite = Invoke-Generator $fixture
    Assert-Contract ($overwrite.ExitCode -ne 0) 'overwrite attempt fails'
    Assert-Contract ([Linq.Enumerable]::SequenceEqual[byte]($beforeOverwrite, [IO.File]::ReadAllBytes($manifestPath))) 'overwrite refusal preserves existing manifest bytes'

    # A root with absent cache directories still emits the exact keys with empty lists.
    $emptyRoot = Join-Path $tempRoot 'empty'
    [void](New-Item -ItemType Directory -Path $emptyRoot)
    $emptyResult = Invoke-Generator $emptyRoot
    Assert-Contract ($emptyResult.ExitCode -eq 0) "empty cache root generation succeeds: $($emptyResult.Output)"
    $emptyManifest = Get-Content -LiteralPath (Join-Path $emptyRoot 'package-cache-manifest.json') -Raw | ConvertFrom-Json -AsHashtable
    Assert-Contract (($emptyManifest.caches.Keys -join '|') -ceq ($expectedNames -join '|')) 'empty manifest contains exactly the five canonical cache keys'
    foreach ($name in $expectedNames) { Assert-Contract ($emptyManifest.caches[$name].Count -eq 0) "$name is empty when its cache directory is absent" }

    # Symlink creation may be unavailable on a host without link privileges; skip only that case.
    $linkRoot = Join-Path $tempRoot 'linked-entry'
    New-CacheRoot $linkRoot
    $outside = Join-Path $tempRoot 'outside.txt'
    [IO.File]::WriteAllText($outside, 'outside cache')
    $linkPath = Join-Path $linkRoot 'npm\outside-link.txt'
    $linkCreated = $false
    try {
        [void](New-Item -ItemType SymbolicLink -Path $linkPath -Target $outside -ErrorAction Stop)
        $linkCreated = $true
    } catch {
        Write-Output 'SKIP: symlink/reparse rejection case (host does not permit creating a symbolic link).'
    }
    if ($linkCreated) {
        $linkResult = Invoke-Generator $linkRoot
        Assert-Contract ($linkResult.ExitCode -ne 0) 'a symbolic link inside a cache is rejected'
        Assert-Contract (-not (Test-Path -LiteralPath (Join-Path $linkRoot 'package-cache-manifest.json'))) 'link rejection leaves no manifest behind'
    }

    # A linked cache directory itself must also be rejected when directory symlinks are supported.
    $cacheLinkRoot = Join-Path $tempRoot 'linked-cache'
    [void](New-Item -ItemType Directory -Path $cacheLinkRoot)
    $realCache = Join-Path $tempRoot 'real-npm-cache'
    [void](New-Item -ItemType Directory -Path $realCache)
    $cacheLinkCreated = $false
    try {
        [void](New-Item -ItemType SymbolicLink -Path (Join-Path $cacheLinkRoot 'npm') -Target $realCache -ErrorAction Stop)
        $cacheLinkCreated = $true
    } catch {
        if (-not $linkCreated) { Write-Output 'SKIP: cache-directory symlink case (host does not permit creating symbolic links).' }
    }
    if ($cacheLinkCreated) {
        $cacheLinkResult = Invoke-Generator $cacheLinkRoot
        Assert-Contract ($cacheLinkResult.ExitCode -ne 0) 'a symlink used as a cache directory is rejected'
        Assert-Contract (-not (Test-Path -LiteralPath (Join-Path $cacheLinkRoot 'package-cache-manifest.json'))) 'cache-directory link rejection leaves no manifest behind'
    }

    Write-Output 'PASS: operator package-cache manifest contract (schema, keys, hashes, determinism, empty caches, overwrite refusal, link rejection).'
} finally {
    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
        $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
        $resolvedBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (-not $resolvedTemp.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove temp fixture outside the OS temp directory: $resolvedTemp"
        }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
