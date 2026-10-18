using System.Net;
using System.Net.Http.Json;
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
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ManufacturingEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid ProductId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid ComponentId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid OtherProductId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid WarehouseId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid LotComponentId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private static readonly Guid SerialComponentId = Guid.Parse("abababab-abab-abab-abab-abababababab");
    private static readonly Guid SubcomponentId = Guid.Parse("cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd");

    [Fact]
    public async Task Manufacturing_recipe_and_order_are_tenant_scoped_and_complete_atomically_with_costing()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/manufacturing/boms/")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        await using (var seedScope = app.Services.CreateAsyncScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var seeded = await seedDb.StockItems.AsNoTracking().Where(x => x.TenantId == TenantA && x.Id == ProductId).SingleAsync();
            Assert.True(seeded.IsActive);
        }

        var crossTenantBom = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-OTHER", OtherProductId));
        Assert.Equal(HttpStatusCode.BadRequest, crossTenantBom.StatusCode);
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-CHAIR", ProductId));
        Assert.True(bomResponse.StatusCode == HttpStatusCode.Created,
            $"Expected recipe creation; received {(int)bomResponse.StatusCode}: {await bomResponse.Content.ReadAsStringAsync()}");
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(1, bomJson.RootElement.GetProperty("lines").GetArrayLength());

        var orderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-2026-001", bomId, 10m));
        Assert.Equal(HttpStatusCode.Created, orderResponse.StatusCode);
        using var orderJson = JsonDocument.Parse(await orderResponse.Content.ReadAsStringAsync());
        var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(22m, orderJson.RootElement.GetProperty("lines")[0].GetProperty("requiredQuantity").GetDecimal());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = ComponentId,
                EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = 30m, UnitCostBase = 4m, Description = "Opening stock" });
            await db.SaveChangesAsync();
        }
        var completed = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        using (var completeJson = JsonDocument.Parse(await completed.Content.ReadAsStringAsync()))
        {
            Assert.Equal(88m, completeJson.RootElement.GetProperty("totalCostBase").GetDecimal());
            Assert.Equal(8.8m, completeJson.RootElement.GetProperty("unitCostBase").GetDecimal());
            Assert.Equal("Completed", completeJson.RootElement.GetProperty("order").GetProperty("status").GetString());
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);
        await using var finalScope = app.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(3, await finalDb.InventoryTransactions.CountAsync(x => x.TenantId == TenantA));
        Assert.Equal(0, await finalDb.InventoryTransactions.CountAsync(x => x.TenantId == TenantB));
        Assert.Equal(1, await finalDb.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "manufacturing.order.completed"));
    }

    [Fact]
    public async Task Manufacturing_consumes_tracked_lots_by_fefo_and_skips_expired_lots()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-LOT", name = "Tracked assembly", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = LotComponentId, quantity = 5m, scrapPercent = 0m } }
        });
        Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
        using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-LOT-001", bomId, 1m));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync());
        var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var expired = Receipt("LOT-EXPIRED", 10m, new DateOnly(2026, 1, 1));
            var earliest = Receipt("LOT-EARLIEST", 4m, new DateOnly(2027, 1, 1));
            var later = Receipt("LOT-LATER", 5m, new DateOnly(2027, 12, 1));
            db.InventoryTransactions.AddRange(expired, earliest, later); await db.SaveChangesAsync();

            InventoryTransaction Receipt(string code, decimal quantity, DateOnly expiry)
            {
                var movement = new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = LotComponentId,
                    EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = quantity,
                    UnitCostBase = 2m, Description = "Tracked opening stock" };
                movement.Tracking.Add(new InventoryTransactionTrace { TenantId = TenantA, StockItemId = LotComponentId,
                    TrackingMode = InventoryTrackingMode.Lot, TrackingCode = code, Quantity = quantity, ExpiryDate = expiry });
                return movement;
            }
        }
        var complete = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var issue = await verifyDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == LotComponentId && x.Direction == InventoryDirection.Issue);
        var allocation = await verifyDb.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == TenantA && x.InventoryTransactionId == issue.Id)
            .OrderBy(x => x.ExpiryDate).ToListAsync();
        Assert.Equal(2, allocation.Count);
        Assert.Equal("LOT-EARLIEST", allocation[0].TrackingCode); Assert.Equal(4m, allocation[0].Quantity);
        Assert.Equal("LOT-LATER", allocation[1].TrackingCode); Assert.Equal(1m, allocation[1].Quantity);
        Assert.DoesNotContain(allocation, x => x.TrackingCode == "LOT-EXPIRED");
    }

    [Fact]
    public async Task Manufacturing_consumes_serial_components_one_code_per_unit()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-SERIAL", name = "Serial assembly", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = SerialComponentId, quantity = 1m, scrapPercent = 0m } }
        });
        Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
        using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync()); var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var fractionalOrder = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-SERIAL-BAD", bomId, 1.5m));
        Assert.Equal(HttpStatusCode.BadRequest, fractionalOrder.StatusCode);
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-SERIAL-001", bomId, 2m));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync()); var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            foreach (var serial in new[] { "SN-MFG-001", "SN-MFG-002" })
            {
                var receipt = new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = SerialComponentId,
                    EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = 1m, UnitCostBase = 3m, Description = "Serial opening stock" };
                receipt.Tracking.Add(new InventoryTransactionTrace { TenantId = TenantA, StockItemId = SerialComponentId,
                    TrackingMode = InventoryTrackingMode.Serial, TrackingCode = serial, Quantity = 1m });
                db.InventoryTransactions.Add(receipt);
            }
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { })).StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var issue = await verifyDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == SerialComponentId && x.Direction == InventoryDirection.Issue);
        var serials = await verifyDb.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == TenantA && x.InventoryTransactionId == issue.Id)
            .OrderBy(x => x.TrackingCode).ToListAsync();
        Assert.Equal(new[] { "SN-MFG-001", "SN-MFG-002" }, serials.Select(x => x.TrackingCode).ToArray());
        Assert.All(serials, x => Assert.Equal(1m, x.Quantity));
    }

    [Fact]
    public async Task Manufacturing_records_finished_lot_and_rejects_expired_lot_without_posting_stock()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        await using (var seed = app.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<TenantDbContext>();
            var product = await db.StockItems.SingleAsync(x => x.TenantId == TenantA && x.Id == ProductId);
            product.TrackingMode = InventoryTrackingMode.Lot;
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = ComponentId,
                EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = 10m, UnitCostBase = 2m, Description = "Opening stock" });
            await db.SaveChangesAsync();
        }
        var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-FG-LOT", ProductId));
        Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
        using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync()); var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Lot", bomJson.RootElement.GetProperty("productTrackingMode").GetString());
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-FG-LOT", bomId, 2m));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync()); var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);

        var expired = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            finishedGoodsTracking = new[] { new { trackingCode = "FG-LOT-001", quantity = 2m, expiryDate = "2020-01-01" } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, expired.StatusCode);
        await using (var verify = app.Services.CreateAsyncScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(0, await db.InventoryTransactions.CountAsync(x => x.TenantId == TenantA && x.StockItemId == ProductId));
        }
        var valid = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            finishedGoodsTracking = new[] { new { trackingCode = "FG-LOT-001", quantity = 2m, expiryDate = "2027-01-01" } }
        });
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
        await using var finalScope = app.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var receipt = await finalDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == ProductId);
        var trace = await finalDb.InventoryTransactionTraces.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.InventoryTransactionId == receipt.Id);
        Assert.Equal("FG-LOT-001", trace.TrackingCode); Assert.Equal(2m, trace.Quantity); Assert.Equal(new DateOnly(2027, 1, 1), trace.ExpiryDate);
    }

    [Fact]
    public async Task Manufacturing_records_finished_serials_and_rejects_duplicate_codes()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        await using (var seed = app.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<TenantDbContext>();
            var product = await db.StockItems.SingleAsync(x => x.TenantId == TenantA && x.Id == ProductId);
            product.TrackingMode = InventoryTrackingMode.Serial;
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = ComponentId,
                EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = 10m, UnitCostBase = 2m, Description = "Opening stock" });
            await db.SaveChangesAsync();
        }
        var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-FG-SERIAL", ProductId));
        Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
        using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync()); var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-FG-SERIAL", bomId, 2m));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync()); var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);

        var duplicate = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            finishedGoodsTracking = new[] { new { trackingCode = "FG-SN-001", quantity = 1m }, new { trackingCode = "FG-SN-001", quantity = 1m } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        var completed = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            finishedGoodsTracking = new[] { new { trackingCode = "FG-SN-001", quantity = 1m }, new { trackingCode = "FG-SN-002", quantity = 1m } }
        });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var receipt = await verifyDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == ProductId);
        var serials = await verifyDb.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == TenantA && x.InventoryTransactionId == receipt.Id).OrderBy(x => x.TrackingCode).ToListAsync();
        Assert.Equal(new[] { "FG-SN-001", "FG-SN-002" }, serials.Select(x => x.TrackingCode).ToArray());
        Assert.All(serials, x => { Assert.Equal(1m, x.Quantity); Assert.Null(x.ExpiryDate); });
    }

    [Fact]
    public async Task Mrp_explodes_multi_level_demand_and_nets_warehouse_stock()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        await using (var seed = app.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<TenantDbContext>();
            var first = new BillOfMaterial { TenantId = TenantA, Code = "MRP-FG", Name = "Finished good", ProductStockItemId = ProductId, OutputQuantity = 1m };
            first.Lines.Add(new BillOfMaterialLine { TenantId = TenantA, ComponentStockItemId = ComponentId, Quantity = 2m });
            var second = new BillOfMaterial { TenantId = TenantA, Code = "MRP-SUB", Name = "Subassembly", ProductStockItemId = ComponentId, OutputQuantity = 1m };
            second.Lines.Add(new BillOfMaterialLine { TenantId = TenantA, ComponentStockItemId = SubcomponentId, Quantity = 3m });
            db.BillOfMaterials.AddRange(first, second);
            foreach (var item in new[] { (ProductId, 1m), (ComponentId, 1m), (SubcomponentId, 2m) })
                db.InventoryTransactions.Add(new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = item.Item1,
                    EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = item.Item2, UnitCostBase = 1m, Description = "Opening stock" });
            var customer = new CustomerAccount { TenantId = TenantA, Tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA), Code = "MRP-CUST", Name = "MRP customer", Type = CounterpartyType.Customer };
            var quote = new SalesQuote { TenantId = TenantA, Tenant = customer.Tenant, CustomerId = customer.Id, Customer = customer, Code = "MRP-QUOTE",
                QuoteDate = new DateOnly(2026, 10, 10), ValidUntil = new DateOnly(2026, 11, 10), Status = SalesQuoteStatus.Accepted };
            var salesOrder = new SalesOrder { TenantId = TenantA, Tenant = customer.Tenant, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id,
                Customer = customer, Code = "MRP-SALES", OrderDate = new DateOnly(2026, 10, 10), Status = SalesOrderStatus.Open };
            var salesLine = new SalesOrderLine { TenantId = TenantA, OrderId = salesOrder.Id, Order = salesOrder, LineNumber = 1,
                StockItemId = ProductId, StockCode = "FG-CHAIR", StockName = "Chair", Quantity = 1m };
            salesOrder.Lines.Add(salesLine);
            db.SalesOrderReservations.Add(new SalesOrderReservation { TenantId = TenantA, Tenant = customer.Tenant, RequestId = Guid.NewGuid(), OrderId = salesOrder.Id,
                Order = salesOrder, OrderLineNumber = salesLine.LineNumber, OrderLine = salesLine, WarehouseId = WarehouseId, Quantity = .5m });
            db.CustomerAccounts.Add(customer); db.SalesQuotes.Add(quote); db.SalesOrders.Add(salesOrder);
            await db.SaveChangesAsync();
        }
        var response = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId,
            demand = new[] { new { stockItemId = ProductId, quantity = 2m } }
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var lines = json.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(3, lines.Length);
        Assert.Equal(new[] { 0, 1, 2 }, lines.Select(x => x.GetProperty("level").GetInt32()).ToArray());
        Assert.Equal(new[] { 2m, 3m, 7m }, lines.Select(x => x.GetProperty("netRequirement").GetDecimal()).ToArray());
        Assert.Equal(2.5m, lines[0].GetProperty("grossRequirement").GetDecimal());
        Assert.Equal(.5m, lines[0].GetProperty("reserved").GetDecimal());
        Assert.Contains(lines[0].GetProperty("sources").EnumerateArray().Select(x => x.GetString()), x => x!.StartsWith("Satış MRP-SALES", StringComparison.Ordinal));
        Assert.Equal(new[] { "Üret", "Üret", "Satın al" }, lines.Select(x => x.GetProperty("recommendation").GetString()).ToArray());
        var planId = json.RootElement.GetProperty("planId").GetGuid();
        var history = await client.GetFromJsonAsync<JsonElement[]>("/api/manufacturing/mrp/plans");
        Assert.Contains(history!, x => x.GetProperty("id").GetGuid() == planId);
        using var savedPlan = JsonDocument.Parse(await (await client.GetAsync($"/api/manufacturing/mrp/plans/{planId}")).Content.ReadAsStringAsync());
        Assert.Equal(planId, savedPlan.RootElement.GetProperty("planId").GetGuid());
        Assert.Equal(3, savedPlan.RootElement.GetProperty("lines").GetArrayLength());
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/mrp/plans/{planId}")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var crossTenant = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId, includeOpenSalesOrders = false,
            demand = new[] { new { stockItemId = OtherProductId, quantity = 1m } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, crossTenant.StatusCode);
    }

    [Fact]
    public async Task Mrp_plan_conversion_creates_a_production_order_and_purchase_request_once()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("MRP-CONVERT-BOM", ProductId));
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var planResponse = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId, includeOpenSalesOrders = false,
            demand = new[] { new { stockItemId = ProductId, quantity = 2m } }
        });
        Assert.Equal(HttpStatusCode.OK, planResponse.StatusCode);
        using var planJson = JsonDocument.Parse(await planResponse.Content.ReadAsStringAsync());
        var planId = planJson.RootElement.GetProperty("planId").GetGuid();
        var recommendations = planJson.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(new[] { "Üret", "Satın al" }, recommendations.Select(x => x.GetProperty("recommendation").GetString()).ToArray());

        var conversion = await client.PostAsJsonAsync($"/api/manufacturing/mrp/plans/{planId}/convert", new
        {
            confirm = true,
            lines = new[] { new { lineIndex = 0, billOfMaterialId = (Guid?)bomJson.RootElement.GetProperty("id").GetGuid() }, new { lineIndex = 1, billOfMaterialId = (Guid?)null } }
        });
        Assert.Equal(HttpStatusCode.OK, conversion.StatusCode);
        using var conversionJson = JsonDocument.Parse(await conversion.Content.ReadAsStringAsync());
        Assert.Equal(2, conversionJson.RootElement.GetProperty("convertedLineCount").GetInt32());
        Assert.Equal(new[] { "ManufacturingOrder", "PurchaseRequest" }, conversionJson.RootElement.GetProperty("created").EnumerateArray().Select(x => x.GetProperty("resourceType").GetString()).ToArray());
        using var convertedPlan = JsonDocument.Parse(await (await client.GetAsync($"/api/manufacturing/mrp/plans/{planId}")).Content.ReadAsStringAsync());
        Assert.Equal(new[] { 0, 1 }, convertedPlan.RootElement.GetProperty("convertedLineIndexes").EnumerateArray().Select(x => x.GetInt32()).ToArray());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/mrp/plans/{planId}/convert", new
        {
            confirm = true, lines = new[] { new { lineIndex = 0 }, new { lineIndex = 1 } }
        })).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/manufacturing/mrp/plans/{planId}/convert", new { confirm = true, lines = new[] { new { lineIndex = 0 } } })).StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await db.ManufacturingOrders.CountAsync(x => x.TenantId == TenantA));
        Assert.Equal(1, await db.PurchaseRequests.CountAsync(x => x.TenantId == TenantA));
        Assert.Equal(PurchaseRequestStatus.Submitted, await db.PurchaseRequests.Where(x => x.TenantId == TenantA).Select(x => x.Status).SingleAsync());
    }

    [Fact]
    public async Task Mrp_manufacturing_capacity_and_purchase_approval_flow_is_tenant_scoped_end_to_end()
    {
        await using var app = await StartAsync(includeWorkflowRoutes: true);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var workflowCreate = await client.PostAsJsonAsync("/api/workflows/definitions", new
        {
            code = "mrp-procurement-review", name = "MRP procurement approval", description = "Approve MRP-generated material requests",
            steps = new[] { new { name = "Procurement review", approverRole = "TenantAdmin" } }
        });
        Assert.Equal(HttpStatusCode.Created, workflowCreate.StatusCode);
        using var workflowJson = JsonDocument.Parse(await workflowCreate.Content.ReadAsStringAsync());
        var workflowId = workflowJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/workflows/definitions/{workflowId}/publish", new { })).StatusCode);

        var ruleCreate = await client.PostAsJsonAsync("/api/business-rules/", new
        {
            code = "mrp-material-approval", name = "Review MRP material request", trigger = "purchase-request.submitted",
            workflowCode = "mrp-procurement-review",
            conditions = new[] { new { field = "lineCount", @operator = "GreaterThanOrEqual", value = "1" } }
        });
        Assert.Equal(HttpStatusCode.Created, ruleCreate.StatusCode);
        using var ruleJson = JsonDocument.Parse(await ruleCreate.Content.ReadAsStringAsync());
        var ruleId = ruleJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/business-rules/{ruleId}/publish", new { })).StatusCode);

        var centerCreate = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-MRP-E2E", name = "MRP assembly cell", capacityMinutesPerDay = 60,
            laborCostPerHourBase = 80m, overheadCostPerHourBase = 20m
        });
        Assert.Equal(HttpStatusCode.Created, centerCreate.StatusCode);
        using var centerJson = JsonDocument.Parse(await centerCreate.Content.ReadAsStringAsync());
        var centerId = centerJson.RootElement.GetProperty("id").GetGuid();
        var bomCreate = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-MRP-E2E", name = "MRP routed assembly", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 2m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = centerId, setupMinutes = 30m, runMinutesPerOutputUnit = 30m } }
        });
        Assert.Equal(HttpStatusCode.Created, bomCreate.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomCreate.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();

        var planResponse = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId, includeOpenSalesOrders = false,
            demand = new[] { new { stockItemId = ProductId, quantity = 2m } }
        });
        Assert.Equal(HttpStatusCode.OK, planResponse.StatusCode);
        using var planJson = JsonDocument.Parse(await planResponse.Content.ReadAsStringAsync());
        var planId = planJson.RootElement.GetProperty("planId").GetGuid();
        var recommendations = planJson.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(new[] { "Üret", "Satın al" }, recommendations.Select(x => x.GetProperty("recommendation").GetString()).ToArray());
        Assert.Equal(4m, recommendations[1].GetProperty("netRequirement").GetDecimal());

        var conversionResponse = await client.PostAsJsonAsync($"/api/manufacturing/mrp/plans/{planId}/convert", new
        {
            confirm = true,
            lines = new[]
            {
                new { lineIndex = 0, billOfMaterialId = (Guid?)bomId },
                new { lineIndex = 1, billOfMaterialId = (Guid?)null }
            }
        });
        Assert.Equal(HttpStatusCode.OK, conversionResponse.StatusCode);
        using var conversionJson = JsonDocument.Parse(await conversionResponse.Content.ReadAsStringAsync());
        var created = conversionJson.RootElement.GetProperty("created").EnumerateArray().ToArray();
        var productionOrderId = created.Single(x => x.GetProperty("resourceType").GetString() == "ManufacturingOrder").GetProperty("resourceId").GetGuid();
        var purchaseRequestId = created.Single(x => x.GetProperty("resourceType").GetString() == "PurchaseRequest").GetProperty("resourceId").GetGuid();
        Assert.Equal(2, conversionJson.RootElement.GetProperty("convertedLineCount").GetInt32());

        var instances = await client.GetFromJsonAsync<JsonElement[]>("/api/workflows/instances") ?? [];
        var approval = Assert.Single(instances, x => x.GetProperty("subjectId").GetGuid() == purchaseRequestId);
        var workflowInstanceId = approval.GetProperty("id").GetGuid();
        Assert.Equal("Pending", approval.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/workflows/instances/{workflowInstanceId}/decision",
            new { decision = "Approved", comment = "Self approval must fail" })).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-User", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var approved = await client.PostAsJsonAsync($"/api/workflows/instances/{workflowInstanceId}/decision",
            new { decision = "Approved", comment = "MRP shortage reviewed" });
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        await using (var verify = app.Services.CreateAsyncScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(PurchaseRequestStatus.Approved,
                await db.PurchaseRequests.Where(x => x.TenantId == TenantA && x.Id == purchaseRequestId).Select(x => x.Status).SingleAsync());
        }

        var scheduled = await client.PostAsJsonAsync($"/api/manufacturing/orders/{productionOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduled.StatusCode);
        using var scheduledJson = JsonDocument.Parse(await scheduled.Content.ReadAsStringAsync());
        var operation = Assert.Single(scheduledJson.RootElement.GetProperty("operations").EnumerateArray());
        var capacityDays = operation.GetProperty("capacityDays").EnumerateArray().ToArray();
        Assert.Equal(2, capacityDays.Length);
        Assert.All(capacityDays, x => Assert.InRange(x.GetProperty("minutes").GetDecimal(), 0m, 60m));
        var release = await client.PostAsJsonAsync($"/api/manufacturing/orders/{productionOrderId}/release", new { });
        Assert.Equal(HttpStatusCode.OK, release.StatusCode);
        using var releasedJson = JsonDocument.Parse(await release.Content.ReadAsStringAsync());
        Assert.Equal("Released", releasedJson.RootElement.GetProperty("status").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/mrp/plans/{planId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/orders/{productionOrderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/workflows/instances/{workflowInstanceId}/decision",
            new { decision = "Approved", comment = "Cross-tenant decision" })).StatusCode);
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/workflows/instances") ?? []);
        await using var finalScope = app.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await finalDb.ManufacturingOrders.CountAsync(x => x.TenantId == TenantA));
        Assert.Equal(1, await finalDb.PurchaseRequests.CountAsync(x => x.TenantId == TenantA));
        Assert.Empty(await finalDb.ManufacturingOrders.Where(x => x.TenantId == TenantB).ToListAsync());
        Assert.Empty(await finalDb.PurchaseRequests.Where(x => x.TenantId == TenantB).ToListAsync());
    }

    [Fact]
    public async Task Mrp_uses_only_supplies_available_by_need_date_and_offsets_purchase_by_lead_time()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await using (var seed = app.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var item = await db.StockItems.SingleAsync(x => x.TenantId == TenantA && x.Id == SubcomponentId);
            item.ProcurementLeadTimeDays = 7;
            var supplier = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "MRP-SUP", Name = "MRP supplier", Type = CounterpartyType.Supplier };
            var timely = new PurchaseOrder { TenantId = TenantA, Tenant = tenant, Supplier = supplier, SupplierId = supplier.Id,
                Code = "MRP-PO-TIMELY", OrderDate = today, ExpectedReceiptDate = today.AddDays(5), TargetWarehouseId = WarehouseId, Status = PurchaseOrderStatus.Open };
            timely.Lines.Add(new PurchaseOrderLine { TenantId = TenantA, PurchaseOrder = timely, LineNumber = 1, StockItemId = item.Id,
                StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 2m, UnitPrice = 1m });
            var unassigned = new PurchaseOrder { TenantId = TenantA, Tenant = tenant, Supplier = supplier, SupplierId = supplier.Id,
                Code = "MRP-PO-UNASSIGNED", OrderDate = today, ExpectedReceiptDate = today.AddDays(1), Status = PurchaseOrderStatus.Open };
            unassigned.Lines.Add(new PurchaseOrderLine { TenantId = TenantA, PurchaseOrder = unassigned, LineNumber = 1, StockItemId = item.Id,
                StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 100m, UnitPrice = 1m });
            db.CustomerAccounts.Add(supplier); db.PurchaseOrders.AddRange(timely, unassigned);
            await db.SaveChangesAsync();
        }

        var response = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId,
            planDate = today,
            includeOpenSalesOrders = false,
            demand = new[]
            {
                new { stockItemId = SubcomponentId, quantity = 3m, requiredByDate = today.AddDays(3) },
                new { stockItemId = SubcomponentId, quantity = 3m, requiredByDate = today.AddDays(6) }
            }
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var lines = json.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(2, lines.Length);
        Assert.Equal(3m, lines[0].GetProperty("netRequirement").GetDecimal());
        Assert.Equal(0m, lines[0].GetProperty("fromOpenPurchaseOrders").GetDecimal());
        Assert.Equal(today.AddDays(3).ToString("yyyy-MM-dd"), lines[0].GetProperty("requiredByDate").GetString());
        Assert.Equal(today.AddDays(-4).ToString("yyyy-MM-dd"), lines[0].GetProperty("recommendedOrderDate").GetString());
        Assert.Equal(1m, lines[1].GetProperty("netRequirement").GetDecimal());
        Assert.Equal(2m, lines[1].GetProperty("fromOpenPurchaseOrders").GetDecimal());
    }

    [Fact]
    public async Task Sales_order_required_delivery_date_is_audited_and_drives_mrp_timing()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        Guid orderId;
        await using (var seed = app.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var item = await db.StockItems.SingleAsync(x => x.TenantId == TenantA && x.Id == SubcomponentId);
            item.ProcurementLeadTimeDays = 2;
            var customer = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "MRP-DATE-CUST", Name = "MRP delivery customer", Type = CounterpartyType.Customer };
            var quote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "MRP-DATE-QUOTE",
                QuoteDate = today, ValidUntil = today.AddDays(30), Status = SalesQuoteStatus.Accepted };
            var order = new SalesOrder { TenantId = TenantA, Tenant = tenant, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id,
                Customer = customer, Code = "MRP-DATE-SO", OrderDate = today, Status = SalesOrderStatus.Open };
            order.Lines.Add(new SalesOrderLine { TenantId = TenantA, Order = order, LineNumber = 1, StockItemId = item.Id,
                StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 5m, UnitPrice = 1m });
            db.CustomerAccounts.Add(customer); db.SalesQuotes.Add(quote); db.SalesOrders.Add(order);
            await db.SaveChangesAsync(); orderId = order.Id;
        }

        var dueDate = today.AddDays(8);
        var dateResponse = await client.PutAsJsonAsync($"/api/sales/orders/{orderId}/delivery-date", new { requestedDeliveryDate = dueDate });
        Assert.Equal(HttpStatusCode.OK, dateResponse.StatusCode);
        using var savedDate = JsonDocument.Parse(await dateResponse.Content.ReadAsStringAsync());
        Assert.Equal(dueDate.ToString("yyyy-MM-dd"), savedDate.RootElement.GetProperty("requestedDeliveryDate").GetString());

        var planResponse = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new { warehouseId = WarehouseId, planDate = today });
        Assert.Equal(HttpStatusCode.OK, planResponse.StatusCode);
        using var plan = JsonDocument.Parse(await planResponse.Content.ReadAsStringAsync());
        var line = Assert.Single(plan.RootElement.GetProperty("lines").EnumerateArray(), x => x.GetProperty("stockItemId").GetGuid() == SubcomponentId);
        Assert.Equal(5m, line.GetProperty("netRequirement").GetDecimal());
        Assert.Equal(dueDate.ToString("yyyy-MM-dd"), line.GetProperty("requiredByDate").GetString());
        Assert.Equal(dueDate.AddDays(-2).ToString("yyyy-MM-dd"), line.GetProperty("recommendedOrderDate").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/sales/orders/{orderId}/delivery-date", new { requestedDeliveryDate = dueDate })).StatusCode);
    }

    [Fact]
    public async Task Manufacturing_routes_snapshot_costs_and_schedule_without_exceeding_daily_capacity()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerResponse = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-ASSEMBLY", name = "Assembly cell", capacityMinutesPerDay = 60, laborCostPerHourBase = 80m, overheadCostPerHourBase = 20m
        });
        Assert.Equal(HttpStatusCode.Created, centerResponse.StatusCode);
        using var centerJson = JsonDocument.Parse(await centerResponse.Content.ReadAsStringAsync()); var centerId = centerJson.RootElement.GetProperty("id").GetGuid();
        var invalidCenter = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-BAD", name = "Invalid", capacityMinutesPerDay = 0, laborCostPerHourBase = 0m, overheadCostPerHourBase = 0m
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidCenter.StatusCode);
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-ROUTED", name = "Routed assembly", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 2m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = centerId, setupMinutes = 30m, runMinutesPerOutputUnit = 30m } }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync()); var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var first = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-ROUTED-1", bomId, 2m, today));
        var second = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-ROUTED-2", bomId, 2m, today));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode); Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        using var firstJson = JsonDocument.Parse(await first.Content.ReadAsStringAsync()); var firstId = firstJson.RootElement.GetProperty("id").GetGuid();
        using var secondJson = JsonDocument.Parse(await second.Content.ReadAsStringAsync()); var secondId = secondJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(150m, firstJson.RootElement.GetProperty("operations")[0].GetProperty("plannedCostBase").GetDecimal());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/release", new { })).StatusCode);

        var scheduledFirst = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/schedule", new { });
        var scheduledSecond = await client.PostAsJsonAsync($"/api/manufacturing/orders/{secondId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduledFirst.StatusCode); Assert.Equal(HttpStatusCode.OK, scheduledSecond.StatusCode);
        using var scheduledFirstJson = JsonDocument.Parse(await scheduledFirst.Content.ReadAsStringAsync());
        using var scheduledSecondJson = JsonDocument.Parse(await scheduledSecond.Content.ReadAsStringAsync());
        var firstOp = scheduledFirstJson.RootElement.GetProperty("operations")[0];
        var secondOp = scheduledSecondJson.RootElement.GetProperty("operations")[0];
        Assert.Equal(2, firstOp.GetProperty("capacityDays").GetArrayLength());
        var allDays = firstOp.GetProperty("capacityDays").EnumerateArray().Concat(secondOp.GetProperty("capacityDays").EnumerateArray()).ToArray();
        Assert.All(allDays, x => Assert.True(x.GetProperty("minutes").GetDecimal() <= 60m));
        Assert.True(DateOnly.Parse(secondOp.GetProperty("scheduledStartDate").GetString()!) >= DateOnly.Parse(firstOp.GetProperty("scheduledEndDate").GetString()!));

        await using (var seed = app.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = ComponentId,
                EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt, Quantity = 10m, UnitCostBase = 2m, Description = "Opening stock" });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/release", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/complete", new { })).StatusCode);
        var firstOperationId = firstOp.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/operations/{firstOperationId}/start", new { })).StatusCode);
        var operationComplete = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/operations/{firstOperationId}/complete", new
        {
            actualSetupMinutes = 36m, actualRunMinutes = 60m
        });
        Assert.Equal(HttpStatusCode.OK, operationComplete.StatusCode);
        var complete = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        using var completedJson = JsonDocument.Parse(await complete.Content.ReadAsStringAsync());
        Assert.Equal(168m, completedJson.RootElement.GetProperty("totalCostBase").GetDecimal());
        Assert.Equal(160m, completedJson.RootElement.GetProperty("operationCostBase").GetDecimal());
    }

    private static object Bom(string code, Guid productId) => new
    {
        code, name = "Chair assembly", productStockItemId = productId, outputQuantity = 1m,
        lines = new[] { new { componentStockItemId = ComponentId, quantity = 2m, scrapPercent = 10m } }
    };
    private static object Order(string code, Guid bomId, decimal quantity, DateOnly? plannedDate = null) => new
    {
        code, billOfMaterialId = bomId, warehouseId = WarehouseId, plannedQuantity = quantity, plannedDate = (plannedDate ?? new DateOnly(2026, 10, 20)).ToString("yyyy-MM-dd")
    };

    private static async Task<WebApplication> StartAsync(bool includeWorkflowRoutes = false)
    {
        var databaseName = $"manufacturing-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName + "-platform"));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapManufacturingEndpoints(); app.MapSalesOrderEndpoints();
        if (includeWorkflowRoutes) { app.MapWorkflowEndpoints(); app.MapBusinessRuleEndpoints(); }
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" };
        db.Tenants.AddRange(tenantA, tenantB);
        db.Warehouses.Add(new Warehouse { Id = WarehouseId, TenantId = TenantA, Tenant = tenantA, Code = "WH-A", Name = "Main", IsActive = true });
        db.StockItems.AddRange(
            new StockItem { Id = ProductId, TenantId = TenantA, Tenant = tenantA, Code = "FG-CHAIR", Name = "Chair", UnitCode = "EA" },
            new StockItem { Id = ComponentId, TenantId = TenantA, Tenant = tenantA, Code = "RM-WOOD", Name = "Wood", UnitCode = "EA" },
            new StockItem { Id = LotComponentId, TenantId = TenantA, Tenant = tenantA, Code = "RM-LOT-WOOD", Name = "Lot wood", UnitCode = "EA", TrackingMode = InventoryTrackingMode.Lot },
            new StockItem { Id = SerialComponentId, TenantId = TenantA, Tenant = tenantA, Code = "RM-SERIAL", Name = "Serial fastener", UnitCode = "EA", TrackingMode = InventoryTrackingMode.Serial },
            new StockItem { Id = SubcomponentId, TenantId = TenantA, Tenant = tenantA, Code = "RM-PLASTIC", Name = "Plastic granulate", UnitCode = "KG" },
            new StockItem { Id = OtherProductId, TenantId = TenantB, Tenant = tenantB, Code = "FG-OTHER", Name = "Other", UnitCode = "EA" });
        await db.SaveChangesAsync();
        await using var platformScope = app.Services.CreateAsyncScope();
        var platformDb = platformScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platformDb.Database.EnsureCreatedAsync();
        var platformTenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" };
        var platformUser = new AppUser { Id = UserId, Email = "mrp-test@example.test", DisplayName = "MRP Test User", PasswordHash = "test" };
        platformDb.Tenants.Add(platformTenantA); platformDb.Users.Add(platformUser);
        platformDb.TenantMemberships.Add(new TenantMembership { UserId = UserId, User = platformUser, TenantId = TenantA, Tenant = platformTenantA, Role = "TenantAdmin" });
        await platformDb.SaveChangesAsync();
        return app;
    }
}
