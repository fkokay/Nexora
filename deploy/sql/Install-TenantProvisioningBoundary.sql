:ON ERROR EXIT

/*
  SQL Server 2022, run by a DBA with sysadmin-equivalent deployment rights.
  The only SQLCMD substitution is the existing Worker server principal name.
  A master database master key must already exist; this script never prompts
  for or stores a password/secret.
*/
USE [master];
GO

IF CONVERT(int, SERVERPROPERTY('ProductMajorVersion')) < 16
    THROW 51000, 'This boundary script requires SQL Server 2022 (major version 16) or later.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name = N'##MS_DatabaseMasterKey##')
    THROW 51001, 'Create/open the master database master key using the approved secret-management procedure before deployment.', 1;
IF SUSER_ID(N'$(TenantProvisioningLoginName)') IS NULL
    THROW 51002, 'The SQLCMD Worker principal does not exist on this SQL Server instance.', 1;
IF IS_SRVROLEMEMBER(N'sysadmin',N'$(TenantProvisioningLoginName)')=1
   OR IS_SRVROLEMEMBER(N'securityadmin',N'$(TenantProvisioningLoginName)')=1
   OR IS_SRVROLEMEMBER(N'dbcreator',N'$(TenantProvisioningLoginName)')=1
    THROW 51007, 'Worker must not be a member of sysadmin, securityadmin, or dbcreator.', 1;
IF EXISTS (SELECT 1 FROM sys.server_permissions p
           WHERE p.grantee_principal_id=SUSER_ID(N'$(TenantProvisioningLoginName)')
             AND p.state IN ('G','W')
             AND p.permission_name IN (N'CREATE ANY DATABASE',N'ALTER ANY LOGIN',N'CONTROL SERVER'))
    THROW 51008, 'Worker has a prohibited server-level grant; remove it before installing this boundary.', 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.certificates WHERE name = N'NexoraTenantProvisioningSigner')
BEGIN
    CREATE CERTIFICATE [NexoraTenantProvisioningSigner]
        WITH SUBJECT = N'Nexora tenant database provisioning boundary';
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'NexoraTenantProvisioningSignerLogin')
    CREATE LOGIN [NexoraTenantProvisioningSignerLogin]
        FROM CERTIFICATE [NexoraTenantProvisioningSigner];
ELSE IF (SELECT sid FROM sys.server_principals WHERE name=N'NexoraTenantProvisioningSignerLogin')
     <> (SELECT thumbprint FROM sys.certificates WHERE name=N'NexoraTenantProvisioningSigner')
    THROW 51003, 'The existing signer login is not bound to the expected certificate.', 1;
GO

/* SQL Server grants CONNECT SQL as part of certificate-login creation. The
   signer additionally receives only the two permissions required by the
   signed procedures. */
GRANT CREATE ANY DATABASE TO [NexoraTenantProvisioningSignerLogin];
GRANT ALTER ANY LOGIN TO [NexoraTenantProvisioningSignerLogin];
IF EXISTS (SELECT 1 FROM sys.server_permissions
           WHERE grantee_principal_id=SUSER_ID(N'NexoraTenantProvisioningSignerLogin')
             AND state IN ('G','W')
             AND permission_name NOT IN (N'CONNECT SQL',N'CREATE ANY DATABASE',N'ALTER ANY LOGIN'))
    THROW 51009, 'Signer certificate login has grants beyond CONNECT SQL, CREATE ANY DATABASE, and ALTER ANY LOGIN.', 1;
GO

