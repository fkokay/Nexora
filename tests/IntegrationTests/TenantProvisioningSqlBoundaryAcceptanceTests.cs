using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Exercises the exact certificate-signed SQL deployment script on the explicitly
/// disposable SQL Server acceptance instance. Never point this test at the live stack.
/// </summary>
[Collection("Tenant SQL/Vault acceptance")]
public sealed class TenantProvisioningSqlBoundaryAcceptanceTests
{
    [TenantProvisioningSqlBoundaryFact]
    public async Task Signed_boundary_allows_only_canonical_tenant_provisioning_and_denies_direct_server_ddl()
    {
        var rootConnection = Required("AIERP_TENANT_ISOLATION_ACCEPTANCE_SQL_CONNECTION_STRING");
        var rootBuilder = new SqlConnectionStringBuilder(rootConnection);
        if (!string.Equals(rootBuilder.InitialCatalog, "master", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The disposable acceptance SQL connection must target master.");

        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var activeTenantId = Guid.NewGuid();
        var workerLogin = $"NexoraBoundaryWorker_{suffix}";
        var targetLogin = $"NexoraBoundaryTarget_{suffix}";
        var unrelatedLogin = $"NexoraBoundaryUnrelated_{suffix}";
        var workerPassword = CreatePassword();
        var targetPassword = CreatePassword();
        var unrelatedPassword = CreatePassword();
        var erpDatabase = $"AIERPTenant_{tenantId:N}";
        var studioDatabase = $"AIERPStudio_{tenantId:N}";
        var erpLogin = $"aierp_t_{tenantId:N}";
        var studioLogin = $"aierp_s_{tenantId:N}";
        var unauthorizedDatabase = $"AIERPTenant_{activeTenantId:N}";
        var unauthorizedLogin = $"aierp_t_{activeTenantId:N}";

        var masterKeyCreated = false;
        try
        {
            await using (var setup = new SqlConnection(rootConnection))
            {
                await setup.OpenAsync();
                var platformAlreadyExists = await ScalarAsync<int>(setup,
                    "SELECT CASE WHEN DB_ID(N'AIERPPlatform') IS NULL THEN 0 ELSE 1 END;");
                if (platformAlreadyExists != 0)
                    throw new InvalidOperationException("The acceptance SQL instance already contains AIERPPlatform; refusing to overwrite it.");

                var masterKeyExists = await ScalarAsync<int>(setup,
                    "SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name=N'##MS_DatabaseMasterKey##') THEN 1 ELSE 0 END;");
                if (masterKeyExists == 0)
                {
                    await ExecuteAsync(setup, "CREATE MASTER KEY ENCRYPTION BY PASSWORD = " + Literal(CreatePassword()) + ";");
                    masterKeyCreated = true;
                }

                await ExecuteAsync(setup, "CREATE DATABASE [AIERPPlatform];");
                await ExecuteAsync(setup,
                    "CREATE LOGIN " + Q(workerLogin) + " WITH PASSWORD=" + Literal(workerPassword) + ", CHECK_POLICY=ON, CHECK_EXPIRATION=OFF; " +
                    "CREATE LOGIN " + Q(targetLogin) + " WITH PASSWORD=" + Literal(targetPassword) + ", CHECK_POLICY=ON, CHECK_EXPIRATION=OFF; " +
                    "CREATE LOGIN " + Q(unrelatedLogin) + " WITH PASSWORD=" + Literal(unrelatedPassword) + ", CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;");
            }

            var platformConnection = new SqlConnectionStringBuilder(rootBuilder.ConnectionString)
            {
                InitialCatalog = "AIERPPlatform",
                Pooling = false
            }.ConnectionString;
            await using (var platform = new SqlConnection(platformConnection))
            {
                await platform.OpenAsync();
                await ExecuteAsync(platform, """
                    CREATE TABLE dbo.Tenants (Id uniqueidentifier NOT NULL PRIMARY KEY, IsActive bit NOT NULL, Name nvarchar(100) NOT NULL DEFAULT N'test');
                    CREATE TABLE dbo.TenantProvisioningJobs (Id uniqueidentifier NOT NULL PRIMARY KEY, TenantId uniqueidentifier NOT NULL, Status int NOT NULL, LeaseExpiresAt datetimeoffset NOT NULL);
                    CREATE INDEX IX_TenantProvisioningJobs_TenantId ON dbo.TenantProvisioningJobs(TenantId, Status, LeaseExpiresAt);
                    CREATE TABLE dbo.TenantDatabaseCatalog (TenantId uniqueidentifier NOT NULL PRIMARY KEY, DatabaseName sysname NOT NULL, State int NOT NULL);
                    CREATE TABLE dbo.DatabaseSeparationComponentStates (Component nvarchar(64) NOT NULL PRIMARY KEY, DatabaseName sysname NOT NULL, State int NOT NULL);
                    CREATE TABLE dbo.AuditEvents (Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, TenantId uniqueidentifier NOT NULL,
                        UserId uniqueidentifier NOT NULL, Action nvarchar(200) NOT NULL, Resource nvarchar(400) NOT NULL, OccurredAt datetimeoffset NOT NULL);
                    """);
                await SeedTenantAsync(platform, tenantId, isActive: false, erpDatabase, erpState: 2, includeStudio: true);
                await SeedTenantAsync(platform, activeTenantId, isActive: true, unauthorizedDatabase, erpState: 2, includeStudio: false);
            }

            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Install-TenantProvisioningBoundary.sql"));
            script = Regex.Replace(script, "(?m)^\\s*:ON ERROR EXIT\\s*$", string.Empty, RegexOptions.CultureInvariant);
            script = script.Replace("$(TenantProvisioningLoginName)", workerLogin, StringComparison.Ordinal);
            var batches = Regex.Split(script, "(?im)^\\s*GO\\s*(?:--[^\\r\\n]*)?$", RegexOptions.CultureInvariant);
            await using (var master = new SqlConnection(rootConnection))
            {
                await master.OpenAsync();
                foreach (var batch in batches.Where(x => !string.IsNullOrWhiteSpace(x)))
                    await ExecuteAsync(master, batch);
                // Upgrades re-run the install script on an instance where the signer
                // login/user already exist; the second run must succeed unchanged.
                foreach (var batch in batches.Where(x => !string.IsNullOrWhiteSpace(x)))
                    await ExecuteAsync(master, batch);
            }

            var workerConnection = new SqlConnectionStringBuilder(rootBuilder.ConnectionString)
            {
                InitialCatalog = "master",
                UserID = workerLogin,
                Password = workerPassword,
                IntegratedSecurity = false,
                PersistSecurityInfo = false,
                Pooling = false,
                ConnectTimeout = 10
            }.ConnectionString;

            var workerPlatformConnection = new SqlConnectionStringBuilder(rootBuilder.ConnectionString)
            {
                InitialCatalog = "AIERPPlatform",
                UserID = workerLogin,
                Password = workerPassword,
                IntegratedSecurity = false,
                PersistSecurityInfo = false,
                Pooling = false,
                ConnectTimeout = 10
            }.ConnectionString;

            await using (var workerPlatform = new SqlConnection(workerPlatformConnection))
            {
                await workerPlatform.OpenAsync();
                Assert.Equal(2, await ScalarAsync<int>(workerPlatform, "SELECT COUNT(*) FROM dbo.Tenants;"));
            }

            await using (var worker = new SqlConnection(workerConnection))
            {
                await worker.OpenAsync();
                var permissions = await ReadServerPermissionSnapshotAsync(worker);
                Assert.Equal(0, permissions.Sysadmin);
                Assert.Equal(0, permissions.DbCreator);
                Assert.Equal(0, permissions.SecurityAdmin);
                Assert.Equal(0, permissions.CreateAnyDatabase);
                Assert.Equal(0, permissions.AlterAnyLogin);

                await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(worker,
                    "CREATE DATABASE " + Q($"NexoraForbiddenDb_{suffix}") + ";"));
                await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(worker,
                    "CREATE LOGIN " + Q($"NexoraForbiddenLogin_{suffix}") + " WITH PASSWORD=" + Literal(CreatePassword()) + ";"));
                await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(worker,
                    "ALTER LOGIN " + Q(unrelatedLogin) + " DISABLE;"));

                await EnsureDatabaseAsync(worker, tenantId, component: 1);
                await using (var verify = new SqlConnection(rootConnection))
                {
                    await verify.OpenAsync();
                    Assert.Equal(workerLogin, await ScalarAsync<string>(verify,
                        "SELECT SUSER_SNAME(owner_sid) FROM sys.databases WHERE name=@db;", ("@db", erpDatabase)));
                }

                await using (var platform = new SqlConnection(platformConnection))
                {
                    await platform.OpenAsync();
                    await ExecuteAsync(platform,
                        "UPDATE dbo.TenantDatabaseCatalog SET State=3 WHERE TenantId=@tenantId;", ("@tenantId", tenantId));
                }
                await EnsureDatabaseAsync(worker, tenantId, component: 1); // Ready retry may only reuse the existing canonical DB.
                Assert.True(await TenantDatabaseExistsAsync(worker, tenantId, component: 1));

                await using (var platform = new SqlConnection(platformConnection))
                {
                    await platform.OpenAsync();
                    await ExecuteAsync(platform,
                        "UPDATE dbo.DatabaseSeparationComponentStates SET State=2 WHERE Component=@component;",
                        ("@component", $"AIStudio:{tenantId:N}"));
                }
                await EnsureDatabaseAsync(worker, tenantId, component: 2);
                await using (var platform = new SqlConnection(platformConnection))
                {
                    await platform.OpenAsync();
                    await ExecuteAsync(platform,
                        "UPDATE dbo.DatabaseSeparationComponentStates SET State=3 WHERE Component=@component;",
                        ("@component", $"AIStudio:{tenantId:N}"));
                }
                Assert.True(await TenantDatabaseExistsAsync(worker, tenantId, component: 2));

                // Credential cutover uses this read-only probe for active tenants.
                // Existing Ready tenant databases are queryable, while the signed
                // creation and login procedures below must still reject that tenant.
                await using (var createReadyActiveDatabase = new SqlConnection(rootConnection))
                {
                    await createReadyActiveDatabase.OpenAsync();
                    await ExecuteAsync(createReadyActiveDatabase, "CREATE DATABASE " + Q(unauthorizedDatabase) + ";");
                }
                await using (var markActiveDatabaseReady = new SqlConnection(platformConnection))
                {
                    await markActiveDatabaseReady.OpenAsync();
                    await ExecuteAsync(markActiveDatabaseReady,
                        "UPDATE dbo.TenantDatabaseCatalog SET State=3 WHERE TenantId=@tenantId;", ("@tenantId", activeTenantId));
                }
                Assert.True(await TenantDatabaseExistsAsync(worker, activeTenantId, component: 1));

                await EnsureSqlLoginAsync(worker, tenantId, component: 1, targetPassword);
                await EnsureSqlLoginAsync(worker, tenantId, component: 2, targetPassword);
                await using (var migrate = new SqlConnection(new SqlConnectionStringBuilder(workerConnection) { InitialCatalog = erpDatabase }.ConnectionString))
                {
                    await migrate.OpenAsync();
                    await ExecuteAsync(migrate,
                        "CREATE USER " + Q(erpLogin) + " FOR LOGIN " + Q(erpLogin) + "; " +
                        "ALTER ROLE [db_datareader] ADD MEMBER " + Q(erpLogin) + "; " +
                        "ALTER ROLE [db_datawriter] ADD MEMBER " + Q(erpLogin) + "; " +
                        "CREATE TABLE dbo.BoundaryMigrationAcceptance (Id int NOT NULL PRIMARY KEY);");
                }
                await using (var runtime = new SqlConnection(new SqlConnectionStringBuilder(workerConnection)
                {
                    InitialCatalog = erpDatabase,
                    UserID = erpLogin,
                    Password = targetPassword,
                    IntegratedSecurity = false
                }.ConnectionString))
                {
                    await runtime.OpenAsync();
                    Assert.Equal(erpDatabase, await ScalarAsync<string>(runtime, "SELECT DB_NAME();"));
                }

                // The real worker publishes Ready states and activates a tenant only after
                // both databases and runtime principals are ready. Database creation stays
                // denied after activation; maintenance can inspect/rotate only an existing
                // canonical Ready tenant principal for Vault credential cutover.
                await using (var workerPlatform = new SqlConnection(workerPlatformConnection))
                {
                    await workerPlatform.OpenAsync();
                    await ExecuteAsync(workerPlatform, "UPDATE dbo.TenantDatabaseCatalog SET State=3 WHERE TenantId=@tenant;", ("@tenant", tenantId));
                    await ExecuteAsync(workerPlatform, "UPDATE dbo.TenantProvisioningJobs SET Status=3 WHERE TenantId=@tenant;", ("@tenant", tenantId));
                    await ExecuteAsync(workerPlatform, "UPDATE dbo.Tenants SET IsActive=1 WHERE Id=@tenant;", ("@tenant", tenantId));
                    await ExecuteAsync(workerPlatform, "INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(@tenant,@user,N'tenant.provisioning.ready',N'test',SYSUTCDATETIME());",
                        ("@tenant", tenantId), ("@user", Guid.NewGuid()));
                    await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(workerPlatform,
                        "UPDATE dbo.Tenants SET Name=N'forbidden' WHERE Id=@tenant;", ("@tenant", tenantId)));
                    await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(workerPlatform,
                        "DELETE dbo.AuditEvents WHERE TenantId=@tenant;", ("@tenant", tenantId)));
                    await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(workerPlatform,
                        "ALTER TABLE dbo.Tenants ADD ForbiddenColumn int NULL;"));
                }

                await Assert.ThrowsAsync<SqlException>(() => EnsureDatabaseAsync(worker, activeTenantId, component: 1));
                Assert.True(await TenantDatabaseExistsAsync(worker, activeTenantId, component: 1));
                await EnsureSqlLoginAsync(worker, activeTenantId, component: 1, CreatePassword());
            }

            await using (var verify = new SqlConnection(rootConnection))
            {
                await verify.OpenAsync();
                Assert.Equal(1, await ScalarAsync<int>(verify,
                    "SELECT CASE WHEN DB_ID(@db) IS NULL THEN 0 ELSE 1 END;", ("@db", unauthorizedDatabase)));
                Assert.Equal(0, await ScalarAsync<int>(verify,
                    "SELECT CAST(is_disabled AS int) FROM sys.server_principals WHERE name=@login;", ("@login", unrelatedLogin)));
                Assert.Equal(1, await ScalarAsync<int>(verify,
                    "SELECT CASE WHEN SUSER_ID(@login) IS NULL THEN 0 ELSE 1 END;", ("@login", erpLogin)));
                Assert.Equal(1, await ScalarAsync<int>(verify,
                    "SELECT CASE WHEN SUSER_ID(@login) IS NULL THEN 0 ELSE 1 END;", ("@login", studioLogin)));
                Assert.Equal(1, await ScalarAsync<int>(verify,
                    "SELECT CASE WHEN SUSER_ID(@login) IS NULL THEN 0 ELSE 1 END;", ("@login", unauthorizedLogin)));
            }
        }
        finally
        {
            await CleanupAsync(rootConnection, [erpDatabase, studioDatabase, unauthorizedDatabase],
                [workerLogin, targetLogin, unrelatedLogin, erpLogin, studioLogin, unauthorizedLogin], masterKeyCreated);
        }
    }

    [TenantProvisioningSqlBoundaryFact]
    public async Task Signed_boundary_creates_query_logins_only_for_a_ready_tenant_erp_database()
    {
        var rootConnection = Required("AIERP_TENANT_ISOLATION_ACCEPTANCE_SQL_CONNECTION_STRING");
        var rootBuilder = new SqlConnectionStringBuilder(rootConnection);
        if (!string.Equals(rootBuilder.InitialCatalog, "master", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The disposable acceptance SQL connection must target master.");

        var suffix = Guid.NewGuid().ToString("N");
        var readyTenantId = Guid.NewGuid();
        var notReadyTenantId = Guid.NewGuid();
        var workerLogin = $"NexoraBoundaryWorker_{suffix}";
        var workerPassword = CreatePassword();
        var readyDatabase = $"AIERPTenant_{readyTenantId:N}";
        var notReadyDatabase = $"AIERPTenant_{notReadyTenantId:N}";
        var readerLogin = $"aierp_tr_{readyTenantId:N}";
        var writerLogin = $"aierp_tw_{readyTenantId:N}";
        var notReadyReaderLogin = $"aierp_tr_{notReadyTenantId:N}";
        var notReadyWriterLogin = $"aierp_tw_{notReadyTenantId:N}";
        // Production path of --provision-tenant-query-credentials: an active tenant whose ERP catalog is Ready.
        var activeReadyTenantId = Guid.NewGuid();
        var activeReadyDatabase = $"AIERPTenant_{activeReadyTenantId:N}";
        var activeReaderLogin = $"aierp_tr_{activeReadyTenantId:N}";
        var activeWriterLogin = $"aierp_tw_{activeReadyTenantId:N}";

        var masterKeyCreated = false;
        try
        {
            await using (var setup = new SqlConnection(rootConnection))
            {
                await setup.OpenAsync();
                if (await ScalarAsync<int>(setup, "SELECT CASE WHEN DB_ID(N'AIERPPlatform') IS NULL THEN 0 ELSE 1 END;") != 0)
                    throw new InvalidOperationException("The acceptance SQL instance already contains AIERPPlatform; refusing to overwrite it.");
                if (await ScalarAsync<int>(setup,
                        "SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name=N'##MS_DatabaseMasterKey##') THEN 1 ELSE 0 END;") == 0)
                {
                    await ExecuteAsync(setup, "CREATE MASTER KEY ENCRYPTION BY PASSWORD = " + Literal(CreatePassword()) + ";");
                    masterKeyCreated = true;
                }
                await ExecuteAsync(setup, "CREATE DATABASE [AIERPPlatform];");
                await ExecuteAsync(setup,
                    "CREATE LOGIN " + Q(workerLogin) + " WITH PASSWORD=" + Literal(workerPassword) + ", CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;");
                await ExecuteAsync(setup, "CREATE DATABASE " + Q(readyDatabase) + ";");
                await ExecuteAsync(setup, "CREATE DATABASE " + Q(notReadyDatabase) + ";");
                await ExecuteAsync(setup, "CREATE DATABASE " + Q(activeReadyDatabase) + ";");
            }

            var platformConnection = new SqlConnectionStringBuilder(rootBuilder.ConnectionString)
            {
                InitialCatalog = "AIERPPlatform",
                Pooling = false
            }.ConnectionString;
            await using (var platform = new SqlConnection(platformConnection))
            {
                await platform.OpenAsync();
                await ExecuteAsync(platform, """
                    CREATE TABLE dbo.Tenants (Id uniqueidentifier NOT NULL PRIMARY KEY, IsActive bit NOT NULL, Name nvarchar(100) NOT NULL DEFAULT N'test');
                    CREATE TABLE dbo.TenantProvisioningJobs (Id uniqueidentifier NOT NULL PRIMARY KEY, TenantId uniqueidentifier NOT NULL, Status int NOT NULL, LeaseExpiresAt datetimeoffset NOT NULL);
                    CREATE TABLE dbo.TenantDatabaseCatalog (TenantId uniqueidentifier NOT NULL PRIMARY KEY, DatabaseName sysname NOT NULL, State int NOT NULL);
                    CREATE TABLE dbo.DatabaseSeparationComponentStates (Component nvarchar(64) NOT NULL PRIMARY KEY, DatabaseName sysname NOT NULL, State int NOT NULL);
                    CREATE TABLE dbo.AuditEvents (Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, TenantId uniqueidentifier NOT NULL,
                        UserId uniqueidentifier NOT NULL, Action nvarchar(200) NOT NULL, Resource nvarchar(400) NOT NULL, OccurredAt datetimeoffset NOT NULL);
                    """);
                // Ready tenant: inactive with a live provisioning lease and a Ready ERP catalog row.
                await SeedTenantAsync(platform, readyTenantId, isActive: false, readyDatabase, erpState: 3, includeStudio: false);
                // Not-Ready tenant: active, but its ERP catalog row is still Copying.
                await SeedTenantAsync(platform, notReadyTenantId, isActive: true, notReadyDatabase, erpState: 2, includeStudio: false);
                // Active tenant with a Ready ERP catalog row and existing database.
                await SeedTenantAsync(platform, activeReadyTenantId, isActive: true, activeReadyDatabase, erpState: 3, includeStudio: false);
            }

            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Install-TenantProvisioningBoundary.sql"));
            script = Regex.Replace(script, "(?m)^\\s*:ON ERROR EXIT\\s*$", string.Empty, RegexOptions.CultureInvariant);
            script = script.Replace("$(TenantProvisioningLoginName)", workerLogin, StringComparison.Ordinal);
            var batches = Regex.Split(script, "(?im)^\\s*GO\\s*(?:--[^\\r\\n]*)?$", RegexOptions.CultureInvariant);
            await using (var master = new SqlConnection(rootConnection))
            {
                await master.OpenAsync();
                foreach (var batch in batches.Where(x => !string.IsNullOrWhiteSpace(x)))
                    await ExecuteAsync(master, batch);
                // A second run must succeed unchanged with the query-login roles already present.
                foreach (var batch in batches.Where(x => !string.IsNullOrWhiteSpace(x)))
                    await ExecuteAsync(master, batch);
            }

            var readerPassword = CreatePassword();
            await using (var worker = new SqlConnection(new SqlConnectionStringBuilder(rootBuilder.ConnectionString)
            {
                InitialCatalog = "master",
                UserID = workerLogin,
                Password = workerPassword,
                IntegratedSecurity = false,
                PersistSecurityInfo = false,
                Pooling = false,
                ConnectTimeout = 10
            }.ConnectionString))
            {
                await worker.OpenAsync();
                await EnsureSqlLoginAsync(worker, readyTenantId, component: 3, readerPassword);
                await EnsureSqlLoginAsync(worker, readyTenantId, component: 4, CreatePassword());

                // The worker itself must not be able to touch the hardening roles directly.
                var directRole = await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(worker,
                    "ALTER SERVER ROLE [NexoraTenantQueryLogins] ADD MEMBER " + Q(workerLogin) + ";"));
                Assert.Equal(15151, directRole.Number);

                var notReady3 = await Assert.ThrowsAsync<SqlException>(() => EnsureSqlLoginAsync(worker, notReadyTenantId, component: 3, CreatePassword()));
                Assert.Equal(51023, notReady3.Number);
                var notReady4 = await Assert.ThrowsAsync<SqlException>(() => EnsureSqlLoginAsync(worker, notReadyTenantId, component: 4, CreatePassword()));
                Assert.Equal(51023, notReady4.Number);

                // Active + Ready: create, then rotate (second call takes the ALTER LOGIN branch).
                await EnsureSqlLoginAsync(worker, activeReadyTenantId, component: 3, CreatePassword());
                await EnsureSqlLoginAsync(worker, activeReadyTenantId, component: 4, CreatePassword());
                await EnsureSqlLoginAsync(worker, activeReadyTenantId, component: 3, CreatePassword());
                await EnsureSqlLoginAsync(worker, activeReadyTenantId, component: 4, CreatePassword());

                var invalid = await Assert.ThrowsAsync<SqlException>(() => EnsureSqlLoginAsync(worker, readyTenantId, component: 5, CreatePassword()));
                Assert.Equal(51020, invalid.Number);
            }

            await using (var verify = new SqlConnection(rootConnection))
            {
                await verify.OpenAsync();
                Assert.Equal(readyDatabase, await ScalarAsync<string>(verify,
                    "SELECT default_database_name FROM sys.server_principals WHERE name=@login;", ("@login", readerLogin)));
                Assert.Equal(readyDatabase, await ScalarAsync<string>(verify,
                    "SELECT default_database_name FROM sys.server_principals WHERE name=@login;", ("@login", writerLogin)));
                Assert.Equal(0, await ScalarAsync<int>(verify,
                    "SELECT COUNT(*) FROM sys.server_principals WHERE name IN (@a,@b);",
                    ("@a", notReadyReaderLogin), ("@b", notReadyWriterLogin)));
                Assert.Equal(activeReadyDatabase, await ScalarAsync<string>(verify,
                    "SELECT default_database_name FROM sys.server_principals WHERE name=@login;", ("@login", activeReaderLogin)));
                Assert.Equal(activeReadyDatabase, await ScalarAsync<string>(verify,
                    "SELECT default_database_name FROM sys.server_principals WHERE name=@login;", ("@login", activeWriterLogin)));

                // Every query login (including the rotated ones) is in both hardening roles exactly once.
                foreach (var login in new[] { readerLogin, writerLogin, activeReaderLogin, activeWriterLogin })
                {
                    Assert.Equal(1, await ScalarAsync<int>(verify,
                        "SELECT COUNT(*) FROM sys.server_role_members WHERE role_principal_id=SUSER_ID(N'NexoraTenantQueryLogins') AND member_principal_id=SUSER_ID(@login);",
                        ("@login", login)));
                    Assert.Equal(1, await ScalarAsync<int>(verify,
                        "SELECT COUNT(*) FROM master.sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'NexoraTenantQueryUsers') AND member_principal_id=DATABASE_PRINCIPAL_ID(@login);",
                        ("@login", login)));
                }

                // Provisioning maps the query user into its own tenant database (BuildDatabaseAccessSql).
                await ExecuteAsync(verify, "USE " + Q(readyDatabase) + "; CREATE USER " + Q(readerLogin) + " FOR LOGIN " + Q(readerLogin) + "; ALTER ROLE [db_datareader] ADD MEMBER " + Q(readerLogin) + "; USE [master];");
            }

            await using (var reader = new SqlConnection(new SqlConnectionStringBuilder(rootBuilder.ConnectionString)
            {
                InitialCatalog = readyDatabase,
                UserID = readerLogin,
                Password = readerPassword,
                IntegratedSecurity = false,
                PersistSecurityInfo = false,
                Pooling = false,
                ConnectTimeout = 10
            }.ConnectionString))
            {
                // Its own database still opens; other tenant databases are invisible; file-system probes are denied.
                await reader.OpenAsync();
                Assert.Equal(readyDatabase, await ScalarAsync<string>(reader, "SELECT DB_NAME();"));
                Assert.Equal(0, await ScalarAsync<int>(reader,
                    "SELECT COUNT(*) FROM sys.databases WHERE name IN (@a,@b,N'AIERPPlatform');",
                    ("@a", notReadyDatabase), ("@b", activeReadyDatabase)));
                Assert.Equal(1, await ScalarAsync<int>(reader, "SELECT CASE WHEN DB_ID(@db) IS NULL THEN 1 ELSE 0 END;", ("@db", activeReadyDatabase)));
                foreach (var procedure in new[] { "xp_dirtree", "xp_fileexist", "xp_subdirs" })
                {
                    var denied = await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(reader,
                        $"EXEC master.sys.{procedure} N'/';"));
                    Assert.Equal(229, denied.Number);
                }
            }
        }
        finally
        {
            await CleanupAsync(rootConnection, [readyDatabase, notReadyDatabase, activeReadyDatabase],
                [workerLogin, readerLogin, writerLogin, notReadyReaderLogin, notReadyWriterLogin, activeReaderLogin, activeWriterLogin],
                masterKeyCreated);
        }
    }

    private static async Task SeedTenantAsync(SqlConnection platform, Guid tenantId, bool isActive,
        string erpDatabase, int erpState, bool includeStudio)
    {
        await ExecuteAsync(platform, "INSERT dbo.Tenants(Id, IsActive) VALUES(@id, @active);", ("@id", tenantId), ("@active", isActive));
        await ExecuteAsync(platform,
            "INSERT dbo.TenantProvisioningJobs(Id, TenantId, Status, LeaseExpiresAt) VALUES(@job, @tenant, 2, TODATETIMEOFFSET(DATEADD(hour, 1, SYSUTCDATETIME()), '+00:00'));",
            ("@job", Guid.NewGuid()), ("@tenant", tenantId));
        await ExecuteAsync(platform,
            "INSERT dbo.TenantDatabaseCatalog(TenantId, DatabaseName, State) VALUES(@tenant, @database, @state);",
            ("@tenant", tenantId), ("@database", erpDatabase), ("@state", erpState));
        if (includeStudio)
            await ExecuteAsync(platform,
                "INSERT dbo.DatabaseSeparationComponentStates(Component, DatabaseName, State) VALUES(@component, @database, 2);",
                ("@component", $"AIStudio:{tenantId:N}"), ("@database", $"AIERPStudio_{tenantId:N}"));
    }

    private static Task EnsureDatabaseAsync(SqlConnection connection, Guid tenantId, byte component) =>
        ExecuteAsync(connection, "EXEC dbo.NexoraEnsureTenantDatabase @TenantId=@tenant, @Component=@component;",
            ("@tenant", tenantId), ("@component", component));

    private static async Task<bool> TenantDatabaseExistsAsync(SqlConnection connection, Guid tenantId, byte component) =>
        await ScalarAsync<bool>(connection, "EXEC dbo.NexoraTenantDatabaseExists @TenantId=@tenant, @Component=@component;",
            ("@tenant", tenantId), ("@component", component));

    private static Task EnsureSqlLoginAsync(SqlConnection connection, Guid tenantId, byte component, string password) =>
        ExecuteAsync(connection,
            "EXEC dbo.NexoraEnsureTenantSqlLogin @TenantId=@tenant, @Component=@component, @Password=@password;",
            ("@tenant", tenantId), ("@component", component), ("@password", password));

    private static async Task CleanupAsync(string rootConnection, string[] databases, string[] logins, bool dropMasterKey)
    {
        await using var cleanup = new SqlConnection(new SqlConnectionStringBuilder(rootConnection) { InitialCatalog = "master", Pooling = false }.ConnectionString);
        await cleanup.OpenAsync();
        foreach (var database in databases)
            await ExecuteAsync(cleanup,
                "IF DB_ID(@db) IS NOT NULL BEGIN DECLARE @ddl nvarchar(max)=N'ALTER DATABASE '+QUOTENAME(@db)+N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE '+QUOTENAME(@db); EXEC sys.sp_executesql @ddl; END;",
                ("@db", database));
        await ExecuteAsync(cleanup, "IF DB_ID(N'AIERPPlatform') IS NOT NULL BEGIN ALTER DATABASE [AIERPPlatform] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [AIERPPlatform]; END;");
        await ExecuteAsync(cleanup, "IF EXISTS (SELECT 1 FROM sys.crypt_properties WHERE major_id=OBJECT_ID(N'dbo.NexoraEnsureTenantDatabase')) DROP SIGNATURE FROM OBJECT::dbo.NexoraEnsureTenantDatabase BY CERTIFICATE [NexoraTenantProvisioningSigner]; IF EXISTS (SELECT 1 FROM sys.crypt_properties WHERE major_id=OBJECT_ID(N'dbo.NexoraEnsureTenantSqlLogin')) DROP SIGNATURE FROM OBJECT::dbo.NexoraEnsureTenantSqlLogin BY CERTIFICATE [NexoraTenantProvisioningSigner]; IF EXISTS (SELECT 1 FROM sys.crypt_properties WHERE major_id=OBJECT_ID(N'dbo.NexoraTenantDatabaseExists')) DROP SIGNATURE FROM OBJECT::dbo.NexoraTenantDatabaseExists BY CERTIFICATE [NexoraTenantProvisioningSigner]; IF OBJECT_ID(N'dbo.NexoraEnsureTenantDatabase',N'P') IS NOT NULL DROP PROCEDURE dbo.NexoraEnsureTenantDatabase; IF OBJECT_ID(N'dbo.NexoraEnsureTenantSqlLogin',N'P') IS NOT NULL DROP PROCEDURE dbo.NexoraEnsureTenantSqlLogin; IF OBJECT_ID(N'dbo.NexoraTenantDatabaseExists',N'P') IS NOT NULL DROP PROCEDURE dbo.NexoraTenantDatabaseExists;");
        await ExecuteAsync(cleanup, TenantProvisioningBoundaryCleanupSql.BeforeCertificateDrop);
        await ExecuteAsync(cleanup, "IF SUSER_ID(N'NexoraTenantProvisioningSignerLogin') IS NOT NULL DROP LOGIN [NexoraTenantProvisioningSignerLogin]; IF CERT_ID(N'NexoraTenantProvisioningSigner') IS NOT NULL DROP CERTIFICATE [NexoraTenantProvisioningSigner];");
        foreach (var login in logins)
            await ExecuteAsync(cleanup, "IF SUSER_ID(@login) IS NOT NULL BEGIN DECLARE @ddl nvarchar(max)=N'DROP LOGIN '+QUOTENAME(@login); EXEC sys.sp_executesql @ddl; END;", ("@login", login));
        await ExecuteAsync(cleanup, TenantProvisioningBoundaryCleanupSql.DropServerRole);
        if (dropMasterKey)
            await ExecuteAsync(cleanup, "IF EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name=N'##MS_DatabaseMasterKey##') DROP MASTER KEY;");
    }

    private static async Task<(int Sysadmin, int DbCreator, int SecurityAdmin, int CreateAnyDatabase, int AlterAnyLogin)>
        ReadServerPermissionSnapshotAsync(SqlConnection connection)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),0), ISNULL(IS_SRVROLEMEMBER(N'dbcreator'),0),
                   ISNULL(IS_SRVROLEMEMBER(N'securityadmin'),0),
                   ISNULL(HAS_PERMS_BY_NAME(NULL,N'SERVER',N'CREATE ANY DATABASE'),0),
                   ISNULL(HAS_PERMS_BY_NAME(NULL,N'SERVER',N'ALTER ANY LOGIN'),0);
            """;
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return (reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2), reader.GetInt32(3), reader.GetInt32(4));
    }

    private static async Task ExecuteAsync(SqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        await using var command = connection.CreateCommand();
        command.CommandTimeout = 60;
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<T> ScalarAsync<T>(SqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        await using var command = connection.CreateCommand();
        command.CommandTimeout = 60;
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        return (T)(await command.ExecuteScalarAsync() ?? throw new InvalidOperationException("SQL probe returned no value."));
    }

    private static string Required(string name) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
            ? value
            : throw new InvalidOperationException($"{name} is required for the disposable SQL boundary acceptance.");

    private static string Q(string identifier) => $"[{identifier.Replace("]", "]]", StringComparison.Ordinal)}]";
    private static string Literal(string value) => $"N'{value.Replace("'", "''", StringComparison.Ordinal)}'";
    private static string CreatePassword() => Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)) + "aA1!";
}

internal sealed class TenantProvisioningSqlBoundaryFactAttribute : FactAttribute
{
    public TenantProvisioningSqlBoundaryFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_DISPOSABLE_INSTANCE")
            != "YES_CREATE_AND_DROP_ISOLATED_TENANT_DATABASES")
            Skip = "Requires an explicitly disposable SQL Server acceptance environment.";
        else if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_SQL_CONNECTION_STRING")))
            Skip = "Requires a disposable SQL Server connection string targeting master.";
    }
}
