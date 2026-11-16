:ON ERROR EXIT

/*
  Maps the tenant query SQL logins (aierp_tr_<N> read, aierp_tw_<N> write) into an
  existing tenant ERP database and sets their role memberships. Run by a DBA/migrator
  after the Tenant Provisioning Worker has created the logins with
  --provision-tenant-query-credentials; the provisioning principal intentionally has no
  access to existing tenant databases. See docs/tenant-query-credentials.md.

  SQLCMD variable:
    TenantId  tenant GUID in 32-digit "N" form (no dashes), e.g.
              sqlcmd -v TenantId=0f8fad5bd9cb469fa16570867728950e -i Grant-TenantQueryPrincipals.sql

  The statements below are kept identical to
  TenantDatabaseProvisioner.BuildDatabaseAccessSql(ErpQueryRead/ErpQueryWrite, ...);
  a unit test fails if they drift. The script is idempotent.
*/
USE [master];
GO

IF LEN(N'$(TenantId)') <> 32 OR N'$(TenantId)' LIKE N'%[^0-9a-f]%'
    THROW 51010, 'TenantId must be the tenant GUID in 32-hex-digit N format (no dashes).', 1;
IF DB_ID(N'AIERPTenant_$(TenantId)') IS NULL
    THROW 51011, 'Tenant ERP database does not exist.', 1;
IF SUSER_ID(N'aierp_tr_$(TenantId)') IS NULL OR SUSER_ID(N'aierp_tw_$(TenantId)') IS NULL
    THROW 51012, 'Tenant query logins are missing; run the worker with --provision-tenant-query-credentials first.', 1;
GO

USE [AIERPTenant_$(TenantId)];
GO

-- ErpQueryRead: db_datareader only.
IF DATABASE_PRINCIPAL_ID(N'aierp_tr_$(TenantId)') IS NULL CREATE USER [aierp_tr_$(TenantId)] FOR LOGIN [aierp_tr_$(TenantId)];
ELSE IF NOT EXISTS
(
    SELECT 1
    FROM sys.database_principals AS [databasePrincipal]
    INNER JOIN sys.server_principals AS [serverPrincipal]
        ON [serverPrincipal].[sid] = [databasePrincipal].[sid]
    WHERE [databasePrincipal].[name] = N'aierp_tr_$(TenantId)'
      AND [serverPrincipal].[name] = N'aierp_tr_$(TenantId)'
)
    THROW 51001, 'Tenant database principal is not mapped to the tenant login.', 1;
IF NOT EXISTS
(
    SELECT 1
    FROM sys.database_role_members AS [membership]
    INNER JOIN sys.database_principals AS [role]
        ON [role].[principal_id] = [membership].[role_principal_id]
    INNER JOIN sys.database_principals AS [member]
        ON [member].[principal_id] = [membership].[member_principal_id]
    WHERE [role].[name] = N'db_datareader' AND [member].[name] = N'aierp_tr_$(TenantId)'
) ALTER ROLE [db_datareader] ADD MEMBER [aierp_tr_$(TenantId)];
IF EXISTS
(
    SELECT 1
    FROM sys.database_role_members AS [membership]
    INNER JOIN sys.database_principals AS [role]
        ON [role].[principal_id] = [membership].[role_principal_id]
    INNER JOIN sys.database_principals AS [member]
        ON [member].[principal_id] = [membership].[member_principal_id]
    WHERE [role].[name] = N'db_datawriter' AND [member].[name] = N'aierp_tr_$(TenantId)'
) ALTER ROLE [db_datawriter] DROP MEMBER [aierp_tr_$(TenantId)];
GO

-- ErpQueryWrite: db_datareader + db_datawriter, no EXECUTE grants.
IF DATABASE_PRINCIPAL_ID(N'aierp_tw_$(TenantId)') IS NULL CREATE USER [aierp_tw_$(TenantId)] FOR LOGIN [aierp_tw_$(TenantId)];
ELSE IF NOT EXISTS
(
    SELECT 1
    FROM sys.database_principals AS [databasePrincipal]
    INNER JOIN sys.server_principals AS [serverPrincipal]
        ON [serverPrincipal].[sid] = [databasePrincipal].[sid]
    WHERE [databasePrincipal].[name] = N'aierp_tw_$(TenantId)'
      AND [serverPrincipal].[name] = N'aierp_tw_$(TenantId)'
)
    THROW 51001, 'Tenant database principal is not mapped to the tenant login.', 1;
IF NOT EXISTS
(
    SELECT 1
    FROM sys.database_role_members AS [membership]
    INNER JOIN sys.database_principals AS [role]
        ON [role].[principal_id] = [membership].[role_principal_id]
    INNER JOIN sys.database_principals AS [member]
        ON [member].[principal_id] = [membership].[member_principal_id]
    WHERE [role].[name] = N'db_datareader' AND [member].[name] = N'aierp_tw_$(TenantId)'
) ALTER ROLE [db_datareader] ADD MEMBER [aierp_tw_$(TenantId)];
IF NOT EXISTS
(
    SELECT 1
    FROM sys.database_role_members AS [membership]
    INNER JOIN sys.database_principals AS [role]
        ON [role].[principal_id] = [membership].[role_principal_id]
    INNER JOIN sys.database_principals AS [member]
        ON [member].[principal_id] = [membership].[member_principal_id]
    WHERE [role].[name] = N'db_datawriter' AND [member].[name] = N'aierp_tw_$(TenantId)'
) ALTER ROLE [db_datawriter] ADD MEMBER [aierp_tw_$(TenantId)];
GO

-- Verification: expected rows are tr→db_datareader, tw→db_datareader, tw→db_datawriter.
SELECT [member].[name] AS [MemberName], [role].[name] AS [RoleName]
FROM sys.database_role_members AS [membership]
INNER JOIN sys.database_principals AS [role]
    ON [role].[principal_id] = [membership].[role_principal_id]
INNER JOIN sys.database_principals AS [member]
    ON [member].[principal_id] = [membership].[member_principal_id]
WHERE [member].[name] IN (N'aierp_tr_$(TenantId)', N'aierp_tw_$(TenantId)')
ORDER BY [member].[name], [role].[name];
GO
