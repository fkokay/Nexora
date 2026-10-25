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
    private static readonly Guid ComponentLocationId = Guid.Parse("12121212-1212-1212-1212-121212121212");
    private static readonly Guid FinishedGoodsLocationId = Guid.Parse("13131313-1313-1313-1313-131313131313");

    [Fact]
    public async Task Work_order_search_is_tenant_scoped_and_returns_only_first_ten_sanitized_matches()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/manufacturing/orders/search?q=MO-SEARCH")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-ASSIST-SEARCH", ProductId));
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bom = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var bomId = bom.RootElement.GetProperty("id").GetGuid();
        for (var index = 1; index <= 12; index++)
        {
            var created = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order($"MO-SEARCH-{index:000}", bomId, index));
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        }

        var response = await client.GetAsync("/api/manufacturing/orders/search?q=mo-search");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using (var search = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
        {
            Assert.Equal(12, search.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Equal(10, search.RootElement.GetProperty("returned").GetInt32());
            Assert.True(search.RootElement.GetProperty("hasMore").GetBoolean());
            Assert.Equal(10, search.RootElement.GetProperty("items").GetArrayLength());
            var first = search.RootElement.GetProperty("items")[0];
            Assert.Equal("MO-SEARCH-001", first.GetProperty("code").GetString());
            Assert.False(first.TryGetProperty("id", out _));
            Assert.False(first.TryGetProperty("warehouseId", out _));
            Assert.False(first.TryGetProperty("billOfMaterialId", out _));
        }

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = JsonDocument.Parse(await (await client.GetAsync("/api/manufacturing/orders/search?q=MO-SEARCH")).Content.ReadAsStringAsync());
        Assert.Equal(0, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/manufacturing/orders/search?q=x")).StatusCode);
    }

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
    public async Task Sequence_dependent_setup_is_tenant_scoped_snapshotted_and_consumes_work_center_capacity()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-SETUP-SEQ", 60, 127);
        using var rulesSaved = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules", new
        {
            rules = new[] { new { fromSetupFamilyCode = "A", toSetupFamilyCode = "B", setupMinutes = 60m, isTransitionAllowed = true } }
        });
        Assert.Equal(HttpStatusCode.OK, rulesSaved.StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-SETUP-SEQ", name = "Sequence setup", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[]
            {
                new { sequence = 1, workCenterId = centerId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m, setupFamilyCode = "A" },
                new { sequence = 2, workCenterId = centerId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m, setupFamilyCode = "B" }
            }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var orderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-SETUP-SEQ", bomId, 1m));
        Assert.Equal(HttpStatusCode.Created, orderResponse.StatusCode);
        using var orderJson = JsonDocument.Parse(await orderResponse.Content.ReadAsStringAsync());
        var orderId = orderJson.RootElement.GetProperty("id").GetGuid();

        // Configuration edits after order creation must not rewrite its immutable rule snapshot.
        using var rulesChanged = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules", new
        {
            rules = new[] { new { fromSetupFamilyCode = "A", toSetupFamilyCode = "B", setupMinutes = 0m, isTransitionAllowed = false } }
        });
        Assert.Equal(HttpStatusCode.OK, rulesChanged.StatusCode);
        using var schedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, schedule.StatusCode);
        using var scheduledJson = JsonDocument.Parse(await schedule.Content.ReadAsStringAsync());
        var secondOperation = scheduledJson.RootElement.GetProperty("operations").EnumerateArray().Single(x => x.GetProperty("sequence").GetInt32() == 2);
        Assert.Equal(60m, secondOperation.GetProperty("sequenceSetupMinutes").GetDecimal());
        Assert.Equal(90m, secondOperation.GetProperty("capacityDays").EnumerateArray().Sum(x => x.GetProperty("minutes").GetDecimal()));

        // The queue on a machine includes work from earlier orders, not only this route's predecessor.
        using var crossOrderRule = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules", new
        {
            rules = new[] { new { fromSetupFamilyCode = "B", toSetupFamilyCode = "C", setupMinutes = 20m, isTransitionAllowed = true } }
        });
        Assert.Equal(HttpStatusCode.OK, crossOrderRule.StatusCode);
        var nextBomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-SETUP-CROSS-ORDER", name = "Next family", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = centerId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m, setupFamilyCode = "C" } }
        });
        Assert.Equal(HttpStatusCode.Created, nextBomResponse.StatusCode);
        using var nextBomJson = JsonDocument.Parse(await nextBomResponse.Content.ReadAsStringAsync());
        var nextOrderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-SETUP-CROSS-ORDER", nextBomJson.RootElement.GetProperty("id").GetGuid(), 1m,
            DateOnly.FromDateTime(DateTime.UtcNow).AddDays(10)));
        Assert.Equal(HttpStatusCode.Created, nextOrderResponse.StatusCode);
        using var crossOrderJson = JsonDocument.Parse(await nextOrderResponse.Content.ReadAsStringAsync());
        var crossOrderId = crossOrderJson.RootElement.GetProperty("id").GetGuid();
        using var crossOrderRuleChanged = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules", new
        {
            rules = new[] { new { fromSetupFamilyCode = "B", toSetupFamilyCode = "C", setupMinutes = 0m, isTransitionAllowed = false } }
        });
        Assert.Equal(HttpStatusCode.OK, crossOrderRuleChanged.StatusCode);
        using var crossOrderSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{crossOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, crossOrderSchedule.StatusCode);
        using var crossOrderScheduledJson = JsonDocument.Parse(await crossOrderSchedule.Content.ReadAsStringAsync());
        Assert.Equal(20m, crossOrderScheduledJson.RootElement.GetProperty("operations")[0].GetProperty("sequenceSetupMinutes").GetDecimal());

        using var blockRouteTransition = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules", new
        {
            rules = new[] { new { fromSetupFamilyCode = "A", toSetupFamilyCode = "B", setupMinutes = 0m, isTransitionAllowed = false } }
        });
        Assert.Equal(HttpStatusCode.OK, blockRouteTransition.StatusCode);
        var nextOrder = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-SETUP-SEQ-BLOCKED", bomId, 1m,
            DateOnly.FromDateTime(DateTime.UtcNow).AddDays(100)));
        Assert.Equal(HttpStatusCode.Created, nextOrder.StatusCode);
        using var nextOrderJson = JsonDocument.Parse(await nextOrder.Content.ReadAsStringAsync());
        var blockedOrderId = nextOrderJson.RootElement.GetProperty("id").GetGuid();
        await using (var blockedScope = app.Services.CreateAsyncScope())
        {
            var blockedDb = blockedScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var blockedOperation = await blockedDb.ManufacturingOrderOperations.SingleAsync(x => x.TenantId == TenantA && x.ManufacturingOrderId == blockedOrderId && x.Sequence == 2);
            using var snapshotJson = JsonDocument.Parse(blockedOperation.SetupTransitionRulesSnapshotJson);
            Assert.Contains(snapshotJson.RootElement.EnumerateArray(), x => x.GetProperty("FromSetupFamilyCode").GetString() == "A" &&
                x.GetProperty("ToSetupFamilyCode").GetString() == "B" && !x.GetProperty("IsTransitionAllowed").GetBoolean());
        }
        using var blockedSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{blockedOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.Conflict, blockedSchedule.StatusCode);
    }

    [Fact]
    public async Task Tenant_negative_stock_setting_allows_only_untracked_unlocated_manufacturing_issue()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-NEGATIVE", ProductId));
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();

        var strictOrderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-NEGATIVE-STRICT", bomId, 1m));
        Assert.Equal(HttpStatusCode.Created, strictOrderResponse.StatusCode);
        using var strictOrderJson = JsonDocument.Parse(await strictOrderResponse.Content.ReadAsStringAsync());
        var strictOrderId = strictOrderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{strictOrderId}/release", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{strictOrderId}/complete", new { })).StatusCode);

        await using (var settingsScope = app.Services.CreateAsyncScope())
        {
            var db = settingsScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.TenantOperationalSettings.Add(new TenantOperationalSettings { TenantId = TenantA, AllowNegativeStock = true });
            await db.SaveChangesAsync();
        }

        var allowedOrderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-NEGATIVE-ALLOWED", bomId, 1m));
        Assert.Equal(HttpStatusCode.Created, allowedOrderResponse.StatusCode);
        using var allowedOrderJson = JsonDocument.Parse(await allowedOrderResponse.Content.ReadAsStringAsync());
        var allowedOrderId = allowedOrderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{allowedOrderId}/release", new { })).StatusCode);
        var completion = await client.PostAsJsonAsync($"/api/manufacturing/orders/{allowedOrderId}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, completion.StatusCode);

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var componentBalance = await verifyDb.InventoryTransactions.AsNoTracking()
            .Where(x => x.TenantId == TenantA && x.WarehouseId == WarehouseId && x.StockItemId == ComponentId)
            .SumAsync(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity);
        Assert.Equal(-2.2m, componentBalance);
        Assert.Equal(1, await verifyDb.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "manufacturing.order.completed"));
    }

    [Fact]
    public async Task Intraday_work_center_queue_sequences_two_orders_and_charges_setup_minutes_to_shift_capacity()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-INTRADAY", 60, 127);
        using var calendar = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            shiftStartMinuteOfDay = 480,
            shiftEndMinuteOfDay = 540,
            capacityOverrides = Array.Empty<object>()
        });
        Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);
        using var setupRules = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/setup-rules", new
        {
            rules = new[] { new { fromSetupFamilyCode = "A", toSetupFamilyCode = "B", setupMinutes = 10m, isTransitionAllowed = true } }
        });
        Assert.Equal(HttpStatusCode.OK, setupRules.StatusCode);

        async Task<Guid> CreateOrderBomAsync(string bomCode, string orderCode, string setupFamily, decimal runMinutes)
        {
            var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
            {
                code = bomCode,
                name = bomCode,
                productStockItemId = ProductId,
                outputQuantity = 1m,
                lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
                operations = new[] { new { sequence = 1, workCenterId = centerId, setupMinutes = 0m,
                    runMinutesPerOutputUnit = runMinutes, setupFamilyCode = setupFamily } }
            });
            Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
            using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync());
            var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order(orderCode,
                bomJson.RootElement.GetProperty("id").GetGuid(), 1m, DateOnly.FromDateTime(DateTime.UtcNow)));
            Assert.Equal(HttpStatusCode.Created, order.StatusCode);
            using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync());
            return orderJson.RootElement.GetProperty("id").GetGuid();
        }

        var firstOrderId = await CreateOrderBomAsync("BOM-INTRADAY-A", "MO-INTRADAY-A", "A", 20m);
        using var firstSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, firstSchedule.StatusCode);
        using var firstJson = JsonDocument.Parse(await firstSchedule.Content.ReadAsStringAsync());
        var firstOperation = firstJson.RootElement.GetProperty("operations")[0];

        var secondOrderId = await CreateOrderBomAsync("BOM-INTRADAY-B", "MO-INTRADAY-B", "B", 35m);
        using var secondSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{secondOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, secondSchedule.StatusCode);
        using var secondJson = JsonDocument.Parse(await secondSchedule.Content.ReadAsStringAsync());
        var secondOperation = secondJson.RootElement.GetProperty("operations")[0];
        var firstDate = firstOperation.GetProperty("scheduledStartDate").GetDateTime().Date;
        Assert.Equal(firstOperation.GetProperty("scheduledEndDate").GetDateTime().Date, firstDate);
        Assert.Equal(firstDate, secondOperation.GetProperty("scheduledStartDate").GetDateTime().Date);
        Assert.Equal(480, firstOperation.GetProperty("scheduledStartMinuteOfDay").GetInt32());
        Assert.Equal(500, firstOperation.GetProperty("scheduledEndMinuteOfDay").GetInt32());
        Assert.Equal(10m, secondOperation.GetProperty("sequenceSetupMinutes").GetDecimal());
        var allocations = secondOperation.GetProperty("capacityDays").EnumerateArray().ToArray();
        Assert.Equal(2, allocations.Length);
        Assert.Equal(500, allocations[0].GetProperty("startMinuteOfDay").GetInt32());
        Assert.Equal(540, allocations[0].GetProperty("endMinuteOfDay").GetInt32());
        Assert.Equal(40m, allocations[0].GetProperty("minutes").GetDecimal());
        Assert.Equal(480, allocations[1].GetProperty("startMinuteOfDay").GetInt32());
        Assert.Equal(485, allocations[1].GetProperty("endMinuteOfDay").GetInt32());
        Assert.Equal(5m, allocations[1].GetProperty("minutes").GetDecimal());
    }

    [Theory]
    [InlineData(true, 0, InventoryTrackingMode.None, false, true)]
    [InlineData(false, 0, InventoryTrackingMode.None, false, false)]
    [InlineData(true, 1, InventoryTrackingMode.None, false, false)]
    [InlineData(true, 0, InventoryTrackingMode.Lot, false, false)]
    [InlineData(true, 0, InventoryTrackingMode.Serial, false, false)]
    [InlineData(true, 0, InventoryTrackingMode.None, true, false)]
    public void Negative_stock_override_preserves_reservations_tracking_and_bin_guards(bool tenantAllowsNegativeStock,
        decimal activeReservedQuantity, InventoryTrackingMode trackingMode, bool hasStorageLocation, bool expected)
    {
        Assert.Equal(expected, TenantOperationalSettingsEndpoints.CanPostNegativeBalance(
            tenantAllowsNegativeStock, activeReservedQuantity, trackingMode, hasStorageLocation));
    }

    [Fact]
    public async Task Manufacturing_completion_attributes_component_issue_and_finished_receipt_to_valid_locations()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("BOM-LOC", ProductId));
        Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
        using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync()); var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-LOC", bomId, 10m));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync()); var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.WarehouseLocations.AddRange(
                new WarehouseLocation { Id = ComponentLocationId, TenantId = TenantA, WarehouseId = WarehouseId, Code = "RAW", Name = "Raw materials" },
                new WarehouseLocation { Id = FinishedGoodsLocationId, TenantId = TenantA, WarehouseId = WarehouseId, Code = "FG", Name = "Finished goods" });
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StorageLocationId = ComponentLocationId,
                StockItemId = ComponentId, EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt,
                Quantity = 30m, UnitCostBase = 4m, Description = "Opening stock" });
            await db.SaveChangesAsync();
        }

        var invalidLocation = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            componentStorageLocationId = Guid.NewGuid(), finishedGoodsStorageLocationId = FinishedGoodsLocationId
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidLocation.StatusCode);
        var completed = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            componentStorageLocationId = ComponentLocationId, finishedGoodsStorageLocationId = FinishedGoodsLocationId
        });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);

        await using var verifyScope = app.Services.CreateAsyncScope(); var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var issue = await verifyDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == ComponentId && x.Direction == InventoryDirection.Issue);
        var receipt = await verifyDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == ProductId && x.Direction == InventoryDirection.Receipt);
        Assert.Equal(orderId, issue.ManufacturingOrderId);
        Assert.Null(receipt.ManufacturingOrderId);
        Assert.Equal(ComponentLocationId, issue.StorageLocationId);
        Assert.Equal(FinishedGoodsLocationId, receipt.StorageLocationId);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new
        {
            componentStorageLocationId = ComponentLocationId, finishedGoodsStorageLocationId = FinishedGoodsLocationId
        })).StatusCode);
    }

    [Fact]
    public async Task Manufacturing_tracked_component_availability_is_scoped_to_requested_location()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var bom = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-LOC-LOT", name = "Tracked assembly", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = LotComponentId, quantity = 5m, scrapPercent = 0m } }
        });
        Assert.Equal(HttpStatusCode.Created, bom.StatusCode);
        using var bomJson = JsonDocument.Parse(await bom.Content.ReadAsStringAsync()); var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-LOC-LOT", bomId, 1m));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync()); var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/release", new { })).StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.WarehouseLocations.AddRange(
                new WarehouseLocation { Id = ComponentLocationId, TenantId = TenantA, WarehouseId = WarehouseId, Code = "RAW", Name = "Raw materials" },
                new WarehouseLocation { Id = FinishedGoodsLocationId, TenantId = TenantA, WarehouseId = WarehouseId, Code = "FG", Name = "Finished goods" });
            foreach (var (locationId, code, quantity) in new[] { (ComponentLocationId, "LOC-LOW", 4m), (FinishedGoodsLocationId, "LOC-OTHER", 10m) })
            {
                var movement = new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StorageLocationId = locationId,
                    StockItemId = LotComponentId, EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt,
                    Quantity = quantity, UnitCostBase = 2m, Description = "Tracked opening stock" };
                movement.Tracking.Add(new InventoryTransactionTrace { TenantId = TenantA, StockItemId = LotComponentId, TrackingMode = InventoryTrackingMode.Lot,
                    TrackingCode = code, Quantity = quantity, ExpiryDate = new DateOnly(2027, 1, 1) });
                db.InventoryTransactions.Add(movement);
            }
            await db.SaveChangesAsync();
        }
        var shortLocation = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { componentStorageLocationId = ComponentLocationId });
        Assert.Equal(HttpStatusCode.Conflict, shortLocation.StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var extra = new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StorageLocationId = ComponentLocationId,
                StockItemId = LotComponentId, EntryDate = new DateOnly(2026, 10, 10), Direction = InventoryDirection.Receipt,
                Quantity = 2m, UnitCostBase = 2m, Description = "Additional tracked opening stock" };
            extra.Tracking.Add(new InventoryTransactionTrace { TenantId = TenantA, StockItemId = LotComponentId, TrackingMode = InventoryTrackingMode.Lot,
                TrackingCode = "LOC-EXTRA", Quantity = 2m, ExpiryDate = new DateOnly(2027, 1, 1) });
            db.InventoryTransactions.Add(extra); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/complete", new { componentStorageLocationId = ComponentLocationId })).StatusCode);
        await using var verify = app.Services.CreateAsyncScope(); var verifyDb = verify.ServiceProvider.GetRequiredService<TenantDbContext>();
        var issue = await verifyDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantA && x.StockItemId == LotComponentId && x.Direction == InventoryDirection.Issue);
        Assert.Equal(ComponentLocationId, issue.StorageLocationId);
        var traces = await verifyDb.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == TenantA && x.InventoryTransactionId == issue.Id).ToListAsync();
        Assert.Equal(2, traces.Count);
        Assert.Equal(5m, traces.Sum(x => x.Quantity));
        Assert.All(traces, x => Assert.NotEqual("LOC-OTHER", x.TrackingCode));
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
    public async Task Mrp_does_not_count_future_dated_inventory_as_on_hand_at_the_plan_date()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.InventoryTransactions.Add(new InventoryTransaction
            {
                TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = SubcomponentId,
                EntryDate = today.AddDays(1), Direction = InventoryDirection.Receipt, Quantity = 5m,
                UnitCostBase = 1m, Description = "Future-dated receipt"
            });
            await db.SaveChangesAsync();
        }

        var response = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId,
            planDate = today,
            includeOpenSalesOrders = false,
            demand = new[] { new { stockItemId = SubcomponentId, quantity = 5m, requiredByDate = today } }
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var planJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var line = Assert.Single(planJson.RootElement.GetProperty("lines").EnumerateArray(),
            x => x.GetProperty("stockItemId").GetGuid() == SubcomponentId);
        Assert.Equal(0m, line.GetProperty("onHand").GetDecimal());
        Assert.Equal(0m, line.GetProperty("fromOnHand").GetDecimal());
        Assert.Equal(5m, line.GetProperty("netRequirement").GetDecimal());
        Assert.Equal("Satın al", line.GetProperty("recommendation").GetString());
    }

    [Fact]
    public async Task Mrp_counts_open_manufacturing_order_even_after_its_recipe_is_deactivated()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", Bom("MRP-ARCHIVED-BOM", ProductId));
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var orderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-ARCHIVED-BOM", bomId, 2m, today));
        Assert.Equal(HttpStatusCode.Created, orderResponse.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var bom = await db.BillOfMaterials.SingleAsync(x => x.TenantId == TenantA && x.Id == bomId);
            bom.IsActive = false;
            await db.SaveChangesAsync();
        }

        var planResponse = await client.PostAsJsonAsync("/api/manufacturing/mrp/plan", new
        {
            warehouseId = WarehouseId,
            planDate = today,
            includeOpenSalesOrders = false,
            demand = new[] { new { stockItemId = ProductId, quantity = 3m, requiredByDate = today } }
        });
        Assert.Equal(HttpStatusCode.OK, planResponse.StatusCode);
        using var planJson = JsonDocument.Parse(await planResponse.Content.ReadAsStringAsync());
        var productLine = Assert.Single(planJson.RootElement.GetProperty("lines").EnumerateArray(),
            x => x.GetProperty("stockItemId").GetGuid() == ProductId);
        Assert.Equal(2m, productLine.GetProperty("fromOpenManufacturingOrders").GetDecimal());
        Assert.Equal(1m, productLine.GetProperty("netRequirement").GetDecimal());
        Assert.Equal("Satın al", productLine.GetProperty("recommendation").GetString());
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
        var invalidEnergy = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/operations/{firstOperationId}/complete", new
        {
            actualSetupMinutes = 36m, actualRunMinutes = 60m, actualEnergyQuantityKwh = -1m, actualEnergyCostPerKwhBase = 5m
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidEnergy.StatusCode);
        var operationComplete = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/operations/{firstOperationId}/complete", new
        {
            actualSetupMinutes = 36m, actualRunMinutes = 60m, actualEnergyQuantityKwh = 2.5m, actualEnergyCostPerKwhBase = 5m
        });
        Assert.Equal(HttpStatusCode.OK, operationComplete.StatusCode);
        using var operationJson = JsonDocument.Parse(await operationComplete.Content.ReadAsStringAsync());
        var completedOperation = operationJson.RootElement.GetProperty("operations")[0];
        Assert.Equal(2.5m, completedOperation.GetProperty("actualEnergyQuantityKwh").GetDecimal());
        Assert.Equal(5m, completedOperation.GetProperty("actualEnergyCostPerKwhBase").GetDecimal());
        Assert.Equal(12.5m, completedOperation.GetProperty("actualEnergyCostBase").GetDecimal());
        Assert.Equal(172.5m, completedOperation.GetProperty("actualCostBase").GetDecimal());
        var complete = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        using var completedJson = JsonDocument.Parse(await complete.Content.ReadAsStringAsync());
        Assert.Equal(180.5m, completedJson.RootElement.GetProperty("totalCostBase").GetDecimal());
        Assert.Equal(172.5m, completedJson.RootElement.GetProperty("operationCostBase").GetDecimal());
    }

    [Fact]
    public async Task Manufacturing_scheduler_places_routed_successor_after_predecessor_handoff_day()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var firstCenterResponse = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-ROUTE-1", name = "Cutting", capacityMinutesPerDay = 480, laborCostPerHourBase = 0m, overheadCostPerHourBase = 0m
        });
        var secondCenterResponse = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-ROUTE-2", name = "Assembly", capacityMinutesPerDay = 480, laborCostPerHourBase = 0m, overheadCostPerHourBase = 0m
        });
        Assert.Equal(HttpStatusCode.Created, firstCenterResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, secondCenterResponse.StatusCode);
        using var firstCenterJson = JsonDocument.Parse(await firstCenterResponse.Content.ReadAsStringAsync());
        using var secondCenterJson = JsonDocument.Parse(await secondCenterResponse.Content.ReadAsStringAsync());
        var firstCenterId = firstCenterJson.RootElement.GetProperty("id").GetGuid();
        var secondCenterId = secondCenterJson.RootElement.GetProperty("id").GetGuid();
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-STRICT-ROUTE", name = "Cut then assemble", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[]
            {
                new { sequence = 1, workCenterId = firstCenterId, setupMinutes = 30m, runMinutesPerOutputUnit = 30m },
                new { sequence = 2, workCenterId = secondCenterId, setupMinutes = 30m, runMinutesPerOutputUnit = 30m }
            }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var orderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-STRICT-ROUTE", bomJson.RootElement.GetProperty("id").GetGuid(), 1m, today));
        Assert.Equal(HttpStatusCode.Created, orderResponse.StatusCode);
        using var orderJson = JsonDocument.Parse(await orderResponse.Content.ReadAsStringAsync());
        var orderId = orderJson.RootElement.GetProperty("id").GetGuid();

        var scheduleResponse = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });

        Assert.Equal(HttpStatusCode.OK, scheduleResponse.StatusCode);
        using var scheduleJson = JsonDocument.Parse(await scheduleResponse.Content.ReadAsStringAsync());
        var operations = scheduleJson.RootElement.GetProperty("operations").EnumerateArray().OrderBy(x => x.GetProperty("sequence").GetInt32()).ToArray();
        var predecessorEnd = DateOnly.Parse(operations[0].GetProperty("scheduledEndDate").GetString()!);
        var successorStart = DateOnly.Parse(operations[1].GetProperty("scheduledStartDate").GetString()!);
        var predecessorEndMinute = operations[0].GetProperty("scheduledEndMinuteOfDay").GetInt32();
        var successorStartMinute = operations[1].GetProperty("scheduledStartMinuteOfDay").GetInt32();
        Assert.True(successorStart > predecessorEnd || successorStart == predecessorEnd && successorStartMinute >= predecessorEndMinute,
            $"Successor started {successorStart} at minute {successorStartMinute} before predecessor handoff {predecessorEnd} at minute {predecessorEndMinute}.");
    }

    [Fact]
    public async Task Manufacturing_scheduler_enforces_recipe_minimum_wait_days_between_routed_operations()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var firstCenterId = await CreateWorkCenterAsync(client, "WC-WAIT-1", 480, 127);
        var secondCenterId = await CreateWorkCenterAsync(client, "WC-WAIT-2", 480, 127);
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-WAIT-ROUTE", name = "Cure then finish", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[]
            {
                new { sequence = 1, workCenterId = firstCenterId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m, minimumWaitDaysAfterPrevious = 0 },
                new { sequence = 2, workCenterId = secondCenterId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m, minimumWaitDaysAfterPrevious = 3 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var route = bomJson.RootElement.GetProperty("operations").EnumerateArray().OrderBy(x => x.GetProperty("sequence").GetInt32()).ToArray();
        Assert.Equal(3, route[1].GetProperty("minimumWaitDaysAfterPrevious").GetInt32());

        var invalidBom = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-WAIT-INVALID", name = "Invalid wait", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = firstCenterId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m, minimumWaitDaysAfterPrevious = 366 } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidBom.StatusCode);

        var orderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/",
            Order("MO-WAIT-ROUTE", bomJson.RootElement.GetProperty("id").GetGuid(), 1m, DateOnly.FromDateTime(DateTime.UtcNow)));
        Assert.Equal(HttpStatusCode.Created, orderResponse.StatusCode);
        using var orderJson = JsonDocument.Parse(await orderResponse.Content.ReadAsStringAsync());
        var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        var scheduleResponse = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduleResponse.StatusCode);
        using var scheduleJson = JsonDocument.Parse(await scheduleResponse.Content.ReadAsStringAsync());
        var operations = scheduleJson.RootElement.GetProperty("operations").EnumerateArray().OrderBy(x => x.GetProperty("sequence").GetInt32()).ToArray();
        var predecessorEnd = DateOnly.Parse(operations[0].GetProperty("scheduledEndDate").GetString()!);
        var successorStart = DateOnly.Parse(operations[1].GetProperty("scheduledStartDate").GetString()!);
        Assert.Equal(3, operations[1].GetProperty("minimumWaitDaysAfterPrevious").GetInt32());
        Assert.True(successorStart >= predecessorEnd.AddDays(4),
            $"Successor starts {successorStart}; it must wait three full calendar days after predecessor handoff {predecessorEnd}.");
    }

    [Fact]
    public async Task Manufacturing_scheduler_selects_earliest_eligible_alternative_and_recalculates_machine_cost()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var preferredResponse = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-ALT-PREF", name = "Preferred machine", capacityMinutesPerDay = 480,
            laborCostPerHourBase = 120m, overheadCostPerHourBase = 0m, workingDaysMask = 0
        });
        var alternativeResponse = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-ALT-FAST", name = "Available machine", capacityMinutesPerDay = 480,
            laborCostPerHourBase = 60m, overheadCostPerHourBase = 0m
        });
        Assert.Equal(HttpStatusCode.Created, preferredResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, alternativeResponse.StatusCode);
        using var preferredJson = JsonDocument.Parse(await preferredResponse.Content.ReadAsStringAsync());
        using var alternativeJson = JsonDocument.Parse(await alternativeResponse.Content.ReadAsStringAsync());
        var preferredId = preferredJson.RootElement.GetProperty("id").GetGuid();
        var alternativeId = alternativeJson.RootElement.GetProperty("id").GetGuid();

        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-ALT-MACHINE", name = "Eligible machine route", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = preferredId, eligibleWorkCenterIds = new[] { preferredId, alternativeId },
                setupMinutes = 0m, runMinutesPerOutputUnit = 60m } }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, bomJson.RootElement.GetProperty("operations")[0].GetProperty("eligibleWorkCenterIds").GetArrayLength());
        var invalidEligibility = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-ALT-INVALID", name = "Unknown machine", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = preferredId,
                eligibleWorkCenterIds = new[] { preferredId, Guid.NewGuid() }, setupMinutes = 0m, runMinutesPerOutputUnit = 60m } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidEligibility.StatusCode);
        var orderResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/",
            Order("MO-ALT-MACHINE", bomJson.RootElement.GetProperty("id").GetGuid(), 1m, DateOnly.FromDateTime(DateTime.UtcNow)));
        Assert.Equal(HttpStatusCode.Created, orderResponse.StatusCode);
        using var orderJson = JsonDocument.Parse(await orderResponse.Content.ReadAsStringAsync());
        var orderId = orderJson.RootElement.GetProperty("id").GetGuid();
        var scheduleResponse = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduleResponse.StatusCode);
        using var scheduleJson = JsonDocument.Parse(await scheduleResponse.Content.ReadAsStringAsync());
        var operation = scheduleJson.RootElement.GetProperty("operations")[0];
        Assert.Equal(alternativeId, operation.GetProperty("workCenterId").GetGuid());
        Assert.Equal("WC-ALT-FAST", operation.GetProperty("workCenterCode").GetString());
        Assert.Equal(60m, operation.GetProperty("plannedCostBase").GetDecimal());
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var orderOperationId = operation.GetProperty("id").GetGuid();
        var orderOptions = await verifyDb.ManufacturingOrderOperationWorkCenterOptions.AsNoTracking()
            .Where(x => x.TenantId == TenantA && x.ManufacturingOrderOperationId == orderOperationId).ToListAsync();
        Assert.Equal(2, orderOptions.Count);
        Assert.Contains(orderOptions, x => x.WorkCenterId == preferredId && x.IsPreferred);
        var allocation = await verifyDb.ManufacturingCapacityAllocations.SingleAsync(x => x.TenantId == TenantA &&
            x.ManufacturingOrderOperationId == orderOperationId);
        Assert.Equal(alternativeId, allocation.WorkCenterId);
    }

    [Fact]
    public async Task Work_center_calendar_skips_closed_weekdays_and_honors_zero_capacity_override()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        const int mondayThroughFriday = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
        var centerId = await CreateWorkCenterAsync(client, "WC-CALENDAR-WEEK", 60, mondayThroughFriday);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var orderId = await CreateScheduledOrderAsync(client, "MO-CALENDAR-WEEK", centerId, 0m, 30m, today);
        using var calendar = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = mondayThroughFriday,
            capacityOverrides = new[] { new { workDate = today.ToString("yyyy-MM-dd"), capacityMinutes = 0, note = "Bakım" } }
        });
        Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);

        var response = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var operation = json.RootElement.GetProperty("operations")[0];
        var dates = operation.GetProperty("capacityDays").EnumerateArray()
            .Select(x => DateOnly.Parse(x.GetProperty("date").GetString()!)).ToArray();
        var expected = today.AddDays(1);
        while ((mondayThroughFriday & (1 << (int)expected.DayOfWeek)) == 0) expected = expected.AddDays(1);
        Assert.Equal(expected, dates.Single());
        Assert.DoesNotContain(dates, date => date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday);
        Assert.DoesNotContain(today, dates);
    }

    [Fact]
    public async Task Work_center_calendar_reduced_capacity_is_used_for_date_override()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-CALENDAR-REDUCED", 120, 127);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var orderId = await CreateScheduledOrderAsync(client, "MO-CALENDAR-REDUCED", centerId, 0m, 35m, today);
        using var calendar = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            capacityOverrides = new[] { new { workDate = today.ToString("yyyy-MM-dd"), capacityMinutes = 15, note = "Kısa vardiya" } }
        });
        Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);

        var response = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var days = json.RootElement.GetProperty("operations")[0].GetProperty("capacityDays").EnumerateArray().ToArray();
        Assert.Equal(2, days.Length);
        Assert.Equal(today, DateOnly.Parse(days[0].GetProperty("date").GetString()!));
        Assert.Equal(15m, days[0].GetProperty("minutes").GetDecimal());
        Assert.Equal(20m, days[1].GetProperty("minutes").GetDecimal());
    }

    [Fact]
    public async Task Annual_work_center_closures_apply_each_year_and_dated_override_has_precedence()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var closedCenterId = await CreateWorkCenterAsync(client, "WC-ANNUAL-CLOSED", 60, 127);
        var closedOrderId = await CreateScheduledOrderAsync(client, "MO-ANNUAL-CLOSED", closedCenterId, 0m, 30m, today);
        using (var calendar = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{closedCenterId}/calendar", new
        {
            workingDaysMask = 127,
            annualCapacityRules = new[] { new { month = today.Month, day = today.Day, capacityMinutes = 0, note = "Her yıl bakım" } }
        })) Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);

        using var closedSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{closedOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, closedSchedule.StatusCode);
        using var closedJson = JsonDocument.Parse(await closedSchedule.Content.ReadAsStringAsync());
        var closedDates = closedJson.RootElement.GetProperty("operations")[0].GetProperty("capacityDays").EnumerateArray()
            .Select(x => DateOnly.Parse(x.GetProperty("date").GetString()!)).ToArray();
        Assert.DoesNotContain(today, closedDates);
        Assert.Equal(today.AddDays(1), closedDates[0]);

        var overrideCenterId = await CreateWorkCenterAsync(client, "WC-ANNUAL-OVERRIDE", 60, 127);
        var overrideOrderId = await CreateScheduledOrderAsync(client, "MO-ANNUAL-OVERRIDE", overrideCenterId, 0m, 35m, today);
        using (var calendar = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{overrideCenterId}/calendar", new
        {
            workingDaysMask = 127,
            capacityOverrides = new[] { new { workDate = today.ToString("yyyy-MM-dd"), capacityMinutes = 15, note = "Özel çalışma" } },
            annualCapacityRules = new[] { new { month = today.Month, day = today.Day, capacityMinutes = 0, note = "Yıllık kapanış" } }
        })) Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);

        using var overrideSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{overrideOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, overrideSchedule.StatusCode);
        using var overrideJson = JsonDocument.Parse(await overrideSchedule.Content.ReadAsStringAsync());
        var overrideDays = overrideJson.RootElement.GetProperty("operations")[0].GetProperty("capacityDays").EnumerateArray().ToArray();
        Assert.Equal(today, DateOnly.Parse(overrideDays[0].GetProperty("date").GetString()!));
        Assert.Equal(15m, overrideDays[0].GetProperty("minutes").GetDecimal());
        Assert.Equal(20m, overrideDays[1].GetProperty("minutes").GetDecimal());
    }

    [Fact]
    public async Task Annual_february_29_rule_is_valid_and_only_closes_leap_days()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-ANNUAL-LEAP", 60, 127);
        using (var invalid = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            annualCapacityRules = new[] { new { month = 2, day = 30, capacityMinutes = 0, note = "Invalid" } }
        })) Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var year = DateTime.UtcNow.Year;
        while (!DateTime.IsLeapYear(year) || new DateOnly(year, 2, 29) < DateOnly.FromDateTime(DateTime.UtcNow)) year++;
        var leapDay = new DateOnly(year, 2, 29);
        using (var leapRule = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            annualCapacityRules = new[] { new { month = 2, day = 29, capacityMinutes = 0, note = "Yıllık bakım" } }
        }))
        {
            Assert.Equal(HttpStatusCode.OK, leapRule.StatusCode);
            using var body = JsonDocument.Parse(await leapRule.Content.ReadAsStringAsync());
            var rule = body.RootElement.GetProperty("annualCapacityRules")[0];
            Assert.Equal(2, rule.GetProperty("month").GetInt32());
            Assert.Equal(29, rule.GetProperty("day").GetInt32());
        }

        var leapOrderId = await CreateScheduledOrderAsync(client, "MO-ANNUAL-LEAP", centerId, 0m, 30m, leapDay);
        using var leapSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{leapOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, leapSchedule.StatusCode);
        using var leapJson = JsonDocument.Parse(await leapSchedule.Content.ReadAsStringAsync());
        var leapDates = leapJson.RootElement.GetProperty("operations")[0].GetProperty("capacityDays").EnumerateArray()
            .Select(x => DateOnly.Parse(x.GetProperty("date").GetString()!)).ToArray();
        Assert.DoesNotContain(leapDay, leapDates);
        Assert.Equal(leapDay.AddDays(1), leapDates[0]);

        var commonYearDate = new DateOnly(year + 1, 2, 28);
        var commonYearOrderId = await CreateScheduledOrderAsync(client, "MO-ANNUAL-COMMON", centerId, 0m, 30m, commonYearDate);
        using var commonSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{commonYearOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, commonSchedule.StatusCode);
        using var commonJson = JsonDocument.Parse(await commonSchedule.Content.ReadAsStringAsync());
        Assert.Equal(commonYearDate.ToString("yyyy-MM-dd"), commonJson.RootElement.GetProperty("operations")[0]
            .GetProperty("capacityDays")[0].GetProperty("date").GetString());
    }

    [Fact]
    public async Task Effective_dated_shift_rotation_schedules_work_and_preserves_precedence()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-ROTATING-SHIFTS", 120, 127);
        var startDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2);
        var orderId = await CreateScheduledOrderAsync(client, "MO-ROTATING-SHIFTS", centerId, 0m, 90m, startDate);
        using (var calendar = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 0,
            capacityOverrides = Array.Empty<object>(),
            shiftRotations = new[]
            {
                new
                {
                    effectiveFromDate = startDate.ToString("yyyy-MM-dd"), effectiveToDate = (DateOnly?)null, note = "2-day rotation",
                    days = new[]
                    {
                        new { dayIndex = 0, capacityMinutes = 60, shiftStartMinuteOfDay = 480, shiftEndMinuteOfDay = 540 },
                        new { dayIndex = 1, capacityMinutes = 60, shiftStartMinuteOfDay = 1200, shiftEndMinuteOfDay = 1260 }
                    }
                }
            }
        }))
        {
            Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);
            using var calendarJson = JsonDocument.Parse(await calendar.Content.ReadAsStringAsync());
            Assert.Equal(2, calendarJson.RootElement.GetProperty("shiftRotations")[0].GetProperty("days").GetArrayLength());
        }

        using var scheduled = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduled.StatusCode);
        using var json = JsonDocument.Parse(await scheduled.Content.ReadAsStringAsync());
        var days = json.RootElement.GetProperty("operations")[0].GetProperty("capacityDays").EnumerateArray().ToArray();
        Assert.Equal(2, days.Length);
        Assert.Equal(startDate.ToString("yyyy-MM-dd"), days[0].GetProperty("date").GetString());
        Assert.Equal(480, days[0].GetProperty("startMinuteOfDay").GetInt32());
        Assert.Equal(540, days[0].GetProperty("endMinuteOfDay").GetInt32());
        Assert.Equal(startDate.AddDays(1).ToString("yyyy-MM-dd"), days[1].GetProperty("date").GetString());
        Assert.Equal(1200, days[1].GetProperty("startMinuteOfDay").GetInt32());
        Assert.Equal(1230, days[1].GetProperty("endMinuteOfDay").GetInt32());
    }

    [Fact]
    public async Task Overlapping_effective_shift_rotations_are_rejected()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-ROTATION-OVERLAP", 60, 127);
        using var response = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            shiftRotations = new[]
            {
                new { effectiveFromDate = DateOnly.Parse("2026-10-01"), effectiveToDate = (DateOnly?)DateOnly.Parse("2026-10-31"), days = new[] { new { dayIndex = 0, capacityMinutes = 60, shiftStartMinuteOfDay = 480, shiftEndMinuteOfDay = 540 } } },
                new { effectiveFromDate = DateOnly.Parse("2026-10-31"), effectiveToDate = (DateOnly?)null, days = new[] { new { dayIndex = 0, capacityMinutes = 60, shiftStartMinuteOfDay = 540, shiftEndMinuteOfDay = 600 } } }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Work_center_calendar_is_tenant_scoped_for_read_and_write()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-CALENDAR-TENANT", 60, 127);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        using (var update = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            capacityOverrides = new[] { new { workDate = today.ToString("yyyy-MM-dd"), capacityMinutes = 0, note = "Tenant A only" } },
            annualCapacityRules = new[] { new { month = 12, day = 25, capacityMinutes = 0, note = "Tenant A only annual rule" } }
        })) Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        using (var legacyCalendarUpdate = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new
        {
            workingDaysMask = 127,
            capacityOverrides = new[] { new { workDate = today.ToString("yyyy-MM-dd"), capacityMinutes = 0, note = "Tenant A only" } }
        })) Assert.Equal(HttpStatusCode.OK, legacyCalendarUpdate.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/work-centers/{centerId}/calendar")).StatusCode);
        using var crossTenantUpdate = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new { workingDaysMask = 0 });
        Assert.Equal(HttpStatusCode.NotFound, crossTenantUpdate.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var persisted = await client.GetFromJsonAsync<JsonElement>($"/api/manufacturing/work-centers/{centerId}/calendar");
        Assert.Equal(127, persisted.GetProperty("workingDaysMask").GetInt32());
        Assert.Equal(0, persisted.GetProperty("capacityOverrides")[0].GetProperty("capacityMinutes").GetInt32());
        Assert.Equal(1, persisted.GetProperty("annualCapacityRules").GetArrayLength());
        Assert.Equal(25, persisted.GetProperty("annualCapacityRules")[0].GetProperty("day").GetInt32());
    }

    [Fact]
    public async Task Failed_schedule_keeps_existing_schedule_and_writes_no_partial_allocations()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerId = await CreateWorkCenterAsync(client, "WC-CALENDAR-ROLLBACK", 60, 127);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var orderId = await CreateScheduledOrderAsync(client, "MO-CALENDAR-ROLLBACK", centerId, 0m, 30m, today);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { })).StatusCode);
        Guid operationId; DateOnly originalDate;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var operation = await db.ManufacturingOrderOperations.SingleAsync(x => x.TenantId == TenantA && x.ManufacturingOrderId == orderId);
            operationId = operation.Id;
            originalDate = (await db.ManufacturingCapacityAllocations.SingleAsync(x => x.TenantId == TenantA && x.ManufacturingOrderOperationId == operationId)).ScheduledDate;
        }
        using var closed = await client.PutAsJsonAsync($"/api/manufacturing/work-centers/{centerId}/calendar", new { workingDaysMask = 0 });
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);

        using var failed = await client.PostAsJsonAsync($"/api/manufacturing/orders/{orderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.Conflict, failed.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var persistedOperation = await verifyDb.ManufacturingOrderOperations.SingleAsync(x => x.TenantId == TenantA && x.Id == operationId);
        Assert.Equal(originalDate, persistedOperation.ScheduledStartDate);
        var persistedAllocations = await verifyDb.ManufacturingCapacityAllocations
            .Where(x => x.TenantId == TenantA && x.ManufacturingOrderOperationId == operationId).ToListAsync();
        Assert.Single(persistedAllocations);
        Assert.Equal(originalDate, persistedAllocations[0].ScheduledDate);
    }

    [Fact]
    public async Task Rescheduling_counts_other_orders_and_calendar_days_keep_operation_order()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var firstCenterId = await CreateWorkCenterAsync(client, "WC-CALENDAR-ROUTE-1", 60, 127);
        var secondCenterId = await CreateWorkCenterAsync(client, "WC-CALENDAR-ROUTE-2", 60, 127);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var firstOrderId = await CreateScheduledOrderAsync(client, "MO-CALENDAR-OCCUPIED-1", firstCenterId, 0m, 60m, today);
        var secondOrderId = await CreateScheduledOrderAsync(client, "MO-CALENDAR-OCCUPIED-2", firstCenterId, 0m, 60m, today);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstOrderId}/schedule", new { })).StatusCode);
        var secondSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{secondOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, secondSchedule.StatusCode);
        using var secondJson = JsonDocument.Parse(await secondSchedule.Content.ReadAsStringAsync());
        var secondOperation = secondJson.RootElement.GetProperty("operations")[0];
        var occupiedDate = DateOnly.Parse(secondOperation.GetProperty("capacityDays")[0].GetProperty("date").GetString()!);
        Assert.True(occupiedDate > today);

        var rescheduledSecond = await client.PostAsJsonAsync($"/api/manufacturing/orders/{secondOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, rescheduledSecond.StatusCode);
        using var rescheduledJson = JsonDocument.Parse(await rescheduledSecond.Content.ReadAsStringAsync());
        Assert.Equal(occupiedDate, DateOnly.Parse(rescheduledJson.RootElement.GetProperty("operations")[0]
            .GetProperty("capacityDays")[0].GetProperty("date").GetString()!));

        var routeBom = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-CALENDAR-ROUTE", name = "Calendar route", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[]
            {
                new { sequence = 1, workCenterId = firstCenterId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m },
                new { sequence = 2, workCenterId = secondCenterId, setupMinutes = 0m, runMinutesPerOutputUnit = 30m }
            }
        });
        Assert.Equal(HttpStatusCode.Created, routeBom.StatusCode);
        using var bomJson = JsonDocument.Parse(await routeBom.Content.ReadAsStringAsync());
        var routeOrder = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-CALENDAR-ROUTE", bomJson.RootElement.GetProperty("id").GetGuid(), 1m, today));
        Assert.Equal(HttpStatusCode.Created, routeOrder.StatusCode);
        using var orderJson = JsonDocument.Parse(await routeOrder.Content.ReadAsStringAsync());
        var routeOrderId = orderJson.RootElement.GetProperty("id").GetGuid();
        var routeSchedule = await client.PostAsJsonAsync($"/api/manufacturing/orders/{routeOrderId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, routeSchedule.StatusCode);
        using var routeJson = JsonDocument.Parse(await routeSchedule.Content.ReadAsStringAsync());
        var routeOperations = routeJson.RootElement.GetProperty("operations").EnumerateArray().OrderBy(x => x.GetProperty("sequence").GetInt32()).ToArray();
        var predecessorEnd = DateOnly.Parse(routeOperations[0].GetProperty("scheduledEndDate").GetString()!);
        var successorStart = DateOnly.Parse(routeOperations[1].GetProperty("scheduledStartDate").GetString()!);
        var predecessorEndMinute = routeOperations[0].GetProperty("scheduledEndMinuteOfDay").GetInt32();
        var successorStartMinute = routeOperations[1].GetProperty("scheduledStartMinuteOfDay").GetInt32();
        Assert.True(successorStart > predecessorEnd || successorStart == predecessorEnd && successorStartMinute >= predecessorEndMinute);
    }

    private static async Task<Guid> CreateWorkCenterAsync(HttpClient client, string code, int capacityMinutes, int workingDaysMask)
    {
        var response = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code, name = code, capacityMinutesPerDay = capacityMinutes, laborCostPerHourBase = 0m,
            overheadCostPerHourBase = 0m, workingDaysMask
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateScheduledOrderAsync(HttpClient client, string code, Guid workCenterId,
        decimal setupMinutes, decimal runMinutes, DateOnly plannedDate)
    {
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = $"BOM-{code}", name = code, productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId, setupMinutes, runMinutesPerOutputUnit = runMinutes } }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bom = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var order = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order(code, bom.RootElement.GetProperty("id").GetGuid(), 1m, plannedDate));
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        using var orderJson = JsonDocument.Parse(await order.Content.ReadAsStringAsync());
        return orderJson.RootElement.GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Cancelling_scheduled_manufacturing_order_clears_dates_and_releases_capacity()
    {
        await using var app = await StartAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var centerResponse = await client.PostAsJsonAsync("/api/manufacturing/work-centers/", new
        {
            code = "WC-CANCEL-SCHEDULE", name = "Cancellation test", capacityMinutesPerDay = 480,
            laborCostPerHourBase = 0m, overheadCostPerHourBase = 0m
        });
        Assert.Equal(HttpStatusCode.Created, centerResponse.StatusCode);
        using var centerJson = JsonDocument.Parse(await centerResponse.Content.ReadAsStringAsync());
        var centerId = centerJson.RootElement.GetProperty("id").GetGuid();
        var bomResponse = await client.PostAsJsonAsync("/api/manufacturing/boms/", new
        {
            code = "BOM-CANCEL-SCHEDULE", name = "Cancellation test", productStockItemId = ProductId, outputQuantity = 1m,
            lines = new[] { new { componentStockItemId = ComponentId, quantity = 1m, scrapPercent = 0m } },
            operations = new[] { new { sequence = 1, workCenterId = centerId, setupMinutes = 30m, runMinutesPerOutputUnit = 30m } }
        });
        Assert.Equal(HttpStatusCode.Created, bomResponse.StatusCode);
        using var bomJson = JsonDocument.Parse(await bomResponse.Content.ReadAsStringAsync());
        var bomId = bomJson.RootElement.GetProperty("id").GetGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var firstResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-CANCEL-SCHEDULE-1", bomId, 1m, today));
        var secondResponse = await client.PostAsJsonAsync("/api/manufacturing/orders/", Order("MO-CANCEL-SCHEDULE-2", bomId, 1m, today));
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, secondResponse.StatusCode);
        using var firstJson = JsonDocument.Parse(await firstResponse.Content.ReadAsStringAsync());
        using var secondJson = JsonDocument.Parse(await secondResponse.Content.ReadAsStringAsync());
        var firstId = firstJson.RootElement.GetProperty("id").GetGuid();
        var secondId = secondJson.RootElement.GetProperty("id").GetGuid();

        var scheduledFirst = await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduledFirst.StatusCode);
        using var scheduledFirstJson = JsonDocument.Parse(await scheduledFirst.Content.ReadAsStringAsync());
        var firstOperation = scheduledFirstJson.RootElement.GetProperty("operations")[0];
        var originallyAllocatedDate = DateOnly.Parse(firstOperation.GetProperty("capacityDays")[0].GetProperty("date").GetString()!);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync($"/api/manufacturing/orders/{firstId}/cancel", new { })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var cancelledOperation = await db.ManufacturingOrderOperations.SingleAsync(x => x.TenantId == TenantA && x.ManufacturingOrderId == firstId);
            Assert.Null(cancelledOperation.ScheduledStartDate);
            Assert.Null(cancelledOperation.ScheduledEndDate);
            Assert.Empty(await db.ManufacturingCapacityAllocations.Where(x => x.TenantId == TenantA && x.ManufacturingOrderOperationId == cancelledOperation.Id).ToListAsync());
        }

        var scheduledSecond = await client.PostAsJsonAsync($"/api/manufacturing/orders/{secondId}/schedule", new { });
        Assert.Equal(HttpStatusCode.OK, scheduledSecond.StatusCode);
        using var scheduledSecondJson = JsonDocument.Parse(await scheduledSecond.Content.ReadAsStringAsync());
        var secondOperation = scheduledSecondJson.RootElement.GetProperty("operations")[0];
        Assert.Equal(originallyAllocatedDate.ToString("yyyy-MM-dd"), secondOperation.GetProperty("capacityDays")[0].GetProperty("date").GetString());
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
        var mediumLicense = LicenseTierCatalog.All["Medium"];
        platformDb.TenantLicenses.Add(new TenantLicense { TenantId = TenantA, LicenseId = Guid.NewGuid(), Tier = mediumLicense.Code,
            MaxUsers = mediumLicense.MaxUsers, MaxCustomModules = mediumLicense.MaxCustomModules, MaxStorageGb = mediumLicense.MaxStorageGb,
            IssuedAt = DateTimeOffset.UtcNow.AddDays(-1), ExpiresAt = DateTimeOffset.UtcNow.AddDays(30), GrantSha256 = new string('A', 64) });
        await platformDb.SaveChangesAsync();
        return app;
    }
}
