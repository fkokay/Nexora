using System.Net;
using System.Text.Json;
using AIERP.Api;
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

public sealed class PurchaseDeliveryNoteSearchEndpointsIntegrationTests
{
    [Fact]
    public async Task Search_requires_authentication_is_tenant_scoped_and_returns_only_first_ten_minimal_rows()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var databaseName = $"purchase-delivery-note-search-{Guid.NewGuid():N}";
        var today = new DateOnly(2026, 10, 25);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"platform-{databaseName}"));
        builder.Services.AddAuthentication("delivery-note-search-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("delivery-note-search-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPurchaseDeliveryNoteEndpoints();
        await app.StartAsync();

        var tenantA = new Tenant { Id = tenantAId, Name = "Tenant A", Slug = $"tenant-a-{tenantAId:N}" };
        var tenantB = new Tenant { Id = tenantBId, Name = "Tenant B", Slug = $"tenant-b-{tenantBId:N}" };
        var supplierA = new CustomerAccount { TenantId = tenantAId, Tenant = tenantA, Code = "SUP-A", Name = "Private supplier A", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var supplierB = new CustomerAccount { TenantId = tenantBId, Tenant = tenantB, Code = "SUP-B", Name = "Private supplier B", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var orderA = new PurchaseOrder { TenantId = tenantAId, Tenant = tenantA, SupplierId = supplierA.Id, Supplier = supplierA, Code = "PO-NOTE-SEARCH-A", OrderDate = today };
        var orderB = new PurchaseOrder { TenantId = tenantBId, Tenant = tenantB, SupplierId = supplierB.Id, Supplier = supplierB, Code = "PO-NOTE-SEARCH-B", OrderDate = today };
        var notes = Enumerable.Range(1, 12).Select(index => new PurchaseDeliveryNote
        {
            TenantId = tenantAId, PurchaseOrderId = orderA.Id, PurchaseOrder = orderA,
            DocumentNumber = $"SDN-SEARCH-{index:000}", DocumentDate = today,
            CreatedAt = DateTimeOffset.Parse("2026-10-25T10:00:00Z"),
            Lines = [new PurchaseDeliveryNoteLine { TenantId = tenantAId, PurchaseOrderId = orderA.Id, OrderLineNumber = 1, Quantity = index, UnitCode = "EA" }]
        }).ToArray();
        var otherTenantNote = new PurchaseDeliveryNote
        {
            TenantId = tenantBId, PurchaseOrderId = orderB.Id, PurchaseOrder = orderB,
            DocumentNumber = "SDN-SEARCH-999", DocumentDate = today
        };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.CustomerAccounts.AddRange(supplierA, supplierB);
            db.PurchaseOrders.AddRange(orderA, orderB);
            db.PurchaseDeliveryNotes.AddRange(notes);
            db.PurchaseDeliveryNotes.Add(otherTenantNote);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/purchasing/delivery-notes/search?q=SDN-SEARCH")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString());
        var response = await client.GetAsync("/api/purchasing/delivery-notes/search?q=sdn-search");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using (var search = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
        {
            Assert.Equal(12, search.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Equal(10, search.RootElement.GetProperty("returned").GetInt32());
            Assert.True(search.RootElement.GetProperty("hasMore").GetBoolean());
            Assert.Equal(10, search.RootElement.GetProperty("items").GetArrayLength());
            var first = search.RootElement.GetProperty("items")[0];
            Assert.Equal("SDN-SEARCH-001", first.GetProperty("documentNumber").GetString());
            Assert.Equal("PO-NOTE-SEARCH-A", first.GetProperty("purchaseOrderCode").GetString());
            Assert.Equal(1, first.GetProperty("lineCount").GetInt32());
            Assert.False(first.GetProperty("linkedToReceipt").GetBoolean());
            Assert.False(first.TryGetProperty("id", out _));
            Assert.False(first.TryGetProperty("supplierName", out _));
            Assert.False(first.TryGetProperty("supplierId", out _));
        }

        using var orderSearch = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/delivery-notes/search?q=PO-NOTE-SEARCH")).Content.ReadAsStringAsync());
        Assert.Equal(12, orderSearch.RootElement.GetProperty("totalCount").GetInt32());
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString());
        using var otherTenantSearch = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/delivery-notes/search?q=SDN-SEARCH")).Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenantSearch.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("SDN-SEARCH-999", otherTenantSearch.RootElement.GetProperty("items")[0].GetProperty("documentNumber").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/purchasing/delivery-notes/search?q=x")).StatusCode);
    }
}
