[CmdletBinding()]
param(
    [string]$ContainerName = 'docker-sqlserver-1',
    [Parameter(Mandatory)] [string]$PlatformBackupPath,
    [Parameter(Mandatory)] [string]$TenantBackupPath,
    [Parameter(Mandatory)] [string]$StudioBackupPath,
    [string]$TenantDatabase = 'AIERPTenant_912df12f4e3144bea20735cca5834485',
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\..\docs\separated-recovery-drill.json')
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
if ($ContainerName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$') {
    throw 'ContainerName contains unsupported characters.'
}
if ($TenantDatabase -notmatch '^AIERPTenant_(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$') {
    throw 'TenantDatabase must be an AIERPTenant database name.'
}

$drillId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$sources = @(
    [pscustomobject]@{ Tag = 'Platform'; Database = 'AIERPPlatform'; Path = $PlatformBackupPath },
    [pscustomobject]@{ Tag = 'Tenant'; Database = $TenantDatabase; Path = $TenantBackupPath },
    [pscustomobject]@{ Tag = 'Studio'; Database = 'AIERPStudio'; Path = $StudioBackupPath }
)
$results = [System.Collections.Generic.List[object]]::new()
$temporaryDatabases = [System.Collections.Generic.List[string]]::new()
$containerBackups = [System.Collections.Generic.List[string]]::new()
$drillError = $null
$cleanupSucceeded = $true

function Invoke-ContainerSql([string]$Sql) {
    $output = @($Sql | & $docker exec -i $ContainerName sh -c 'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -W -s "|" -h -1 -i /dev/stdin' 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw 'SQL recovery verification failed in the SQL Server container.'
    }
    return (($output | ForEach-Object { [string]$_ }) -join "`n")
}

try {
    $running = & $docker inspect --format '{{.State.Running}}' $ContainerName 2>$null
    if ($LASTEXITCODE -ne 0 -or $running -ne 'true') {
        throw 'The requested SQL Server container is not running.'
    }

    foreach ($source in $sources) {
        $source.Path = [IO.Path]::GetFullPath($source.Path)
        if (-not (Test-Path -LiteralPath $source.Path -PathType Leaf)) {
            throw "A required $($source.Tag) backup file was not found."
        }
        if ($source.Database -notmatch '^[A-Za-z][A-Za-z0-9_]{0,80}$') {
            throw 'A source database name contains unsupported characters.'
        }

        $targetDatabase = "AIERPRecovery_${drillId}_$($source.Tag)"
        $backupBasename = "AIERPRecovery_${drillId}_$($source.Tag).bak"
        $containerBackup = "/var/opt/mssql/backups/$backupBasename"
        $targetDatabaseSql = $targetDatabase.Replace(']', ']]')
        $sourceDatabaseSql = $source.Database.Replace(']', ']]')
        $containerBackupSql = $containerBackup.Replace("'", "''")
        $sourceHash = (Get-FileHash -LiteralPath $source.Path -Algorithm SHA256).Hash
        $sourceBytes = (Get-Item -LiteralPath $source.Path).Length

        & $docker cp $source.Path "$ContainerName`:$containerBackup" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "The $($source.Tag) backup could not be staged in SQL Server." }
        $containerBackups.Add($containerBackup)

        $containerHashOutput = @(& $docker exec $ContainerName sha256sum $containerBackup 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "The $($source.Tag) backup copy could not be verified." }
        $containerHash = ([string]$containerHashOutput[0] -split '\s+')[0].ToUpperInvariant()
        if ($containerHash -ne $sourceHash) { throw "The $($source.Tag) backup copy checksum does not match." }

        $sql = @"
SET NOCOUNT ON;
DECLARE @source sysname = N'$sourceDatabaseSql';
DECLARE @target sysname = N'$targetDatabaseSql';
DECLARE @backup nvarchar(4000) = N'$containerBackupSql';
IF DB_ID(@source) IS NULL THROW 51000, 'Source database does not exist.', 1;
IF DB_ID(@target) IS NOT NULL THROW 51001, 'Recovery database already exists.', 1;
RESTORE VERIFYONLY FROM DISK = @backup WITH CHECKSUM;
DECLARE @moves nvarchar(max);
SELECT @moves = STRING_AGG(CONVERT(nvarchar(max),
    N'MOVE N''' + REPLACE(name, N'''', N'''''') + N''' TO N''/var/opt/mssql/data/' +
    @target + N'_' + CONVERT(nvarchar(10), file_id) +
    CASE type_desc WHEN N'LOG' THEN N'.ldf' WHEN N'ROWS' THEN CASE WHEN file_id = 1 THEN N'.mdf' ELSE N'.ndf' END ELSE N'.dat' END + N''''), N', ')
    WITHIN GROUP (ORDER BY file_id)
FROM sys.master_files WHERE database_id = DB_ID(@source);
IF @moves IS NULL THROW 51002, 'Source database has no files.', 1;
DECLARE @restore nvarchar(max) = N'RESTORE DATABASE ' + QUOTENAME(@target) + N' FROM DISK = N''' +
    REPLACE(@backup, N'''', N'''''') + N''' WITH ' + @moves + N', CHECKSUM, RECOVERY, STATS = 5;';
EXEC (@restore);
DBCC CHECKDB (@target) WITH NO_INFOMSGS, ALL_ERRORMSGS;
DECLARE @sourceTables bigint, @restoredTables bigint;
DECLARE @sourceCountSql nvarchar(max) = N'SELECT @count = COUNT_BIG(*) FROM ' + QUOTENAME(@source) + N'.sys.tables WHERE is_ms_shipped = 0;';
EXEC sys.sp_executesql @sourceCountSql, N'@count bigint OUTPUT', @count = @sourceTables OUTPUT;
DECLARE @countSql nvarchar(max) = N'SELECT @count = COUNT_BIG(*) FROM ' + QUOTENAME(@target) + N'.sys.tables WHERE is_ms_shipped = 0;';
EXEC sys.sp_executesql @countSql, N'@count bigint OUTPUT', @count = @restoredTables OUTPUT;
SELECT N'DRILL_RESULT|' + @target + N'|' + CONVERT(nvarchar(30), @sourceTables) + N'|' + CONVERT(nvarchar(30), @restoredTables) AS drill_result;
"@
        $temporaryDatabases.Add($targetDatabase)
        $sqlOutput = Invoke-ContainerSql $sql
        $resultLine = ($sqlOutput -split "`r?`n" | Where-Object { $_ -match '^DRILL_RESULT\|' } | Select-Object -Last 1)
        if (-not $resultLine) { throw "The $($source.Tag) restore did not return its verification result." }
        $parts = $resultLine -split '\|'
        if ($parts.Count -ne 4) { throw "The $($source.Tag) restore returned a malformed result." }
        $sourceTables = [long]$parts[2]
        $restoredTables = [long]$parts[3]
        if ($sourceTables -ne $restoredTables) { throw "The $($source.Tag) restore table count did not match." }

        $results.Add([ordered]@{
            database = $source.Database
            backupFile = [IO.Path]::GetFileName($source.Path)
            backupBytes = $sourceBytes
            backupSha256 = $sourceHash
            stagedCopyChecksumVerified = $true
            restoreVerifyOnlyPassed = $true
            dbccCheckdbPassed = $true
            sourceUserTables = $sourceTables
            restoredUserTables = $restoredTables
            status = 'passed'
        })
    }
}
catch {
    $drillError = $_.Exception.Message
}
finally {
    foreach ($database in $temporaryDatabases) {
        try {
            $safeDatabase = $database.Replace(']', ']]')
            [void](Invoke-ContainerSql "SET NOCOUNT ON; IF DB_ID(N'$safeDatabase') IS NOT NULL BEGIN ALTER DATABASE [$safeDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$safeDatabase]; END;")
        }
        catch {
            $cleanupSucceeded = $false
            if (-not $drillError) { $drillError = 'Temporary recovery database cleanup failed.' }
        }
    }
    foreach ($backup in $containerBackups) {
        try {
            & $docker exec $ContainerName rm -f -- $backup | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Remove failed.' }
        }
        catch {
            $cleanupSucceeded = $false
            if (-not $drillError) { $drillError = 'Temporary recovery backup cleanup failed.' }
        }
    }
}

$report = [ordered]@{
    drillId = $drillId
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    container = $ContainerName
    topology = 'separated-platform-tenant-studio'
    databases = @($results)
    passed = @($results | Where-Object status -eq 'passed').Count
    failed = if ($drillError) { 1 } else { 0 }
    temporaryArtifactsRemoved = $cleanupSucceeded
    status = if (-not $drillError -and $results.Count -eq $sources.Count -and $cleanupSucceeded) { 'passed' } else { 'failed' }
    error = $drillError
}
$reportFullPath = [IO.Path]::GetFullPath($ReportPath)
$reportDirectory = Split-Path -Parent $reportFullPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportFullPath -Encoding utf8
if ($drillError) { throw $drillError }
Write-Output ($report | ConvertTo-Json -Depth 5)
