using System.Text.Json.Nodes;
using AIERP.Api;
using Xunit;

/// <summary>
/// "Lot / Seri İzleme" standard (inventory-tracking): the embedded envelope pins the read-only list on
/// <c>stok.izleme.bakiyeler</c>, its filters, the screen view mapping and the detail panel's expiry conditions.
/// </summary>
public sealed class InventoryTrackingStandardTests
{
    private const string Key = "inventory-tracking";

    [Fact]
    public void Header_is_preview_version_1()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal(1, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Lot / Seri İzleme", standard.Title);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, 1), out var restrictedError), restrictedError);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
    }

    [Fact]
    public void Page_only_reads()
    {
        // The legacy screen is read only: no write query, no delete/new/open command and no write button.
        Assert.All(Definition()["queries"]!.AsArray().OfType<JsonObject>(), x => Assert.Equal("read", (string)x["kind"]!));
        Assert.Equal(new[] { "stok.izleme.bakiyeler", "depo.listele" },
            Definition()["queries"]!.AsArray().Select(x => (string)x!["operation"]!));
        foreach (var operation in new[] { "stok.izleme.bakiyeler", "depo.listele" })
        {
            Assert.True(ErpOperationCatalog.TryGet(operation, out var op), operation);
            Assert.Equal(("read", "GET"), (op.Kind, op.Method));
        }
        var bar = Props("komutlar");
        Assert.Equal(new[] { "focusInput", "exportTable", "titleCount" }, bar.Select(x => x.Key));
        Assert.Equal("{{bakiye.meta.totalCount}}", (string)bar["titleCount"]!);
        Assert.DoesNotContain(AllComponents(), x => (string)x["type"]! is "button" or "dialog" or "form" or "formCard" or "editableGrid");
    }

    [Fact]
    public void List_is_server_paged_on_tracking_balances()
    {
        var props = Props("liste");
        Assert.Equal(("bakiye", "server", 50), ((string)props["query"]!, (string)props["paging"]!, (int)props["pageSize"]!));
        Assert.Equal(8, (int)props["width"]!);
        Assert.Equal(4, (int)Props("detayKarti")["width"]!);
        Assert.Equal("Aktif lot veya seri bakiyesi bulunamadı.", (string)props["emptyText"]!);
        var expected = new Dictionary<string, string>
        {
            ["q"] = "{{suzgec.q}}", ["warehouseId"] = "{{suzgec.warehouseId}}", ["trackingMode"] = "{{suzgec.trackingMode}}",
            ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("bakiye")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("bakiye", parameter));

        var bar = Props("suzgec");
        Assert.Equal(("liste", true, "q"), ((string)bar["table"]!, (bool)bar["search"]!, (string)bar["searchParam"]!));
        Assert.Equal("Lot/seri kodu, stok veya depo ara", (string)bar["searchPlaceholder"]!);
        Assert.Equal(new[] { "trackingMode|select|row|trackingMode|İz türü", "warehouseId|select|row|warehouseId|Depo|depolar:id:name" },
            Strings(bar["filters"]));
        // The tracking type choices come from the list's value labels: only Lot and Serial reach the server.
        Assert.Equal(new[] { "trackingMode:Lot=Lot", "trackingMode:Serial=Seri" }, Strings(props["valueLabels"]));
    }

    [Fact]
    public void List_columns_follow_screen_view_mapping()
    {
        var standard = SystemPageStandards.All[Key];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal("inventory-trace-balances", view.Key);
        Assert.Equal("liste", view.Component);
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(view.Key, out var fields));
        // Every legacy field is mapped; the composite Stok / Depo cells map to their name columns.
        Assert.Equal(fields.Select(x => x.Key).OrderBy(x => x), view.Fields.Keys.OrderBy(x => x));
        Assert.Equal(("stockItemName", "warehouseName"), (view.Fields["stockItem"], view.Fields["warehouse"]));
        var columns = Strings(Props("liste")["columns"]);
        var mapped = fields.Select(x => view.Fields[x.Key]).ToArray();
        // Mapped columns keep the legacy order; the code columns sit next to their names and are not mapped.
        Assert.Equal(mapped, columns.Where(x => mapped.Contains(x)));
        Assert.Equal(new[] { "stockItemCode", "warehouseCode" }, columns.Except(mapped));
        Assert.True(ErpOperationCatalog.TryGet("stok.izleme.bakiyeler", out var op));
        Assert.All(columns, x => Assert.Contains(x, op.Result.Columns.Select(c => c.Code)));
    }

    [Fact]
    public void Detail_panel_marks_expiry_by_relative_date()
    {
        Assert.Equal("liste.seciliSatir.expiryDate < bugun", (string)Props("detaySuresiGecti")["visibleWhen"]!);
        Assert.Equal("liste.seciliSatir.expiryDate >= bugun && liste.seciliSatir.expiryDate <= bugun + 30",
            (string)Props("detaySuresiYaklasiyor")["visibleWhen"]!);
        Assert.Equal(("danger", "warning"), ((string)Props("detaySuresiGecti")["variant"]!, (string)Props("detaySuresiYaklasiyor")["variant"]!));
        foreach (var id in new[] { "detaySuresiGecti", "detaySuresiYaklasiyor" })
        {
            Assert.True(PageConditionExpression.TryParse((string)Props(id)["visibleWhen"]!, out var roots, out var error), error);
            Assert.Equal(new[] { "liste", "bugun" }, roots);
        }
        Assert.Equal("liste.seciliSatir.trackingCode == null", (string)Props("detayBos")["visibleWhen"]!);
        Assert.Equal("Bir lot veya seri seçin; ayrıntıları burada görün.", (string)Props("detayBos")["text"]!);
    }

    private static JsonObject Definition() => JsonNode.Parse(SystemPageStandards.All[Key].DefinitionJson)!.AsObject();

    private static IEnumerable<JsonObject> AllComponents()
    {
        var pending = new Stack<JsonObject>(Definition()["components"]!.AsArray().OfType<JsonObject>().Reverse());
        while (pending.Count > 0)
        {
            var component = pending.Pop();
            yield return component;
            if (component["children"] is JsonArray children)
                foreach (var child in children.OfType<JsonObject>().Reverse()) pending.Push(child);
        }
    }

    private static JsonObject Props(string id) =>
        (AllComponents().SingleOrDefault(x => (string)x["id"]! == id) ?? throw new Xunit.Sdk.XunitException($"Bileşen yok: {id}"))["props"]!.AsObject();

    private static JsonObject Query(string id) =>
        Definition()["queries"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Sorgu yok: {id}");

    private static string? Binding(string queryId, string parameter) =>
        (string?)Query(queryId)["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
