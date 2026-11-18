using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Api;
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
/// Tedarikçi teklifinin iki giriş yolu SQL Server üzerinde: talepli teklif (satır kilitleri ve talep satırı FK'si ile)
/// ve talepsiz teklif aynı listede görünür; talepli teklif siparişe dönüşmeye devam eder. Disposable SQL Server gerekir.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class PurchaseSupplierQuoteSqlAcceptanceTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [SqlServerAcceptanceFact]
    public async Task Request_quote_and_requestless_quote_share_the_list_and_request_quote_still_orders()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_SupplierQuotePlatform_{suffix}");
        var tenantConnection = BuildDatabaseConnection(configuredConnection!, $"AIERPTenant_{TenantId:N}");
        var studioConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_SupplierQuoteStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            await using var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, TenantId);

            var tenant = new Tenant { Id = TenantId, Name = "Supplier quote acceptance", Slug = $"supplier-quote-{suffix}" };
            var user = new AppUser { Id = UserId, Email = $"supplier-quote-{suffix}@example.invalid", DisplayName = "Synthetic Admin", PasswordHash = "test" };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(user);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = TenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();

            var tenantCopy = new Tenant { Id = TenantId, Name = tenant.Name, Slug = tenant.Slug };
            var supplier = new CustomerAccount { TenantId = TenantId, Tenant = tenantCopy, Code = "SUP-1", Name = "Synthetic Supplier", Type = CounterpartyType.Supplier };
            var stock = new StockItem { TenantId = TenantId, Tenant = tenantCopy, Code = "SKU-Q", Name = "Quoted item", UnitCode = "EA" };
            tenantDb.Tenants.Add(tenantCopy);
            tenantDb.CustomerAccounts.Add(supplier);
            tenantDb.StockItems.Add(stock);
            var request = new PurchaseRequest
            {
                TenantId = TenantId, RequestedByUserId = UserId, Code = "PR-Q-1", RequestDate = new DateOnly(2026, 11, 18),
                Description = "Teklif kabul testi", Status = PurchaseRequestStatus.Approved,
                Lines = { new PurchaseRequestLine { TenantId = TenantId, LineNumber = 1, StockItemId = stock.Id, StockCode = stock.Code, StockName = stock.Name, UnitCode = "EA", Quantity = 3m } }
            };
            tenantDb.PurchaseRequests.Add(request);
            await tenantDb.SaveChangesAsync();

            using var startupConfiguration = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-supplier-quote-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP",
                ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection,
                ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection,
                ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new SupplierQuoteApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", UserId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");

            var requestQuote = await client.PostAsJsonAsync($"/api/purchasing/requests/{request.Id:D}/supplier-quotes", new
            {
                code = "TKL-REQ", supplierId = supplier.Id, quoteDate = "2026-11-18",
                lines = new[] { new { requestLineNumber = 1, unitPrice = 10m, discountPercent = 0m, vatPercent = 20m } }
            });
            Assert.True(requestQuote.IsSuccessStatusCode, $"{(int)requestQuote.StatusCode}: {await requestQuote.Content.ReadAsStringAsync()}");
            var requestQuoteId = (await requestQuote.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

            var standalone = await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", new
            {
                code = "TKL-FREE", supplierId = supplier.Id, quoteDate = "2026-11-18",
                lines = new[] { new { stockItemId = stock.Id, quantity = 4m, unitPrice = 9m, discountPercent = 0m, vatPercent = 20m } }
            });
            Assert.True(standalone.IsSuccessStatusCode, $"{(int)standalone.StatusCode}: {await standalone.Content.ReadAsStringAsync()}");
            var duplicate = await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", new
            {
                code = "TKL-FREE", supplierId = supplier.Id, quoteDate = "2026-11-18",
                lines = new[] { new { stockItemId = stock.Id, quantity = 1m, unitPrice = 1m } }
            });
            Assert.Equal(System.Net.HttpStatusCode.Conflict, duplicate.StatusCode);

            var list = await client.GetFromJsonAsync<JsonElement>("/api/purchasing/supplier-quotes/?page=1&pageSize=50");
            var items = list.GetProperty("items").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!);
            Assert.Equal(2, items.Count);
            Assert.Equal("PR-Q-1", items["TKL-REQ"].GetProperty("requestCode").GetString());
            Assert.Equal(JsonValueKind.Null, items["TKL-FREE"].GetProperty("requestCode").ValueKind);
            Assert.Equal(JsonValueKind.Null, items["TKL-FREE"].GetProperty("purchaseRequestId").ValueKind);
            var searched = await client.GetFromJsonAsync<JsonElement>("/api/purchasing/supplier-quotes/?search=PR-Q");
            Assert.Equal("TKL-REQ", Assert.Single(searched.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());
            var requestQuotes = await client.GetFromJsonAsync<JsonElement>($"/api/purchasing/requests/{request.Id:D}/supplier-quotes");
            Assert.Equal("TKL-REQ", Assert.Single(requestQuotes.EnumerateArray()).GetProperty("code").GetString());

            var order = await client.PostAsJsonAsync($"/api/purchasing/requests/{request.Id:D}/order", new
            {
                code = "PO-Q-1", supplierId = supplier.Id, orderDate = "2026-11-18", supplierQuoteId = requestQuoteId,
                lines = new[] { new { lineNumber = 1, unitPrice = 10m, discountPercent = 0m, vatPercent = 20m } }
            });
            Assert.True(order.IsSuccessStatusCode, $"{(int)order.StatusCode}: {await order.Content.ReadAsStringAsync()}");

            tenantDb.ChangeTracker.Clear();
            var storedOrder = await tenantDb.PurchaseOrders.AsNoTracking().SingleAsync(x => x.TenantId == TenantId);
            Assert.Equal(requestQuoteId, storedOrder.SourceSupplierQuoteId);
            var statuses = await tenantDb.PurchaseSupplierQuotes.AsNoTracking().ToDictionaryAsync(x => x.Code, x => x.Status);
            Assert.Equal(PurchaseSupplierQuoteStatus.Selected, statuses["TKL-REQ"]);
            // Talepsiz teklif talebin sipariş kararından etkilenmez.
            Assert.Equal(PurchaseSupplierQuoteStatus.Submitted, statuses["TKL-FREE"]);
            var requestLine = await tenantDb.PurchaseSupplierQuoteLines.AsNoTracking().SingleAsync(x => x.QuoteId == requestQuoteId);
            Assert.Equal(stock.Id, requestLine.StockItemId);
        }
        finally
        {
            if (tenantCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (platformCreated)
            {
                await using var cleanup = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (tenantCredential is not null) await tenantCredential.DisposeAsync();
        }
    }

    private static string BuildDatabaseConnection(string source, string databaseName) =>
        new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true }.ConnectionString;

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

    private sealed class SupplierQuoteApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "supplier-quote-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "supplier-quote-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-supplier-quote-acceptance-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection,
                ["Database:SeparationEnabled"] = "true", ["Database:ApplyMigrationsOnStartup"] = "false"
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
}
