[CmdletBinding()]
param(
    [string]$ContainerName = 'docker-sqlserver-1',
    [int]$StopTimeoutSeconds = 30,
    [int]$RecoveryTimeoutSeconds = 240,
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\sql-restart-recovery-drill.json')
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
$startedAt = [DateTime]::UtcNow
$report = [ordered]@{
    drill = 'local-compose-sql-graceful-restart'
    startedAtUtc = $startedAt.ToString('o')
    completedAtUtc = $null
    container = $ContainerName
    stopTimeoutSeconds = $StopTimeoutSeconds
    recoveryTimeoutSeconds = $RecoveryTimeoutSeconds
    volumesModified = $false
    migrationsRun = $false
    sqlRestarted = $false
    sqlHealthy = $false
    expectedDatabaseCountOnline = 0
    expectedDatabaseCount = 3
    applicationContainersRecovered = $false
    httpEndpoints = @()
    result = 'failed'
    failure = $null
}

function Invoke-Docker([string[]]$Arguments) {
    $output = @(& $docker @Arguments 2>&1)
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw "docker $($Arguments -join ' ') failed (exit $code): $($output -join ' ')" }
    return ($output -join "`n").Trim()
}

function Invoke-ContainerSql([string]$Sql) {
    $output = @($Sql | & $docker exec -i $ContainerName sh -c 'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -W -s "|" -i /dev/stdin' 2>&1)
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw "SQL verification failed in container '$ContainerName' (exit $code): $($output -join ' ')" }
    return ($output -join "`n").Trim()
}

function Test-HttpEndpoints {
    $checks = @(
        @{ name = 'Development Studio'; uri = 'http://localhost:5174/' },
        @{ name = 'Platform API'; uri = 'http://localhost:5080/health' },
        @{ name = 'AI Service'; uri = 'http://localhost:5081/health' }
    )
    $results = foreach ($check in $checks) {
        $code = $null
        try {
            $curlOutput = @(& curl.exe --noproxy '*' -sS -o NUL -w '%{http_code}' --max-time 15 $check.uri 2>$null)
            if ($LASTEXITCODE -eq 0 -and ($curlOutput -join '').Trim() -match '^\d{3}$') { $code = [int](($curlOutput -join '').Trim()) }
        } catch { $code = $null }
        [pscustomobject]@{ name = $check.name; statusCode = $code; passed = ($code -eq 200) }
    }
    return @($results)
}

function Get-ContainerState([string[]]$Names) {
    foreach ($name in $Names) {
        $line = Invoke-Docker @('inspect', '--format', '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', $name)
        $parts = $line.TrimStart('/') -split '\|', 3
        [pscustomobject]@{ name = $parts[0]; state = $parts[1]; health = $parts[2] }
    }
}

