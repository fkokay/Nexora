[CmdletBinding()]
param(
    [string]$ContainerName = 'docker-sqlserver-1',
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\local-release-failure-drill.json')
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
if ($ContainerName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$') {
    throw 'ContainerName contains unsupported characters.'
}

$drillId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$database = "AIERPReleaseFailureDrill_$drillId"
$stage = 'setup'
$backup = "/var/opt/mssql/backups/$database.bak"
$damagedBackup = "/var/opt/mssql/backups/$database.damaged.bak"
$migrationRolledBack = $false
$failedRestoreRejected = $false
$targetSurvivedFailedRestore = $false
$safetyRestoreSucceeded = $false
$cleanupSucceeded = $true
$drillError = $null

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
    $setupSql = @"
SET NOCOUNT ON;
IF DB_ID(N'$database') IS NOT NULL THROW 51000, 'Unique drill database already exists.', 1;
CREATE DATABASE [$database];
GO
ALTER DATABASE [$database] SET RECOVERY SIMPLE;
USE [$database];
CREATE TABLE dbo.DrillSentinel (Id int NOT NULL PRIMARY KEY, Value int NOT NULL);
INSERT dbo.DrillSentinel (Id, Value) VALUES (1, 1);
BACKUP DATABASE [$database] TO DISK = N'$backup' WITH INIT, CHECKSUM, STATS = 5;
RESTORE VERIFYONLY FROM DISK = N'$backup' WITH CHECKSUM;
SELECT N'DRILL_FILE|' + CONVERT(nvarchar(128), name) COLLATE DATABASE_DEFAULT + N'|' +
    CONVERT(nvarchar(60), type_desc) COLLATE DATABASE_DEFAULT + N'|' + CONVERT(nvarchar(10), file_id) AS drill_file
FROM [$database].sys.database_files ORDER BY file_id;
"@
    $setupOutput = Invoke-ContainerSql $setupSql
    $fileLayoutLines = @($setupOutput -split "`r?`n" | Where-Object { $_ -match '^DRILL_FILE\|' })
    if ($fileLayoutLines.Count -lt 2) { throw 'Scratch backup file layout was not returned.' }
    $moveClauses = foreach ($line in $fileLayoutLines) {
        $parts = $line -split '\|'
        if ($parts.Count -ne 4) { throw 'Scratch backup returned a malformed file layout.' }
        $logicalName = $parts[1].Replace("'", "''")
        $fileType = $parts[2]
        $fileId = [int]$parts[3]
        $suffix = if ($fileType -eq 'LOG') { '_log.ldf' } elseif ($fileId -eq 1) { '.mdf' } else { "_$fileId.ndf" }
        "MOVE N'$logicalName' TO N'/var/opt/mssql/data/$database$suffix'"
    }
    $moveClauseSql = $moveClauses -join ', '

    # Prove a failed transactional migration leaves no partial schema/data behind.
    $stage = 'transactional-migration-failure'
    $migrationSql = @"
USE [$database];
BEGIN TRY
    BEGIN TRANSACTION;
    CREATE TABLE dbo.PartialMigrationProbe (Id int NOT NULL PRIMARY KEY);
    INSERT dbo.PartialMigrationProbe (Id) VALUES (1);
    THROW 51001, 'Injected migration failure.', 1;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
END CATCH;
IF OBJECT_ID(N'dbo.PartialMigrationProbe', N'U') IS NOT NULL
    THROW 51002, 'Failed migration left partial schema behind.', 1;
IF (SELECT Value FROM dbo.DrillSentinel WHERE Id = 1) <> 1
    THROW 51003, 'Failed migration changed the sentinel.', 1;
SELECT N'MIGRATION_ROLLED_BACK' AS drill_result;
"@
    $migrationOutput = Invoke-ContainerSql $migrationSql
    $migrationRolledBack = $migrationOutput -match 'MIGRATION_ROLLED_BACK'
    if (-not $migrationRolledBack) { throw 'Failed migration rollback was not confirmed.' }

    # Make a deliberately corrupt copy, then fail restore against only the scratch DB.
    $stage = 'corrupt-restore-injection'
    $makeBadCopy = "cp -- '$backup' '$damagedBackup' && truncate -s 512 '$damagedBackup'"
    & $docker exec $ContainerName sh -c $makeBadCopy | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the drill-only damaged backup copy.' }

    $failedRestoreSql = @"
UPDATE [$database].dbo.DrillSentinel SET Value = 2 WHERE Id = 1;
DECLARE @restoreFailed bit = 0;
BEGIN TRY
    RESTORE DATABASE [$database] FROM DISK = N'$damagedBackup' WITH REPLACE, CHECKSUM, RECOVERY;
END TRY
BEGIN CATCH
    SET @restoreFailed = 1;
END CATCH;
IF @restoreFailed <> 1 THROW 51004, 'Corrupt backup unexpectedly restored.', 1;
IF DB_ID(N'$database') IS NOT NULL
BEGIN
    IF (SELECT Value FROM [$database].dbo.DrillSentinel WHERE Id = 1) <> 2
        THROW 51006, 'Failed restore unexpectedly changed scratch data.', 1;
END;
SELECT N'FAILED_RESTORE_REJECTED|' + CONVERT(nvarchar(1), CASE WHEN DB_ID(N'$database') IS NULL THEN 0 ELSE 1 END) AS drill_result;
"@
    $failedRestoreOutput = Invoke-ContainerSql $failedRestoreSql
    $failedRestoreMatch = [regex]::Match($failedRestoreOutput, 'FAILED_RESTORE_REJECTED\|([01])')
    $failedRestoreRejected = $failedRestoreMatch.Success
    $targetSurvivedFailedRestore = $failedRestoreMatch.Success -and $failedRestoreMatch.Groups[1].Value -eq '1'
    if (-not $failedRestoreRejected) { throw 'Failed-restore rejection was not confirmed.' }

    # Exercise the safety-backup recovery path after the failed restore.
    $stage = 'safety-backup-recovery'
    $safetyRestoreSql = @"
SET NOCOUNT ON;
RESTORE DATABASE [$database] FROM DISK = N'$backup' WITH $moveClauseSql, REPLACE, CHECKSUM, RECOVERY, STATS = 5;
DBCC CHECKDB ([$database]) WITH NO_INFOMSGS, ALL_ERRORMSGS;
IF (SELECT Value FROM [$database].dbo.DrillSentinel WHERE Id = 1) <> 1
    THROW 51008, 'Safety backup restore did not recover the expected sentinel.', 1;
IF OBJECT_ID(N'[$database].dbo.PartialMigrationProbe', N'U') IS NOT NULL
    THROW 51009, 'Safety backup unexpectedly includes the failed migration probe.', 1;
SELECT N'SAFETY_RESTORE_SUCCEEDED' AS drill_result;
"@
    $safetyOutput = Invoke-ContainerSql $safetyRestoreSql
    $safetyRestoreSucceeded = $safetyOutput -match 'SAFETY_RESTORE_SUCCEEDED'
    if (-not $safetyRestoreSucceeded) { throw 'Safety-backup restore was not confirmed.' }
}
catch {
    $drillError = $_.Exception.Message
}
finally {
    try {
        $cleanupSql = @"
SET NOCOUNT ON;
IF DB_ID(N'$database') IS NOT NULL
BEGIN
    ALTER DATABASE [$database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$database];
END;
"@
        [void](Invoke-ContainerSql $cleanupSql)
    }
    catch {
        $cleanupSucceeded = $false
        if (-not $drillError) { $drillError = "Temporary database cleanup failed: $($_.Exception.Message)" }
    }
    foreach ($file in @($backup, $damagedBackup)) {
        try {
            & $docker exec $ContainerName rm -f -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'docker exec rm returned a non-zero exit code.' }
        }
        catch {
            $cleanupSucceeded = $false
            if (-not $drillError) { $drillError = "Temporary backup cleanup failed: $($_.Exception.Message)" }
        }
    }
}

$report = [ordered]@{
    drillId = $drillId
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    container = $ContainerName
    temporaryDatabase = $database
    migrationFailureRolledBack = $migrationRolledBack
    corruptRestoreRejected = $failedRestoreRejected
    targetSurvivedFailedRestore = $targetSurvivedFailedRestore
    safetyBackupRestoredAndDbccChecked = $safetyRestoreSucceeded
    temporaryArtifactsRemoved = $cleanupSucceeded
    status = if ([string]::IsNullOrEmpty($drillError) -and $cleanupSucceeded -and $migrationRolledBack -and $failedRestoreRejected -and $safetyRestoreSucceeded) { 'passed' } else { 'failed' }
    failedStage = if ($drillError) { $stage } else { $null }
    error = $drillError
}
$reportFullPath = [IO.Path]::GetFullPath($ReportPath)
$reportDirectory = Split-Path -Parent $reportFullPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportFullPath -Encoding utf8
if ($drillError) { throw $drillError }
Write-Output ($report | ConvertTo-Json -Depth 4)
