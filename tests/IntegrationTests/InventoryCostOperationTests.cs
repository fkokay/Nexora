using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static AIERP.Api.IntegrationTests.ErpOperationCatalogTests;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Stok Değerleme (inventory-cost) operations: each maps to the endpoint the legacy screen calls, with that endpoint's
/// permission; every write handler only accepts TenantAdmin, so no new privilege is created.
/// </summary>
public sealed class InventoryCostOperationTests
{
    private static readonly Guid User = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    public static TheoryData<string, string, string, string, string, bool> Shapes => new()
    {
        { "stok.maliyet.kayitlari", "Stok", "GET", "/api/warehouses/{warehouseId}/stock/{stockItemId}/cost-adjustments", "warehouseId,stockItemId", false },
        { "stok.maliyet.yenidenDegerle", "Stok", "POST", "/api/warehouses/{warehouseId}/stock/{stockItemId}/revaluations", "warehouseId,stockItemId,entryDate,amountBase,reason", true },
        { "stok.maliyet.tersKayit", "Stok", "POST", "/api/warehouses/cost-adjustments/{id}/reverse", "id,reason", true },
        { "satinalma.malKabul.listele", "Satınalma", "GET", "/api/purchasing/receipts", "page,pageSize", false },
        { "satinalma.malKabul.ekMaliyetler", "Satınalma", "GET", "/api/purchasing/receipts/{id}/landed-costs", "id", false },
        { "satinalma.malKabul.ekMaliyetDagit", "Satınalma", "POST", "/api/purchasing/receipts/{id}/landed-costs", "id,entryDate,amountBase,allocationMethod,description", true },
        { "satinalma.malKabul.ekMaliyetTersKayit", "Satınalma", "POST", "/api/purchasing/receipts/{id}/landed-costs/{adjustmentId}/reverse", "id,adjustmentId,reason", true },
    };

    [Theory]
    [MemberData(nameof(Shapes))]
    public void Operation_follows_the_legacy_endpoint(string name, string module, string method, string route, string parameters, bool tenantAdmin)
    {
        Assert.True(ErpOperationCatalog.TryGet(name, out var op), name);
        Assert.Equal(module, op.Module);
        Assert.Equal(method, op.Method);
        Assert.Equal(route, op.Route);
        Assert.Equal(parameters.Split(','), op.Parameters.Select(x => x.Name));
        Assert.Equal(tenantAdmin, op.RequiresTenantAdmin);
        Assert.Equal(method == "GET" ? "read" : "write", op.Kind);
        if (op.Kind == "write") Assert.Equal("insert", op.PageKind);
        // Every body field of these requests is required by the handler (no defaults).
        Assert.All(op.Parameters.Where(x => x.In is "body" or "route"), x => Assert.True(x.Required, $"{name}.{x.Name}"));
        Assert.Empty(op.RouteVariants);
        Assert.Null(op.BodyMap);
        Assert.Null(op.SourceOperation);
        Assert.Null(op.FixedBody);
    }

    [Fact]
    public void Adjustment_columns_are_scalar_and_carry_has_reversal()
    {
        Assert.True(ErpOperationCatalog.TryGet("stok.maliyet.kayitlari", out var op));
        Assert.Null(op.Result.RowsPath);
        Assert.Equal(["id", "code", "entryDate", "kind", "purchaseReceiptId", "description", "reversalOfId", "createdAt", "totalAmountBase", "hasReversal"],
            op.Result.Columns.Select(x => x.Code));
        Assert.Equal(new ErpOperationColumn("hasReversal", "Ters kaydı var", "bool"), op.Result.Columns[^1]);
        Assert.Equal(new ErpOperationColumn("kind", "Kayıt türü", "text"), op.Result.Columns.Single(x => x.Code == "kind"));
        Assert.True(ErpOperationCatalog.TryGet("satinalma.malKabul.listele", out var receipts));
        Assert.Equal("items", receipts.Result.RowsPath);
        Assert.Equal(["id", "code", "purchaseOrderId", "purchaseOrderCode", "warehouseId", "warehouseName", "receiptDate", "status", "lineCount", "createdAt"],
            receipts.Result.Columns.Select(x => x.Code));
        Assert.All(receipts.Parameters, x => Assert.Equal(("query", false), (x.In, x.Required)));
    }

