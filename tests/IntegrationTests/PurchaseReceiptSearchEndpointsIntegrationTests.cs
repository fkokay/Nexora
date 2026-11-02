using System.Net;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class PurchaseReceiptSearchEndpointsIntegrationTests
{
    [Fact]
    public async Task Search_requires_authentication_is_tenant_scoped_and_returns_only_first_ten_sanitized_rows()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var databaseName = $"purchase-receipt-search-{Guid.NewGuid():N}";
        var today = new DateOnly(2026, 10, 25);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("receipt-search-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("receipt-search-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPurchaseReceiptSearchEndpoints();
        await app.StartAsync();

        var tenantA = new Tenant { Id = tenantAId, Name = "Tenant A", Slug = $"tenant-a-{tenantAId:N}" };
        var tenantB = new Tenant { Id = tenantBId, Name = "Tenant B", Slug = $"tenant-b-{tenantBId:N}" };
        var supplierA = new CustomerAccount { TenantId = tenantAId, Tenant = tenantA, Code = "SUP-A", Name = "Supplier A", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var supplierB = new CustomerAccount { TenantId = tenantBId, Tenant = tenantB, Code = "SUP-B", Name = "Supplier B", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var warehouseA = new Warehouse { TenantId = tenantAId, Tenant = tenantA, Code = "W-A", Name = "Warehouse A" };
        var warehouseB = new Warehouse { TenantId = tenantBId, Tenant = tenantB, Code = "W-B", Name = "Warehouse B" };
        var orderA = new PurchaseOrder { TenantId = tenantAId, Tenant = tenantA, SupplierId = supplierA.Id, Supplier = supplierA, Code = "PO-RECEIPT-SEARCH-A", OrderDate = today };
        var orderB = new PurchaseOrder { TenantId = tenantBId, Tenant = tenantB, SupplierId = supplierB.Id, Supplier = supplierB, Code = "PO-RECEIPT-SEARCH-B", OrderDate = today };
        var receipts = Enumerable.Range(1, 12).Select(index => new PurchaseReceipt
        {
            TenantId = tenantAId, Tenant = tenantA, RequestId = Guid.NewGuid(), PurchaseOrderId = orderA.Id, PurchaseOrder = orderA,
            WarehouseId = warehouseA.Id, Warehouse = warehouseA, Code = $"GR-SEARCH-{index:000}", ReceiptDate = today,
            CreatedAt = DateTimeOffset.Parse("2026-10-25T10:00:00Z")
        }).ToArray();
        var otherTenantReceipt = new PurchaseReceipt
        {
            TenantId = tenantBId, Tenant = tenantB, RequestId = Guid.NewGuid(), PurchaseOrderId = orderB.Id, PurchaseOrder = orderB,
            WarehouseId = warehouseB.Id, Warehouse = warehouseB, Code = "GR-SEARCH-999", ReceiptDate = today
        };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.CustomerAccounts.AddRange(supplierA, supplierB);
            db.Warehouses.AddRange(warehouseA, warehouseB);
            db.PurchaseOrders.AddRange(orderA, orderB);
            db.PurchaseReceipts.AddRange(receipts);
            db.PurchaseReceipts.Add(otherTenantReceipt);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/purchasing/receipts/search?q=GR-SEARCH")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString());
        var response = await client.GetAsync("/api/purchasing/receipts/search?q=gr-search");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using (var search = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
        {
            Assert.Equal(12, search.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Equal(10, search.RootElement.GetProperty("returned").GetInt32());
            Assert.True(search.RootElement.GetProperty("hasMore").GetBoolean());
            Assert.Equal(10, search.RootElement.GetProperty("items").GetArrayLength());
            var first = search.RootElement.GetProperty("items")[0];
            Assert.Equal("GR-SEARCH-001", first.GetProperty("code").GetString());
            Assert.False(first.TryGetProperty("id", out _));
            Assert.False(first.TryGetProperty("warehouseId", out _));
            Assert.False(first.TryGetProperty("supplierName", out _));
        }

        using var orderSearch = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/receipts/search?q=PO-RECEIPT-SEARCH")).Content.ReadAsStringAsync());
        Assert.Equal(12, orderSearch.RootElement.GetProperty("totalCount").GetInt32());
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString());
        using var otherTenantSearch = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/receipts/search?q=GR-SEARCH")).Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenantSearch.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("GR-SEARCH-999", otherTenantSearch.RootElement.GetProperty("items")[0].GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/purchasing/receipts/search?q=x")).StatusCode);
    }
}
