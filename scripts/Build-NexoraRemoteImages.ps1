<#
.SYNOPSIS
Builds Nexora application images ON the remote Docker host from a merged commit.

.DESCRIPTION
`docker --context nexora-remote compose build` streams the ~140 MB build context
over SSH uncompressed (measured 207 s of a 7 min Platform API build on 2026-11-18).
This script sends one compressed `git archive` of the commit (~12 MB) instead,
verifies its SHA-256 on the server, extracts it to an operator-only folder and runs
`docker compose build` there. All remote work runs in ONE ssh session (plus one scp),
because many SSH connections in a row have locked the server's SSH port before.

It only builds images (nexora-<service>:latest, labelled with the commit). Switch
containers afterwards exactly as before, from this machine with
`up --detach --no-deps --no-build <services>`, after tagging rollback images.
No credentials are created or copied: the server's existing private .env is used
for Compose interpolation and stays on the server.

.EXAMPLE
./scripts/Build-NexoraRemoteImages.ps1 -Services platform-api,erp-web -PlanOnly
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('platform-api', 'platform-migrator', 'ai-service', 'erp-web', 'development-studio', 'plugin-host',
        'integration-host', 'tenant-provisioning-worker', 'workspace-runner', 'workspace-sandbox')]
    [string[]] $Services,
    [string] $Commit = 'origin/master',
    [string] $DockerContext = 'nexora-remote',
    [string] $RemoteRoot = 'C:/Nexora/build-sources',
    [string] $RemoteEnvFile = 'C:/Nexora/private/.env',
    [string[]] $RemoteComposeOverrides = @(),
    [int] $KeepSources = 3,
    [switch] $PlanOnly
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
foreach ($tool in @($ssh, $scp)) { if (-not (Test-Path -LiteralPath $tool)) { throw "Windows OpenSSH is required (the agent only works there): $tool" } }

git -C $repositoryRoot fetch --quiet origin master
if ($LASTEXITCODE -ne 0) { throw 'git fetch origin master failed.' }
$sha = (git -C $repositoryRoot rev-parse --verify "$Commit^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { throw "Commit '$Commit' was not found." }
git -C $repositoryRoot merge-base --is-ancestor $sha origin/master
if ($LASTEXITCODE -ne 0) { throw "Commit $sha is not on origin/master; deploy only merged commits." }

$endpoint = (docker context inspect $DockerContext --format '{{.Endpoints.docker.Host}}').Trim()
if ($endpoint -notmatch '^ssh://(?<target>[A-Za-z0-9._-]+@[A-Za-z0-9.:_-]+)$') { throw "Docker context '$DockerContext' is not an ssh:// context." }
$target = $Matches.target
foreach ($remotePath in @($RemoteRoot, $RemoteEnvFile) + $RemoteComposeOverrides) {
    if ($remotePath -notmatch '^[A-Za-z]:/[A-Za-z0-9._/ -]+$') { throw "Remote path must be an absolute forward-slash Windows path: $remotePath" }
}

$archive = Join-Path ([IO.Path]::GetTempPath()) "nexora-$sha.zip"
# artifacts/ and docs/ are recorded evidence, never part of an image (~570 MB).
git -C $repositoryRoot archive --format=zip -9 -o $archive $sha -- . ':(exclude)artifacts' ':(exclude)docs'
if ($LASTEXITCODE -ne 0) { throw 'git archive failed.' }
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
$sizeMb = [math]::Round((Get-Item -LiteralPath $archive).Length / 1MB, 1)

$overrideArgs = ($RemoteComposeOverrides | ForEach-Object { "'--file', '$_'" }) -join ', '
$serviceArgs = ($Services | ForEach-Object { "'$_'" }) -join ', '
$remoteScript = @"
`$ErrorActionPreference = 'Stop'
`$timer = [Diagnostics.Stopwatch]::StartNew()
`$zip = '$RemoteRoot/$sha.zip'; `$source = '$RemoteRoot/$sha'
if ((Get-FileHash -LiteralPath `$zip -Algorithm SHA256).Hash -ne '$hash') { Remove-Item -LiteralPath `$zip -Force; throw 'Archive hash mismatch; nothing was built.' }
if (-not (Test-Path -LiteralPath `$source)) { Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(`$zip, "`$source.partial"); Rename-Item -LiteralPath "`$source.partial" -NewName '$sha' }
Remove-Item -LiteralPath `$zip -Force
"extract=`$([math]::Round(`$timer.Elapsed.TotalSeconds,1))s"
`$env:OCI_IMAGE_REVISION = '$sha'
`$compose = @('compose', '--project-name', 'nexora', '--env-file', '$RemoteEnvFile', '--file', "`$source/deploy/docker/docker-compose.yml"$(if ($overrideArgs) { ", $overrideArgs" }))
& docker @compose build $serviceArgs
if (`$LASTEXITCODE -ne 0) { throw "docker compose build failed (`$LASTEXITCODE)." }
"build=`$([math]::Round(`$timer.Elapsed.TotalSeconds,1))s"
# Keep the newest sources; never delete a folder a running container mounts.
`$mounted = docker ps -q | ForEach-Object { docker inspect --format '{{range .Mounts}}{{.Source}}|{{end}}' `$_ } | Out-String
Get-ChildItem -LiteralPath '$RemoteRoot' -Directory | Where-Object { `$_.Name -match '^[0-9a-f]{40}$' } | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepSources | Where-Object { `$mounted -notlike "*`$(`$_.Name)*" } | Remove-Item -Recurse -Force
"@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remoteScript))
# The remote default shell is cmd.exe, whose command line is limited to 8191 characters.
if ($encoded.Length -gt 7800) { throw "Remote command is too long ($($encoded.Length) characters)." }

Write-Host "Commit $sha, archive $sizeMb MB (SHA-256 $hash), services: $($Services -join ', '), host: $target"
if ($PlanOnly) { Write-Host $remoteScript; Remove-Item -LiteralPath $archive -Force; return }

$timer = [Diagnostics.Stopwatch]::StartNew()
try {
    & $scp -q $archive "${target}:$RemoteRoot/$sha.zip"
    if ($LASTEXITCODE -ne 0) { throw "scp failed ($LASTEXITCODE). Does $RemoteRoot exist on the server?" }
    $upload = [math]::Round($timer.Elapsed.TotalSeconds, 1)
    & $ssh $target "powershell -NoProfile -NonInteractive -EncodedCommand $encoded"
    if ($LASTEXITCODE -ne 0) { throw "Remote build failed ($LASTEXITCODE); running containers were not changed." }
    Write-Host "Süreler: upload=${upload}s total=$([math]::Round($timer.Elapsed.TotalSeconds, 1))s"
}
finally { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
