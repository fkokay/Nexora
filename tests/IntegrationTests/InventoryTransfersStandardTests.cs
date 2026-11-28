using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Api;
using AIERP.Api.IntegrationTests;
using AIERP.Platform.Application;

using Xunit;

/// <summary>
/// "Depolar arası transferler" list standard routes New and Open to the inventory transfer Belge page. The list still owns
/// transfer cancellation and follows the "Görünümü düzenle" view <c>inventory-transfers</c>.
/// </summary>
public sealed class InventoryTransfersStandardTests
{
    private const string Key = "inventory-transfers";
    private static readonly string[] ViewFields = ["code", "transferDate", "fromWarehouseName", "toWarehouseName", "lineCount", "status", "createdAt"];
    private const string VoidText = "{{liste.seciliSatir.code}} · Kaynak ve hedef depodaki tüm transfer hareketleri birlikte ters kayıtla iptal edilecek. Hedef stok kullanılmışsa işlem reddedilir.";

    [Fact]
    public void Header_is_preview_version_1_on_the_standard_menu()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal((2, "preview"), (standard.Version, standard.Stage));
        Assert.Equal("Depolar arası transferler", standard.Title);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Contains(Key, StandardMenuEndpoints.PageKeys);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        Assert.Single(standard.Updates, x => x.Id == "belge");
        Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, 1), out var oldVersion), oldVersion);
    }

    [Fact]
    public void Queries_use_catalog_operations()
    {
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["id"]!, x => (string)x["operation"]!);
        Assert.Equal(new Dictionary<string, string>
        {
            ["transferler"] = "depo.transfer.listele", ["kalemDetayi"] = "depo.transfer.kalemleri", ["depolar"] = "depo.listele",
            ["kaynakKonumlar"] = "depo.konumlari", ["hedefKonumlar"] = "depo.konumlari", ["stoklar"] = "stok.kart.listele",
            ["birimler"] = "stok.kart.birimleri", ["transferOlustur"] = "depo.transfer.olustur", ["transferIptal"] = "depo.transfer.iptal",
            ["transferIptalMenu"] = "depo.transfer.iptal"
        }, queries);
        Assert.All(queries.Values, name => Assert.True(ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated && !op.RequiresTenantAdmin, name));
        Assert.Equal(("insert", "manual"), ((string)Query("transferOlustur")["kind"]!, (string)Query("transferOlustur")["runOn"]!));
        foreach (var id in new[] { "transferIptal", "transferIptalMenu" })
            Assert.Equal(("update", "manual"), ((string)Query(id)["kind"]!, (string)Query(id)["runOn"]!));
    }

    [Fact]
    public void Action_bar_opens_dialogs_and_voids_from_the_menu()
    {
        var bar = Props("komutlar");
        Assert.Equal(("kalemlerDugmesi", "{{transferler.meta.totalCount}}"),
            ((string)bar["openButton"]!, (string)bar["titleCount"]!));
        Assert.False(bar.ContainsKey("newButton"));
        Assert.Equal(new[] { "iptalMenuDugmesi" }, Strings(bar["moreButtons"]));
        Assert.Equal(new[] { "save", "delete", "print" }, Strings(bar["hiddenCommands"]));
        // CSV is on by default (Studio stores only false), so the standard leaves it out.
        Assert.False(bar.ContainsKey("exportCsv"));
        Assert.Equal(("liste", "suzgec"), ((string)bar["exportTable"]!, (string)bar["focusInput"]!));
        Assert.Equal(("page", "@inventory-transfer-document"), ((string)bar["newAction"]!, (string)bar["newPageCode"]!));
        Assert.Equal(("page", "@inventory-transfer-document"), ((string)Props("kalemlerDugmesi")["actionType"]!, (string)Props("kalemlerDugmesi")["pageCode"]!));

        var filter = Props("suzgec");
        Assert.Equal(new[] { "code", "fromWarehouseName", "toWarehouseName" }, Strings(filter["searchColumns"]));
        Assert.Equal(new[] { "status|select|row||Durum" }, Strings(filter["filters"]));
    }

    [Fact]
    public void List_is_server_paged_with_row_actions()
    {
        var props = Props("liste");
        Assert.Equal(("transferler", "server", 50), ((string)props["query"]!, (string)props["paging"]!, (int)props["pageSize"]!));
        Assert.Equal("{{liste.sayfa}}", Binding("transferler", "page"));
        Assert.Equal("{{liste.sayfaBoyutu}}", Binding("transferler", "pageSize"));
        Assert.Equal(new[] { "kalemlerDugmesi", "iptalDugmesi" }, Strings(props["rowActions"]));
        Assert.Equal("kalemlerDugmesi", (string)props["rowOpenAction"]!);
        Assert.Equal(new[] { "status:Posted=Kaydedildi", "status:Voided=İptal edildi" }, Strings(props["valueLabels"]));
        Assert.Equal(new[] { "Kaydedildi=success", "İptal edildi=info" }, Strings(props["toneMap"]));
        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.listele", out var op));
        Assert.All(Strings(props["columns"]), column => Assert.Contains(op.Result.Columns, x => x.Code == column));
    }

    [Fact]
    public void List_columns_follow_screen_view_mapping()
    {
        var standard = SystemPageStandards.All[Key];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal((Key, "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(view.Key, out var fields));
        Assert.Equal(ViewFields, view.Fields.Keys);
        // "actions" (row buttons) has no column: it comes from rowActions.
        Assert.Equal(ViewFields.Append("actions"), fields.Select(x => x.Key));
        var visible = fields.Where(x => x.DefaultVisible && x.Key != "actions").Select(x => view.Fields[x.Key]);
        Assert.Equal(visible, Strings(Props("liste")["columns"]));
        var labels = Strings(Props("liste")["columnLabels"]).Select(x => x.Split('=', 2)).ToDictionary(x => x[0], x => x[1]);
        foreach (var field in fields.Where(x => x.Key != "actions")) Assert.Equal(field.Label, labels[view.Fields[field.Key]]);
    }

    [Fact]
    public void Screen_view_import_hides_mapped_columns_and_keeps_a_valid_page()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out var fields));
        // The firm view hides lineCount; the fixed actions field has no mapped column and is left alone.
        var states = fields.Select(x => new ScreenViewFieldState(x.Key, x.Label, x.DefaultVisible && x.Key != "lineCount", x.Key == "lineCount")).ToArray();
        var result = SystemPageMerge.ImportScreenViews(standard, new Dictionary<string, IReadOnlyList<ScreenViewFieldState>> { [Key] = states });
        var props = JsonNode.Parse(result.DefinitionJson)!["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "liste")["props"]!;
        var columns = Strings(props["columns"]);
        Assert.Equal(new[] { "code", "transferDate", "fromWarehouseName", "toWarehouseName", "status" }, columns);
        Assert.DoesNotContain("lineCount", columns);
        Assert.DoesNotContain("actions", columns);
        Assert.True(TenantCustomPageSchema.Validate(result.DefinitionJson, out var error), error);
    }

    [Fact]
    public void Lines_dialog_reads_the_selected_transfer()
    {
        var dialog = Props("kalemlerPenceresi");
        Assert.Equal(new[] { "kalemlerBilgisi", "kalemTablosu" }, Strings(dialog["contains"]));
        Assert.StartsWith("{{liste.seciliSatir.code}}", (string)dialog["title"]!);
        Assert.Equal("{{liste.seciliSatir.id}}", Binding("kalemDetayi", "transferId"));
        var table = Props("kalemTablosu");
        Assert.Equal(new[] { "displayQuantity=displayUnitCode", "quantity=unitCode",
            "fromStorageLocationCode=fromStorageLocationName", "toStorageLocationCode=toStorageLocationName" }, Strings(table["columnUnits"]));
        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.kalemleri", out var op));
        var columns = Strings(table["columns"]).Concat(Strings(table["columnUnits"]).Select(x => x.Split('=')[1]));
        Assert.All(columns, column => Assert.Contains(op.Result.Columns, x => x.Code == column));
    }

    [Fact]
    public void New_transfer_dialog_posts_grid_lines_with_a_page_request_id()
    {
        var dialog = Props("yeniTransferPenceresi");
        Assert.Equal(new[] { "transferBilgileri", "istekKimligi", "transferNotu", "kalemler", "durumSatiri" }, Strings(dialog["contains"]));
        Assert.Equal(("transferOlustur", true, true), ((string)dialog["saveQuery"]!, (bool)dialog["closeOnSave"]!, (bool)dialog["resetOnOpen"]!));
        Assert.Equal(new[] { "transferler" }, Strings(dialog["refreshQueries"]));

        var requestId = Props("istekKimligi");
        Assert.Equal((true, true), ((bool)requestId["hidden"]!, (bool)requestId["autoId"]!));
        Assert.Equal(new Dictionary<string, string>
        {
            ["requestId"] = "{{istekKimligi.value}}", ["fromWarehouseId"] = "{{kaynakDepo.value}}", ["toWarehouseId"] = "{{hedefDepo.value}}",
            ["transferDate"] = "{{transferTarihi.value}}", ["lines"] = "{{kalemler.satirlar}}"
        }, Query("transferOlustur")["parameters"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["name"]!, x => (string)x["binding"]!));

        Assert.Equal("satir.isActive == true", (string)Props("kaynakDepo")["optionsWhen"]!);
        Assert.Equal("satir.isActive == true && satir.id != kaynakDepo.value", (string)Props("hedefDepo")["optionsWhen"]!);
        Assert.Equal(new[] { "kalemler.fromStorageLocationId" }, Strings(Props("kaynakDepo")["clearsOnChange"]));
        Assert.Equal(new[] { "kalemler.toStorageLocationId" }, Strings(Props("hedefDepo")["clearsOnChange"]));

        var grid = Props("kalemler");
        Assert.Equal(("list", 100, 1), ((string)grid["gridMode"]!, (int)grid["maxRows"]!, (int)grid["minRows"]!));
        Assert.Equal(new[] { "unitCode==Ana birim" }, Strings(grid["columnStaticOptions"]));
        var lookups = Strings(grid["gridColumns"]).Select(x =>
        {
            Assert.True(GridColumnSpec.TryParse(x, out var code, out var type, out var lookup, out var reason), reason);
            return (code, type, lookup);
        }).ToArray();
        Assert.Equal(new[] { "stockItemId", "unitCode", "quantity", "fromStorageLocationId", "toStorageLocationId" }, lookups.Select(x => x.code));
        Assert.Equal(new[] { "stoklar", "birimler", null, "kaynakKonumlar", "hedefKonumlar" }, lookups.Select(x => x.lookup?.QueryId));
        // Every grid column is an item of the lines list parameter.
        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.olustur", out var create));
        var items = create.Parameters.Single(x => x.Name == "lines").Items!;
        Assert.All(lookups, column => Assert.Contains(items, x => x.Code == column.code));
        // Units are row-scoped (the row's stock card); stock search follows the focused picker cell.
        Assert.Equal("{{kalemler.satir.stockItemId}}", Binding("birimler", "id"));
        Assert.Equal("{{kalemler.arama}}", Binding("stoklar", "q"));
        Assert.Contains("{{kalemler.satirSayisi}}", (string)Props("durumSatiri")["text"]!);
    }

    [Fact]
    public void Void_buttons_ask_a_reason_and_show_the_warning()
    {
        foreach (var (button, query) in new[] { ("iptalDugmesi", "transferIptal"), ("iptalMenuDugmesi", "transferIptalMenu") })
        {
            var props = Props(button);
            Assert.Equal(("query", query, "İptal nedeni", true, 160), ((string)props["actionType"]!, (string)props["queryId"]!,
                (string)props["promptLabel"]!, (bool)props["promptRequired"]!, (int)props["promptMaxLength"]!));
            Assert.Equal(VoidText, (string)props["promptText"]!);
            Assert.Equal("liste.seciliSatir.status == 'Posted'", (string)props["visibleWhen"]!);
            Assert.Equal("{{liste.seciliSatir.id}}", Binding(query, "transferId"));
            Assert.Equal($"{{{{{button}.yanit}}}}", Binding(query, "reason"));
        }
    }

    [Fact]
    public void Catalog_operations_describe_the_transfer_routes()
    {
        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.listele", out var list));
        Assert.Equal(("GET", "/api/warehouses/transfers", "items"), (list.Method, list.Route, list.Result.RowsPath));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, list.Result.MetaPaths);
        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.kalemleri", out var lines));
        Assert.Equal(("GET", "/api/warehouses/transfers/{transferId}", "lines"), (lines.Method, lines.Route, lines.Result.RowsPath));
        Assert.Contains(lines.Result.Columns, x => x is { Code: "displayQuantity", DataType: "decimal" });
        Assert.Contains(lines.Result.Columns, x => x is { Code: "displayUnitCode", DataType: "text" });

        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.olustur", out var create));
        Assert.Equal(("POST", "/api/warehouses/transfers", "insert", "record"), (create.Method, create.Route, create.PageKind, create.Result.Shape));
        Assert.Equal(new[] { "requestId:guid:True", "fromWarehouseId:guid:True", "toWarehouseId:guid:True", "transferDate:date:True", "lines:list:False" },
            create.Parameters.Select(x => $"{x.Name}:{x.Type}:{x.Required}"));
        Assert.Equal(new[] { "stockItemId:guid:True", "quantity:decimal:True", "unitCode:text:False", "fromStorageLocationId:guid:False", "toStorageLocationId:guid:False" },
            create.Parameters.Single(x => x.Name == "lines").Items!.Select(x => $"{x.Code}:{x.DataType}:{x.Required}"));

        Assert.True(ErpOperationCatalog.TryGet("depo.transfer.iptal", out var cancel));
        Assert.Equal(("POST", "/api/warehouses/transfers/{transferId}/void", "update", "none"), (cancel.Method, cancel.Route, cancel.PageKind, cancel.Result.Shape));
        Assert.Equal(new[] { "transferId:route", "reason:body" }, cancel.Parameters.Select(x => $"{x.Name}:{x.In}"));
        Assert.Equal(true, cancel.FixedBody!["confirmation"]);
    }

    [Fact]
    public void Line_view_display_members_fall_back_to_base_unit()
    {
        var plain = new InventoryTransferLineView(Guid.NewGuid(), "SKU", "Ürün", "ADET", 24m);
        Assert.Equal((24m, "ADET"), (plain.DisplayQuantity, plain.DisplayUnitCode));
        var entered = plain with { EnteredQuantity = 2m, EnteredUnitCode = "KOLI" };
        Assert.Equal((2m, "KOLI"), (entered.DisplayQuantity, entered.DisplayUnitCode));
        var json = JsonSerializer.SerializeToElement(entered, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(("KOLI", 2m), (json.GetProperty("displayUnitCode").GetString(), json.GetProperty("displayQuantity").GetDecimal()));
    }

    [Fact]
    public async Task Frontend_fixture_matches_catalog()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => JsonNode.Parse(x.GetRawText())!);
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend", "erp-web", "src", "system-pages",
            "inventoryTransfersOperations.fixture.json")))!["operations"]!.AsArray();
        var used = Definition()["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        Assert.Equal(used, fixture.Select(x => (string)x!["name"]!).Order(StringComparer.Ordinal));
        foreach (var operation in fixture)
            Assert.True(JsonNode.DeepEquals(live[(string)operation!["name"]!], operation), (string)operation["name"]!);
    }

    // ---- Schema (v2) features used by the standard: E1–E6 ----

    [Theory]
    [InlineData("sku|Stok|lookup:stoklar:id:code:name|required,unique,readOnly", true)]
    [InlineData("unit|Birim|lookup:birimler:unitCode:unitCode", true)]
    [InlineData("x|X|lookup:q-1:balance.id:balance.code", true)]
    [InlineData("x|X|lookup:q:id", false)]
    [InlineData("x|X|lookup:q:id:code:name:extra", false)]
    [InlineData("x|X|lookup::id:code", false)]
    [InlineData("x|X|lookup:q:id:code|upperCase", false)]
    [InlineData("x|X|lookup:q:id:code|maxLength:4", false)]
    [InlineData("x|X|lookup:q:id:code|min:1", false)]
    [InlineData("x|X|lookup:q:1d:code", false)]
    [InlineData("x|X|lookup", false)]
    public void Grid_lookup_column_spec(string text, bool valid)
    {
        Assert.Equal(valid, GridColumnSpec.TryParse(text, out _, out var type, out var lookup, out _));
        if (valid) Assert.Equal(("lookup", true), (type, lookup is not null));
    }

    public static TheoryData<string, string> Rejected => new()
    {
        // E1 autoId
        { """{"c":"istekKimligi","p":"autoId","v":"evet"}""", "autoId" },
        { """{"c":"transferNotu","p":"autoId","v":true}""", "autoId" },
        // E2 picker columns
        { """{"c":"kalemler","p":"gridColumns","v":["stockItemId|Stok|lookup:yok:id:code"]}""", "seçim sütununun sorgusu" },
        { """{"c":"kalemler","p":"gridColumns","v":["stockItemId|Stok|lookup:stoklar:id:yokSutun"]}""", "yokSutun" },
        { """{"c":"kalemler","p":"gridColumns","v":["stockItemId|Stok|lookup:transferOlustur:id:code"]}""", "okuma sorgusu" },
        { """{"c":"kalemler","p":"columnStaticOptions","v":["quantity==Ana birim"]}""", "columnStaticOptions" },
        { """{"c":"kalemler","p":"columnStaticOptions","v":["unitCode=Ana birim"]}""", "columnStaticOptions" },
        // E3 optionsWhen
        { """{"c":"transferTarihi","p":"optionsWhen","v":"satir.isActive == true"}""", "optionsWhen" },
        { """{"c":"kaynakDepo","p":"optionsWhen","v":"satir.isActive == yok.value"}""", "yok" },
        { """{"c":"kaynakDepo","p":"optionsWhen","v":"satir.isActive =="}""", "optionsWhen" },
        { """{"c":"kalemler","p":"columnOptionsWhen","v":["quantity=satir.isActive == true"]}""", "columnOptionsWhen" },
        { """{"c":"kalemler","p":"columnOptionsWhen","v":["unitCode=satir.a == 1","unitCode=satir.b == 1"]}""", "columnOptionsWhen" },
        { """{"c":"transferNotu","p":"optionsWhen","v":"satir.isActive == true"}""", "optionsWhen" },
        // E4 clearsOnChange
        { """{"c":"kaynakDepo","p":"clearsOnChange","v":["kalemler.yok"]}""", "clearsOnChange" },
        { """{"c":"kaynakDepo","p":"clearsOnChange","v":["kaynakDepo"]}""", "clearsOnChange" },
        { """{"c":"kaynakDepo","p":"clearsOnChange","v":["yokGiris"]}""", "clearsOnChange" },
        { """{"c":"kaynakDepo","p":"clearsOnChange","v":[]}""", "clearsOnChange" },
        { """{"c":"liste","p":"clearsOnChange","v":["hedefDepo"]}""", "clearsOnChange" },
        // E5 minRows
        { """{"c":"kalemler","p":"minRows","v":101}""", "minRows" },
        { """{"c":"kalemler","p":"minRows","v":-1}""", "minRows" },
        { """{"c":"kalemler","p":"minRows","v":"1"}""", "minRows" },
        { """{"c":"liste","p":"minRows","v":1}""", "minRows" },
        // E6 prompt text and length
        { """{"c":"iptalDugmesi","p":"promptMaxLength","v":0}""", "promptMaxLength" },
        { """{"c":"iptalDugmesi","p":"promptMaxLength","v":4001}""", "promptMaxLength" },
        { """{"c":"kalemlerDugmesi","p":"promptText","v":"Açıklama"}""", "promptText" },
        { """{"c":"kalemlerDugmesi","p":"promptMaxLength","v":10}""", "promptMaxLength" },
        { """{"c":"iptalDugmesi","p":"promptText","v":"<b>x</b>"}""", "promptText" },
        { """{"c":"liste","p":"promptText","v":"Açıklama"}""", "promptText" },
    };

    [Theory]
    [MemberData(nameof(Rejected))]
    public void Schema_rejects_invalid_feature_props(string change, string expected)
    {
        var spec = JsonNode.Parse(change)!;
        var definition = Definition();
        var props = definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == (string)spec["c"]!)["props"]!.AsObject();
        props[(string)spec["p"]!] = spec["v"]!.DeepClone();
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error), change);
        Assert.Contains(expected, error);
    }

    [Fact]
    public void Schema_rejects_overlong_prompt_text_and_min_rows_above_max()
    {
        var definition = Definition();
        Component(definition, "iptalDugmesi")["promptText"] = new string('a', 301);
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("promptText", error);

        definition = Definition();
        Component(definition, "kalemler")["maxRows"] = 5;
        Component(definition, "kalemler")["minRows"] = 6;
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("minRows", error);
    }

    [Fact]
    public void Schema_rejects_grid_row_bindings_outside_read_queries_and_grid_columns()
    {
        var definition = Definition();
        Parameter(definition, "birimler", "id")["binding"] = "{{kalemler.satir.yokSutun}}";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("yokSutun", error);

        definition = Definition();
        Parameter(definition, "transferIptal", "reason")["binding"] = "{{kalemler.arama}}";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("okuma sorgusunda", error);
    }

    [Fact]
    public void Schema_accepts_feature_variants()
    {
        var definition = Definition();
        Component(definition, "kalemler")["minRows"] = 0;
        Component(definition, "iptalDugmesi")["promptMaxLength"] = 4000;
        Component(definition, "hedefDepo")["clearsOnChange"] = new JsonArray("kalemler.toStorageLocationId", "transferTarihi");
        Component(definition, "istekKimligi")["autoId"] = false;
        // A select input may filter its options too.
        var select = Component(definition, "transferTarihi");
        select["inputType"] = "select";
        select["staticOptions"] = new JsonArray("a=A", "b=B");
        select["optionsWhen"] = "satir.value != 'b'";
        select.Remove("defaultValue");
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error), error);
    }

    private static JsonObject Component(JsonObject definition, string id) =>
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject Parameter(JsonObject definition, string queryId, string name) =>
        definition["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().Single(x => (string)x["name"]! == name);

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static JsonObject Definition() => JsonNode.Parse(SystemPageStandards.All[Key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string id) => Component(Definition(), id);

    private static JsonObject Query(string id) =>
        Definition()["queries"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Sorgu yok: {id}");

    private static string? Binding(string queryId, string parameter) =>
        (string?)Query(queryId)["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
