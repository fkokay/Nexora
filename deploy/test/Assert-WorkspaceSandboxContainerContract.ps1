$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dockerfilePath = Join-Path $repoRoot 'deploy\docker\WorkspaceSandbox.Dockerfile'
$composePath = Join-Path $repoRoot 'deploy\docker\docker-compose.yml'
$dockerfile = Get-Content -LiteralPath $dockerfilePath -Raw
$compose = Get-Content -LiteralPath $composePath -Raw

function Assert-Contract([bool] $condition, [string] $message) {
    if (-not $condition) { throw "WorkspaceSandbox container contract failed: $message" }
}

$runtimeStageStart = [regex]::Matches($dockerfile, '(?m)^FROM\s+')[-1].Index
$runtimeStage = $dockerfile.Substring($runtimeStageStart)
Assert-Contract ($runtimeStage -match '(?m)^USER\s+1654:1654\s*$') 'the runtime image must run as UID/GID 1654'

$sandboxMatch = [regex]::Match($compose, '(?ms)^  workspace-sandbox:\r?\n(?<body>.*?)(?=^volumes:)')
Assert-Contract $sandboxMatch.Success 'the workspace-sandbox service must exist'
$sandbox = $sandboxMatch.Groups['body'].Value
Assert-Contract ($sandbox -match '(?m)^    user:\s*["'']?1654:1654["'']?\s*$') 'compose must pin the sandbox service to UID/GID 1654'
Assert-Contract ($sandbox -match '(?m)^    cap_drop:\s*\r?\n      - ALL\s*$') 'the sandbox must drop all capabilities before allow-listing required capabilities'
$capsMatch = [regex]::Match($sandbox, '(?ms)^    cap_add:\s*\r?\n(?<caps>(?:      - [A-Z_]+\r?\n?)+)')
Assert-Contract $capsMatch.Success 'the sandbox capability allow-list must be explicit'
$caps = $capsMatch.Groups['caps'].Value -split '\r?\n' | ForEach-Object { ($_ -replace '^\s*-\s*', '').Trim() } | Where-Object { $_ }
$expectedCaps = @('KILL', 'SETGID', 'SETPCAP', 'SETUID')
$actualCapsKey = @($caps | Sort-Object) -join ','
$expectedCapsKey = @($expectedCaps | Sort-Object) -join ','
Assert-Contract ($actualCapsKey -eq $expectedCapsKey) 'only KILL, SETGID, SETPCAP, and SETUID may be granted to the sandbox'
Assert-Contract ($sandbox -notmatch '(?m)^      - DAC_OVERRIDE\s*$') 'DAC_OVERRIDE must remain dropped'
Assert-Contract ($sandbox -match '(?m)^      - /tmp/test-jobs:.*uid=1654,gid=1654') 'the job tmpfs must be writable by the runtime UID'
Assert-Contract ($sandbox -match '(?ms)^    depends_on:.*?workspace-test-jobs-init:\s*\r?\n\s+condition: service_completed_successfully') 'the job volume initializer must complete before the sandbox starts'

$initMatch = [regex]::Match($compose, '(?ms)^  workspace-test-jobs-init:\r?\n(?<body>.*?)(?=^  [a-zA-Z0-9_-]+:|^volumes:)')
Assert-Contract $initMatch.Success 'the workspace test-job volume initializer must exist'
$initializer = $initMatch.Groups['body'].Value
Assert-Contract ($initializer -match 'chown -R 1654:1654 /test-jobs') 'the test-job volume must be owned by UID/GID 1654 before startup'

Write-Output 'WorkspaceSandbox container contract source is valid.'
