using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
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

public sealed class PurchaseInvoiceEntryIntegrationTests
{
    [Fact]
    public async Task Entry_receipts_are_tenant_scoped_posted_and_not_previously_invoiced()
    {
        var tenantId = Guid.NewGuid(); var otherTenantId = Guid.NewGuid(); var dbName = $"purchase-invoice-entry-{Guid.NewGuid():N}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{dbName}-platform"));
        builder.Services.AddScoped<AIERP.Platform.Application.IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddAuthentication("purchase-entry-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("purchase-entry-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapPurchaseInvoiceEntryEndpoints(); await app.StartAsync();

        var tenant = new Tenant { Id = tenantId, Name = "Tenant A", Slug = $"tenant-a-{tenantId:N}" };
        var otherTenant = new Tenant { Id = otherTenantId, Name = "Tenant B", Slug = $"tenant-b-{otherTenantId:N}" };
        var supplierA = Supplier(tenantId, tenant, "SUP-A"); var supplierB = Supplier(otherTenantId, otherTenant, "SUP-B");
        var itemA = Stock(tenantId, tenant, "SKU-A"); var itemB = Stock(otherTenantId, otherTenant, "SKU-B");
        var warehouseA = WarehouseFor(tenantId, tenant, "WH-A"); var warehouseB = WarehouseFor(otherTenantId, otherTenant, "WH-B");
        var visibleOrder = PurchaseOrderFor(tenantId, tenant, supplierA, itemA, "PO-A");
        var foreignOrder = PurchaseOrderFor(otherTenantId, otherTenant, supplierB, itemB, "PO-B");
        var available = Receipt(tenantId, tenant, visibleOrder, warehouseA, "GR-AVAILABLE", today, itemA);
        var invoiced = Receipt(tenantId, tenant, visibleOrder, warehouseA, "GR-INVOICED", today.AddDays(-1), itemA);
        var voided = Receipt(tenantId, tenant, visibleOrder, warehouseA, "GR-VOIDED", today.AddDays(-2), itemA, PurchaseReceiptStatus.Voided);
        var foreign = Receipt(otherTenantId, otherTenant, foreignOrder, warehouseB, "GR-FOREIGN", today, itemB);
        var invoice = new PurchaseInvoice { TenantId = tenantId, Tenant = tenant, PurchaseReceiptId = invoiced.Id, PurchaseReceipt = invoiced,
            PurchaseOrderId = visibleOrder.Id, PurchaseOrder = visibleOrder, SupplierId = supplierA.Id, Supplier = supplierA,
            Code = "PI-EXISTING", InvoiceDate = today, DueDate = today.AddDays(30), CurrencyCode = "TRY", GrandTotal = 10m };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant); db.CustomerAccounts.AddRange(supplierA, supplierB); db.StockItems.AddRange(itemA, itemB);
            db.Warehouses.AddRange(warehouseA, warehouseB); db.PurchaseOrders.AddRange(visibleOrder, foreignOrder);
            db.PurchaseReceipts.AddRange(available, invoiced, voided, foreign); db.PurchaseInvoices.Add(invoice);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        using var response = await client.GetAsync("/api/purchasing/invoices/entry/receipts?page=1&pageSize=25");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, body.RootElement.GetProperty("totalCount").GetInt32());
        var row = Assert.Single(body.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(available.Id, row.GetProperty("id").GetGuid());
        Assert.Equal("GR-AVAILABLE", row.GetProperty("receiptCode").GetString());
        Assert.Equal(supplierA.Id, row.GetProperty("supplierId").GetGuid());

        using var badSearch = await client.GetAsync("/api/purchasing/invoices/entry/receipts?q=" + new string('x', 121));
        Assert.Equal(HttpStatusCode.BadRequest, badSearch.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope(); var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await verifyDb.PurchaseInvoices.CountAsync());
        Assert.Equal(4, await verifyDb.PurchaseReceipts.CountAsync());
    }

    private static CustomerAccount Supplier(Guid tenantId, Tenant tenant, string code) => new()
    {
        TenantId = tenantId, Tenant = tenant, Code = code, Name = code, Type = CounterpartyType.Supplier, CurrencyCode = "TRY"
    };

    private static StockItem Stock(Guid tenantId, Tenant tenant, string code) => new()
    {
        TenantId = tenantId, Tenant = tenant, Code = code, Name = code, UnitCode = "EA", IsActive = true
    };

    private static Warehouse WarehouseFor(Guid tenantId, Tenant tenant, string code) => new()
    {
        TenantId = tenantId, Tenant = tenant, Code = code, Name = code, IsActive = true
    };

    private static PurchaseOrder PurchaseOrderFor(Guid tenantId, Tenant tenant, CustomerAccount supplier, StockItem item, string code)
    {
        var order = new PurchaseOrder { TenantId = tenantId, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
            Code = code, OrderDate = new DateOnly(2026, 10, 1), CurrencyCode = "TRY", Status = PurchaseOrderStatus.Open, GrandTotal = 10m };
        order.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrder = order, PurchaseOrderId = order.Id, LineNumber = 1,
            StockItem = item, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 2m, UnitPrice = 5m, LineSubtotal = 10m, LineTotal = 10m });
        return order;
    }

    private static PurchaseReceipt Receipt(Guid tenantId, Tenant tenant, PurchaseOrder order, Warehouse warehouse, string code,
        DateOnly date, StockItem item, PurchaseReceiptStatus status = PurchaseReceiptStatus.Posted)
    {
        var line = order.Lines.Single();
        var receipt = new PurchaseReceipt { TenantId = tenantId, Tenant = tenant, PurchaseOrder = order, PurchaseOrderId = order.Id,
            Warehouse = warehouse, WarehouseId = warehouse.Id, RequestId = Guid.NewGuid(), Code = code, ReceiptDate = date, Status = status };
        receipt.Lines.Add(new PurchaseReceiptLine { TenantId = tenantId, Receipt = receipt, PurchaseOrderId = order.Id,
            OrderLineNumber = line.LineNumber, OrderLine = line, StockItemId = item.Id, StockCode = item.Code,
            StockName = item.Name, UnitCode = item.UnitCode, Quantity = 2m });
        return receipt;
    }
}