$sqlWasRunning = $false
try {
    $null = Invoke-Docker @('info', '--format', '{{.ServerVersion}}')
    $sqlState = Invoke-Docker @('inspect', '--format', '{{.State.Status}}', $ContainerName)
    if ($sqlState -ne 'running') { throw "SQL Server container must be running before the drill; current state: $sqlState" }
    $sqlWasRunning = $true

    $beforeEndpoints = Test-HttpEndpoints
    if (@($beforeEndpoints | Where-Object { -not $_.passed }).Count -gt 0) {
        throw 'Preflight HTTP health checks failed; SQL restart was not attempted.'
    }

    $runningText = Invoke-Docker @('ps', '--format', '{{.Names}}')
    $runningContainers = @($runningText -split "`n" | Where-Object { $_ })
    if ($runningContainers -notcontains $ContainerName) { throw 'SQL Server was not present in the running-container baseline.' }
    $report.runningContainerCountBefore = $runningContainers.Count

    # Confirm the separated platform, Studio, and at least one tenant database are online before stopping.
    $baselineSql = @'
SET NOCOUNT ON;
SELECT COUNT(*)
FROM sys.databases
WHERE state_desc = N'ONLINE'
  AND (name = N'AIERPPlatform' OR name = N'AIERPStudio' OR name LIKE N'AIERPTenant[_]%');
'@
    $baselineCountText = Invoke-ContainerSql $baselineSql
    $baselineCount = [int](($baselineCountText -split "`n" | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -Last 1).Trim())
    if ($baselineCount -lt 3) { throw "Preflight expected Platform, Studio, and a tenant database online; found $baselineCount." }

    $null = Invoke-Docker @('stop', '--time', [string]$StopTimeoutSeconds, $ContainerName)
    $stoppedState = Invoke-Docker @('inspect', '--format', '{{.State.Status}}', $ContainerName)
    if ($stoppedState -ne 'exited') { throw "SQL container did not stop cleanly; state: $stoppedState" }
    $null = Invoke-Docker @('start', $ContainerName)
    $report.sqlRestarted = $true

    $deadline = [DateTime]::UtcNow.AddSeconds($RecoveryTimeoutSeconds)
    do {
        $health = Invoke-Docker @('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', $ContainerName)
        if ($health -eq 'healthy') { break }
        Start-Sleep -Seconds 3
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($health -ne 'healthy') { throw "SQL Server did not become healthy within $RecoveryTimeoutSeconds seconds; state: $health" }
    $report.sqlHealthy = $true

    $onlineSql = @'
SET NOCOUNT ON;
SELECT CASE WHEN
    EXISTS (SELECT 1 FROM sys.databases WHERE name = N'AIERPPlatform' AND state_desc = N'ONLINE')
    AND EXISTS (SELECT 1 FROM sys.databases WHERE name = N'AIERPStudio' AND state_desc = N'ONLINE')
    AND EXISTS (SELECT 1 FROM sys.databases WHERE name LIKE N'AIERPTenant[_]%' AND state_desc = N'ONLINE')
    THEN 3 ELSE 0 END;
'@
    $databaseCheckAttempts = 0
    do {
        $databaseCheckAttempts++
        $onlineText = Invoke-ContainerSql $onlineSql
        $numberLine = $onlineText -split "`n" | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -Last 1
        $onlineCount = if ($numberLine) { [int]$numberLine.Trim() } else { 0 }
        if ($onlineCount -ge $report.expectedDatabaseCount) { break }
        Start-Sleep -Seconds 3
    } while ([DateTime]::UtcNow -lt $deadline)
    $report.expectedDatabaseCountOnline = $onlineCount
    $report.databaseCheckAttempts = $databaseCheckAttempts
    if ($onlineCount -lt $report.expectedDatabaseCount) { throw "Only $onlineCount of the expected separated databases are online." }

    do {
        $currentText = Invoke-Docker @('ps', '--format', '{{.Names}}')
        $current = @($currentText -split "`n" | Where-Object { $_ })
        $missing = @($runningContainers | Where-Object { $current -notcontains $_ })
        $containerStates = @(Get-ContainerState $runningContainers)
        $notReady = @($containerStates | Where-Object { $_.state -ne 'running' -or $_.health -in @('unhealthy', 'starting') })
        if ($missing.Count -eq 0 -and $notReady.Count -eq 0) { break }
        Start-Sleep -Seconds 3
    } while ([DateTime]::UtcNow -lt $deadline)
    $report.applicationContainersRecovered = ($missing.Count -eq 0 -and $notReady.Count -eq 0)
    $report.missingContainersAfterRecovery = $missing
    $report.containerHealthAfterRecovery = $containerStates
    if ($missing.Count -gt 0 -or $notReady.Count -gt 0) { throw "Previously running containers did not recover: $($notReady.name -join ', ') $($missing -join ', ')" }

    $httpAttempt = 0
    do {
        $httpAttempt++
        $report.httpEndpoints = Test-HttpEndpoints
        if (@($report.httpEndpoints | Where-Object { -not $_.passed }).Count -eq 0) { break }
        Start-Sleep -Seconds 3
    } while ([DateTime]::UtcNow -lt $deadline)
    $report.httpCheckAttempts = $httpAttempt
    if (@($report.httpEndpoints | Where-Object { -not $_.passed }).Count -gt 0) {
        throw 'One or more Development Studio, Platform API, or AI Service HTTP checks failed after SQL recovery.'
    }
    $report.result = 'passed'
} catch {
    $report.failure = $_.Exception.Message
    throw
} finally {
    # If the drill interrupted between stop and start, restore the service without touching its volume.
    if ($sqlWasRunning) {
        try {
            $state = Invoke-Docker @('inspect', '--format', '{{.State.Status}}', $ContainerName)
            if ($state -ne 'running') { $null = Invoke-Docker @('start', $ContainerName) }
        } catch {
            if (-not $report.failure) { $report.failure = "Failed to ensure SQL Server is running: $($_.Exception.Message)" }
            $report.result = 'failed'
        }
    }
    $report.completedAtUtc = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}

Get-Content -LiteralPath $ReportPath -Raw
if ($report.result -ne 'passed') { exit 1 }
