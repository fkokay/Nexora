using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Api;
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

/// <summary>Optional free-text invoice note: trimmed, bounded to 1000 characters, persisted and returned in the detail view.</summary>
public sealed class SalesInvoiceNotesIntegrationTests
{
    [Fact]
    public async Task Invoice_note_is_trimmed_saved_returned_and_kept_on_replay()
    {
        await using var factory = new NotesApiFactory();
        var seed = await SeedTenantAsync(factory, "notes-a");
        using var client = CreateClient(factory, seed.TenantId);
        var deliveryId = await CreatePostedStandaloneDeliveryAsync(client, seed);

        var note = new string('n', 1000);
        var request = new
        {
            invoiceDate = "2026-10-30",
            notes = $"  {note}  ",
            lines = new[] { new { lineNumber = 1, unitPrice = 25m, discountPercent = 0m, vatPercent = 20m } }
        };
        using var created = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{deliveryId}/invoice", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var invoiceId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/sales/invoices/{invoiceId}");
        Assert.Equal(note, detail.GetProperty("notes").GetString());

        using var replay = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{deliveryId}/invoice",
            new { request.invoiceDate, notes = "Farklı not", request.lines });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(invoiceId, (await replay.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(note, await db.SalesInvoices.Where(x => x.TenantId == seed.TenantId && x.Id == invoiceId).Select(x => x.Notes).SingleAsync());
        }

        var other = await SeedTenantAsync(factory, "notes-b");
        using var otherClient = CreateClient(factory, other.TenantId);
        using var foreign = await otherClient.GetAsync($"/api/sales/invoices/{invoiceId}");
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.DoesNotContain(note, await foreign.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    public async Task Missing_or_blank_invoice_note_is_stored_as_null(string? notes)
    {
        await using var factory = new NotesApiFactory();
        var seed = await SeedTenantAsync(factory, "notes-empty");
        using var client = CreateClient(factory, seed.TenantId);
        var deliveryId = await CreatePostedStandaloneDeliveryAsync(client, seed);

        using var created = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{deliveryId}/invoice", new
        {
            invoiceDate = "2026-10-30",
            notes,
            lines = new[] { new { lineNumber = 1, unitPrice = 25m, discountPercent = 0m, vatPercent = 20m } }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var invoiceId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/sales/invoices/{invoiceId}");
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("notes").ValueKind);
    }

    [Fact]
    public async Task Invoice_note_longer_than_1000_characters_is_rejected_on_every_create_route()
    {
        await using var factory = new NotesApiFactory();
        var seed = await SeedTenantAsync(factory, "notes-long");
        using var client = CreateClient(factory, seed.TenantId);
        var deliveryId = await CreatePostedStandaloneDeliveryAsync(client, seed);
        var tooLong = new string('x', 1001);

        using var standaloneDelivery = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{deliveryId}/invoice", new
        {
            invoiceDate = "2026-10-30",
            notes = tooLong,
            lines = new[] { new { lineNumber = 1, unitPrice = 25m, discountPercent = 0m, vatPercent = 20m } }
        });
        using var standaloneInvoice = await client.PostAsJsonAsync("/api/sales/invoices/", new
        {
            requestId = Guid.NewGuid(), customerId = seed.CustomerId, warehouseId = seed.WarehouseId, invoiceDate = "2026-10-30",
            notes = tooLong,
            lines = new[] { new { stockItemId = seed.StockItemId, quantity = 1m, unitPrice = 10m, discountPercent = 0m, vatPercent = 20m } }
        });
        using var fromDelivery = await client.PostAsJsonAsync($"/api/sales/deliveries/{Guid.NewGuid()}/invoice", new
        {
            customerId = seed.CustomerId, invoiceDate = "2026-10-30", notes = tooLong
        });

        foreach (var response in new[] { standaloneDelivery, standaloneInvoice, fromDelivery })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(problem.GetProperty("errors").TryGetProperty("notes", out _));
        }
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.False(await db.SalesInvoices.AnyAsync(x => x.TenantId == seed.TenantId));
    }

    private sealed record Seed(Guid TenantId, Guid CustomerId, Guid WarehouseId, Guid StockItemId);

    private static HttpClient CreateClient(NotesApiFactory factory, Guid tenantId)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        return client;
    }

    private static async Task<Seed> SeedTenantAsync(NotesApiFactory factory, string slug)
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
        var tenant = new Tenant { Id = tenantId, Name = slug, Slug = $"{slug}-{tenantId:N}", IsActive = true };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Main warehouse" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-1", Name = "Material", UnitCode = "EA", TrackingMode = InventoryTrackingMode.None };
        db.Tenants.Add(tenant); db.CustomerAccounts.Add(customer); db.Warehouses.Add(warehouse); db.StockItems.Add(item);
        db.InventoryTransactions.Add(new InventoryTransaction
        {
            TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 10, 28),
            Direction = InventoryDirection.Receipt, Quantity = 5m, UnitCostBase = 10m, Description = "Opening test stock"
        });
        await db.SaveChangesAsync();
        return new Seed(tenantId, customer.Id, warehouse.Id, item.Id);
    }

    private static async Task<Guid> CreatePostedStandaloneDeliveryAsync(HttpClient client, Seed seed)
    {
        using var create = await client.PostAsJsonAsync("/api/sales/standalone-deliveries", new
        {
            requestId = Guid.NewGuid(), code = $"SD-{Guid.NewGuid():N}"[..20], customerId = seed.CustomerId, warehouseId = seed.WarehouseId, deliveryDate = "2026-10-29",
            lines = new[] { new { stockItemId = seed.StockItemId, quantity = 2m, unitCode = "EA", trackingCode = (string?)null, expiryDate = (string?)null } }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var post = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{id}/post", new { });
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        return id;
    }

    private sealed class NotesApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"sales-invoice-notes-{Guid.NewGuid():N}";

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
                ["Authentication:SigningKey"] = "synthetic-sales-invoice-notes-signing-key-32-bytes",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["PluginHost:SigningKey"] = "synthetic-sales-invoice-notes-plugin-key-32-bytes",
                ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "sales-invoice-notes-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "sales-invoice-notes-secret",
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

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "sales-invoice-notes-test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Guid.TryParse(Request.Headers["X-Test-User"], out var parsed) ? parsed : Guid.NewGuid();
            var claims = new[]
            {
                new Claim("tenant_id", tenantId.ToString("D")),
                new Claim("sub", userId.ToString("D")),
                new Claim("role", "TenantAdmin")
            };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName)));
        }
    }
}