    [Theory]
    [InlineData("GET", "/api/warehouses/{warehouseId}/stock/{stockItemId}/cost-adjustments", "/api/warehouses/{warehouseId:guid}/stock/{stockItemId:guid}/cost-adjustments", "erp.inventory-cost-adjustments.read")]
    // "revaluations" is not an execution route segment, so the POST resolves to create (existing behaviour, unchanged).
    [InlineData("POST", "/api/warehouses/{warehouseId}/stock/{stockItemId}/revaluations", "/api/warehouses/{warehouseId:guid}/stock/{stockItemId:guid}/revaluations", "erp.inventory-cost-adjustments.create")]
    [InlineData("POST", "/api/warehouses/cost-adjustments/{id}/reverse", "/api/warehouses/cost-adjustments/{id:guid}/reverse", "erp.inventory-cost-adjustments.execute")]
    [InlineData("GET", "/api/purchasing/receipts", "/api/purchasing/receipts/", "erp.purchase-receipts.read")]
    [InlineData("GET", "/api/purchasing/receipts/{id}/landed-costs", "/api/purchasing/receipts/{id:guid}/landed-costs", "erp.inventory-cost-adjustments.read")]
    [InlineData("POST", "/api/purchasing/receipts/{id}/landed-costs", "/api/purchasing/receipts/{id:guid}/landed-costs", "erp.inventory-cost-adjustments.create")]
    [InlineData("POST", "/api/purchasing/receipts/{id}/landed-costs/{adjustmentId}/reverse", "/api/purchasing/receipts/{id:guid}/landed-costs/{adjustmentId:guid}/reverse", "erp.inventory-cost-adjustments.execute")]
    public void Route_resolves_to_the_endpoint_permission(string method, string route, string pattern, string expected)
    {
        var path = route.Replace("{warehouseId}", Guid.Empty.ToString("D")).Replace("{stockItemId}", Guid.Empty.ToString("D"))
            .Replace("{adjustmentId}", Guid.Empty.ToString("D")).Replace("{id}", Guid.Empty.ToString("D"));
        Assert.True(PlatformPermissionCatalog.TryResolve(path, method, pattern, new Dictionary<string, string?>(), TenantA, User, "TenantUser", out var resolved));
        Assert.Equal(expected, resolved!.Permission.Code);
    }

