using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

/// <summary>Pure screen-view import and "Yeni" computation; envelopes are built in code so versions 2 and 3 can be modeled.</summary>
public sealed class SystemPageMergeTests
{
    private const string ViewKey = "inventory-warehouses";
    private const string OrderNote = "Sütun sırası, etiketleri ve genişlikleri aktarılmaz; tasarımcıda düzenleyin.";
    private const string AllHiddenNote = "Tüm sütunlar gizli olduğu için görünüm ayarı aktarılmadı.";

    private static SystemPageStandard Warehouses()
    {
        var definition = """
        {"schemaVersion":2,
         "components":[{"id":"depoListesi","type":"dataTable","name":"depoListesi",
           "props":{"title":"Depolar","query":"depolar","columns":["code","name","isActive"],"columnFormats":["code=code","isActive=status"]}}],
         "queries":[{"id":"depolar","name":"depolar","kind":"read","operation":"depo.listele","parameters":[],"runOn":"load"}]}
        """;
        return new SystemPageStandard(ViewKey, "Depo Yönetimi", "Depo tanımlarının listesi.", "Stok & Depo", 1, "preview",
            [
                new SystemPageItem("component:depoListesi", "component", "depoListesi", 1, "Depo listesi", ["query:depolar"]),
                new SystemPageItem("query:depolar", "query", "depolar", 1, "Depoları listele", [])
            ],
            [new SystemPageScreenView(ViewKey, "depoListesi", new Dictionary<string, string> { ["code"] = "code", ["name"] = "name", ["status"] = "isActive" })],
            definition);
    }

