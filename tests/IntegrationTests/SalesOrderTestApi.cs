extern alias Api;
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
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Shared in-process API for the sales order state chain tests (belge kuralları, PR 1): the full AIERP.Api on InMemory databases,
/// a header-driven test identity (X-Test-Tenant, X-Test-User, X-Test-Role) and a seed with an admin, a TenantUser, a TRY customer,
/// a warehouse with stock and two stock cards.
/// </summary>
internal sealed record SalesOrderSeed(Guid TenantId, Guid AdminUserId, Guid UserId, Guid CustomerId, Guid WarehouseId,
    Guid StockItemId, Guid StockItem2Id);

internal sealed class SalesOrderApiFactory : WebApplicationFactory<ApiEntryPointMarker>
{
    private readonly string _databaseName = $"sales-order-chain-{Guid.NewGuid():N}";

    public HttpClient Client(SalesOrderSeed seed, string role = "TenantAdmin")
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", seed.TenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", (role == "TenantAdmin" ? seed.AdminUserId : seed.UserId).ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        return client;
    }

    public async Task<T> WithTenantDbAsync<T>(Func<TenantDbContext, Task<T>> work)
    {
        await using var scope = Services.CreateAsyncScope();
        return await work(scope.ServiceProvider.GetRequiredService<TenantDbContext>());
    }

    public async Task WithTenantDbAsync(Func<TenantDbContext, Task> work)
    {
        await using var scope = Services.CreateAsyncScope();
        await work(scope.ServiceProvider.GetRequiredService<TenantDbContext>());
    }

    public async Task WithPlatformDbAsync(Func<PlatformDbContext, Task> work)
    {
        await using var scope = Services.CreateAsyncScope();
        await work(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
    }

    public async Task<SalesOrderSeed> SeedAsync(string slug = "chain")
    {
        var tenantId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await using var scope = Services.CreateAsyncScope();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platformDb.Database.EnsureCreatedAsync();
        var platformTenant = new Tenant { Id = tenantId, Name = slug, Slug = $"{slug}-{tenantId:N}", IsActive = true };
        platformDb.Tenants.Add(platformTenant);
        platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId, Tenant = platformTenant, DatabaseName = $"AIERPTenant_{tenantId:N}", State = TenantDatabaseProvisioningState.Ready
        });
        var admin = new AppUser { Id = adminId, Email = $"admin-{adminId:N}@example.test", DisplayName = "Yönetici" };
        var user = new AppUser { Id = userId, Email = $"user-{userId:N}@example.test", DisplayName = "Kullanıcı" };
        platformDb.Users.AddRange(admin, user);
        platformDb.TenantMemberships.AddRange(
            new TenantMembership { UserId = adminId, User = admin, TenantId = tenantId, Tenant = platformTenant, Role = "TenantAdmin" },
            new TenantMembership { UserId = userId, User = user, TenantId = tenantId, Tenant = platformTenant, Role = "TenantUser" });
        await platformDb.SaveChangesAsync();

        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = new Tenant { Id = tenantId, Name = slug, Slug = $"{slug}-{tenantId:N}", IsActive = true, BaseCurrencyCode = "TRY" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Müşteri", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Merkez" };
        var item = new StockItem
        {
            TenantId = tenantId, Tenant = tenant, Code = "MAT-1", Name = "Malzeme", UnitCode = "KG", TrackingMode = InventoryTrackingMode.None,
            SalesListPrice = 12.5m, SalesVatPercent = 10m, SalesDiscountPercent = 5m, PriceCurrencyCode = "TRY"
        };
        var item2 = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-2", Name = "Malzeme 2", UnitCode = "AD", TrackingMode = InventoryTrackingMode.None };
        db.Tenants.Add(tenant); db.CustomerAccounts.Add(customer); db.Warehouses.Add(warehouse); db.StockItems.AddRange(item, item2);
        db.InventoryTransactions.AddRange(
            new InventoryTransaction
            {
                TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 10, 28),
                Direction = InventoryDirection.Receipt, Quantity = 100m, UnitCostBase = 10m, Description = "Opening test stock"
            },
            new InventoryTransaction
            {
                TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item2.Id, EntryDate = new DateOnly(2026, 10, 28),
                Direction = InventoryDirection.Receipt, Quantity = 100m, UnitCostBase = 1m, Description = "Opening test stock"
            });
        await db.SaveChangesAsync();
        return new SalesOrderSeed(tenantId, adminId, userId, customer.Id, warehouse.Id, item.Id, item2.Id);
    }

    /// <summary>An order written straight to the database (as live data is) with one line of <paramref name="quantity"/> × 10 TRY.</summary>
    public Task<Guid> SeedOrderAsync(SalesOrderSeed seed, SalesOrderStatus status, decimal quantity = 4m, string code = "SO-SEED") =>
        WithTenantDbAsync(async db =>
        {
            var item = await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId);
            var order = new SalesOrder
            {
                TenantId = seed.TenantId, CustomerId = seed.CustomerId, Code = code, OrderDate = new DateOnly(2026, 11, 2), CurrencyCode = "TRY",
                Status = status, Subtotal = quantity * 10m, TaxTotal = quantity * 2m, GrandTotal = quantity * 12m
            };
            order.Lines.Add(new SalesOrderLine
            {
                TenantId = seed.TenantId, Order = order, LineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                UnitCode = item.UnitCode, EnteredUnitCode = item.UnitCode, EnteredCurrencyCode = "TRY", EnteredUnitPrice = 10m,
                Quantity = quantity, UnitPrice = 10m, VatPercent = 20m, LineSubtotal = quantity * 10m, TaxAmount = quantity * 2m, LineTotal = quantity * 12m
            });
            db.SalesOrders.Add(order);
            await db.SaveChangesAsync();
            return order.Id;
        });

    public static SalesOrderWriteRequest OrderBody(SalesOrderSeed seed, decimal quantity = 4m, string code = "") =>
        new(code, seed.CustomerId, new DateOnly(2026, 11, 2), null, "TRY",
            [new SalesQuoteLineWriteRequest(seed.StockItemId, quantity, 10m, VatPercent: 20m)]);

    public static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode || text.Length > 0, $"{(int)response.StatusCode} {text}");
        return JsonDocument.Parse(text.Length == 0 ? "{}" : text).RootElement.Clone();
    }

    public static async Task<Guid> CreateOrderAsync(HttpClient client, SalesOrderSeed seed, decimal quantity = 4m)
    {
        using var response = await client.PostAsJsonAsync("/api/sales/orders", OrderBody(seed, quantity));
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await ReadJsonAsync(response)).GetProperty("id").GetGuid();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Production);
        builder.ConfigureTestServices(services =>
        {
            var root = new InMemoryDatabaseRoot();
            services.RemoveAll<PlatformDbContext>();
            services.RemoveAll<DbContextOptions<PlatformDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
            services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName, root)
                .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
            services.RemoveAll<TenantDbContext>();
            services.RemoveAll<DbContextOptions<TenantDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<TenantDbContext>>();
            services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{_databaseName}-tenant", root)
                .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
            services.RemoveAll<ITenantSqlCredentialReader>();
            services.AddSingleton<ITenantSqlCredentialReader, ChainTenantSqlCredentialReader>();
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = ChainAuthenticationHandler.SchemeName;
                options.DefaultChallengeScheme = ChainAuthenticationHandler.SchemeName;
                options.DefaultForbidScheme = ChainAuthenticationHandler.SchemeName;
            }).AddScheme<AuthenticationSchemeOptions, ChainAuthenticationHandler>(ChainAuthenticationHandler.SchemeName, _ => { });
            // Keep the API's permission requirement (route → permission catalog → tenant rules) so Deny rules are enforced.
            services.PostConfigure<AuthorizationOptions>(options =>
            {
                options.DefaultPolicy = new AuthorizationPolicyBuilder(ChainAuthenticationHandler.SchemeName).RequireAuthenticatedUser()
                    .AddRequirements(new Api::PermissionRequirement()).Build();
                options.FallbackPolicy = options.DefaultPolicy;
            });
            foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                         && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                services.Remove(worker);
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:SigningKey"] = "synthetic-sales-chain-signing-key-32-bytes-long",
            ["Authentication:Issuer"] = "AIERP",
            ["Authentication:Audience"] = "AIERP",
            ["PluginHost:SigningKey"] = "synthetic-sales-chain-plugin-key-32-bytes-long",
            ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
            ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
            ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
            ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
            ["Database:SeparationEnabled"] = "true",
            ["Database:ApplyMigrationsOnStartup"] = "false",
            ["Vault:Address"] = "https://vault.test",
            ["Vault:TenantSqlCredentialReader:RoleId"] = "sales-chain-role",
            ["Vault:TenantSqlCredentialReader:SecretId"] = "sales-chain-secret",
            ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
            ["AI:LiveEvaluation:Enabled"] = "false"
        }));
        return base.CreateHost(builder);
    }

    private sealed class ChainTenantSqlCredentialReader : ITenantSqlCredentialReader
    {
        public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
            string secretReference, CancellationToken cancellationToken = default) => Task.FromResult(new TenantSqlCredential(
            TenantSqlCredentialPath.DatabaseName(tenantId, component), $"aierp_t_{tenantId:N}", "synthetic-password", 1));
    }

    private sealed class ChainAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "sales-chain-test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)) return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Guid.TryParse(Request.Headers["X-Test-User"], out var parsed) ? parsed : Guid.NewGuid();
            var role = Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin";
            var claims = new[] { new Claim("tenant_id", tenantId.ToString("D")), new Claim("sub", userId.ToString("D")), new Claim("role", role) };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName)));
        }
    }
}
