namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Cleanup SQL for the query-login hardening objects that
/// deploy/sql/Install-TenantProvisioningBoundary.sql creates on a disposable acceptance instance.
/// Run in master; <see cref="BeforeCertificateDrop"/> must run before the signer certificate is dropped.
/// </summary>
internal static class TenantProvisioningBoundaryCleanupSql
{
    /// <summary>Drops the master query users, the master hardening role and the master certificate user.</summary>
    public const string BeforeCertificateDrop = """
        IF DATABASE_PRINCIPAL_ID(N'NexoraTenantQueryUsers') IS NOT NULL
        BEGIN
            DECLARE @member sysname, @memberDdl nvarchar(max);
            DECLARE queryUsers CURSOR LOCAL FAST_FORWARD FOR
                SELECT member.name FROM sys.database_role_members AS rm
                INNER JOIN sys.database_principals AS member ON member.principal_id = rm.member_principal_id
                WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'NexoraTenantQueryUsers');
            OPEN queryUsers;
            FETCH NEXT FROM queryUsers INTO @member;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @memberDdl = N'ALTER ROLE [NexoraTenantQueryUsers] DROP MEMBER ' + QUOTENAME(@member) + N';'
                    + CASE WHEN @member LIKE N'aierp[_]t[rw][_]%' THEN N' DROP USER ' + QUOTENAME(@member) + N';' ELSE N'' END;
                EXEC sys.sp_executesql @memberDdl;
                FETCH NEXT FROM queryUsers INTO @member;
            END;
            CLOSE queryUsers;
            DEALLOCATE queryUsers;
            DROP ROLE [NexoraTenantQueryUsers];
        END;
        IF DATABASE_PRINCIPAL_ID(N'NexoraTenantProvisioningSignerMasterUser') IS NOT NULL
            DROP USER [NexoraTenantProvisioningSignerMasterUser];
        """;

    /// <summary>Empties and drops the server hardening role.</summary>
    public const string DropServerRole = """
        IF SUSER_ID(N'NexoraTenantQueryLogins') IS NOT NULL
        BEGIN
            DECLARE @login sysname, @loginDdl nvarchar(max);
            DECLARE queryLogins CURSOR LOCAL FAST_FORWARD FOR
                SELECT member.name FROM sys.server_role_members AS rm
                INNER JOIN sys.server_principals AS member ON member.principal_id = rm.member_principal_id
                WHERE rm.role_principal_id = SUSER_ID(N'NexoraTenantQueryLogins');
            OPEN queryLogins;
            FETCH NEXT FROM queryLogins INTO @login;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @loginDdl = N'ALTER SERVER ROLE [NexoraTenantQueryLogins] DROP MEMBER ' + QUOTENAME(@login) + N';';
                EXEC sys.sp_executesql @loginDdl;
                FETCH NEXT FROM queryLogins INTO @login;
            END;
            CLOSE queryLogins;
            DEALLOCATE queryLogins;
            DROP SERVER ROLE [NexoraTenantQueryLogins];
        END;
        """;
}