CREATE OR ALTER PROCEDURE dbo.NexoraEnsureTenantDatabase
    @TenantId uniqueidentifier,
    @Component tinyint
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @DatabaseName sysname, @ComponentKey nvarchar(64), @TenantActive bit;
    IF @TenantId IS NULL OR @TenantId = '00000000-0000-0000-0000-000000000000' OR @Component IS NULL OR @Component NOT IN (1,2)
        THROW 51010, 'Invalid tenant provisioning request.', 1;

    SET @DatabaseName = CASE @Component
        WHEN 1 THEN N'AIERPTenant_' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N''))
        WHEN 2 THEN N'AIERPStudio_' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N'')) END;
    SET @ComponentKey = N'AIStudio:' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N''));

    IF DB_ID(N'AIERPPlatform') IS NULL
        THROW 51011, 'Platform database is unavailable.', 1;

    DECLARE @Sql nvarchar(max) = N'
      SELECT @Active = [IsActive] FROM [AIERPPlatform].[dbo].[Tenants] WHERE [Id] = @Tid;
      IF @Active IS NULL OR @Active <> 0 THROW 51012, ''Tenant must exist and be inactive.'', 1;
      IF NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantProvisioningJobs]
          WHERE [TenantId]=@Tid AND [Status]=2 AND [LeaseExpiresAt] > TODATETIMEOFFSET(SYSUTCDATETIME(), ''+00:00''))
          THROW 51013, ''A running, unexpired provisioning job is required.'', 1;
      IF @Comp=1 AND NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
          WHERE [TenantId]=@Tid AND [DatabaseName]=@Db AND ([State]=2 OR ([State]=3 AND DB_ID(@Db) IS NOT NULL)))
          THROW 51014, ''ERP catalog must be Copying, or Ready with its database already present.'', 1;
      IF @Comp=2 AND (
          NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
          WHERE [TenantId]=@Tid AND [DatabaseName]=N''AIERPTenant_''+LOWER(REPLACE(CONVERT(nvarchar(36),@Tid),N''-'',N'''')) AND [State]=3)
          OR NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[DatabaseSeparationComponentStates]
              WHERE [Component]=@Key AND [DatabaseName]=@Db AND ([State]=2 OR ([State]=3 AND DB_ID(@Db) IS NOT NULL))))
          THROW 51015, ''ERP must be Ready and AI Studio must be Copying, or Ready with its database already present.'', 1;';
    EXEC sys.sp_executesql @Sql,
        N'@Tid uniqueidentifier,@Comp tinyint,@Db sysname,@Key nvarchar(64),@Active bit OUTPUT',
        @Tid=@TenantId,@Comp=@Component,@Db=@DatabaseName,@Key=@ComponentKey,@Active=@TenantActive OUTPUT;

    /* Serialize concurrent retries for this deterministic database. */
    DECLARE @LockResult int, @LockResource nvarchar(255)=N'NexoraTenantDb:' + @DatabaseName;
    EXEC @LockResult = sys.sp_getapplock @Resource=@LockResource,
        @LockMode='Exclusive', @LockOwner='Session', @LockTimeout=15000;
    IF @LockResult < 0 THROW 51016, 'Could not acquire tenant database provisioning lock.', 1;
    BEGIN TRY
        IF DB_ID(@DatabaseName) IS NULL
        BEGIN
            DECLARE @CreateSql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@DatabaseName) + N';';
            EXEC sys.sp_executesql @CreateSql;
        END;
        EXEC sys.sp_releaseapplock @Resource=@LockResource, @LockOwner='Session';
    END TRY
    BEGIN CATCH
        EXEC sys.sp_releaseapplock @Resource=@LockResource, @LockOwner='Session';
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.NexoraEnsureTenantSqlLogin
    @TenantId uniqueidentifier,
    @Component tinyint,
    @Password nvarchar(512)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @TenantId IS NULL OR @TenantId = '00000000-0000-0000-0000-000000000000' OR @Component IS NULL OR @Component NOT IN (1,2)
       OR @Password IS NULL OR LEN(@Password) < 16
        THROW 51020, 'Invalid tenant SQL credential request.', 1;

    DECLARE @DatabaseName sysname = CASE @Component
        WHEN 1 THEN N'AIERPTenant_' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N''))
        WHEN 2 THEN N'AIERPStudio_' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N'')) END;
    DECLARE @LoginName sysname = CASE @Component
        WHEN 1 THEN N'aierp_t_' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N''))
        WHEN 2 THEN N'aierp_s_' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N'')) END;
    DECLARE @ComponentKey nvarchar(64)=N'AIStudio:' + LOWER(REPLACE(CONVERT(nvarchar(36), @TenantId), N'-', N''));

    IF DB_ID(@DatabaseName) IS NULL THROW 51021, 'Canonical tenant database must exist before login provisioning.', 1;

    DECLARE @Sql nvarchar(max)=N'
      DECLARE @Active bit;
      SELECT @Active=[IsActive] FROM [AIERPPlatform].[dbo].[Tenants] WHERE [Id]=@Tid;
      IF @Active IS NULL THROW 51022, ''Tenant does not exist.'', 1;
      /* Offline credential cutover rotates principals only for an already-Ready
         canonical database. New database/login provisioning remains bound to an
         inactive tenant and a live provisioning lease. */
      IF @Active=1 AND NOT (
          (@Comp=1 AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
              WHERE [TenantId]=@Tid AND [DatabaseName]=@Db AND [State]=3) AND DB_ID(@Db) IS NOT NULL)
          OR (@Comp=2 AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
              WHERE [TenantId]=@Tid AND [DatabaseName]=N''AIERPTenant_''+LOWER(REPLACE(CONVERT(nvarchar(36),@Tid),N''-'',N'''')) AND [State]=3)
              AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[DatabaseSeparationComponentStates]
                  WHERE [Component]=@Key AND [DatabaseName]=@Db AND [State]=3) AND DB_ID(@Db) IS NOT NULL))
          THROW 51023, ''Active tenants may only rotate credentials for an existing Ready database.'', 1;
      IF @Active=0
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantProvisioningJobs]
            WHERE [TenantId]=@Tid AND [Status]=2 AND [LeaseExpiresAt] > TODATETIMEOFFSET(SYSUTCDATETIME(), ''+00:00''))
            THROW 51024, ''A running, unexpired provisioning job is required.'', 1;
        IF @Comp=1 AND NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
            WHERE [TenantId]=@Tid AND [DatabaseName]=@Db AND ([State]=2 OR ([State]=3 AND DB_ID(@Db) IS NOT NULL)))
            THROW 51025, ''ERP catalog must be Copying, or Ready with its database already present.'', 1;
        IF @Comp=2 AND (NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
                WHERE [TenantId]=@Tid AND [DatabaseName]=N''AIERPTenant_''+LOWER(REPLACE(CONVERT(nvarchar(36),@Tid),N''-'',N'''')) AND [State]=3)
            OR NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[DatabaseSeparationComponentStates]
                WHERE [Component]=@Key AND [DatabaseName]=@Db AND ([State]=2 OR ([State]=3 AND DB_ID(@Db) IS NOT NULL))))
            THROW 51026, ''ERP must be Ready and AI Studio must be Copying, or Ready with its database already present.'', 1;
      END;';
    EXEC sys.sp_executesql @Sql,N'@Tid uniqueidentifier,@Comp tinyint,@Db sysname,@Key nvarchar(64)',
        @Tid=@TenantId,@Comp=@Component,@Db=@DatabaseName,@Key=@ComponentKey;

    DECLARE @EscapedPassword nvarchar(1024)=REPLACE(@Password,N'''',N'''''');
    DECLARE @LoginSql nvarchar(max)=CASE WHEN SUSER_ID(@LoginName) IS NULL
       THEN N'CREATE LOGIN '+QUOTENAME(@LoginName)+N' WITH PASSWORD=N'''+@EscapedPassword+N''', CHECK_POLICY=ON, DEFAULT_DATABASE='+QUOTENAME(@DatabaseName)+N';'
       ELSE N'ALTER LOGIN '+QUOTENAME(@LoginName)+N' WITH PASSWORD=N'''+@EscapedPassword+N''', CHECK_POLICY=ON; ALTER LOGIN '+QUOTENAME(@LoginName)+N' WITH DEFAULT_DATABASE='+QUOTENAME(@DatabaseName)+N';' END;
    EXEC sys.sp_executesql @LoginSql;
END;
GO

CREATE OR ALTER PROCEDURE dbo.NexoraTenantDatabaseExists
    @TenantId uniqueidentifier,
    @Component tinyint
AS
BEGIN
    SET NOCOUNT ON;
    IF @TenantId IS NULL OR @TenantId='00000000-0000-0000-0000-000000000000' OR @Component IS NULL OR @Component NOT IN (1,2)
        THROW 51030, 'Invalid tenant database lookup.', 1;
    DECLARE @DatabaseName sysname=CASE @Component
        WHEN 1 THEN N'AIERPTenant_'+LOWER(REPLACE(CONVERT(nvarchar(36),@TenantId),N'-',N''))
        WHEN 2 THEN N'AIERPStudio_'+LOWER(REPLACE(CONVERT(nvarchar(36),@TenantId),N'-',N'')) END;
    DECLARE @Key nvarchar(64)=N'AIStudio:'+LOWER(REPLACE(CONVERT(nvarchar(36),@TenantId),N'-',N''));
    DECLARE @Sql nvarchar(max)=N'
      DECLARE @Active bit;
      SELECT @Active=[IsActive] FROM [AIERPPlatform].[dbo].[Tenants] WHERE [Id]=@Tid;
      IF @Active IS NULL THROW 51031, ''Tenant does not exist.'', 1;
      /* A read-only existence check is also required by the offline credential
         cutover for active tenants. Permit that path only for an already-Ready,
         canonical catalog entry whose database is present. Creating databases
         and rotating logins remain restricted to inactive leased provisioning. */
      IF @Comp=1 AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
          WHERE [TenantId]=@Tid AND [DatabaseName]=@Db AND [State]=3) AND DB_ID(@Db) IS NOT NULL
      BEGIN SELECT CONVERT(bit,1) AS [Exists]; RETURN; END;
      IF @Comp=2 AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
              WHERE [TenantId]=@Tid AND [DatabaseName]=N''AIERPTenant_''+LOWER(REPLACE(CONVERT(nvarchar(36),@Tid),N''-'',N'''')) AND [State]=3)
          AND EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[DatabaseSeparationComponentStates]
              WHERE [Component]=@Key AND [DatabaseName]=@Db AND [State]=3) AND DB_ID(@Db) IS NOT NULL
      BEGIN SELECT CONVERT(bit,1) AS [Exists]; RETURN; END;
      IF @Active<>0 THROW 51032, ''Active tenants may only query an existing Ready database.'', 1;
      IF NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantProvisioningJobs]
          WHERE [TenantId]=@Tid AND [Status]=2 AND [LeaseExpiresAt] > TODATETIMEOFFSET(SYSUTCDATETIME(), ''+00:00''))
          THROW 51033, ''A running, unexpired provisioning job is required.'', 1;
      IF @Comp=1 AND NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
          WHERE [TenantId]=@Tid AND [DatabaseName]=@Db AND [State]=2)
          THROW 51034, ''ERP catalog must be Copying, or Ready with its database already present.'', 1;
      IF @Comp=2 AND (NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[TenantDatabaseCatalog]
              WHERE [TenantId]=@Tid AND [DatabaseName]=N''AIERPTenant_''+LOWER(REPLACE(CONVERT(nvarchar(36),@Tid),N''-'',N'''')) AND [State]=3)
          OR NOT EXISTS (SELECT 1 FROM [AIERPPlatform].[dbo].[DatabaseSeparationComponentStates]
          WHERE [Component]=@Key AND [DatabaseName]=@Db AND [State]=2))
          THROW 51035, ''ERP must be Ready and AI Studio must be Copying, or Ready with its database already present.'', 1;
      SELECT CONVERT(bit,CASE WHEN DB_ID(@Db) IS NULL THEN 0 ELSE 1 END) AS [Exists];';
    EXEC sys.sp_executesql @Sql,N'@Tid uniqueidentifier,@Comp tinyint,@Db sysname,@Key nvarchar(64)',
        @Tid=@TenantId,@Comp=@Component,@Db=@DatabaseName,@Key=@Key;
END;
GO

/* Copy only the public certificate in-memory; no OS-specific SQL Server file path is required. */
IF NOT EXISTS (SELECT 1 FROM [AIERPPlatform].sys.certificates WHERE name=N'NexoraTenantProvisioningSigner')
BEGIN
    DECLARE @PublicCertificate varbinary(max)=CERTENCODED(CERT_ID(N'NexoraTenantProvisioningSigner'));
    IF @PublicCertificate IS NULL THROW 51042, 'Could not encode the provisioning signer certificate.', 1;
    DECLARE @CertificateHex varchar(max)=CONVERT(varchar(max),@PublicCertificate,1);
    DECLARE @CreatePlatformCertificate nvarchar(max)=N'USE [AIERPPlatform]; CREATE CERTIFICATE [NexoraTenantProvisioningSigner] FROM BINARY = '+CONVERT(nvarchar(max),@CertificateHex)+N';';
    EXEC sys.sp_executesql @CreatePlatformCertificate;
END
ELSE IF (SELECT thumbprint FROM [AIERPPlatform].sys.certificates WHERE name=N'NexoraTenantProvisioningSigner')
     <> (SELECT thumbprint FROM master.sys.certificates WHERE name=N'NexoraTenantProvisioningSigner')
    THROW 51004, 'AIERPPlatform contains a different certificate with the signer name.', 1;
GO

/* Create the AIERPPlatform certificate user and grant exactly the SELECTs used by the gates. */
USE [AIERPPlatform];
GO
IF NOT EXISTS (SELECT 1 FROM sys.certificates WHERE name=N'NexoraTenantProvisioningSigner')
    THROW 51043, 'Provisioning signer public certificate transfer did not complete.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'NexoraTenantProvisioningSignerUser')
    CREATE USER [NexoraTenantProvisioningSignerUser] FROM CERTIFICATE [NexoraTenantProvisioningSigner];
ELSE IF (SELECT sid FROM sys.database_principals WHERE name=N'NexoraTenantProvisioningSignerUser')
     <> (SELECT thumbprint FROM sys.certificates WHERE name=N'NexoraTenantProvisioningSigner')
    THROW 51005, 'The existing Platform signer user is not bound to the expected certificate.', 1;
GRANT SELECT ON dbo.Tenants TO [NexoraTenantProvisioningSignerUser];
GRANT SELECT ON dbo.TenantProvisioningJobs TO [NexoraTenantProvisioningSignerUser];
GRANT SELECT ON dbo.TenantDatabaseCatalog TO [NexoraTenantProvisioningSignerUser];
GRANT SELECT ON dbo.DatabaseSeparationComponentStates TO [NexoraTenantProvisioningSignerUser];
GO

USE [master];
GO
/* Ensure/refresh signatures after CREATE OR ALTER. The cert is never dropped/recreated. */
IF EXISTS (SELECT 1 FROM sys.crypt_properties WHERE major_id=OBJECT_ID(N'dbo.NexoraEnsureTenantDatabase'))
    DROP SIGNATURE FROM OBJECT::dbo.NexoraEnsureTenantDatabase BY CERTIFICATE [NexoraTenantProvisioningSigner];
ADD SIGNATURE TO OBJECT::dbo.NexoraEnsureTenantDatabase BY CERTIFICATE [NexoraTenantProvisioningSigner];
IF EXISTS (SELECT 1 FROM sys.crypt_properties WHERE major_id=OBJECT_ID(N'dbo.NexoraEnsureTenantSqlLogin'))
    DROP SIGNATURE FROM OBJECT::dbo.NexoraEnsureTenantSqlLogin BY CERTIFICATE [NexoraTenantProvisioningSigner];
ADD SIGNATURE TO OBJECT::dbo.NexoraEnsureTenantSqlLogin BY CERTIFICATE [NexoraTenantProvisioningSigner];
IF EXISTS (SELECT 1 FROM sys.crypt_properties WHERE major_id=OBJECT_ID(N'dbo.NexoraTenantDatabaseExists'))
    DROP SIGNATURE FROM OBJECT::dbo.NexoraTenantDatabaseExists BY CERTIFICATE [NexoraTenantProvisioningSigner];
ADD SIGNATURE TO OBJECT::dbo.NexoraTenantDatabaseExists BY CERTIFICATE [NexoraTenantProvisioningSigner];
GO

DECLARE @Worker sysname=N'$(TenantProvisioningLoginName)';
DECLARE @WorkerDbUser sysname=@Worker;
IF USER_ID(@WorkerDbUser) IS NULL
BEGIN
    DECLARE @CreateUser nvarchar(max)=N'CREATE USER '+QUOTENAME(@WorkerDbUser)+N' FOR LOGIN '+QUOTENAME(@Worker)+N';';
    EXEC sys.sp_executesql @CreateUser;
END
ELSE IF USER_SID(@WorkerDbUser) <> SUSER_SID(@Worker)
    THROW 51006, 'The existing Worker database user does not map to the supplied server login.', 1;
IF EXISTS (SELECT 1 FROM sys.database_permissions
           WHERE grantee_principal_id=USER_ID(@WorkerDbUser) AND state IN ('G','W')
             AND NOT (permission_name=N'CONNECT'
                      OR (permission_name=N'EXECUTE' AND major_id IN
                          (OBJECT_ID(N'dbo.NexoraEnsureTenantDatabase'),OBJECT_ID(N'dbo.NexoraEnsureTenantSqlLogin'),OBJECT_ID(N'dbo.NexoraTenantDatabaseExists')))))
    THROW 51040, 'Worker has database grants in master beyond CONNECT and the three provisioning procedure EXECUTE grants.', 1;
IF EXISTS (SELECT 1 FROM sys.database_role_members
           WHERE member_principal_id=USER_ID(@WorkerDbUser))
    THROW 51041, 'Worker has existing database-role memberships in master; remove them before installing the EXECUTE-only boundary.', 1;
DECLARE @GrantExec nvarchar(max)=N'GRANT EXECUTE ON dbo.NexoraEnsureTenantDatabase TO '+QUOTENAME(@WorkerDbUser)+N'; GRANT EXECUTE ON dbo.NexoraEnsureTenantSqlLogin TO '+QUOTENAME(@WorkerDbUser)+N'; GRANT EXECUTE ON dbo.NexoraTenantDatabaseExists TO '+QUOTENAME(@WorkerDbUser)+N';';
EXEC sys.sp_executesql @GrantExec;
GO

/* The Worker also needs narrowly scoped Platform job/catalog persistence.
   Tenant activation is the only Tenants column it may update. */
USE [AIERPPlatform];
GO
DECLARE @Worker sysname=N'$(TenantProvisioningLoginName)';
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=@Worker)
BEGIN
    DECLARE @CreatePlatformUser nvarchar(max)=N'CREATE USER '+QUOTENAME(@Worker)+N' FOR LOGIN '+QUOTENAME(@Worker)+N';';
    EXEC sys.sp_executesql @CreatePlatformUser;
END
ELSE IF USER_SID(@Worker) <> SUSER_SID(@Worker)
    THROW 51050, 'The Worker Platform user does not map to the supplied server login.', 1;

IF EXISTS (SELECT 1 FROM sys.database_role_members WHERE member_principal_id=USER_ID(@Worker))
    THROW 51051, 'Worker has Platform database-role memberships; remove them before installing explicit table grants.', 1;
IF EXISTS (SELECT 1 FROM sys.database_permissions p
           WHERE p.grantee_principal_id=USER_ID(@Worker) AND p.state IN ('G','W')
             AND NOT (
                 (p.permission_name=N'CONNECT' AND p.major_id=0 AND p.minor_id=0)
                 OR (p.permission_name=N'SELECT' AND p.major_id=OBJECT_ID(N'dbo.Tenants') AND p.minor_id=0)
                 OR (p.permission_name=N'UPDATE' AND p.major_id=OBJECT_ID(N'dbo.Tenants') AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Tenants'),N'IsActive','ColumnId'))
                 OR (p.permission_name IN (N'SELECT',N'UPDATE') AND p.major_id=OBJECT_ID(N'dbo.TenantProvisioningJobs') AND p.minor_id=0)
                 OR (p.permission_name IN (N'SELECT',N'INSERT',N'UPDATE') AND p.major_id=OBJECT_ID(N'dbo.TenantDatabaseCatalog') AND p.minor_id=0)
                 OR (p.permission_name IN (N'SELECT',N'INSERT',N'UPDATE') AND p.major_id=OBJECT_ID(N'dbo.DatabaseSeparationComponentStates') AND p.minor_id=0)
                 OR (p.permission_name=N'INSERT' AND p.major_id=OBJECT_ID(N'dbo.AuditEvents') AND p.minor_id=0)
             ))
    THROW 51052, 'Worker has Platform grants outside the approved job/catalog permission set.', 1;

GRANT CONNECT TO [$(TenantProvisioningLoginName)];
GRANT SELECT ON dbo.Tenants TO [$(TenantProvisioningLoginName)];
GRANT UPDATE (IsActive) ON dbo.Tenants TO [$(TenantProvisioningLoginName)];
GRANT SELECT, UPDATE ON dbo.TenantProvisioningJobs TO [$(TenantProvisioningLoginName)];
GRANT SELECT, INSERT, UPDATE ON dbo.TenantDatabaseCatalog TO [$(TenantProvisioningLoginName)];
GRANT SELECT, INSERT, UPDATE ON dbo.DatabaseSeparationComponentStates TO [$(TenantProvisioningLoginName)];
GRANT INSERT ON dbo.AuditEvents TO [$(TenantProvisioningLoginName)];
GO

