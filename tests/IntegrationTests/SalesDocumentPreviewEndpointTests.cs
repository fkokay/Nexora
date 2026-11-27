using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satış Aşama B previews (<c>POST /api/sales/{invoices|quotes|orders}/preview</c>): what the write would store, row keys echoed,
/// the write's field errors, tenant scope, nothing written, and the create permission. The order PUT runs on the InMemory
/// provider, so its stored amounts are compared with the preview here; the other writes need SQL Server
/// (SalesDocumentPreviewSqlAcceptanceTests).
/// </summary>
public sealed class SalesDocumentPreviewEndpointTests
{
    [Fact]
    public async Task Invoice_preview_applies_the_tax_profile_and_writes_nothing()
    {
        await using var factory = new PreviewApiFactory();
        var seed = await SeedAsync(factory, "preview-invoice", withTaxProfile: true);
        using var client = CreateClient(factory, seed.TenantId);
        var before = await CountsAsync(factory, seed.TenantId);

        using var response = await client.PostAsJsonAsync("/api/sales/invoices/preview", new
        {
            requestId = Guid.NewGuid(), customerId = seed.CustomerId, warehouseId = seed.WarehouseId, invoiceDate = "2026-11-20",
            invoiceType = "Wholesale", notes = "yok sayılır",
            lines = new object[]
            {
                new { rowKey = "r1", stockItemId = seed.StockItemId, quantity = 10m, unitPrice = 100m, discountPercent = 0m, vatPercent = 20m, warehouseId = seed.WarehouseId },
                new { rowKey = "r2", stockItemId = seed.StockItemId, quantity = 1m, unitPrice = 50m, discountPercent = 10m, vatPercent = 10m }
            }
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("TRY", preview.GetProperty("currencyCode").GetString());
        Assert.Equal("TR-TEST", preview.GetProperty("accountingProfileCode").GetString());
        var lines = preview.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal<IEnumerable<string?>>(["r1", "r2"], lines.Select(x => x.GetProperty("rowKey").GetString()));
        // r1: 1000 + VAT 200 + ÖTV 100 − tevkifat 50; r2: 50 − 5 = 45, VAT 4.50, ÖTV 4.50, tevkifat 2.25.
        Assert.Equal(1250.00m, lines[0].GetProperty("lineTotal").GetDecimal());
        Assert.Equal(51.75m, lines[1].GetProperty("lineTotal").GetDecimal());
        Assert.Equal(2.25m, lines[1].GetProperty("withholdingAmount").GetDecimal());
        Assert.Equal((1050.00m, 5.00m, 1045.00m, 309.00m, 52.25m, 1354.00m, 1301.75m),
            (D(preview, "subtotal"), D(preview, "discountTotal"), D(preview, "taxableTotal"), D(preview, "taxTotal"), D(preview, "withholdingTotal"),
                D(preview, "grossTotal"), D(preview, "grandTotal")));
        Assert.Equal([("VAT", 20m, 200.00m), ("VAT", 10m, 4.50m), ("OTV", 10m, 104.50m), ("TEV", 5m, 52.25m)],
            preview.GetProperty("taxes").EnumerateArray().Select(x => (x.GetProperty("code").GetString(), x.GetProperty("rate").GetDecimal(), x.GetProperty("amount").GetDecimal())));

        Assert.Equal(before, await CountsAsync(factory, seed.TenantId));
    }

    [Fact]
    public async Task Invoice_preview_returns_the_write_field_errors_and_stays_in_the_tenant()
    {
        await using var factory = new PreviewApiFactory();
        var seed = await SeedAsync(factory, "preview-invoice-errors");
        var other = await SeedAsync(factory, "preview-invoice-other");
        using var client = CreateClient(factory, seed.TenantId);

        async Task<JsonElement> Errors(object body)
        {
            using var response = await client.PostAsJsonAsync("/api/sales/invoices/preview", body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        }
        object Body(Guid customerId, Guid stockItemId, string? unitCode = null, decimal quantity = 1m) => new
        {
            customerId, invoiceDate = "2026-11-20", lines = new[] { new { stockItemId, quantity, unitPrice = 10m, unitCode } }
        };
        Assert.True((await Errors(Body(seed.SupplierId, seed.StockItemId))).TryGetProperty("customerId", out _));
        Assert.True((await Errors(Body(other.CustomerId, seed.StockItemId))).TryGetProperty("customerId", out _));
        Assert.True((await Errors(Body(seed.CustomerId, other.StockItemId))).TryGetProperty("lines", out _));
        Assert.True((await Errors(Body(seed.CustomerId, seed.StockItemId, quantity: 0m))).TryGetProperty("lines", out _));
        Assert.True((await Errors(Body(seed.CustomerId, seed.StockItemId, unitCode: "KOLI"))).TryGetProperty($"lines[{seed.StockItemId}].unitCode", out _));
        Assert.True((await Errors(new { customerId = seed.CustomerId, invoiceDate = "2026-11-20", lines = Array.Empty<object>() })).TryGetProperty("invoice", out _));
    }

    [Fact]
    public async Task Quote_preview_converts_units_and_currency_like_the_write()
    {
        await using var factory = new PreviewApiFactory();
        var seed = await SeedAsync(factory, "preview-quote");
        using var client = CreateClient(factory, seed.TenantId);
        var before = await CountsAsync(factory, seed.TenantId);

        async Task<JsonElement> Preview(decimal? enteredRate, string date = "2026-11-20")
        {
            using var response = await client.PostAsJsonAsync("/api/sales/quotes/preview", new
            {
                code = "", customerId = seed.CustomerId, quoteDate = date, validUntil = "2026-12-20", currencyCode = "TRY",
                lines = new[] { new { rowKey = "k", stockItemId = seed.StockItemId, quantity = 2m, unitPrice = 100m, discountPercent = 10m, vatPercent = 20m,
                    unitCode = "TON", currencyCode = "USD", exchangeRateToQuoteCurrency = enteredRate } }
            });
            return response.StatusCode == HttpStatusCode.OK ? await response.Content.ReadFromJsonAsync<JsonElement>()
                : throw new InvalidOperationException($"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        }
        // 2 TON = 2000 KG; 100 USD × 32.5 / 1000 = 3.25 TRY per KG (the dated tenant rate).
        var dated = await Preview(null);
        var line = dated.GetProperty("lines")[0];
        Assert.Equal(("k", "KG", 2000m, 3.25m, "TON", "USD", 32.5m), (line.GetProperty("rowKey").GetString(), line.GetProperty("unitCode").GetString(),
            line.GetProperty("quantity").GetDecimal(), line.GetProperty("unitPrice").GetDecimal(), line.GetProperty("enteredUnitCode").GetString(),
            line.GetProperty("enteredCurrencyCode").GetString(), line.GetProperty("exchangeRate").GetDecimal()));
        Assert.Equal(7020.00m, D(dated, "grandTotal"));
        // An entered rate wins on a quote line.
        Assert.Equal(6480.00m, D(await Preview(30m), "grandTotal"));
        // No rate dated on or before the quote date: the write's error key.
        using var missing = await client.PostAsJsonAsync("/api/sales/quotes/preview", new
        {
            customerId = seed.CustomerId, quoteDate = "2026-01-01", validUntil = "2026-12-20", currencyCode = "TRY",
            lines = new[] { new { stockItemId = seed.StockItemId, quantity = 1m, unitPrice = 1m, currencyCode = "USD" } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.True((await missing.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").TryGetProperty("lines[0].currencyCode", out _));
        Assert.Equal(before, await CountsAsync(factory, seed.TenantId));
    }

    [Fact]
    public async Task Order_preview_equals_what_the_order_update_stores()
    {
        await using var factory = new PreviewApiFactory();
        var seed = await SeedAsync(factory, "preview-order");
        using var client = CreateClient(factory, seed.TenantId);
        Guid orderId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var order = new SalesOrder { TenantId = seed.TenantId, CustomerId = seed.CustomerId, Code = "SO-1", OrderDate = new DateOnly(2026, 11, 20), CurrencyCode = "TRY", Status = SalesOrderStatus.Draft };
            db.SalesOrders.Add(order);
            await db.SaveChangesAsync();
            orderId = order.Id;
        }
        var lines = new object[]
        {
            new { rowKey = "a", stockItemId = seed.StockItemId, quantity = 1.5m, unitPrice = 200m, discountPercent = 7.5m, vatPercent = 20m, unitCode = "TON", currencyCode = "USD" },
            new { rowKey = "b", stockItemId = seed.StockItemId, quantity = 3m, unitPrice = 41.67m, discountPercent = 0m, vatPercent = 1m, isVatIncluded = true }
        };
        using var previewResponse = await client.PostAsJsonAsync("/api/sales/orders/preview",
            new { customerId = seed.CustomerId, orderDate = "2026-11-20", currencyCode = "TRY", lines });
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        var preview = await previewResponse.Content.ReadFromJsonAsync<JsonElement>();
        using var update = await client.PutAsJsonAsync($"/api/sales/orders/{orderId}",
            new { code = "SO-1", customerId = seed.CustomerId, orderDate = "2026-11-20", currencyCode = "TRY", lines });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        await using var check = factory.Services.CreateAsyncScope();
        var stored = await check.ServiceProvider.GetRequiredService<TenantDbContext>().SalesOrders.AsNoTracking().Include(x => x.Lines)
            .SingleAsync(x => x.Id == orderId);
        Assert.Equal((stored.Subtotal, stored.DiscountTotal, stored.TaxTotal, stored.GrandTotal),
            (D(preview, "subtotal"), D(preview, "discountTotal"), D(preview, "taxTotal"), D(preview, "grandTotal")));
        var previewLines = preview.GetProperty("lines").EnumerateArray().ToArray();
        foreach (var storedLine in stored.Lines.OrderBy(x => x.LineNumber))
        {
            var line = previewLines[storedLine.LineNumber - 1];
            Assert.Equal((storedLine.Quantity, storedLine.UnitPrice, storedLine.LineSubtotal, storedLine.DiscountAmount, storedLine.TaxAmount, storedLine.LineTotal,
                    storedLine.ExchangeRateToOrderCurrency, storedLine.EnteredUnitCode),
                (line.GetProperty("quantity").GetDecimal(), line.GetProperty("unitPrice").GetDecimal(), line.GetProperty("lineSubtotal").GetDecimal(),
                    line.GetProperty("discountAmount").GetDecimal(), line.GetProperty("taxAmount").GetDecimal(), line.GetProperty("lineTotal").GetDecimal(),
                    line.GetProperty("exchangeRate").GetDecimal(), line.GetProperty("enteredUnitCode").GetString()));
        }
        // Golden numbers of this body: 1500 KG × 6.50 = 9750.00 − 7.5 % = 9018.75 + 20 % VAT 1803.75; 3 × 41.67 = 125.01 VAT-included
        // at 1 % → 123.77 + VAT 1.24.
        Assert.Equal((9873.77m, 731.25m, 1804.99m, 10947.51m), (stored.Subtotal, stored.DiscountTotal, stored.TaxTotal, stored.GrandTotal));
    }

    [Fact]
    public void Previews_resolve_as_the_create_permission_of_their_document()
    {
        foreach (var (route, permission) in new[]
        {
            ("/api/sales/invoices/preview", "erp.sales-invoices.create"), ("/api/sales/quotes/preview", "erp.sales-quotes.create"),
            ("/api/sales/orders/preview", "erp.sales-orders.create")
        })
        {
            Assert.True(PlatformPermissionCatalog.TryResolve(route, "POST", route, new Dictionary<string, string?>(), Guid.NewGuid(), Guid.NewGuid(),
                "TenantUser", out var resolved), route);
            Assert.Equal(permission, resolved!.Permission.Code);
            Assert.True(PlatformPermissionCatalog.TryResolve(route[..route.LastIndexOf('/')], "POST", route[..route.LastIndexOf('/')] + "/",
                new Dictionary<string, string?>(), Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var create));
            Assert.Equal(create!.Permission.Code, resolved.Permission.Code);
        }
    }

    private static decimal D(JsonElement element, string property) => element.GetProperty(property).GetDecimal();

    // ---- Fixture ----

    private sealed record Seed(Guid TenantId, Guid CustomerId, Guid SupplierId, Guid WarehouseId, Guid StockItemId);

    private static HttpClient CreateClient(PreviewApiFactory factory, Guid tenantId)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        return client;
    }

    /// <summary>Rows a write would add: documents, stock, ledger, audit, numbering and request keys.</summary>
    private static async Task<(int, int, int, int, int, int, int, int)> CountsAsync(PreviewApiFactory factory, Guid tenantId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        return (await db.SalesInvoices.CountAsync(x => x.TenantId == tenantId), await db.SalesDeliveries.CountAsync(x => x.TenantId == tenantId),
            await db.SalesQuotes.CountAsync(x => x.TenantId == tenantId), await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId),
            await db.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId), await db.AuditEvents.CountAsync(x => x.TenantId == tenantId),
            await db.TenantDocumentNumberTemplates.CountAsync(x => x.TenantId == tenantId), await db.CustomerAccounts.CountAsync(x => x.TenantId == tenantId));
    }

    private static async Task<Seed> SeedAsync(PreviewApiFactory factory, string slug, bool withTaxProfile = false)
    {
        var tenantId = Guid.NewGuid();
        await using var scope = factory.Services.CreateAsyncScope();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var platformTenant = new Tenant { Id = tenantId, Name = slug, Slug = $"{slug}-{tenantId:N}", IsActive = true };
        platformDb.Tenants.Add(platformTenant);
        platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId, Tenant = platformTenant, DatabaseName = $"AIERPTenant_{tenantId:N}", State = TenantDatabaseProvisioningState.Ready
        });
        await platformDb.SaveChangesAsync();

        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = new Tenant { Id = tenantId, Name = slug, Slug = $"{slug}-{tenantId:N}", IsActive = true, BaseCurrencyCode = "TRY" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Müşteri", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var supplier = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "SUP-1", Name = "Tedarikçi", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Merkez" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-1", Name = "Malzeme", UnitCode = "KG", TrackingMode = InventoryTrackingMode.None };
        db.Tenants.Add(tenant); db.CustomerAccounts.AddRange(customer, supplier); db.Warehouses.Add(warehouse); db.StockItems.Add(item);
        db.StockItemUnitConversions.Add(new StockItemUnitConversion { TenantId = tenantId, StockItemId = item.Id, UnitCode = "TON", FactorToBase = 1000m });
        db.TenantExchangeRates.Add(new TenantExchangeRate { TenantId = tenantId, Tenant = tenant, CurrencyCode = "USD", RateDate = new DateOnly(2026, 11, 1), Rate = 32.5m });
        db.InventoryTransactions.Add(new InventoryTransaction
        {
            TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 10, 28),
            Direction = InventoryDirection.Receipt, Quantity = 5m, UnitCostBase = 10m, Description = "Opening test stock"
        });
        if (withTaxProfile)
            db.AccountingRuleProfiles.Add(new AccountingRuleProfile
            {
                TenantId = tenantId, ProfileCode = "TR-TEST", EffectiveFrom = new DateOnly(2026, 1, 1),
                ParametersJson = JsonSerializer.Serialize(new
                {
                    taxRules = new object[]
                    {
                        new { code = "OTV", name = "ÖTV", rate = 10m, operationType = "Sales", treatment = "Additive", calculationBase = "Net" },
                        new { code = "TEV", name = "Tevkifat", rate = 5m, operationType = "Sales", treatment = "Withholding", calculationBase = "Net" }
                    }
                })
            });
        await db.SaveChangesAsync();
        return new Seed(tenantId, customer.Id, supplier.Id, warehouse.Id, item.Id);
    }

    private sealed class PreviewApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"sales-preview-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName)
                    .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
                services.RemoveAll<TenantDbContext>();
                services.RemoveAll<DbContextOptions<TenantDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<TenantDbContext>>();
                services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{_databaseName}-tenant")
                    .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader, TestTenantSqlCredentialReader>();
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = TestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(TestAuthenticationHandler.SchemeName, _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder(TestAuthenticationHandler.SchemeName)
                        .RequireAuthenticatedUser().Build());
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-sales-preview-signing-key-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["PluginHost:SigningKey"] = "synthetic-sales-preview-plugin-key-32-bytes-long",
                ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "sales-preview-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "sales-preview-secret",
                ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
                ["AI:LiveEvaluation:Enabled"] = "false"
            }));
            return base.CreateHost(builder);
        }
    }

    private sealed class TestTenantSqlCredentialReader : ITenantSqlCredentialReader
    {
        public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
            string secretReference, CancellationToken cancellationToken = default) => Task.FromResult(new TenantSqlCredential(
            TenantSqlCredentialPath.DatabaseName(tenantId, component), $"aierp_t_{tenantId:N}", "synthetic-password", 1));
    }

    private sealed class TestAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "sales-preview-test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)) return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Guid.TryParse(Request.Headers["X-Test-User"], out var parsed) ? parsed : Guid.NewGuid();
            var claims = new[] { new Claim("tenant_id", tenantId.ToString("D")), new Claim("sub", userId.ToString("D")), new Claim("role", "TenantAdmin") };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName)));
        }
    }
}
