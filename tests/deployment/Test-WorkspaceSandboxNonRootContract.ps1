[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dockerfilePath = Join-Path $repoRoot 'deploy\docker\WorkspaceSandbox.Dockerfile'
$composePath = Join-Path $repoRoot 'deploy\docker\docker-compose.yml'
$workerPath = Join-Path $repoRoot 'src\AI\AIERP.WorkspaceSandbox\TestJobWorker.cs'
$assertions = [Collections.Generic.List[string]]::new()

foreach ($path in @($dockerfilePath, $composePath, $workerPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Workspace sandbox contract source was not found: $([IO.Path]::GetFileName($path))"
    }
}

$dockerfile = Get-Content -LiteralPath $dockerfilePath -Raw
if ($dockerfile -notmatch '(?m)^USER\s+1654:1654\s*$') {
    throw 'WorkspaceSandbox.Dockerfile must run the final image as UID:GID 1654:1654.'
}
$assertions.Add('sandbox image defaults to non-root UID:GID 1654:1654')

$compose = Get-Content -LiteralPath $composePath -Raw
$serviceMatch = [regex]::Match($compose, '(?ms)^  workspace-sandbox:\s*\r?\n(?<body>.*?)(?=^  [A-Za-z0-9][A-Za-z0-9_-]*:\s*$|\z)')
if (-not $serviceMatch.Success) { throw 'Compose service workspace-sandbox was not found.' }
$service = $serviceMatch.Groups['body'].Value

if ($service -notmatch '(?m)^    user:\s*["'']?0:0["'']?\s*$') {
    throw 'Compose workspace-sandbox trusted worker must run as root to drop child jobs to the restricted UID.'
}
$assertions.Add('trusted queue worker runs as root; child build/test processes drop to UID/GID 65532')

if ($service -notmatch '(?m)^    network_mode:\s*none\s*$') { throw 'Compose workspace-sandbox must use network_mode: none.' }
if ($service -notmatch '(?m)^    read_only:\s*true\s*$') { throw 'Compose workspace-sandbox root filesystem must be read-only.' }
if ($service -notmatch '(?ms)^    security_opt:\s*\r?\n      -\s*no-new-privileges:true\s*(?:\r?\n|\z)') {
    throw 'Compose workspace-sandbox must enable no-new-privileges.'
}
$assertions.Add('Compose sandbox disables networking, uses a read-only root filesystem, and enables no-new-privileges')

if ($service -notmatch '(?ms)^    cap_drop:\s*\r?\n      -\s*ALL\s*(?:\r?\n|\z)') {
    throw 'Compose workspace-sandbox must drop all capabilities before adding the minimal required set.'
}
$capAdd = [regex]::Match($service, '(?ms)^    cap_add:\s*\r?\n(?<list>.*?)(?=^    [A-Za-z_][A-Za-z0-9_-]*:|\z)')
if (-not $capAdd.Success) { throw 'Compose workspace-sandbox must explicitly declare its required capabilities.' }
$capabilities = @([regex]::Matches($capAdd.Groups['list'].Value, '(?m)^      -\s*([A-Z_]+)\s*$') | ForEach-Object { $_.Groups[1].Value })
$expectedCapabilities = @('KILL', 'SETPCAP', 'SETUID', 'SETGID', 'DAC_OVERRIDE')
if ($capabilities.Count -ne $expectedCapabilities.Count -or
    @($capabilities | Where-Object { $_ -notin $expectedCapabilities }).Count -ne 0 -or
    @($expectedCapabilities | Where-Object { $_ -notin $capabilities }).Count -ne 0) {
    throw "Compose workspace-sandbox capabilities must be exactly: $($expectedCapabilities -join ', ')."
}
$assertions.Add('Compose drops ALL capabilities and adds only KILL, SETPCAP, SETUID, SETGID, and DAC_OVERRIDE')

$worker = Get-Content -LiteralPath $workerPath -Raw
foreach ($argument in @('--reuid=65532', '--regid=65532', '--clear-groups', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all')) {
    if ($worker -notmatch [regex]::Escape('ArgumentList.Add("' + $argument + '")')) {
        throw "Workspace sandbox child commands must retain setpriv argument $argument."
    }
}
$assertions.Add('child commands retain UID/GID 65532, clear supplementary groups, and drop bounding, inheritable, and ambient capabilities')

[pscustomobject]@{
    status = 'passed'
    assertions = @($assertions)
    dockerInvoked = $false
} | ConvertTo-Json -Depth 3
