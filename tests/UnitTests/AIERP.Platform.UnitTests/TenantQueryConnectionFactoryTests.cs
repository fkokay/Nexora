using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

public sealed class TenantQueryConnectionFactoryTests
{
    private const string Template = "Server=localhost;Database=x;User Id=a;Password=b;TrustServerCertificate=true";

    private sealed class FakeReader(Func<TenantSqlCredential> create) : ITenantSqlCredentialReader
    {
        public int Calls { get; private set; }
        public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component, string secretReference, CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(create());
        }
    }

    private static PlatformDbContext NewDb() => new(new DbContextOptionsBuilder<PlatformDbContext>()
        .UseInMemoryDatabase($"tqcf-{Guid.NewGuid():N}").Options);

    private static TenantSqlCredential ReadCredential(Guid id) =>
        new($"AIERPTenant_{id:N}", $"aierp_tr_{id:N}", "pw", 1);

    private static async Task<PlatformDbContext> DbWithEntryAsync(Guid id, TenantDatabaseProvisioningState state)
    {
        var db = NewDb();
        db.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = id, DatabaseName = $"AIERPTenant_{id:N}", State = state
        });
        await db.SaveChangesAsync();
        return db;
    }

    [Fact]
    public async Task OpenAsync_fails_closed_when_separation_is_disabled()
    {
        var id = Guid.NewGuid();
        var reader = new FakeReader(() => ReadCredential(id));
        var factory = new TenantQueryConnectionFactory(Template, false, reader, NewDb);
        await Assert.ThrowsAsync<TenantQueryUnavailableException>(() => factory.OpenAsync(id, TenantQueryAccess.Read, default));
        Assert.Equal(0, reader.Calls);
    }

    [Fact]
    public async Task OpenAsync_fails_closed_when_catalog_entry_is_not_ready()
    {
        var id = Guid.NewGuid();
        var db = await DbWithEntryAsync(id, TenantDatabaseProvisioningState.Copying);
        var reader = new FakeReader(() => ReadCredential(id));
        var factory = new TenantQueryConnectionFactory(Template, true, reader, () => db);
        await Assert.ThrowsAsync<TenantQueryUnavailableException>(() => factory.OpenAsync(id, TenantQueryAccess.Read, default));
        Assert.Equal(0, reader.Calls);
    }

    [Fact]
    public async Task OpenAsync_fails_closed_when_vault_returns_erp_runtime_login_for_query_read()
    {
        var id = Guid.NewGuid();
        var db = await DbWithEntryAsync(id, TenantDatabaseProvisioningState.Ready);
        var reader = new FakeReader(() => new TenantSqlCredential($"AIERPTenant_{id:N}", $"aierp_t_{id:N}", "pw", 1));
        var factory = new TenantQueryConnectionFactory(Template, true, reader, () => db);
        var ex = await Assert.ThrowsAsync<TenantQueryUnavailableException>(() => factory.OpenAsync(id, TenantQueryAccess.Read, default));
        Assert.Equal(1, reader.Calls);
        Assert.DoesNotContain("aierp_t_", ex.Message);
    }

    [Fact]
    public async Task OpenAsync_logs_failure_type_server_side_without_details()
    {
        var id = Guid.NewGuid();
        var db = await DbWithEntryAsync(id, TenantDatabaseProvisioningState.Ready);
        var reader = new FakeReader(() => new TenantSqlCredential($"AIERPTenant_{id:N}", $"aierp_t_{id:N}", "secret-pw", 1));
        var logger = new CapturingLogger();
        var factory = new TenantQueryConnectionFactory(Template, true, reader, () => db, logger);

        await Assert.ThrowsAsync<TenantQueryUnavailableException>(() => factory.OpenAsync(id, TenantQueryAccess.Read, default));

        var entry = Assert.Single(logger.Messages);
        Assert.Equal(Microsoft.Extensions.Logging.LogLevel.Warning, entry.Level);
        Assert.Contains(id.ToString(), entry.Message);
        Assert.Contains("InvalidOperationException", entry.Message);
        Assert.DoesNotContain("secret-pw", entry.Message);
        Assert.DoesNotContain("aierp_t_", entry.Message);
        Assert.Null(entry.Exception);
    }

    private sealed class CapturingLogger : Microsoft.Extensions.Logging.ILogger<TenantQueryConnectionFactory>
    {
        public List<(Microsoft.Extensions.Logging.LogLevel Level, string Message, Exception? Exception)> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter) => Messages.Add((logLevel, formatter(state, exception), exception));
    }

    [Fact]
    public void BuildConnectionString_uses_read_login_and_application_name()
    {
        var id = Guid.NewGuid();
        var factory = new TenantQueryConnectionFactory(Template, true, new FakeReader(() => ReadCredential(id)), NewDb);
        var b = new SqlConnectionStringBuilder(factory.BuildConnectionString(id, TenantQueryAccess.Read, ReadCredential(id)));
        Assert.Equal($"AIERPTenant_{id:N}", b.InitialCatalog);
        Assert.Equal($"aierp_tr_{id:N}", b.UserID);
        Assert.Equal("Nexora.TenantQuery.Read", b.ApplicationName);
        Assert.False(b.IntegratedSecurity);
        Assert.Equal(10, b.ConnectTimeout);
        Assert.True(b.Pooling);
    }
}
