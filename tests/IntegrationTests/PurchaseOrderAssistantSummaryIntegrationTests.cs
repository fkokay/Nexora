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

public sealed class PurchaseOrderAssistantSummaryIntegrationTests
{
    [Fact]
    public async Task Exact_order_summary_requires_auth_scopes_tenant_caps_lines_and_omits_private_fields()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var databaseName = $"purchase-order-assistant-summary-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"platform-{databaseName}"));
        builder.Services.AddAuthentication("purchase-order-summary-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("purchase-order-summary-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/purchasing/orders").MapPurchaseOrderAssistantSummaryEndpoint();
        await app.StartAsync();

        var tenantA = new Tenant { Id = tenantAId, Name = "Tenant A", Slug = $"po-a-{tenantAId:N}" };
        var tenantB = new Tenant { Id = tenantBId, Name = "Tenant B", Slug = $"po-b-{tenantBId:N}" };
        var supplierA = new CustomerAccount { TenantId = tenantAId, Tenant = tenantA, Code = "SUP-A", Name = "Private supplier A", Type = CounterpartyType.Supplier };
        var supplierB = new CustomerAccount { TenantId = tenantBId, Tenant = tenantB, Code = "SUP-B", Name = "Private supplier B", Type = CounterpartyType.Supplier };
        var orderA = new PurchaseOrder { TenantId = tenantAId, Tenant = tenantA, SupplierId = supplierA.Id, Supplier = supplierA, Code = "PO-ASSIST-01", OrderDate = new DateOnly(2026, 10, 25), GrandTotal = 1200m, Notes = "private order notes" };
        var orderB = new PurchaseOrder { TenantId = tenantBId, Tenant = tenantB, SupplierId = supplierB.Id, Supplier = supplierB, Code = "PO-ASSIST-01", OrderDate = new DateOnly(2026, 10, 25), GrandTotal = 9999m };
        var linesA = Enumerable.Range(1, 51).Select(index => new PurchaseOrderLine
        {
            TenantId = tenantAId, PurchaseOrderId = orderA.Id, LineNumber = index, StockItemId = Guid.NewGuid(),
            StockCode = $"ITEM-{index:000}", StockName = "Synthetic item", UnitCode = "EA", Quantity = 10m,
            UnitPrice = 100m, VatPercent = 20m, LineSubtotal = 1000m, TaxAmount = 200m, LineTotal = 1200m
        }).ToArray();
        var linesB = new[]
        {
            new PurchaseOrderLine { TenantId = tenantBId, PurchaseOrderId = orderB.Id, LineNumber = 1, StockItemId = Guid.NewGuid(),
                StockCode = "TENANT-B-ITEM", StockName = "Tenant B item", UnitCode = "EA", Quantity = 1m, UnitPrice = 9999m,
                LineSubtotal = 9999m, LineTotal = 9999m }
        };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.CustomerAccounts.AddRange(supplierA, supplierB);
            db.PurchaseOrders.AddRange(orderA, orderB);
            db.PurchaseOrderLines.AddRange(linesA);
            db.PurchaseOrderLines.AddRange(linesB);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/purchasing/orders/assistant-summary?code=PO-ASSIST-01")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString("D"));
        using var response = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/orders/assistant-summary?code=PO-ASSIST-01")).Content.ReadAsStringAsync());
        var summary = response.RootElement;
        Assert.Equal(1200m, summary.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(51, summary.GetProperty("lineCount").GetInt32());
        Assert.Equal(50, summary.GetProperty("returnedLines").GetInt32());
        Assert.True(summary.GetProperty("hasMoreLines").GetBoolean());
        Assert.Equal("ITEM-001", summary.GetProperty("lines")[0].GetProperty("stockCode").GetString());
        var json = response.RootElement.GetRawText();
        Assert.DoesNotContain("supplier", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private order notes", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("supplierId", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("stockItemId", json, StringComparison.OrdinalIgnoreCase);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString("D"));
        using var otherTenant = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/orders/assistant-summary?code=PO-ASSIST-01")).Content.ReadAsStringAsync());
        Assert.Equal(9999m, otherTenant.RootElement.GetProperty("grandTotal").GetDecimal());
        Assert.Equal("TENANT-B-ITEM", otherTenant.RootElement.GetProperty("lines")[0].GetProperty("stockCode").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/purchasing/orders/assistant-summary?code=PO-NOT-FOUND")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/purchasing/orders/assistant-summary?code=x")).StatusCode);
    }
}
