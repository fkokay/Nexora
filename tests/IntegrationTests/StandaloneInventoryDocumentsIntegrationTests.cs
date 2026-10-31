using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class StandaloneInventoryDocumentsIntegrationTests
{
    [Fact]
    public async Task Standalone_sales_delivery_is_draft_then_posts_and_voids_with_stock_reversal()
    {
        var tenantId = Guid.NewGuid(); var userId = Guid.NewGuid(); var tenant = new Tenant { Id = tenantId, Name = "Standalone sales test", Slug = $"standalone-sales-{tenantId:N}" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Main warehouse" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-1", Name = "Material", UnitCode = "EA", TrackingMode = InventoryTrackingMode.None };
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase($"standalone-sales-doc-{tenantId:N}").ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("standalone-test").AddScheme<AuthenticationSchemeOptions, StandaloneTestAuthHandler>("standalone-test", _ => { });
        builder.Services.AddAuthorization(); builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapStandaloneInventoryDocumentEndpoints(); await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.Add(tenant); db.CustomerAccounts.Add(customer); db.Warehouses.Add(warehouse); db.StockItems.Add(item);
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 10, 28),
                Direction = InventoryDirection.Receipt, Quantity = 5m, UnitCostBase = 10m, Description = "Opening test stock" });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D")); client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        var create = await client.PostAsJsonAsync("/api/sales/standalone-deliveries", new
        {
            requestId = Guid.NewGuid(), code = "SD-OPEN-1", customerId = customer.Id, warehouseId = warehouse.Id, deliveryDate = "2026-10-29",
            lines = new[] { new { stockItemId = item.Id, quantity = 2m, unitCode = "EA", trackingCode = (string?)null, expiryDate = (string?)null } }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); var body = await create.Content.ReadFromJsonAsync<JsonElement>(); var id = body.GetProperty("id").GetGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(1, await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(StandaloneInventoryDocumentStatus.Draft, await db.StandaloneSalesDeliveries.Where(x => x.Id == id).Select(x => x.Status).SingleAsync());
        }
        var post = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{id}/post", new { }); Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        var retry = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{id}/post", new { }); Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        var voided = await client.PostAsync($"/api/sales/standalone-deliveries/{id}/void", null); Assert.Equal(HttpStatusCode.OK, voided.StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); var movements = await db.InventoryTransactions.Where(x => x.TenantId == tenantId).ToListAsync();
            Assert.Equal(3, movements.Count); Assert.Single(movements, x => x.Direction == InventoryDirection.Issue && x.Quantity == 2m);
            Assert.Single(movements, x => x.Direction == InventoryDirection.Receipt && x.ReversalOfId is not null && x.Quantity == 2m);
            Assert.Equal(StandaloneInventoryDocumentStatus.Voided, await db.StandaloneSalesDeliveries.Where(x => x.Id == id).Select(x => x.Status).SingleAsync());
        }
        await app.StopAsync();
    }

    [Fact]
    public async Task Standalone_purchase_receipt_is_draft_then_posts_and_voids_with_reversal()
    {
        var tenantId = Guid.NewGuid(); var userId = Guid.NewGuid(); var tenant = new Tenant { Id = tenantId, Name = "Standalone test", Slug = $"standalone-{tenantId:N}" };
        var supplier = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "SUP-1", Name = "Supplier", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Main warehouse" };
        var location = new WarehouseLocation { TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "A-01", Name = "Shelf A-01" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-1", Name = "Material", UnitCode = "EA", TrackingMode = InventoryTrackingMode.Lot };
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase($"standalone-doc-{tenantId:N}").ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("standalone-test").AddScheme<AuthenticationSchemeOptions, StandaloneTestAuthHandler>("standalone-test", _ => { });
        builder.Services.AddAuthorization(); builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapStandaloneInventoryDocumentEndpoints(); await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.Add(tenant); db.CustomerAccounts.Add(supplier); db.Warehouses.Add(warehouse); db.WarehouseLocations.Add(location); db.StockItems.Add(item); await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D")); client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        var create = await client.PostAsJsonAsync("/api/purchasing/standalone-receipts", new
        {
            requestId = Guid.NewGuid(), code = "GR-OPEN-1", supplierId = supplier.Id, warehouseId = warehouse.Id, receiptDate = "2026-10-29",
            lines = new[] { new { stockItemId = item.Id, quantity = 2m, unitCode = "EA", unitCostBase = 12.5m, trackingCode = "LOT-2026-A", expiryDate = "2027-10-29", storageLocationId = location.Id } }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); var body = await create.Content.ReadFromJsonAsync<JsonElement>(); var id = body.GetProperty("id").GetGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(StandaloneInventoryDocumentStatus.Draft, await db.StandalonePurchaseReceipts.Where(x => x.Id == id).Select(x => x.Status).SingleAsync());
            Assert.Empty(await db.InventoryTransactions.Where(x => x.TenantId == tenantId).ToListAsync());
        }
        var details = await client.GetFromJsonAsync<JsonElement>($"/api/purchasing/standalone-receipts/{id}");
        var savedLine = details.GetProperty("lines")[0];
        Assert.Equal("LOT-2026-A", savedLine.GetProperty("trackingCode").GetString());
        Assert.Equal("2027-10-29", savedLine.GetProperty("expiryDate").GetString());
        Assert.Equal(location.Id, savedLine.GetProperty("storageLocationId").GetGuid());
        var update = await client.PutAsJsonAsync($"/api/purchasing/standalone-receipts/{id}", new
        {
            requestId = Guid.NewGuid(), code = "GR-OPEN-1-EDIT", supplierId = supplier.Id, warehouseId = warehouse.Id, receiptDate = "2026-10-30",
            lines = new[] { new { stockItemId = item.Id, quantity = 2m, unitCode = "EA", unitCostBase = 14m, trackingCode = "LOT-2026-B", expiryDate = "2027-11-30", storageLocationId = location.Id } }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await client.GetFromJsonAsync<JsonElement>($"/api/purchasing/standalone-receipts/{id}");
        Assert.Equal("GR-OPEN-1-EDIT", updated.GetProperty("code").GetString());
        Assert.Equal("LOT-2026-B", updated.GetProperty("lines")[0].GetProperty("trackingCode").GetString());
        var post = await client.PostAsJsonAsync($"/api/purchasing/standalone-receipts/{id}/post", new { });
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        var postedEdit = await client.PutAsJsonAsync($"/api/purchasing/standalone-receipts/{id}", new
        {
            requestId = Guid.NewGuid(), code = "GR-POSTED-EDIT", supplierId = supplier.Id, warehouseId = warehouse.Id, receiptDate = "2026-10-30",
            lines = new[] { new { stockItemId = item.Id, quantity = 2m, unitCode = "EA", unitCostBase = 14m, trackingCode = "LOT-2026-B", expiryDate = "2027-11-30", storageLocationId = location.Id } }
        });
        Assert.Equal(HttpStatusCode.Conflict, postedEdit.StatusCode);
        var retry = await client.PostAsJsonAsync($"/api/purchasing/standalone-receipts/{id}/post", new { }); Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); var movement = await db.InventoryTransactions.Include(x => x.Tracking).SingleAsync(x => x.TenantId == tenantId);
            Assert.Equal(InventoryDirection.Receipt, movement.Direction); Assert.Equal(2m, movement.Quantity); Assert.Equal(14m, movement.UnitCostBase); Assert.Equal(location.Id, movement.StorageLocationId);
            var trace = Assert.Single(movement.Tracking); Assert.Equal("LOT-2026-B", trace.TrackingCode); Assert.Equal(new DateOnly(2027, 11, 30), trace.ExpiryDate);
        }
        var voided = await client.PostAsync($"/api/purchasing/standalone-receipts/{id}/void", null); Assert.Equal(HttpStatusCode.OK, voided.StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); var movements = await db.InventoryTransactions.Include(x => x.Tracking).Where(x => x.TenantId == tenantId).OrderBy(x => x.Direction).ToListAsync();
            Assert.Equal(2, movements.Count); Assert.Contains(movements, x => x.Direction == InventoryDirection.Issue && x.ReversalOfId == movements.Single(m => m.Direction == InventoryDirection.Receipt).Id);
            Assert.All(movements, x => { Assert.Equal("LOT-2026-B", Assert.Single(x.Tracking).TrackingCode); Assert.Equal(location.Id, x.StorageLocationId); });
            Assert.Equal(StandaloneInventoryDocumentStatus.Voided, await db.StandalonePurchaseReceipts.Where(x => x.Id == id).Select(x => x.Status).SingleAsync());
        }
        await app.StopAsync();
    }

    private sealed class StandaloneTestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)) return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Request.Headers.TryGetValue("X-Test-User", out var value) && Guid.TryParse(value, out var parsed) ? parsed : Guid.Empty;
            var identity = new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString()), new Claim("sub", userId.ToString()), new Claim("role", "TenantAdmin")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
