using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
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

public sealed class ErpDashboardSummaryIntegrationTests
{
    [Fact]
    public async Task Summary_aggregates_tenant_data_by_currency_and_caps_recent_orders()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var databaseName = $"erp-dashboard-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantId, Name = "Dashboard Tenant", Slug = $"dashboard-{tenantId:N}", BaseCurrencyCode = "TRY" };
        var otherTenant = new Tenant { Id = otherTenantId, Name = "Other Tenant", Slug = $"dashboard-other-{otherTenantId:N}" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "C-1", Name = "Synthetic customer", Type = CounterpartyType.Customer };
        var supplier = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "S-1", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "WH-1", Name = "Main", IsActive = true };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "ITEM-1", Name = "Synthetic stock", IsActive = true };
        var now = DateOnly.FromDateTime(DateTime.UtcNow);
        var orders = Enumerable.Range(1, 7).Select(index => new SalesOrder
        {
            TenantId = tenantId, Tenant = tenant, QuoteId = Guid.NewGuid(), CustomerId = customer.Id, Customer = customer,
            Code = $"SO-{index:D2}", OrderDate = now.AddDays(-index), Status = SalesOrderStatus.Open,
            GrandTotal = index * 100m, CurrencyCode = index % 2 == 0 ? "USD" : "TRY"
        }).ToArray();
        var salesInvoices = new[]
        {
            new SalesInvoice { TenantId = tenantId, Tenant = tenant, DeliveryId = Guid.NewGuid(), OrderId = orders[0].Id, CustomerId = customer.Id, Customer = customer, Code = "SI-TRY", InvoiceDate = now, CurrencyCode = "TRY", GrandTotal = 1200m, Status = SalesInvoiceStatus.Posted },
            new SalesInvoice { TenantId = tenantId, Tenant = tenant, DeliveryId = Guid.NewGuid(), OrderId = orders[1].Id, CustomerId = customer.Id, Customer = customer, Code = "SI-USD", InvoiceDate = now, CurrencyCode = "USD", GrandTotal = 90m, Status = SalesInvoiceStatus.Posted },
            new SalesInvoice { TenantId = otherTenantId, CustomerId = Guid.NewGuid(), Code = "SI-OTHER", InvoiceDate = now, CurrencyCode = "TRY", GrandTotal = 999999m, Status = SalesInvoiceStatus.Posted }
        };
        var openPurchase = new PurchaseOrder { TenantId = tenantId, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-EUR", OrderDate = now, CurrencyCode = "EUR", GrandTotal = 50m, Status = PurchaseOrderStatus.Open };
        var receipt = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = now, Direction = InventoryDirection.Receipt, Quantity = 10m, UnitCostBase = 4m };
        var issue = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = now, Direction = InventoryDirection.Issue, Quantity = 2m, UnitCostBase = 4m };
        var adjustment = new InventoryCostAdjustmentLine { TenantId = tenantId, AdjustmentId = Guid.NewGuid(), WarehouseId = warehouse.Id, StockItemId = item.Id, QuantitySnapshot = 8m, AmountBase = 5m };

        var app = await CreateApp(databaseName, tenantId, tenant, otherTenant);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant);
            db.CustomerAccounts.AddRange(customer, supplier);
            db.SalesOrders.AddRange(orders);
            db.SalesInvoices.AddRange(salesInvoices);
            db.PurchaseOrders.Add(openPurchase);
            db.Warehouses.Add(warehouse);
            db.StockItems.Add(item);
            db.InventoryTransactions.AddRange(receipt, issue,
                new InventoryTransaction { TenantId = otherTenantId, WarehouseId = Guid.NewGuid(), StockItemId = Guid.NewGuid(), EntryDate = now, Direction = InventoryDirection.Receipt, Quantity = 100m, UnitCostBase = 999m });
            db.InventoryCostAdjustmentLines.Add(adjustment);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        var result = await client.GetAsync("/api/dashboard/erp-summary");
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var summary = await result.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("TRY", summary.GetProperty("baseCurrencyCode").GetString());
        Assert.Equal(5, summary.GetProperty("recentOpenSalesOrders").GetArrayLength());
        Assert.Equal(7, summary.GetProperty("openSalesOrderCount").GetInt32());
        Assert.Equal(2, summary.GetProperty("salesInvoiceTotals").GetArrayLength());
        var tryTotal = summary.GetProperty("salesInvoiceTotals").EnumerateArray().Single(x => x.GetProperty("currencyCode").GetString() == "TRY");
        Assert.Equal(1200m, tryTotal.GetProperty("amount").GetDecimal());
        Assert.Equal(1, summary.GetProperty("openPurchaseOrderCount").GetInt32());
        Assert.Equal("EUR", summary.GetProperty("openPurchaseOrderTotals")[0].GetProperty("currencyCode").GetString());
        Assert.Equal(1, summary.GetProperty("activeStockItemCount").GetInt32());
        Assert.Equal(1, summary.GetProperty("activeWarehouseCount").GetInt32());
        Assert.Equal(37m, summary.GetProperty("inventoryValueBase").GetDecimal());
        Assert.DoesNotContain(summary.GetProperty("recentOpenSalesOrders").EnumerateArray(), x => x.GetProperty("customerName").GetString() == "Other tenant");
        await app.DisposeAsync();
    }

    [Fact]
    public async Task Summary_hides_inventory_aggregates_when_stock_rows_are_scoped()
    {
        var tenantId = Guid.NewGuid();
        var databaseName = $"erp-dashboard-scope-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantId, Name = "Scoped dashboard", Slug = $"dashboard-scope-{tenantId:N}" };
        var app = await CreateApp(databaseName, tenantId, tenant);
        var userId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var allowedCustomerId = Guid.NewGuid();
        var deniedCustomerId = Guid.NewGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.Add(tenant);
            var allowedCustomer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Id = allowedCustomerId, Code = "C-ALLOW", Name = "Allowed customer", Type = CounterpartyType.Customer };
            var deniedCustomer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Id = deniedCustomerId, Code = "C-DENY", Name = "Hidden customer", Type = CounterpartyType.Customer };
            db.CustomerAccounts.AddRange(allowedCustomer, deniedCustomer);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            db.SalesInvoices.AddRange(
                new SalesInvoice { TenantId = tenantId, Tenant = tenant, DeliveryId = Guid.NewGuid(), OrderId = Guid.NewGuid(), CustomerId = allowedCustomerId, Customer = allowedCustomer, Code = "SI-ALLOWED", InvoiceDate = today, CurrencyCode = "TRY", GrandTotal = 100m, Status = SalesInvoiceStatus.Posted },
                new SalesInvoice { TenantId = tenantId, Tenant = tenant, DeliveryId = Guid.NewGuid(), OrderId = Guid.NewGuid(), CustomerId = deniedCustomerId, Customer = deniedCustomer, Code = "SI-HIDDEN", InvoiceDate = today, CurrencyCode = "TRY", GrandTotal = 999m, Status = SalesInvoiceStatus.Posted });
            await db.SaveChangesAsync();
            var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var platformTenant = await platformDb.Tenants.SingleAsync(x => x.Id == tenantId);
            var user = new AppUser { Id = userId, Email = "scoped@example.invalid", DisplayName = "Scoped user", IsActive = true };
            platformDb.Users.Add(user);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Tenant = platformTenant, User = user, Role = "TenantUser" });
            foreach (var code in new[] { "erp.dashboard.read", "erp.sales-orders.read", "erp.sales-invoices.read", "erp.purchase-orders.read", "erp.purchase-invoices.read", "erp.warehouses.read", "erp.stock-items.read" })
            {
                var definition = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code);
                if (code != "erp.sales-invoices.read")
                    platformDb.TenantPermissionRules.Add(new TenantPermissionRule { TenantId = tenantId, SubjectRole = "TenantUser", PermissionCode = code,
                        ResourceType = definition.ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true });
            }
            platformDb.TenantPermissionRules.Add(new TenantPermissionRule { TenantId = tenantId, SubjectRole = "TenantUser",
                PermissionCode = "erp.stock-items.read", ResourceType = "erp.stock-items", Effect = TenantPermissionEffect.Deny,
                AttributeName = "resource.ownerUserId", AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = Guid.NewGuid().ToString("D"), IsActive = true });
            platformDb.TenantPermissionRules.Add(new TenantPermissionRule { TenantId = tenantId, SubjectRole = "TenantUser",
                PermissionCode = "erp.sales-invoices.read", ResourceType = "erp.sales-invoices", Effect = TenantPermissionEffect.Allow,
                AttributeName = "resource.customerId", AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = allowedCustomerId.ToString("D"), IsActive = true });
            await platformDb.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var response = await client.GetAsync("/api/dashboard/erp-summary");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(summary.GetProperty("canReadInventory").GetBoolean());
        Assert.Equal(JsonValueKind.Null, summary.GetProperty("inventoryValueBase").ValueKind);
        Assert.Equal(JsonValueKind.Null, summary.GetProperty("activeStockItemCount").ValueKind);
        var salesTotals = summary.GetProperty("salesInvoiceTotals").EnumerateArray().ToArray();
        Assert.Single(salesTotals);
        Assert.Equal(100m, salesTotals[0].GetProperty("amount").GetDecimal());
        await app.DisposeAsync();
    }

    [Fact]
    public async Task Summary_uses_platform_default_currency_when_legacy_tenant_catalogue_row_is_missing()
    {
        var tenantId = Guid.NewGuid();
        var tenant = new Tenant { Id = tenantId, Name = "Legacy dashboard", Slug = $"dashboard-legacy-{tenantId:N}", BaseCurrencyCode = "USD" };
        var app = await CreateApp($"erp-dashboard-legacy-{Guid.NewGuid():N}", tenantId, tenant);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        var response = await client.GetAsync("/api/dashboard/erp-summary");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("USD", summary.GetProperty("baseCurrencyCode").GetString());
        await app.DisposeAsync();
    }

    private static async Task<WebApplication> CreateApp(string databaseName, Guid tenantId, Tenant tenant, Tenant? otherTenant = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddScoped<IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddAuthentication("dashboard-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("dashboard-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapErpDashboardSummaryEndpoints();
        await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var platformTenant = new Tenant { Id = tenantId, Name = tenant.Name, Slug = tenant.Slug,
                BaseCurrencyCode = tenant.BaseCurrencyCode, IsActive = true };
            platformDb.Tenants.Add(platformTenant);
            if (otherTenant is not null) platformDb.Tenants.Add(new Tenant { Id = otherTenant.Id, Name = otherTenant.Name, Slug = otherTenant.Slug, IsActive = true });
            var admin = new AppUser { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), Email = "admin@example.invalid", DisplayName = "Admin", IsActive = true };
            platformDb.Users.Add(admin);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = admin.Id, Tenant = platformTenant, User = admin, Role = "TenantAdmin" });
            await platformDb.SaveChangesAsync();
        }
        return app;
    }
}
