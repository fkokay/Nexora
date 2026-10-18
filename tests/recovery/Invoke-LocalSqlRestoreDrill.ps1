[CmdletBinding()]
param(
    [string]$ContainerName = 'docker-sqlserver-1',
    [string]$SourceDatabase = 'AIERPPlatform',
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\recovery-drill.json')
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
if ($SourceDatabase -notmatch '^[A-Za-z][A-Za-z0-9_]{0,80}$') {
    throw 'SourceDatabase must be a simple SQL database identifier.'
}
if ($ContainerName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$') {
    throw 'ContainerName contains unsupported characters.'
}

$drillId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$targetDatabase = "AIERPRecoveryDrill_$drillId"
$backupFile = "/var/opt/mssql/backups/AIERPRecoveryDrill_$drillId.bak"
$backupBasename = [IO.Path]::GetFileName($backupFile)
$resultLine = $null
$drillError = $null
$cleanupSucceeded = $true

function Invoke-ContainerSql([string]$Sql) {
    $output = @($Sql | & $docker exec -i $ContainerName sh -c 'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -W -s "|" -i /dev/stdin' 2>&1)
    $exitCode = $LASTEXITCODE
    $text = ($output | ForEach-Object { [string]$_ }) -join "`n"
    if ($exitCode -ne 0) {
        throw "SQL operation failed in container '$ContainerName' (exit $exitCode). $text"
    }
    return $text
}

try {
    $restoreSql = @"
SET NOCOUNT ON;
DECLARE @source sysname = N'$SourceDatabase';
DECLARE @target sysname = N'$targetDatabase';
DECLARE @backup nvarchar(4000) = N'$backupFile';
IF DB_ID(@source) IS NULL THROW 51000, 'Source database does not exist.', 1;
IF DB_ID(@target) IS NOT NULL THROW 51001, 'Drill database already exists.', 1;
BACKUP DATABASE [$SourceDatabase] TO DISK = @backup WITH COPY_ONLY, INIT, CHECKSUM, STATS = 5;
RESTORE VERIFYONLY FROM DISK = @backup WITH CHECKSUM;
DECLARE @moves nvarchar(max);
SELECT @moves = STRING_AGG(CONVERT(nvarchar(max),
    N'MOVE N''' + REPLACE(name, N'''', N'''''') + N''' TO N''/var/opt/mssql/data/' +
    @target + CASE type_desc WHEN N'LOG' THEN N'_log.ldf' WHEN N'ROWS' THEN CASE WHEN file_id = 1 THEN N'.mdf' ELSE N'_' + CONVERT(nvarchar(10), file_id) + N'.ndf' END ELSE N'_' + CONVERT(nvarchar(10), file_id) + N'.dat' END + N''''), N', ')
FROM [$SourceDatabase].sys.database_files;
IF @moves IS NULL THROW 51002, 'Source database has no files.', 1;
DECLARE @restore nvarchar(max) = N'RESTORE DATABASE ' + QUOTENAME(@target) + N' FROM DISK = N''' + REPLACE(@backup, N'''', N'''''') + N''' WITH ' + @moves + N', CHECKSUM, RECOVERY, STATS = 5;';
EXEC (@restore);
DECLARE @check nvarchar(max) = N'DBCC CHECKDB (' + QUOTENAME(@target) + N') WITH NO_INFOMSGS, ALL_ERRORMSGS;';
EXEC (@check);
DECLARE @sourceTables bigint, @targetTables bigint, @sourceRows bigint, @targetRows bigint;
SELECT @sourceTables = COUNT_BIG(*) FROM [$SourceDatabase].sys.tables WHERE is_ms_shipped = 0;
SET @check = N'SELECT @tableCount = COUNT_BIG(*) FROM ' + QUOTENAME(@target) + N'.sys.tables WHERE is_ms_shipped = 0;';
EXEC sys.sp_executesql @check, N'@tableCount bigint OUTPUT', @tableCount = @targetTables OUTPUT;
SET @check = N'SELECT @rowCount = COALESCE(SUM(row_count),0) FROM ' + QUOTENAME(@source) + N'.sys.dm_db_partition_stats WHERE index_id IN (0,1);';
EXEC sys.sp_executesql @check, N'@rowCount bigint OUTPUT', @rowCount = @sourceRows OUTPUT;
SET @check = N'SELECT @rowCount = COALESCE(SUM(row_count),0) FROM ' + QUOTENAME(@target) + N'.sys.dm_db_partition_stats WHERE index_id IN (0,1);';
EXEC sys.sp_executesql @check, N'@rowCount bigint OUTPUT', @rowCount = @targetRows OUTPUT;
SELECT N'DRILL_RESULT|' + @target + N'|' + CONVERT(nvarchar(30), @sourceTables) + N'|' + CONVERT(nvarchar(30), @targetTables) + N'|' + CONVERT(nvarchar(30), @sourceRows) + N'|' + CONVERT(nvarchar(30), @targetRows) AS drill_result;
"@
    $sqlOutput = Invoke-ContainerSql $restoreSql
    $resultLine = ($sqlOutput -split "`r?`n" | Where-Object { $_ -match '^DRILL_RESULT\|' } | Select-Object -Last 1)
    if (-not $resultLine) { throw 'Restore drill did not return its verification result.' }
    $parts = $resultLine -split '\|'
    if ($parts.Count -ne 6) { throw 'Restore drill returned a malformed verification result.' }
    $sourceTables = [long]$parts[2]; $restoredTables = [long]$parts[3]
    $sourceRows = [long]$parts[4]; $restoredRows = [long]$parts[5]
    if ($sourceTables -ne $restoredTables) {
        throw "Restore table-count mismatch ($sourceTables/$restoredTables)."
    }
}
catch {
    $drillError = $_.Exception.Message
}
finally {
    try {
        $cleanupSql = @"
SET NOCOUNT ON;
IF DB_ID(N'$targetDatabase') IS NOT NULL
BEGIN
    ALTER DATABASE [$targetDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$targetDatabase];
END;
"@
        [void](Invoke-ContainerSql $cleanupSql)
    }
    catch {
        $cleanupSucceeded = $false
        if (-not $drillError) { $drillError = "Temporary database cleanup failed: $($_.Exception.Message)" }
    }
    try {
        & $docker exec $ContainerName rm -f -- $backupFile | Out-Null
        if ($LASTEXITCODE -ne 0) { $cleanupSucceeded = $false; if (-not $drillError) { $drillError = 'Temporary backup file cleanup failed.' } }
    }
    catch {
        $cleanupSucceeded = $false
        if (-not $drillError) { $drillError = "Temporary backup cleanup failed: $($_.Exception.Message)" }
    }
}

$report = [ordered]@{
    drillId = $drillId
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    container = $ContainerName
    sourceDatabase = $SourceDatabase
    temporaryDatabase = $targetDatabase
    backupFile = $backupBasename
    backupVerified = [bool]$resultLine
    restoreCheckedWithDbcc = [bool]$resultLine
    sourceUserTables = if ($resultLine) { $sourceTables } else { $null }
    restoredUserTables = if ($resultLine) { $restoredTables } else { $null }
    sourceRows = if ($resultLine) { $sourceRows } else { $null }
    restoredRows = if ($resultLine) { $restoredRows } else { $null }
    rowCountDelta = if ($resultLine) { $restoredRows - $sourceRows } else { $null }
    rowCountsArePointInTimeComparable = $false
    temporaryArtifactsRemoved = $cleanupSucceeded
    status = if ([string]::IsNullOrEmpty($drillError) -and $cleanupSucceeded) { 'passed' } else { 'failed' }
    error = $drillError
}
$reportFullPath = [IO.Path]::GetFullPath($ReportPath)
$reportDirectory = Split-Path -Parent $reportFullPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportFullPath -Encoding utf8
if ($drillError) { throw $drillError }
Write-Output ($report | ConvertTo-Json -Depth 4)
