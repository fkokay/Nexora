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

public sealed class ForeignTradeEndpointsIntegrationTests
{
    [Fact]
    public async Task Import_case_lifecycle_is_tenant_scoped_validated_audited_and_locked_after_shipment()
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var databaseName = $"foreign-trade-{Guid.NewGuid():N}";
        var platformDatabaseName = $"{databaseName}-platform";
        var tenant = new Tenant { Id = tenantA, Name = "Trade test A", Slug = $"trade-a-{tenantA:N}" };
        var otherTenant = new Tenant { Id = tenantB, Name = "Trade test B", Slug = $"trade-b-{tenantB:N}" };
        var supplier = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "SUP-1", Name = "Synthetic supplier", Type = CounterpartyType.Supplier, CurrencyCode = "EUR" };
        var order = new PurchaseOrder { TenantId = tenantA, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-TRADE-1", OrderDate = new DateOnly(2026, 10, 1), CurrencyCode = "EUR", GrandTotal = 1250m, Status = PurchaseOrderStatus.Open };
        var warehouse = new Warehouse { TenantId = tenantA, Tenant = tenant, Code = "WH-TRADE", Name = "Trade warehouse" };
        var stockItem = new StockItem { TenantId = tenantA, Tenant = tenant, Code = "TRADE-ITEM", Name = "Trade item" };
        var orderLine = new PurchaseOrderLine { TenantId = tenantA, PurchaseOrderId = order.Id, PurchaseOrder = order, LineNumber = 1, StockItemId = stockItem.Id, StockItem = stockItem, StockCode = stockItem.Code, StockName = stockItem.Name, UnitCode = "EA", Quantity = 1m, UnitPrice = 1250m, LineSubtotal = 1250m, LineTotal = 1250m };
        order.Lines.Add(orderLine);
        var receipt = new PurchaseReceipt { TenantId = tenantA, Tenant = tenant, PurchaseOrderId = order.Id, PurchaseOrder = order, WarehouseId = warehouse.Id, Warehouse = warehouse, RequestId = Guid.NewGuid(), Code = "GR-TRADE-1", ReceiptDate = new DateOnly(2026, 10, 15), Status = PurchaseReceiptStatus.Posted };
        var receiptLine = new PurchaseReceiptLine { TenantId = tenantA, ReceiptId = receipt.Id, Receipt = receipt, PurchaseOrderId = order.Id, OrderLineNumber = 1, OrderLine = orderLine, StockItemId = stockItem.Id, StockCode = stockItem.Code, StockName = stockItem.Name, UnitCode = "EA", Quantity = 1m };
        receipt.Lines.Add(receiptLine);
        var receiptMovement = new InventoryTransaction { TenantId = tenantA, WarehouseId = warehouse.Id, Warehouse = warehouse, StockItemId = stockItem.Id, StockItem = stockItem, PurchaseReceiptLineId = receiptLine.Id, PurchaseReceiptLine = receiptLine, EntryDate = new DateOnly(2026, 10, 15), Direction = InventoryDirection.Receipt, Quantity = 1m, Description = "Posted purchase receipt" };
        receiptLine.InventoryTransactions.Add(receiptMovement);
        var otherSupplier = new CustomerAccount { TenantId = tenantB, Tenant = otherTenant, Code = "SUP-B", Name = "Tenant B supplier", Type = CounterpartyType.Supplier, CurrencyCode = "EUR" };
        var otherOrder = new PurchaseOrder { TenantId = tenantB, Tenant = otherTenant, SupplierId = otherSupplier.Id, Supplier = otherSupplier, Code = "PO-TRADE-B", OrderDate = new DateOnly(2026, 10, 1), CurrencyCode = "EUR", GrandTotal = 50m, Status = PurchaseOrderStatus.Open };
        var otherWarehouse = new Warehouse { TenantId = tenantB, Tenant = otherTenant, Code = "WH-B", Name = "Tenant B warehouse" };
        var otherStockItem = new StockItem { TenantId = tenantB, Tenant = otherTenant, Code = "ITEM-B", Name = "Tenant B item" };
        var otherOrderLine = new PurchaseOrderLine { TenantId = tenantB, PurchaseOrderId = otherOrder.Id, PurchaseOrder = otherOrder, LineNumber = 1, StockItemId = otherStockItem.Id, StockItem = otherStockItem, StockCode = otherStockItem.Code, StockName = otherStockItem.Name, UnitCode = "EA", Quantity = 1m, UnitPrice = 50m, LineSubtotal = 50m, LineTotal = 50m };
        otherOrder.Lines.Add(otherOrderLine);
        var otherReceipt = new PurchaseReceipt { TenantId = tenantB, Tenant = otherTenant, PurchaseOrderId = otherOrder.Id, PurchaseOrder = otherOrder, WarehouseId = otherWarehouse.Id, Warehouse = otherWarehouse, RequestId = Guid.NewGuid(), Code = "GR-TRADE-B", ReceiptDate = new DateOnly(2026, 10, 15), Status = PurchaseReceiptStatus.Posted };
        var otherReceiptLine = new PurchaseReceiptLine { TenantId = tenantB, ReceiptId = otherReceipt.Id, Receipt = otherReceipt, PurchaseOrderId = otherOrder.Id, OrderLineNumber = 1, OrderLine = otherOrderLine, StockItemId = otherStockItem.Id, StockCode = otherStockItem.Code, StockName = otherStockItem.Name, UnitCode = "EA", Quantity = 1m };
        otherReceipt.Lines.Add(otherReceiptLine);
        var otherReceiptMovement = new InventoryTransaction { TenantId = tenantB, WarehouseId = otherWarehouse.Id, Warehouse = otherWarehouse, StockItemId = otherStockItem.Id, StockItem = otherStockItem, PurchaseReceiptLineId = otherReceiptLine.Id, PurchaseReceiptLine = otherReceiptLine, EntryDate = new DateOnly(2026, 10, 15), Direction = InventoryDirection.Receipt, Quantity = 1m, Description = "Tenant B posted purchase receipt" };
        otherReceiptLine.InventoryTransactions.Add(otherReceiptMovement);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(platformDatabaseName));
        builder.Services.AddScoped<IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddAuthentication("trade-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("trade-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapForeignTradeEndpoints();
        await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant);
            db.CustomerAccounts.Add(supplier);
            db.PurchaseOrders.Add(order);
            db.PurchaseOrders.Add(otherOrder);
            db.Warehouses.Add(warehouse);
            db.Warehouses.Add(otherWarehouse);
            db.StockItems.Add(stockItem);
            db.StockItems.Add(otherStockItem);
            db.PurchaseReceipts.Add(receipt);
            db.PurchaseReceipts.Add(otherReceipt);
            db.InventoryTransactions.Add(receiptMovement);
            db.InventoryTransactions.Add(otherReceiptMovement);
            db.CustomerAccounts.Add(otherSupplier);
            await db.SaveChangesAsync();
        }
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var platformTenant = new Tenant { Id = tenantA, Name = tenant.Name, Slug = tenant.Slug, IsActive = true };
            var platformOtherTenant = new Tenant { Id = tenantB, Name = otherTenant.Name, Slug = otherTenant.Slug, IsActive = true };
            var admin = new AppUser { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), Email = "admin@example.invalid", DisplayName = "Admin", IsActive = true };
            var companyUser = new AppUser { Id = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), Email = "trade-user@example.invalid", DisplayName = "Trade User", IsActive = true };
            db.Tenants.AddRange(platformTenant, platformOtherTenant);
            db.Users.AddRange(admin, companyUser);
            db.TenantMemberships.AddRange(
                new TenantMembership { TenantId = tenantA, UserId = admin.Id, Tenant = platformTenant, User = admin, Role = "TenantAdmin" },
                new TenantMembership { TenantId = tenantB, UserId = admin.Id, Tenant = platformOtherTenant, User = admin, Role = "TenantAdmin" },
                new TenantMembership { TenantId = tenantA, UserId = companyUser.Id, Tenant = platformTenant, User = companyUser, Role = "TenantUser" });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/foreign-trade/cases")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        var orders = await client.GetFromJsonAsync<JsonElement[]>("/api/foreign-trade/orders?direction=Import");
        Assert.Contains(orders!, item => item.GetProperty("id").GetGuid() == order.Id && item.GetProperty("currencyCode").GetString() == "EUR");

        var payload = new
        {
            direction = "Import", purchaseOrderId = order.Id, salesOrderId = (Guid?)null, referenceCode = "IMP-2026-001",
            originCountryCode = "DE", destinationCountryCode = "TR", incotermsCode = "CIF", harmonizedSystemCode = "123456",
            transportMode = "Sea", carrierReference = "SHIP-1", customsReference = (string?)null,
            declaredValue = 1250m, plannedShipDate = "2026-10-05", plannedArrivalDate = "2026-10-15", notes = "synthetic acceptance"
        };
        using var badCountry = await client.PostAsJsonAsync("/api/foreign-trade/cases", new { payload.direction, payload.purchaseOrderId, payload.salesOrderId, payload.referenceCode, originCountryCode = "DEU", payload.destinationCountryCode, payload.incotermsCode, payload.harmonizedSystemCode, payload.transportMode, payload.carrierReference, payload.customsReference, payload.declaredValue, payload.plannedShipDate, payload.plannedArrivalDate, payload.notes });
        Assert.Equal(HttpStatusCode.BadRequest, badCountry.StatusCode);
        foreach (var unassignedCountryCode in new[] { "AA", "ZZ" })
        {
            using var invalidCountry = await client.PostAsJsonAsync("/api/foreign-trade/cases", new
            {
                payload.direction, payload.purchaseOrderId, payload.salesOrderId, payload.referenceCode,
                originCountryCode = unassignedCountryCode, payload.destinationCountryCode, payload.incotermsCode,
                payload.harmonizedSystemCode, payload.transportMode, payload.carrierReference, payload.customsReference,
                payload.declaredValue, payload.plannedShipDate, payload.plannedArrivalDate, payload.notes
            });
            Assert.Equal(HttpStatusCode.BadRequest, invalidCountry.StatusCode);
        }
        using var created = await client.PostAsJsonAsync("/api/foreign-trade/cases", payload);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var caseId = createdJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("EUR", createdJson.RootElement.GetProperty("currencyCode").GetString());
        Assert.Equal("Draft", createdJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/foreign-trade/cases", payload)).StatusCode);

        using var companyUserClient = app.GetTestClient();
        companyUserClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        companyUserClient.DefaultRequestHeaders.Add("X-Test-User", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        companyUserClient.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var noAccess = await companyUserClient.GetFromJsonAsync<JsonElement>("/api/foreign-trade/capabilities");
        Assert.False(noAccess.GetProperty("canCreate").GetBoolean());
        Assert.False(noAccess.GetProperty("canAdvance").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await companyUserClient.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Booked" })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            foreach (var action in new[] { "create", "execute" })
            {
                var code = $"erp.foreign-trade.{action}";
                var definition = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code);
                var permission = await db.PermissionDefinitions.SingleOrDefaultAsync(x => x.Code == code);
                if (permission is null)
                {
                    permission = new PermissionDefinition { Code = code, ResourceType = definition.ResourceType, Action = definition.Action, Description = definition.Description };
                    db.PermissionDefinitions.Add(permission);
                }
                db.TenantPermissionRules.Add(new TenantPermissionRule
                {
                    TenantId = tenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                    PermissionCode = code, Permission = permission, Effect = TenantPermissionEffect.Allow,
                    ResourceType = definition.ResourceType, CreatedByUserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
                });
            }
            await db.SaveChangesAsync();
        }
        var granted = await companyUserClient.GetFromJsonAsync<JsonElement>("/api/foreign-trade/capabilities");
        Assert.True(granted.GetProperty("canCreate").GetBoolean());
        Assert.False(granted.GetProperty("canUpdate").GetBoolean());
        Assert.True(granted.GetProperty("canAdvance").GetBoolean());
        var companyPayload = new
        {
            direction = "Import", purchaseOrderId = order.Id, salesOrderId = (Guid?)null, referenceCode = "IMP-2026-002",
            originCountryCode = "DE", destinationCountryCode = "TR", incotermsCode = "CIF", harmonizedSystemCode = "123456",
            transportMode = "Sea", carrierReference = (string?)null, customsReference = (string?)null,
            declaredValue = 1250m, plannedShipDate = "2026-10-05", plannedArrivalDate = "2026-10-15", notes = "authorized company role"
        };
        using var companyCreated = await companyUserClient.PostAsJsonAsync("/api/foreign-trade/cases", companyPayload);
        Assert.Equal(HttpStatusCode.Created, companyCreated.StatusCode);
        using var companyCreatedJson = JsonDocument.Parse(await companyCreated.Content.ReadAsStringAsync());
        var companyCaseId = companyCreatedJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await companyUserClient.PostAsJsonAsync($"/api/foreign-trade/cases/{companyCaseId}/transition", new { status = "Booked" })).StatusCode);
        companyUserClient.DefaultRequestHeaders.Remove("X-Test-Tenant");
        companyUserClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        Assert.Equal(HttpStatusCode.Forbidden, (await companyUserClient.PostAsJsonAsync("/api/foreign-trade/cases", companyPayload)).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        var otherTenantCases = await client.GetFromJsonAsync<JsonElement>("/api/foreign-trade/cases");
        Assert.Equal(0, otherTenantCases.GetProperty("total").GetInt32());
        var otherTenantOrders = await client.GetFromJsonAsync<JsonElement[]>("/api/foreign-trade/orders?direction=Import");
        Assert.Contains(otherTenantOrders!, item => item.GetProperty("id").GetGuid() == otherOrder.Id);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Booked" })).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Booked" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Shipped", actualDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1).ToString("yyyy-MM-dd") })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Shipped", actualDate = "2026-10-07" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "CustomsClearance" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "CustomsClearance", customsReference = new string('X', 101), carrierReference = new string('Y', 101) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "CustomsClearance", customsReference = "CUSTOMS-1" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Arrived", actualDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1).ToString("yyyy-MM-dd") })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Arrived", actualDate = "2026-10-15" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Closed" })).StatusCode);
        var inventoryDocuments = await client.GetFromJsonAsync<JsonElement[]>($"/api/foreign-trade/cases/{caseId}/inventory-documents");
        Assert.Contains(inventoryDocuments!, item => item.GetProperty("id").GetGuid() == receipt.Id && item.GetProperty("code").GetString() == receipt.Code);
        Assert.DoesNotContain(inventoryDocuments!, item => item.GetProperty("id").GetGuid() == otherReceipt.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/inventory-document", new { documentId = otherReceipt.Id })).StatusCode);
        var linked = await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/inventory-document", new { documentId = receipt.Id });
        Assert.Equal(HttpStatusCode.OK, linked.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/inventory-document", new { documentId = receipt.Id })).StatusCode); // retry is idempotent
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/foreign-trade/cases/{caseId}/transition", new { status = "Closed" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/foreign-trade/cases/{caseId}", payload)).StatusCode);

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var persisted = await verifyDb.Set<ForeignTradeCase>().SingleAsync(item => item.Id == caseId);
        Assert.Equal(ForeignTradeStatus.Closed, persisted.Status);
        Assert.Equal(receipt.Id, persisted.PurchaseReceiptId);
        Assert.NotNull(persisted.InventoryDocumentLinkedAt);
        Assert.Equal("CUSTOMS-1", persisted.CustomsReference);
        Assert.True(await verifyDb.AuditEvents.AnyAsync(item => item.TenantId == tenantA && item.Action == "foreign-trade.case.created"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(item => item.TenantId == tenantA && item.Action == "foreign-trade.case.status-changed"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(item => item.TenantId == tenantA && item.Action == "foreign-trade.case.inventory-document-linked"));
    }
}
