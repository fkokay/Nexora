using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class SqlServerStandaloneInventoryDocumentsAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Orderless_sales_delivery_and_purchase_receipt_post_idempotently_and_reverse_stock()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var connection = DatabaseConnection(configuredConnection!, $"AIERP_OrderlessTenant_{suffix}");
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var tenant = new Tenant { Id = tenantId, Name = "Orderless acceptance", Slug = $"orderless-{tenantId:N}" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
        var supplier = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "SUP-1", Name = "Supplier", Type = CounterpartyType.Supplier, CurrencyCode = "TRY", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Main warehouse", IsActive = true };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "ITEM-1", Name = "Test item", UnitCode = "EA", TrackingMode = InventoryTrackingMode.None, IsActive = true };

        await using var seed = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options);
        var databaseCreated = false;
        try
        {
            databaseCreated = await seed.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);
            seed.Tenants.Add(tenant);
            seed.CustomerAccounts.AddRange(customer, supplier);
            seed.Warehouses.Add(warehouse);
            seed.StockItems.Add(item);
            seed.InventoryTransactions.Add(new InventoryTransaction
            {
                TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 10, 28),
                Direction = InventoryDirection.Receipt, Quantity = 5m, UnitCostBase = 10m, Description = "Synthetic opening stock",
            });
            await seed.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(options => options.UseSqlServer(connection));
            builder.Services.AddAuthentication("orderless-sql-test")
                .AddScheme<AuthenticationSchemeOptions, OrderlessSqlAuthenticationHandler>("orderless-sql-test", _ => { });
            builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
            builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapStandaloneInventoryDocumentEndpoints();
            await app.StartAsync();

            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");

            using var createDeliveryResponse = await client.PostAsJsonAsync("/api/sales/standalone-deliveries", new
            {
                requestId = Guid.NewGuid(), code = "SD-SQL-001", customerId = customer.Id, warehouseId = warehouse.Id, deliveryDate = "2026-10-29",
                lines = new[] { new { stockItemId = item.Id, quantity = 2m, unitCode = "EA", trackingCode = (string?)null, expiryDate = (string?)null } },
            });
            Assert.Equal(HttpStatusCode.Created, createDeliveryResponse.StatusCode);
            using var deliveryJson = await JsonDocument.ParseAsync(await createDeliveryResponse.Content.ReadAsStreamAsync());
            var deliveryId = deliveryJson.RootElement.GetProperty("id").GetGuid();
            Assert.Equal(1, await seed.InventoryTransactions.CountAsync(x => x.TenantId == tenantId));

            using var postDeliveryResponse = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{deliveryId}/post", new { });
            Assert.True(postDeliveryResponse.StatusCode == HttpStatusCode.OK, await postDeliveryResponse.Content.ReadAsStringAsync());
            using var replayDeliveryResponse = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{deliveryId}/post", new { });
            Assert.Equal(HttpStatusCode.OK, replayDeliveryResponse.StatusCode);
            using var voidDeliveryResponse = await client.PostAsync($"/api/sales/standalone-deliveries/{deliveryId}/void", null);
            Assert.Equal(HttpStatusCode.OK, voidDeliveryResponse.StatusCode);

            using var createReceiptResponse = await client.PostAsJsonAsync("/api/purchasing/standalone-receipts", new
            {
                requestId = Guid.NewGuid(), code = "GR-SQL-001", supplierId = supplier.Id, warehouseId = warehouse.Id, receiptDate = "2026-10-29",
                lines = new[] { new { stockItemId = item.Id, quantity = 3m, unitCode = "EA", unitCostBase = 12.5m, trackingCode = (string?)null, expiryDate = (string?)null } },
            });
            Assert.Equal(HttpStatusCode.Created, createReceiptResponse.StatusCode);
            using var receiptJson = await JsonDocument.ParseAsync(await createReceiptResponse.Content.ReadAsStreamAsync());
            var receiptId = receiptJson.RootElement.GetProperty("id").GetGuid();
            Assert.Equal(3, await seed.InventoryTransactions.CountAsync(x => x.TenantId == tenantId));

            using var postReceiptResponse = await client.PostAsJsonAsync($"/api/purchasing/standalone-receipts/{receiptId}/post", new { });
            Assert.True(postReceiptResponse.StatusCode == HttpStatusCode.OK, await postReceiptResponse.Content.ReadAsStringAsync());
            using var replayReceiptResponse = await client.PostAsJsonAsync($"/api/purchasing/standalone-receipts/{receiptId}/post", new { });
            Assert.Equal(HttpStatusCode.OK, replayReceiptResponse.StatusCode);
            using var voidReceiptResponse = await client.PostAsync($"/api/purchasing/standalone-receipts/{receiptId}/void", null);
            Assert.Equal(HttpStatusCode.OK, voidReceiptResponse.StatusCode);

            await seed.Entry(tenant).ReloadAsync();
            var movements = await seed.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync();
            Assert.Equal(5, movements.Count);
            Assert.Contains(movements, x => x.Direction == InventoryDirection.Issue && x.StandaloneSalesDeliveryLineId != null && x.Quantity == 2m);
            Assert.Contains(movements, x => x.Direction == InventoryDirection.Receipt && x.ReversalOfId != null && x.Quantity == 2m);
            Assert.Contains(movements, x => x.Direction == InventoryDirection.Receipt && x.StandalonePurchaseReceiptLineId != null && x.Quantity == 3m && x.UnitCostBase == 12.5m);
            Assert.Contains(movements, x => x.Direction == InventoryDirection.Issue && x.ReversalOfId != null && x.Quantity == 3m);
            Assert.Equal(StandaloneInventoryDocumentStatus.Voided, await seed.StandaloneSalesDeliveries.Where(x => x.Id == deliveryId).Select(x => x.Status).SingleAsync());
            Assert.Equal(StandaloneInventoryDocumentStatus.Voided, await seed.StandalonePurchaseReceipts.Where(x => x.Id == receiptId).Select(x => x.Status).SingleAsync());

            await app.StopAsync();
        }
        finally
        {
            if (databaseCreated) await seed.Database.EnsureDeletedAsync();
            SqlConnection.ClearAllPools();
        }
    }

    private static string DatabaseConnection(string source, string name) => new SqlConnectionStringBuilder(source)
    {
        InitialCatalog = name, ConnectTimeout = 15, TrustServerCertificate = true,
    }.ConnectionString;

    private sealed class OrderlessSqlAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)
                || !Guid.TryParse(Request.Headers["X-Test-User"], out var userId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var claims = new[]
            {
                new Claim("tenant_id", tenantId.ToString("D")), new Claim("sub", userId.ToString("D")),
                new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin"),
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
