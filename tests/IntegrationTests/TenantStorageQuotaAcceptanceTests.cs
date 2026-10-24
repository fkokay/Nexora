using System.Data;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class TenantStorageQuotaAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Storage_quota_allows_reads_and_pure_deletes_but_rejects_creates_at_and_over_limit()
    {
        await using var databases = await CreateDatabasesAsync();
        var limits = new FixedStorageLimitProvider(long.MaxValue);
        var interceptor = new TenantStorageQuotaInterceptor(databases.PlatformDb, limits,
            NullLogger<TenantStorageQuotaInterceptor>.Instance);
        try
        {
            var original = NewReport(databases.TenantId, "stored", new string('a', 32_000));
            await using (var writeDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                writeDb.TenantSavedReports.Add(original);
                await writeDb.SaveChangesAsync();
            }

            var usedBytes = await ReadSqlDataBytesAsync(databases.TenantConnection);
            limits.MaxBytes = usedBytes;
            await using (var readDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                Assert.Equal(1, await readDb.TenantSavedReports.AsNoTracking().CountAsync());
            }

            var atLimit = NewReport(databases.TenantId, "at-limit", "{}" );
            await using (var writeDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                writeDb.TenantSavedReports.Add(atLimit);
                var exception = await Assert.ThrowsAsync<TenantStorageQuotaExceededException>(() => writeDb.SaveChangesAsync());
                Assert.Equal(usedBytes, exception.UsedBytes);
                Assert.Equal(usedBytes, exception.MaxBytes);
            }

            limits.MaxBytes = usedBytes - 1;
            var overLimit = NewReport(databases.TenantId, "over-limit", "{}" );
            await using (var writeDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                writeDb.TenantSavedReports.Add(overLimit);
                await Assert.ThrowsAsync<TenantStorageQuotaExceededException>(() => writeDb.SaveChangesAsync());
            }

            Assert.False(await ReadReportExistsAsync(databases.TenantConnection, atLimit.Id));
            Assert.False(await ReadReportExistsAsync(databases.TenantConnection, overLimit.Id));

            // Removing rows is allowed at/over the threshold so a company can recover space.
            limits.MaxBytes = usedBytes - 1;
            await using (var deleteDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                var stored = await deleteDb.TenantSavedReports.SingleAsync(x => x.Id == original.Id);
                deleteDb.TenantSavedReports.Remove(stored);
                Assert.Equal(2, await deleteDb.SaveChangesAsync()); // The row deletion and its required audit entry.
            }
            Assert.False(await ReadReportExistsAsync(databases.TenantConnection, original.Id));
        }
        finally
        {
            await interceptor.DisposeAsync();
        }
    }

    [SqlServerAcceptanceFact]
    public async Task Quota_post_write_check_rolls_back_interceptor_owned_and_caller_owned_transactions()
    {
        await using var databases = await CreateDatabasesAsync();
        var limits = new FixedStorageLimitProvider(long.MaxValue);
        var interceptor = new TenantStorageQuotaInterceptor(databases.PlatformDb, limits,
            NullLogger<TenantStorageQuotaInterceptor>.Instance);
        try
        {
            var baseline = await ReadSqlDataBytesAsync(databases.TenantConnection);
            limits.MaxBytes = checked(baseline + 1);
            var interceptorOwned = NewReport(databases.TenantId, "crosses-owned", new string('x', 1_000_000));
            await using (var writeDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                writeDb.TenantSavedReports.Add(interceptorOwned);
                await Assert.ThrowsAsync<TenantStorageQuotaExceededException>(() => writeDb.SaveChangesAsync());
            }
            Assert.False(await ReadReportExistsAsync(databases.TenantConnection, interceptorOwned.Id));

            var callerOwned = NewReport(databases.TenantId, "crosses-caller", new string('y', 1_000_000));
            await using (var writeDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                await using var transaction = await writeDb.Database.BeginTransactionAsync();
                writeDb.TenantSavedReports.Add(callerOwned);
                await Assert.ThrowsAsync<TenantStorageQuotaExceededException>(() => writeDb.SaveChangesAsync());
            }
            Assert.False(await ReadReportExistsAsync(databases.TenantConnection, callerOwned.Id));
        }
        finally
        {
            await interceptor.DisposeAsync();
        }
    }

    [SqlServerAcceptanceFact]
    public async Task Completed_company_transaction_releases_its_session_lock_when_the_company_scope_disposes()
    {
        await using var databases = await CreateDatabasesAsync();
        var interceptor = new TenantStorageQuotaInterceptor(databases.PlatformDb,
            new FixedStorageLimitProvider(long.MaxValue), NullLogger<TenantStorageQuotaInterceptor>.Instance);
        try
        {
            await using (var writeDb = CreateTenantDb(databases.TenantConnection, interceptor))
            {
                await using var transaction = await writeDb.Database.BeginTransactionAsync();
                writeDb.TenantSavedReports.Add(NewReport(databases.TenantId, "scope-lock", "{}"));
                await writeDb.SaveChangesAsync();
                await transaction.CommitAsync();
            }

            await interceptor.DisposeAsync();
            await using var otherConnection = new SqlConnection(databases.PlatformConnection);
            await otherConnection.OpenAsync();
            await using var command = otherConnection.CreateCommand();
            command.CommandText = "DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource = @resource, @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0; SELECT @result;";
            command.Parameters.Add(new SqlParameter("@resource", SqlDbType.NVarChar, 255) { Value = $"Nexora:TenantQuota:{databases.TenantId:N}" });
            Assert.True(Convert.ToInt32(await command.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture) >= 0);
            await using var release = otherConnection.CreateCommand();
            release.CommandText = "EXEC sys.sp_releaseapplock @Resource = @resource, @LockOwner = N'Session';";
            release.Parameters.Add(new SqlParameter("@resource", SqlDbType.NVarChar, 255) { Value = $"Nexora:TenantQuota:{databases.TenantId:N}" });
            await release.ExecuteNonQueryAsync();
        }
        finally
        {
            await interceptor.DisposeAsync();
        }
    }

    private static TenantDbContext CreateTenantDb(string connectionString, TenantStorageQuotaInterceptor interceptor)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseSqlServer(connectionString)
            .AddInterceptors(interceptor)
            .Options;
        return new TenantDbContext(options);
    }

    private static TenantSavedReport NewReport(Guid tenantId, string name, string definitionJson) => new()
    {
        TenantId = tenantId,
        Name = name,
        DefinitionJson = definitionJson,
        CreatedByUserId = Guid.NewGuid(),
        UpdatedByUserId = Guid.NewGuid()
    };

    private static async Task<long> ReadSqlDataBytesAsync(string connectionString)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT SUM(CONVERT(bigint, FILEPROPERTY([name], 'SpaceUsed')) * CONVERT(bigint, 8192)) FROM sys.database_files WHERE [type_desc] = N'ROWS';";
        return Convert.ToInt64(await command.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static async Task<bool> ReadReportExistsAsync(string connectionString, Guid reportId)
    {
        await using var db = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options);
        return await db.TenantSavedReports.AsNoTracking().AnyAsync(x => x.Id == reportId);
    }

    private static async Task<DisposableDatabases> CreateDatabasesAsync()
    {
        var configured = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configured));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var platformConnection = new SqlConnectionStringBuilder(configured)
        {
            InitialCatalog = $"AIERP_Quota_Platform_{suffix}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var tenantConnection = new SqlConnectionStringBuilder(configured)
        {
            InitialCatalog = $"AIERPTenant_{tenantId:N}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
        var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
        var platformCreated = false;
        var tenantCreated = false;
        try
        {
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);
            var tenant = new Tenant { Id = tenantId, Name = "Storage quota acceptance", Slug = $"quota-{suffix}" };
            platformDb.Tenants.Add(tenant);
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId,
                Tenant = tenant,
                DatabaseName = $"AIERPTenant_{tenantId:N}",
                State = TenantDatabaseProvisioningState.Ready
            });
            await platformDb.SaveChangesAsync();
            tenantDb.Tenants.Add(new Tenant { Id = tenantId, Name = tenant.Name, Slug = tenant.Slug });
            await tenantDb.SaveChangesAsync();
            return new DisposableDatabases(platformConnection, tenantConnection, tenantId, platformDb, tenantDb);
        }
        catch
        {
            if (tenantCreated) await tenantDb.Database.EnsureDeletedAsync();
            if (platformCreated) await platformDb.Database.EnsureDeletedAsync();
            await tenantDb.DisposeAsync();
            await platformDb.DisposeAsync();
            throw;
        }
    }

    private sealed record DisposableDatabases(string PlatformConnection, string TenantConnection, Guid TenantId,
        PlatformDbContext PlatformDb, TenantDbContext TenantDb) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await TenantDb.Database.EnsureDeletedAsync();
            await PlatformDb.Database.EnsureDeletedAsync();
            await TenantDb.DisposeAsync();
            await PlatformDb.DisposeAsync();
        }
    }

    private sealed class FixedStorageLimitProvider(long maxBytes) : ITenantStorageLimitProvider
    {
        public long MaxBytes { get; set; } = maxBytes;
        public Task<long> GetLimitBytesAsync(Guid tenantId, CancellationToken cancellationToken) => Task.FromResult(MaxBytes);
    }
}
