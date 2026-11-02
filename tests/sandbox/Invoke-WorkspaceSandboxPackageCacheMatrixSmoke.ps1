[CmdletBinding()]
param(
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\workspace-sandbox-package-cache-smoke.json'),
    [switch]$PreserveArtifacts,
    [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('aierp-sandbox-cache-matrix-' + [Guid]::NewGuid().ToString('N'))
$cacheRoot = Join-Path $tempRoot 'package-cache'
$composeProject = 'aierp-cache-smoke-' + [Guid]::NewGuid().ToString('N')
$composeFile = Join-Path $PSScriptRoot 'docker-compose.package-cache-smoke.yml'
$composeArgs = @('compose', '--project-name', $composeProject, '--project-directory', $PSScriptRoot, '--file', $composeFile)
$runnerContainer = $null
$sandboxContainer = $null
$composeMayExist = $false
$composeStopped = $false
$oldCachePath = $env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH
$oldSigningKey = $env:CACHE_SMOKE_AUTH_SIGNING_KEY
$env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH = $cacheRoot
$env:CACHE_SMOKE_AUTH_SIGNING_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$manifestPath = Join-Path $cacheRoot 'package-cache-manifest.json'
$lockIdentity = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($composeProject))).ToLowerInvariant()
$lockPath = Join-Path ([IO.Path]::GetTempPath()) "aierp-sandbox-cache-matrix-$lockIdentity.lock"
$cacheSmokeLock = $null
try {
    [IO.Directory]::CreateDirectory($tempRoot) | Out-Null
    [IO.Directory]::CreateDirectory($cacheRoot) | Out-Null
    $cacheSmokeLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch [IO.IOException] {
    if ($null -eq $oldCachePath) { Remove-Item Env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH -ErrorAction SilentlyContinue } else { $env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH = $oldCachePath }
    if ($null -eq $oldSigningKey) { Remove-Item Env:CACHE_SMOKE_AUTH_SIGNING_KEY -ErrorAction SilentlyContinue } else { $env:CACHE_SMOKE_AUTH_SIGNING_KEY = $oldSigningKey }
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
    throw "Could not reserve a private package-cache matrix smoke directory: $tempRoot"
}
$manifestCreated = $false
$cacheTargets = @{
    'npm' = Join-Path $cacheRoot 'npm'
    'go-mod' = Join-Path $cacheRoot 'go-mod'
    'cargo-home' = Join-Path $cacheRoot 'cargo-home'
    'nuget' = Join-Path $cacheRoot 'nuget'
}

try {
    if (Test-Path -LiteralPath $manifestPath) { throw "Package cache manifest already exists; refusing to overwrite operator content: $manifestPath" }
    foreach ($path in $cacheTargets.Values) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
        $resolved = (Resolve-Path -LiteralPath $path).Path
        $expectedPrefix = (Resolve-Path -LiteralPath $cacheRoot).Path + [IO.Path]::DirectorySeparatorChar
        if (-not $resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Cache path resolved outside the package cache root: $resolved" }
        if (@(Get-ChildItem -LiteralPath $resolved -Force).Count -gt 0) { throw "Package cache is not empty; refusing to overwrite operator content: $resolved" }
    }
} catch {
    $cacheSmokeLock.Dispose()
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    if ($null -eq $oldCachePath) { Remove-Item Env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH -ErrorAction SilentlyContinue } else { $env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH = $oldCachePath }
    if ($null -eq $oldSigningKey) { Remove-Item Env:CACHE_SMOKE_AUTH_SIGNING_KEY -ErrorAction SilentlyContinue } else { $env:CACHE_SMOKE_AUTH_SIGNING_KEY = $oldSigningKey }
    throw
}

$sourceRoot = Join-Path $tempRoot 'source'
$npmLockRoot = Join-Path $tempRoot 'npm-lock-project'
$nugetPackageProject = Join-Path $tempRoot 'nuget-package'
$emptyFeed = Join-Path $tempRoot 'empty-feed'
$results = [Collections.Generic.List[object]]::new()
$jobIds = [Collections.Generic.List[string]]::new()
$succeeded = $false

function Write-Utf8([string]$Path, [string]$Content) {
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Invoke-Compose([string[]]$Arguments) {
    & $docker @composeArgs @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Isolated package-cache Compose command failed: docker compose $($Arguments -join ' ')" }
}

function Write-PackageCacheManifest {
    $cacheNames = @('npm', 'python-wheels', 'go-mod', 'cargo-home', 'nuget')
    $caches = [ordered]@{}
    foreach ($cacheName in $cacheNames) {
        $cachePath = Join-Path $cacheRoot $cacheName
        $entries = [Collections.Generic.List[object]]::new()
        if (Test-Path -LiteralPath $cachePath -PathType Container) {
            foreach ($item in Get-ChildItem -LiteralPath $cachePath -Force -Recurse | Sort-Object FullName) {
                if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                    throw "Package cache manifest cannot include linked entries: $($item.FullName)"
                }
                if ($item.PSIsContainer) { continue }
                $relativePath = [IO.Path]::GetRelativePath($cachePath, $item.FullName).Replace([IO.Path]::DirectorySeparatorChar, '/')
                if ([IO.Path]::AltDirectorySeparatorChar -ne [IO.Path]::DirectorySeparatorChar) {
                    $relativePath = $relativePath.Replace([IO.Path]::AltDirectorySeparatorChar, '/')
                }
                $entries.Add([ordered]@{
                    path = $relativePath
                    sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                })
            }
        }
        $caches[$cacheName] = @($entries.ToArray())
    }

    $manifest = [ordered]@{
        schemaVersion = 1
        caches = $caches
    }
    $temporaryManifestPath = Join-Path $cacheRoot ('.package-cache-manifest.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    Write-Utf8 -Path $temporaryManifestPath -Content ($manifest | ConvertTo-Json -Depth 6)
    try {
        [IO.File]::Move($temporaryManifestPath, $manifestPath)
        $script:manifestCreated = $true
    } finally {
        if (Test-Path -LiteralPath $temporaryManifestPath) { Remove-Item -LiteralPath $temporaryManifestPath -Force }
    }
}

function New-Zip([string]$Directory, [string]$ArchivePath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($Directory, $ArchivePath)
}

function Copy-FileToContainer([string]$Path, [string]$ContainerPath) {
    $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
    & $docker exec $runnerContainer sh -c "printf '%s' '$encoded' | base64 -d > '$ContainerPath'"
    if ($LASTEXITCODE -ne 0) { throw "Could not transfer a staged file into the isolated sandbox queue: $ContainerPath" }
}

function Invoke-SandboxJob([string]$Ecosystem, [string]$Target, [string]$ProjectDirectory) {
    $jobGuid = [Guid]::NewGuid()
    $jobId = $jobGuid.ToString('N')
    $jobIds.Add($jobId)
    $jobTemp = Join-Path $tempRoot $jobId
    New-Item -ItemType Directory -Path $jobTemp | Out-Null
    $archivePath = Join-Path $jobTemp 'source.zip'
    New-Zip -Directory $ProjectDirectory -ArchivePath $archivePath
    $manifest = [ordered]@{
        id = $jobGuid.ToString('D')
        workspaceId = ([Guid]::NewGuid()).ToString('D')
        targetPath = $Target
        commitSha = ''
        snapshotSha256 = ('0' * 64)
        hasUncommittedChanges = $false
        createdAt = [DateTimeOffset]::UtcNow.ToString('o')
        operation = 'test'
    }
    $manifestPath = Join-Path $jobTemp 'job.json'
    Write-Utf8 -Path $manifestPath -Content ($manifest | ConvertTo-Json -Compress)
    $containerPath = "/test-jobs/$jobId"
    & $docker exec $runnerContainer mkdir -m 700 -p $containerPath
    if ($LASTEXITCODE -ne 0) { throw "Could not create isolated $Ecosystem sandbox job." }
    Copy-FileToContainer -Path $archivePath -ContainerPath "$containerPath/source.zip"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy the $Ecosystem source snapshot to the job queue." }
    Copy-FileToContainer -Path $manifestPath -ContainerPath "$containerPath/job.json.upload"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy the $Ecosystem job manifest to the job queue." }
    & $docker exec $runnerContainer mv "$containerPath/job.json.upload" "$containerPath/job.json"
    if ($LASTEXITCODE -ne 0) { throw "Could not atomically publish the $Ecosystem job manifest." }

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    $result = $null
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $json = & $docker exec $runnerContainer sh -c "cat $containerPath/result.json 2>/dev/null"
        if ($LASTEXITCODE -eq 0 -and $json) {
            $jsonText = ($json -join "`n").TrimStart([char]0xFEFF)
            $result = $jsonText | ConvertFrom-Json
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if ($null -eq $result) { throw "Sandbox cache smoke timed out for $Ecosystem; queued job is preserved: $jobId" }
    $results.Add([pscustomobject]@{
        ecosystem = $Ecosystem
        target = $Target
        status = $result.status
        success = $result.success
        exitCode = $result.exitCode
        durationMilliseconds = $result.durationMilliseconds
        message = $result.message
        output = $result.output
    })
    if (-not $result.success -or $result.status -ne 'Passed') { throw "$Ecosystem cache smoke failed: $($result.status) $($result.message) $($result.output)" }
}

try {
    New-Item -ItemType Directory -Path $sourceRoot | Out-Null

    $npmPackage = Join-Path $npmLockRoot '.operator-cache\npm\aierp-cache-dep'
    Write-Utf8 (Join-Path $npmPackage 'package.json') '{"name":"aierp-cache-dep","version":"1.0.0","main":"index.js"}'
    Write-Utf8 (Join-Path $npmPackage 'index.js') 'module.exports = { marker: () => "operator-npm-cache-ok" };'
    Write-Utf8 (Join-Path $npmLockRoot 'package.json') '{"name":"aierp-npm-cache-smoke","version":"1.0.0","private":true,"dependencies":{"aierp-cache-dep":"file:.operator-cache/npm/aierp-cache-dep"}}'
    Push-Location $npmLockRoot
    try {
        & npm install --package-lock-only --ignore-scripts --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate the local-only npm lockfile for the cache smoke.' }
    } finally { Pop-Location }
    New-Item -ItemType Directory -Force -Path (Join-Path $cacheTargets['npm'] 'aierp-cache-dep') | Out-Null
    Copy-Item -Path (Join-Path $npmPackage '*') -Destination (Join-Path $cacheTargets['npm'] 'aierp-cache-dep') -Recurse -Force
    $nodeProject = Join-Path $sourceRoot 'node'
    New-Item -ItemType Directory -Path (Join-Path $nodeProject 'test') | Out-Null
    Copy-Item -LiteralPath (Join-Path $npmLockRoot 'package.json') -Destination $nodeProject
    Copy-Item -LiteralPath (Join-Path $npmLockRoot 'package-lock.json') -Destination $nodeProject
    Write-Utf8 (Join-Path $nodeProject 'test\cache.test.js') "const test = require('node:test');`nconst assert = require('node:assert/strict');`nconst { marker } = require('aierp-cache-dep');`ntest('uses the staged npm dependency', () => assert.equal(marker(), 'operator-npm-cache-ok'));`n"

    $goCachePackage = Join-Path $cacheTargets['go-mod'] 'aierp-cache-dep'
    Write-Utf8 (Join-Path $goCachePackage 'go.mod') "module example.com/aierp/cachedep`ngo 1.20`n"
    Write-Utf8 (Join-Path $goCachePackage 'dep.go') @'
package cachedep
func Marker() string { return "operator-go-cache-ok" }
'@
    $goProject = Join-Path $sourceRoot 'go'
    Write-Utf8 (Join-Path $goProject 'go.mod') "module example.local/sandbox-cache-smoke`ngo 1.20`n`nrequire example.com/aierp/cachedep v0.0.0`nreplace example.com/aierp/cachedep => ../.gomodcache/aierp-cache-dep`n"
    Write-Utf8 (Join-Path $goProject 'cache_test.go') @'
package cache_smoke
import (
    "testing"
    "example.com/aierp/cachedep"
)
func TestOperatorCache(t *testing.T) {
    if cachedep.Marker() != "operator-go-cache-ok" { t.Fatal("unexpected marker") }
}
'@

    $rustCachePackage = Join-Path $cacheTargets['cargo-home'] 'aierp-cache-dep'
    Write-Utf8 (Join-Path $rustCachePackage 'Cargo.toml') @'
[package]
name = "aierp-cache-dep"
version = "0.1.0"
edition = "2021"
'@
    Write-Utf8 (Join-Path $rustCachePackage 'src\lib.rs') 'pub fn marker() -> &''static str { "operator-cargo-cache-ok" }'
    $rustProject = Join-Path $sourceRoot 'rust'
    Write-Utf8 (Join-Path $rustProject 'Cargo.toml') @'
[package]
name = "aierp-cache-smoke"
version = "0.1.0"
edition = "2021"

[dependencies]
aierp-cache-dep = { path = "../.cargo/aierp-cache-dep" }
'@
    Write-Utf8 (Join-Path $rustProject 'Cargo.lock') @'
version = 4

[[package]]
name = "aierp-cache-dep"
version = "0.1.0"

[[package]]
name = "aierp-cache-smoke"
version = "0.1.0"
dependencies = [
 "aierp-cache-dep",
]
'@
    Write-Utf8 (Join-Path $rustProject 'src\lib.rs') @'
pub fn local_marker() -> &'static str { aierp_cache_dep::marker() }
#[cfg(test)]
mod tests {
    #[test]
    fn consumes_operator_cache() {
        assert_eq!(super::local_marker(), "operator-cargo-cache-ok");
    }
}
'@

    $dotnetPackageProject = Join-Path $nugetPackageProject 'Aierp.CacheSmoke.Dependency'
    New-Item -ItemType Directory -Force -Path $dotnetPackageProject, $emptyFeed | Out-Null
    Write-Utf8 (Join-Path $dotnetPackageProject 'Aierp.CacheSmoke.Dependency.csproj') @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <PackageId>Aierp.CacheSmoke.Dependency</PackageId>
    <Version>1.0.0</Version>
    <Authors>Nexora Sandbox Smoke</Authors>
    <Description>Generated offline dependency for the Workspace Sandbox package cache acceptance test.</Description>
  </PropertyGroup>
</Project>
'@
    Write-Utf8 (Join-Path $dotnetPackageProject 'Marker.cs') @'
namespace Aierp.CacheSmoke.Dependency;
public static class Marker { public static string Value => "operator-nuget-cache-ok"; }
'@
    & dotnet restore (Join-Path $dotnetPackageProject 'Aierp.CacheSmoke.Dependency.csproj') --source $emptyFeed --ignore-failed-sources -p:NuGetAudit=false
    if ($LASTEXITCODE -ne 0) { throw 'Could not restore the local-only generated NuGet package project.' }
    & dotnet pack (Join-Path $dotnetPackageProject 'Aierp.CacheSmoke.Dependency.csproj') --no-restore --output $cacheTargets['nuget']
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the generated local NuGet package for the cache smoke.' }

    $dotnetProject = Join-Path $sourceRoot 'dotnet'
    New-Item -ItemType Directory -Path $dotnetProject | Out-Null
    Write-Utf8 (Join-Path $dotnetProject 'CacheSmoke.Tests.csproj') @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Aierp.CacheSmoke.Dependency" Version="1.0.0" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.4" />
  </ItemGroup>
</Project>
'@
    Write-Utf8 (Join-Path $dotnetProject 'CacheSmokeTests.cs') @'
using Aierp.CacheSmoke.Dependency;
using Xunit;
public sealed class CacheSmokeTests
{
    [Fact]
    public void Restores_the_operator_staged_nuget_package() => Assert.Equal("operator-nuget-cache-ok", Marker.Value);
}
'@

    # The sandbox accepts only an exact file list with per-file SHA-256 digests.
    # Generate the v1 manifest after staging every cache and before the first runner job.
    Write-PackageCacheManifest

    # This stack gets a random Compose project name, private named queue volumes, and a
    # temporary read-only package-cache bind mount. It never touches the operator stack.
    $composeMayExist = $true
    Invoke-Compose -Arguments @('up', '--detach', '--build', 'workspace-runner', 'workspace-sandbox')
    $runnerContainer = (& $docker @composeArgs ps --quiet workspace-runner).Trim()
    $sandboxContainer = (& $docker @composeArgs ps --quiet workspace-sandbox).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($runnerContainer) -or [string]::IsNullOrWhiteSpace($sandboxContainer)) {
        throw 'The isolated package-cache Compose services did not start.'
    }

    Invoke-SandboxJob -Ecosystem 'Node.js' -Target 'package.json' -ProjectDirectory $nodeProject
    Invoke-SandboxJob -Ecosystem 'Go' -Target 'go/cache_test.go' -ProjectDirectory $sourceRoot
    Invoke-SandboxJob -Ecosystem 'Rust' -Target 'Cargo.toml' -ProjectDirectory $rustProject
    Invoke-SandboxJob -Ecosystem '.NET' -Target 'CacheSmoke.Tests.csproj' -ProjectDirectory $dotnetProject

    $sandboxWorkerUid = (& $docker exec $sandboxContainer id -u 2>$null).Trim()
    $sandboxCapabilities = (& $docker inspect --format '{{json .HostConfig.CapAdd}}' $sandboxContainer 2>$null).Trim()
    $sandboxCapabilityList = if ($sandboxCapabilities) { @($sandboxCapabilities | ConvertFrom-Json) } else { @() }
    $privilegeDropPath = (& $docker exec $sandboxContainer sh -c 'if [ -x /usr/bin/setpriv ]; then echo /usr/bin/setpriv; else echo /bin/setpriv; fi' 2>$null).Trim()
    $childUid = (& $docker exec $sandboxContainer $privilegeDropPath --reuid=65532 --regid=65532 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all /usr/bin/id -u 2>$null).Trim()
    if ($sandboxWorkerUid -ne '1654' -or $childUid -ne '65532') { throw "Sandbox worker/process UID boundary failed (worker=$sandboxWorkerUid child=$childUid)." }
    $expectedCapabilities = @('CAP_KILL', 'CAP_SETGID', 'CAP_SETPCAP', 'CAP_SETUID')
    if (@($sandboxCapabilityList | Where-Object { $_ -notin $expectedCapabilities }).Count -gt 0 -or @($expectedCapabilities | Where-Object { $_ -notin $sandboxCapabilityList }).Count -gt 0) { throw "Sandbox capability set changed unexpectedly: $($sandboxCapabilityList -join ', ')" }

    $succeeded = $true
} catch {
    throw
} finally {
    if ($composeMayExist -and $succeeded -and -not $PreserveArtifacts) {
        & $docker @composeArgs down --volumes --remove-orphans
        $composeStopped = $LASTEXITCODE -eq 0
        if (-not $composeStopped) { Write-Warning "Could not stop isolated smoke project '$composeProject'; preserving its private resources at $tempRoot." }
    } elseif ($composeMayExist -and -not $succeeded) {
        Write-Warning "Smoke failed; preserving isolated Compose project '$composeProject' and its private cache at $tempRoot for diagnosis. Remove only this project later with the same Compose file and project name."
    }
    if (-not $PreserveArtifacts -and ($composeStopped -or -not $composeMayExist) -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $cacheSmokeLock) { $cacheSmokeLock.Dispose() }
    if ($null -eq $oldCachePath) { Remove-Item Env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH -ErrorAction SilentlyContinue } else { $env:WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH = $oldCachePath }
    if ($null -eq $oldSigningKey) { Remove-Item Env:CACHE_SMOKE_AUTH_SIGNING_KEY -ErrorAction SilentlyContinue } else { $env:CACHE_SMOKE_AUTH_SIGNING_KEY = $oldSigningKey }
}

try {
$passed = $succeeded -and $results.Count -eq 4 -and @($results | Where-Object { -not $_.success -or $_.status -ne 'Passed' }).Count -eq 0
$report = [ordered]@{
    completedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    composeProject = $composeProject
    runnerContainer = $runnerContainer
    sandboxContainer = $sandboxContainer
    sandboxWorkerUid = $sandboxWorkerUid
    sandboxWorkerCapabilities = $sandboxCapabilityList
    packageCacheRoot = $cacheRoot
    sandboxNetworkDisabled = $true
    runnerNetworkInternal = $true
    operatorCaches = @('npm', 'go-mod', 'cargo-home', 'nuget')
    results = @($results)
    status = if ($passed) { 'passed' } else { 'failed' }
}
$fullReportPath = [IO.Path]::GetFullPath($ReportPath)
$reportDirectory = Split-Path -Parent $fullReportPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $fullReportPath -Encoding utf8
if (-not $passed) { throw "One or more offline sandbox package-cache checks failed. See $fullReportPath" }
Write-Output ($report | ConvertTo-Json -Depth 6)
} finally {
    if ($null -ne $cacheSmokeLock) { $cacheSmokeLock.Dispose() }
}
