using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Shared setup for the route-wide fiscal-close SQL acceptance classes: isolated Platform, Tenant and Studio databases on
/// the disposable SQL Server named by AIERP_REPORT_TEST_SQL_CONNECTION_STRING, a per-tenant SQL login, separation enabled,
/// and the real API host. Every database and the login are removed on dispose.
/// </summary>
internal sealed class FiscalCloseRouteSqlAcceptanceHarness : IAsyncDisposable
{
    private const string SigningKey = "synthetic-route-close-acceptance-key-at-least-32-bytes";
    private const string PluginSigningKey = "different-synthetic-route-close-plugin-key-32-bytes";

    private readonly string _platformConnection;
    private readonly string _tenantConnection;
    private readonly string _studioConnection;
    private bool _platformCreated;
    private bool _tenantCreated;
    private bool _studioCreated;
    private SqlAcceptanceTenantCredential? _credential;
    private RouteCloseApiFactory? _factory;
    private IDisposable? _environment;

    private FiscalCloseRouteSqlAcceptanceHarness(string configuredConnection, string prefix)
    {
        var suffix = Guid.NewGuid().ToString("N");
        TenantId = Guid.NewGuid();
        UserId = Guid.NewGuid();
        _platformConnection = DatabaseConnection(configuredConnection, $"AIERP_{prefix}Platform_{suffix}");
        _tenantConnection = DatabaseConnection(configuredConnection, $"AIERPTenant_{TenantId:N}");
        _studioConnection = DatabaseConnection(configuredConnection, $"AIERP_{prefix}Studio_{suffix}");
        Suffix = suffix;
    }

    public Guid TenantId { get; }
    public Guid UserId { get; }
    public string Suffix { get; }
    public Tenant Tenant { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;

    public static async Task<FiscalCloseRouteSqlAcceptanceHarness> CreateAsync(string prefix)
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var harness = new FiscalCloseRouteSqlAcceptanceHarness(configuredConnection!, prefix);
        try
        {
            await harness.InitializeAsync(configuredConnection!);
            return harness;
        }
        catch
        {
            await harness.DisposeAsync();
            throw;
        }
    }

    public TenantDbContext NewTenantDb() =>
        new(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(_tenantConnection).Options);

    /// <summary>Starts the real API host. Call after seeding so startup sees the tenant catalog entry.</summary>
    public void StartApi()
    {
        _environment = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
        {
            ["Authentication__SigningKey"] = SigningKey,
            ["PluginHost__SigningKey"] = PluginSigningKey,
            ["Authentication__Issuer"] = "AIERP", ["Authentication__Audience"] = "AIERP",
            ["ConnectionStrings__Platform"] = _platformConnection, ["ConnectionStrings__Tenant"] = _tenantConnection,
            ["ConnectionStrings__AIStudio"] = _studioConnection, ["Database__SeparationEnabled"] = "true",
            ["Database__ApplyMigrationsOnStartup"] = "false"
        });
        _factory = new RouteCloseApiFactory(_platformConnection, _tenantConnection, _studioConnection, _credential!.CredentialReader);
        Client = _factory.CreateClient();
        Client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
        Client.DefaultRequestHeaders.Add("X-Test-User", UserId.ToString("D"));
    }

    public async Task CloseAsync(DateOnly fromDate, DateOnly toDate, Guid retainedEarningsAccountId)
    {
        using var close = await Client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
        {
            fromDate = fromDate.ToString("yyyy-MM-dd"), toDate = toDate.ToString("yyyy-MM-dd"), retainedEarningsAccountId
        });
        Assert.True(close.StatusCode == HttpStatusCode.Created,
            $"Fiscal close expected Created, got {(int)close.StatusCode}: {await close.Content.ReadAsStringAsync()}");
    }

    public static async Task AssertCreatedAsync(HttpResponseMessage response, string route)
    {
        Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK,
            $"{route}: expected success, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
    }

    public static async Task AssertClosedPeriodRejectedAsync(HttpResponseMessage response, string route)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Conflict, $"{route}: expected 409, got {(int)response.StatusCode}: {body}");
        Assert.Contains("dönemi kapalı", body, StringComparison.OrdinalIgnoreCase);
    }

    public static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    public static JournalEntry BalancedEntry(Guid tenantId, string code, DateOnly entryDate, LedgerAccount debit, LedgerAccount credit, decimal amount)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = code, EntryDate = entryDate, Description = $"Synthetic {code}",
            SourceType = "Manual", SourceId = Guid.NewGuid() };
        entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = debit.Id, LineNumber = 1,
            Description = "Synthetic debit", Debit = amount, Credit = 0m });
        entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = credit.Id, LineNumber = 2,
            Description = "Synthetic credit", Debit = 0m, Credit = amount });
        return entry;
    }

    public async ValueTask DisposeAsync()
    {
        Client?.Dispose();
        _factory?.Dispose();
        _environment?.Dispose();
        if (_studioCreated)
        {
            await using var cleanup = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(_studioConnection).Options);
            await cleanup.Database.EnsureDeletedAsync();
        }
        if (_tenantCreated)
        {
            await using var cleanup = NewTenantDb();
            await cleanup.Database.EnsureDeletedAsync();
        }
        if (_platformCreated)
        {
            await using var cleanup = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(_platformConnection).Options);
            await cleanup.Database.EnsureDeletedAsync();
        }
        if (_credential is not null) await _credential.DisposeAsync();
    }

    private async Task InitializeAsync(string configuredConnection)
    {
        await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(_platformConnection).Options);
        await using var tenantDb = NewTenantDb();
        await using var studioDb = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(_studioConnection).Options);
        _platformCreated = await platformDb.Database.EnsureCreatedAsync();
        _tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
        _studioCreated = await studioDb.Database.EnsureCreatedAsync();
        Assert.True(_platformCreated && _tenantCreated && _studioCreated);
        _credential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection, TenantId);

        Tenant = new Tenant { Id = TenantId, Name = "Synthetic route close", Slug = $"route-close-{Suffix}", BaseCurrencyCode = "TRY" };
        platformDb.Tenants.Add(Tenant);
        platformDb.Users.Add(new AppUser { Id = UserId, Email = $"route-close-{Suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" });
        platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
        platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = TenantId, Tenant = Tenant, DatabaseName = new SqlConnectionStringBuilder(_tenantConnection).InitialCatalog,
            State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
        });
        await platformDb.SaveChangesAsync();
    }

    private static string DatabaseConnection(string source, string databaseName)
        => new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true }.ConnectionString;

    private sealed class RouteCloseApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "route-close-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "route-close-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = SigningKey,
                ["PluginHost:SigningKey"] = PluginSigningKey,
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection, ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton(credentialReader);
                services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }
    }

    private sealed class ProcessEnvironmentOverride(IReadOnlyDictionary<string, string?> previousValues) : IDisposable
    {
        public static ProcessEnvironmentOverride Push(IReadOnlyDictionary<string, string?> values)
        {
            var previous = values.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            foreach (var (key, value) in values) Environment.SetEnvironmentVariable(key, value);
            return new ProcessEnvironmentOverride(previous);
        }

        public void Dispose()
        {
            foreach (var (key, value) in previousValues) Environment.SetEnvironmentVariable(key, value);
        }
    }
}