    [Fact]
    public async Task Writes_stay_tenant_admin_only_whatever_the_rules_say()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, platformDb =>
        {
            foreach (var code in new[] { "erp.custom-menus.read", "erp.inventory-cost-adjustments.read", "erp.inventory-cost-adjustments.create",
                         "erp.inventory-cost-adjustments.execute", "erp.purchase-receipts.read" })
                platformDb.TenantPermissionRules.Add(Rule(code));
        });
        using var client = factory.CreateClient();
        SetIdentity(client, User, "TenantUser");
        var userOps = await OperationsAsync(client);
        foreach (var read in new[] { "stok.maliyet.kayitlari", "satinalma.malKabul.listele", "satinalma.malKabul.ekMaliyetler" })
            Assert.True(userOps[read].GetProperty("allowed").GetBoolean(), read);
        foreach (var write in new[] { "stok.maliyet.yenidenDegerle", "stok.maliyet.tersKayit", "satinalma.malKabul.ekMaliyetDagit", "satinalma.malKabul.ekMaliyetTersKayit" })
            Assert.False(userOps[write].GetProperty("allowed").GetBoolean(), write);

        SetIdentity(client, Admin, "TenantAdmin");
        var adminOps = await OperationsAsync(client);
        foreach (var row in Shapes)
            Assert.True(adminOps[(string)row[0]].GetProperty("allowed").GetBoolean(), (string)row[0]);
        Assert.Equal("Satınalma", adminOps["satinalma.malKabul.listele"].GetProperty("module").GetString());
    }

    [Fact]
    public async Task Receipt_reads_need_their_own_permissions()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, platformDb =>
        {
            foreach (var code in new[] { "erp.custom-menus.read", "erp.purchase-receipts.read" }) platformDb.TenantPermissionRules.Add(Rule(code));
        });
        using var client = factory.CreateClient();
        SetIdentity(client, User, "TenantUser");
        var ops = await OperationsAsync(client);
        Assert.True(ops["satinalma.malKabul.listele"].GetProperty("allowed").GetBoolean());
        // Landed cost rows belong to the cost adjustment resource, not to the receipt.
        Assert.False(ops["satinalma.malKabul.ekMaliyetler"].GetProperty("allowed").GetBoolean());
        Assert.False(ops["stok.maliyet.kayitlari"].GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task Cost_adjustment_rows_report_their_reversal()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        var warehouse = new Warehouse { TenantId = TenantA, Code = "MRK", Name = "Merkez", IsActive = true };
        var item = new StockItem { TenantId = TenantA, Code = "STK-1", Name = "Vida", UnitCode = "EA", IsActive = true };
        var original = new InventoryCostAdjustment
        {
            TenantId = TenantA, Code = "DGR-1", EntryDate = new DateOnly(2026, 11, 1), Kind = InventoryCostAdjustmentKind.Revaluation,
            Description = "Değerleme", CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-2)
        };
        var reversal = new InventoryCostAdjustment
        {
            TenantId = TenantA, Code = "DGR-2", EntryDate = new DateOnly(2026, 11, 2), Kind = InventoryCostAdjustmentKind.Reversal,
            Description = "Ters kayıt", ReversalOfId = original.Id, CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-1)
        };
        var open = new InventoryCostAdjustment
        {
            TenantId = TenantA, Code = "DGR-3", EntryDate = new DateOnly(2026, 11, 3), Kind = InventoryCostAdjustmentKind.Revaluation,
            Description = "Açık değerleme", CreatedAt = DateTimeOffset.UtcNow
        };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" });
            db.Warehouses.Add(warehouse);
            db.StockItems.Add(item);
            foreach (var (adjustment, amount) in new[] { (original, 10m), (reversal, -10m), (open, 4m) })
            {
                adjustment.Lines.Add(new InventoryCostAdjustmentLine
                {
                    TenantId = TenantA, AdjustmentId = adjustment.Id, WarehouseId = warehouse.Id, StockItemId = item.Id, QuantitySnapshot = 2m, AmountBase = amount
                });
                db.InventoryCostAdjustments.Add(adjustment);
            }
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");
        using var response = await client.GetAsync($"/api/warehouses/{warehouse.Id:D}/stock/{item.Id:D}/cost-adjustments");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var rows = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!, x => x.Clone());
        Assert.True(rows["DGR-1"].GetProperty("hasReversal").GetBoolean());
        Assert.False(rows["DGR-2"].GetProperty("hasReversal").GetBoolean());
        Assert.False(rows["DGR-3"].GetProperty("hasReversal").GetBoolean());
        Assert.Equal("Revaluation", rows["DGR-1"].GetProperty("kind").GetString());
        Assert.True(ErpOperationCatalog.TryGet("stok.maliyet.kayitlari", out var op));
        Assert.All(op.Result.Columns, column => Assert.True(rows["DGR-1"].TryGetProperty(column.Code, out _), column.Code));
    }

    private static TenantPermissionRule Rule(string code) => new()
    {
        TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser", PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true
    };

    private static async Task<Dictionary<string, JsonElement>> OperationsAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("operations").EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.Clone());
    }
}