    /// <summary>Version 3: v2 added an "ozet" metric with its "sayim" query; v3 added a "not" text.</summary>
    private static SystemPageStandard Versioned()
    {
        var definition = """
        {"schemaVersion":2,
         "components":[
           {"id":"depoListesi","type":"dataTable","name":"depoListesi","props":{"query":"depolar","columns":["code","name"]}},
           {"id":"ozet","type":"metric","name":"ozet","props":{"label":"Depo sayısı","query":"sayim"}},
           {"id":"not","type":"text","name":"not","props":{"text":"Bilgi"}}],
         "queries":[
           {"id":"depolar","name":"depolar","kind":"read","operation":"depo.listele","parameters":[],"runOn":"load"},
           {"id":"sayim","name":"sayim","kind":"read","operation":"depo.listele","parameters":[],"runOn":"load"}]}
        """;
        return new SystemPageStandard(ViewKey, "Depo Yönetimi", null, "Stok & Depo", 3, "preview",
            [
                new SystemPageItem("component:depoListesi", "component", "depoListesi", 1, "Depo listesi", ["query:depolar"]),
                new SystemPageItem("query:depolar", "query", "depolar", 1, "Depoları listele", []),
                new SystemPageItem("component:ozet", "component", "ozet", 2, "Depo özeti", ["query:sayim", "query:depolar"]),
                new SystemPageItem("query:sayim", "query", "sayim", 2, "Depo sayımı", []),
                new SystemPageItem("component:not", "component", "not", 3, "Bilgi notu", [])
            ],
            [], definition);
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<ScreenViewFieldState>> View(params ScreenViewFieldState[] fields)
        => new Dictionary<string, IReadOnlyList<ScreenViewFieldState>> { [ViewKey] = fields };

    private static ScreenViewFieldState F(string key, string label, bool visible = true, bool differs = false) => new(key, label, visible, differs);

    private static string[] Columns(string definitionJson)
        => JsonNode.Parse(definitionJson)!["components"]![0]!["props"]!["columns"]!.AsArray().Select(x => x!.GetValue<string>()).ToArray();

    private static string DesignJson(string[] components, string[] queries)
    {
        var json = new JsonObject
        {
            ["schemaVersion"] = 2,
            ["components"] = new JsonArray(components.Select(x => (JsonNode)new JsonObject { ["id"] = x, ["type"] = "text", ["name"] = x }).ToArray()),
            ["queries"] = new JsonArray(queries.Select(x => (JsonNode)new JsonObject { ["id"] = x, ["name"] = x, ["kind"] = "read" }).ToArray())
        };
        return json.ToJsonString();
    }

    [Fact]
    public void Hidden_mapped_field_removes_column()
    {
        var standard = Warehouses();
        var original = standard.DefinitionJson;
        var result = SystemPageMerge.ImportScreenViews(standard,
            View(F("code", "Depo kodu"), F("name", "Depo adı"), F("status", "Durum", visible: false)));
        Assert.Equal(new[] { "code", "name" }, Columns(result.DefinitionJson));
        var formats = JsonNode.Parse(result.DefinitionJson)!["components"]![0]!["props"]!["columnFormats"]!.AsArray().Select(x => x!.GetValue<string>());
        Assert.Equal(new[] { "code=code" }, formats);
        Assert.Empty(result.Notes);
        Assert.Equal(original, standard.DefinitionJson);
        Assert.True(TenantCustomPageSchema.Validate(result.DefinitionJson, out var error), error);
    }

    [Fact]
    public void Unmapped_field_adds_note()
    {
        var result = SystemPageMerge.ImportScreenViews(Warehouses(),
            View(F("code", "Depo kodu"), F("name", "Depo adı"), F("status", "Durum"), F("availability", "Açıklama", visible: false)));
        Assert.Equal(new[] { "code", "name", "isActive" }, Columns(result.DefinitionJson));
        Assert.Equal(new[] { "“Açıklama” alanının yeni tasarımda karşılığı yok; aktarılmadı." }, result.Notes);
    }

    [Fact]
    public void Unmapped_field_at_catalog_default_adds_no_note()
    {
        var result = SystemPageMerge.ImportScreenViews(Warehouses(),
            View(F("code", "Depo kodu"), F("name", "Depo adı"), F("status", "Durum"), F("availability", "Açıklama")));
        Assert.Equal(new[] { "code", "name", "isActive" }, Columns(result.DefinitionJson));
        Assert.Empty(result.Notes);
    }

    [Fact]
    public void Unmapped_field_with_changed_settings_adds_note()
    {
        var result = SystemPageMerge.ImportScreenViews(Warehouses(),
            View(F("code", "Depo kodu"), F("name", "Depo adı"), F("status", "Durum"), F("availability", "Açıklama", differs: true)));
        Assert.Equal(new[] { "“Açıklama” alanının yeni tasarımda karşılığı yok; aktarılmadı.", OrderNote }, result.Notes);
    }

    [Fact]
    public void Label_or_order_change_adds_single_note()
    {
        var result = SystemPageMerge.ImportScreenViews(Warehouses(),
            View(F("code", "Kod", differs: true), F("name", "Depo adı", differs: true), F("status", "Durum")));
        Assert.Equal(new[] { OrderNote }, result.Notes);
        Assert.Equal(new[] { "code", "name", "isActive" }, Columns(result.DefinitionJson));
    }

    [Fact]
    public void All_hidden_keeps_columns_and_notes()
    {
        var result = SystemPageMerge.ImportScreenViews(Warehouses(),
            View(F("code", "Depo kodu", false), F("name", "Depo adı", false), F("status", "Durum", false)));
        Assert.Equal(new[] { "code", "name", "isActive" }, Columns(result.DefinitionJson));
        Assert.Equal(new[] { AllHiddenNote }, result.Notes);
    }

    [Fact]
    public void No_published_view_changes_nothing()
    {
        var standard = Warehouses();
        var result = SystemPageMerge.ImportScreenViews(standard, new Dictionary<string, IReadOnlyList<ScreenViewFieldState>>());
        Assert.Empty(result.Notes);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(standard.DefinitionJson), JsonNode.Parse(result.DefinitionJson)));
    }

    [Fact]
    public void New_item_offered_when_since_above_base_and_absent()
    {
        var items = SystemPageMerge.NewItems(Versioned(), DesignJson(["depoListesi"], ["depolar"]), baseVersion: 1);
        Assert.Equal(new[] { "component:ozet", "query:sayim", "component:not" }, items.Select(x => x.Key));
        var ozet = items[0];
        Assert.Equal("component", ozet.Kind);
        Assert.Equal("Depo özeti", ozet.Label);
        Assert.Equal(2, ozet.Since);
        Assert.Equal("ozet", ozet.Definition.GetProperty("id").GetString());
        Assert.Equal("metric", ozet.Definition.GetProperty("type").GetString());
        Assert.Equal("query", items[1].Kind);
        Assert.Equal("depo.listele", items[1].Definition.GetProperty("operation").GetString());
    }

    [Fact]
    public void Deleted_old_item_not_offered()
    {
        // The firm deleted v1 "depoListesi" and v2 "ozet"; with base 2 only v3 "not" is new.
        var items = SystemPageMerge.NewItems(Versioned(), DesignJson([], ["depolar", "sayim"]), baseVersion: 2);
        Assert.Equal(new[] { "component:not" }, items.Select(x => x.Key));
    }

    [Fact]
    public void Present_item_not_offered()
    {
        // The firm already added "ozet" (since 2 > base 1) by hand.
        var items = SystemPageMerge.NewItems(Versioned(), DesignJson(["depoListesi", "ozet"], ["depolar", "sayim"]), baseVersion: 1);
        Assert.Equal(new[] { "component:not" }, items.Select(x => x.Key));
    }

    [Fact]
    public void Requires_lists_only_absent_dependencies()
    {
        var items = SystemPageMerge.NewItems(Versioned(), DesignJson(["depoListesi"], ["depolar"]), baseVersion: 1);
        Assert.Equal(new[] { "query:sayim" }, items.Single(x => x.Key == "component:ozet").Requires);
        Assert.Empty(items.Single(x => x.Key == "component:not").Requires);
    }

    [Fact]
    public void Base_equal_current_offers_nothing()
    {
        Assert.Empty(SystemPageMerge.NewItems(Versioned(), DesignJson([], []), baseVersion: 3));
    }

    /// <summary>A "list" template standard at version 2 whose commands bar runs a v1 and a v2 button.</summary>
    private static SystemPageStandard TemplatedList()
    {
        var definition = """
        {"schemaVersion":2,"template":{"name":"list"},
         "components":[
           {"id":"komutlar","type":"actionBar","name":"komutlar","props":{"slot":"commands","moreButtons":["yeniTeklif","yeniFatura"],"exportTable":"tablo"}},
           {"id":"tablo","type":"dataTable","name":"tablo","props":{"slot":"list","query":"liste"}},
           {"id":"yeniTeklif","type":"button","name":"yeniTeklif","props":{"slot":"actions","label":"Yeni teklif","actionType":"erpPage","pageKey":"sales-invoices"}},
           {"id":"yeniFatura","type":"button","name":"yeniFatura","props":{"slot":"actions","label":"Yeni fatura","actionType":"erpPage","pageKey":"sales-invoices"}}],
         "queries":[{"id":"liste","name":"liste","kind":"read","sql":"SELECT 1 AS x","parameters":[],"runOn":"load"}]}
        """;
        return new SystemPageStandard(ViewKey, "Liste", null, "Stok & Depo", 2, "preview",
            [
                new SystemPageItem("component:komutlar", "component", "komutlar", 1, "Komutlar", []),
                new SystemPageItem("component:tablo", "component", "tablo", 1, "Liste", ["query:liste"]),
                new SystemPageItem("query:liste", "query", "liste", 1, "Listele", []),
                new SystemPageItem("component:yeniTeklif", "component", "yeniTeklif", 1, "Yeni teklif", []),
                new SystemPageItem("component:yeniFatura", "component", "yeniFatura", 2, "Yeni fatura", [])
            ],
            [], definition);
    }

    private static string WithTemplate(string designJson, string? template)
    {
        var json = JsonNode.Parse(designJson)!.AsObject();
        json.Remove("template");
        if (template is not null) json["template"] = new JsonObject { ["name"] = template };
        return json.ToJsonString();
    }

    [Fact]
    public void No_items_offered_from_templated_standard_to_templateless_copy()
    {
        var design = WithTemplate(SystemPageStandards.Restrict(TemplatedList(), 1), null);
        Assert.Empty(SystemPageMerge.NewItems(TemplatedList(), design, baseVersion: 1));
    }

    [Fact]
    public void No_items_offered_from_templateless_standard_to_templated_copy()
    {
        var design = WithTemplate(DesignJson(["depoListesi"], ["depolar"]), "list");
        Assert.Empty(SystemPageMerge.NewItems(Versioned(), design, baseVersion: 1));
        // A different template is a mismatch too.
        var record = WithTemplate(SystemPageStandards.Restrict(TemplatedList(), 1), "record");
        Assert.Empty(SystemPageMerge.NewItems(TemplatedList(), record, baseVersion: 1));
    }

    [Fact]
    public void Items_offered_between_same_template()
    {
        var design = SystemPageStandards.Restrict(TemplatedList(), 1);
        var items = SystemPageMerge.NewItems(TemplatedList(), design, baseVersion: 1);
        Assert.Equal(new[] { "component:yeniFatura" }, items.Select(x => x.Key));
    }

    [Fact]
    public void Restrict_strips_removed_ids_from_commands_bar()
    {
        var restricted = SystemPageStandards.Restrict(TemplatedList(), 1);
        var bar = JsonNode.Parse(restricted)!["components"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == "komutlar")!;
        Assert.Equal(new[] { "yeniTeklif" }, bar["props"]!["moreButtons"]!.AsArray().Select(x => x!.GetValue<string>()));
        Assert.Equal("commands", bar["props"]!["slot"]!.GetValue<string>());
        Assert.True(TenantCustomPageSchema.Validate(restricted, out var error), error);
        Assert.True(TenantCustomPageSchema.Validate(TemplatedList().DefinitionJson, out var fullError), fullError);
    }
}
