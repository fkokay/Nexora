using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// The page-made requestId of depo.transfer.olustur on SQL Server (the handler takes UPDLOCK/HOLDLOCK row locks, which
/// InMemory cannot run): the first post is 201, the same body again is 200 with the same transfer and no new movement, and a
/// different body with that requestId is 409. The page treats 200 and 201 alike, so a retry after a lost response never posts
/// twice. Skipped without a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class InventoryTransferRetrySqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Same_request_id_returns_existing_transfer_and_different_body_conflicts()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("TransferRetry");
        var tenantId = harness.TenantId;
        var item = new StockItem { TenantId = tenantId, Code = "SKU-TR-RETRY", Name = "Synthetic item", UnitCode = "EA" };
        var source = new Warehouse { TenantId = tenantId, Code = "WH-TR-A", Name = "Synthetic source" };
        var target = new Warehouse { TenantId = tenantId, Code = "WH-TR-B", Name = "Synthetic target" };
        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.StockItems.Add(item);
            seedDb.Warehouses.AddRange(source, target);
            seedDb.InventoryTransactions.Add(new InventoryTransaction
            {
                TenantId = tenantId, Warehouse = source, StockItem = item, EntryDate = date.AddDays(-1), Direction = InventoryDirection.Receipt,
                Quantity = 10m, UnitCostBase = 5m, Description = "Synthetic opening stock"
            });
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();
        var client = harness.Client;
        var requestId = Guid.NewGuid();
        object Body(decimal quantity) => new
        {
            requestId, fromWarehouseId = source.Id, toWarehouseId = target.Id, transferDate = date.ToString("yyyy-MM-dd"),
            lines = new[] { new { stockItemId = item.Id, quantity } }
        };

        using var first = await client.PostAsJsonAsync("/api/warehouses/transfers", Body(2m));
        Assert.True(first.StatusCode == HttpStatusCode.Created, $"{first.StatusCode}: {await first.Content.ReadAsStringAsync()}");
        var created = await first.Content.ReadFromJsonAsync<JsonElement>();
        var movements = await CountAsync(harness, tenantId);
        Assert.Equal(3, movements);

        using var retry = await client.PostAsJsonAsync("/api/warehouses/transfers", Body(2m));
        Assert.True(retry.StatusCode == HttpStatusCode.OK, $"{retry.StatusCode}: {await retry.Content.ReadAsStringAsync()}");
        var returned = await retry.Content.ReadFromJsonAsync<JsonElement>();
        // Same summary shape as the 201: the page reads the same record result.
        Assert.Equal(created.EnumerateObject().Select(x => x.Name), returned.EnumerateObject().Select(x => x.Name));
        Assert.Equal((created.GetProperty("id").GetGuid(), created.GetProperty("code").GetString()),
            (returned.GetProperty("id").GetGuid(), returned.GetProperty("code").GetString()));
        Assert.Equal(movements, await CountAsync(harness, tenantId));

        using var changed = await client.PostAsJsonAsync("/api/warehouses/transfers", Body(3m));
        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        Assert.Equal(movements, await CountAsync(harness, tenantId));
        await using var db = harness.NewTenantDb();
        Assert.Equal(1, await db.InventoryTransfers.CountAsync(x => x.TenantId == tenantId));
    }

    private static async Task<int> CountAsync(FiscalCloseRouteSqlAcceptanceHarness harness, Guid tenantId)
    {
        await using var db = harness.NewTenantDb();
        return await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId);
    }
}
