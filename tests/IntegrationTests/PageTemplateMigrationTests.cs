using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;
using Xunit.Abstractions;

namespace AIERP.Api.IntegrationTests;

/// <summary>Toplu kalıp geçişi (5b-1) Görev 2: eski sayfanın Liste / Serbest gövde kalıbına davranış değişmeden taşınması.</summary>
public sealed class PageTemplateMigrationTests(ITestOutputHelper output)
{
    private static readonly object[] Queries =
    [
        new { id = "liste", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "sil", name = "sil", kind = "delete", operation = "stok.kart.sil", runOn = "manual", parameters = new object[] { new { name = "id", binding = "{{bugun}}", type = "guid" } } }
    ];

    private static string Page(object[] components, object[]? queries = null, int version = 2) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = version,
        ["queries"] = queries ?? Queries,
        ["components"] = components
    });

    private static object C(string id, string type, object? props = null) => new { id, type, name = id, props = props ?? new { } };

    private static object NoTools(string id, string query = "liste") => C(id, "dataTable", new
    {
        query, showGridSearch = false, showColumnFilters = false, showColumnChooser = false, showExport = false, showPivot = false, showCsv = false, showSelectedExport = false
    });

    private static string ListPage() => Page(
    [
        C("baslik", "heading", new { text = "Kartlar", width = 12 }),
        C("toplam", "metric", new { title = "Toplam", value = "1" }),
        C("tablo", "dataTable", new { query = "liste", width = 12, rowActions = new[] { "satirSil" } }),
        C("yeni", "button", new { label = "Sil", actionType = "query", queryId = "sil", confirmText = "Emin misiniz?" }),
        C("satirSil", "button", new { label = "Satırı sil", actionType = "query", queryId = "sil" }),
        C("not", "text", new { text = "Alt not" })
    ]);

    private static string DashboardPage() => Page(
    [
        C("m1", "metric", new { title = "A", value = "1", width = 4 }),
        C("m2", "metric", new { title = "B", value = "2", width = 4 }),
        C("m3", "metric", new { title = "C", value = "3", width = 4 }),
        C("rozet", "badge", new { text = "Durum" })
    ]);

    private static string SectionPage() => Page(
    [
        C("t0", "text", new { text = "Giriş" }),
        C("s1", "section", new { title = "Özet" }),
        C("m1", "metric", new { title = "A", value = "1", width = 6 }),
        C("m2", "metric", new { title = "B", value = "2", width = 6 }),
        C("s2", "section", new { title = "Ayrıntı" }),
        C("t2", "text", new { text = "Not" })
    ]);

    private static string TabsPage() => Page(
    [
        C("sekme", "tabs", new { tabs = new[] { "Genel=t1,m1", "Diğer=s2,t2" } }),
        C("t1", "text", new { text = "Genel metin" }),
        C("m1", "metric", new { title = "A", value = "1" }),
        C("s2", "section", new { title = "Detay" }),
        C("t2", "text", new { text = "Detay metni" }),
        C("k1", "button", new { label = "Yenile", actionType = "query", queryId = "sil" })
    ]);

    private static JsonObject Component(string json, string id) =>
        JsonNode.Parse(json)!["components"]!.AsArray().OfType<JsonObject>().Single(x => (string?)x["id"] == id);

    private static string? Prop(string json, string id, string key) => Component(json, id)["props"]?[key]?.ToJsonString();

    private static string[] Ids(string json) => JsonNode.Parse(json)!["components"]!.AsArray().Select(x => (string)x!["id"]!).ToArray();

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();

    private static MigrationResult Converted(string json, string target)
    {
        Assert.True(TenantCustomPageSchema.Validate(json, out var originalError), originalError);
        var result = PageTemplateMigration.Classify(json, hasOpenDraft: false);
        Assert.True(result.Target == target, $"hedef {result.Target ?? "—"}: {string.Join(" | ", result.Reasons)}");
        Assert.NotNull(result.ConvertedJson);
        Assert.Empty(result.Reasons);
        Assert.Null(result.EquivalenceFailure);
        return result;
    }

    [Fact]
    public void Simple_list_page_becomes_list_template_with_same_queries_and_ids()
    {
        var before = ListPage();
        var result = Converted(before, "list");
        var after = result.ConvertedJson!;
        var root = JsonNode.Parse(after)!;
        Assert.Equal("""{"name":"list"}""", root["template"]!.ToJsonString());
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(before)!["queries"], root["queries"]));
        Assert.Equal(Ids(before), Ids(after));
        Assert.Equal("\"above\"", Prop(after, "baslik", "slot"));
        Assert.Equal("\"indicators\"", Prop(after, "toplam", "slot"));
        Assert.Equal("\"list\"", Prop(after, "tablo", "slot"));
        Assert.Equal("\"actions\"", Prop(after, "yeni", "slot"));
        Assert.Equal("\"rowActions\"", Prop(after, "satirSil", "slot"));
        Assert.Equal("\"below\"", Prop(after, "not", "slot"));
        Assert.Null(Prop(after, "baslik", "width"));
        Assert.Null(Prop(after, "tablo", "width"));
        Assert.Equal("\"query\"", Prop(after, "yeni", "actionType"));
        Assert.Equal("\"Emin misiniz?\"", Prop(after, "yeni", "confirmText"));
        // Türkçe metin kaçışsız yazılır (128 KiB sınırı).
        Assert.Contains("Satırı sil", after);
        Assert.True(result.LayoutChanges > 0);
    }

    [Fact]
    public void Dashboard_page_becomes_free_with_one_block_and_column_count_from_widths()
    {
        var before = DashboardPage();
        var after = Converted(before, "free").ConvertedJson!;
        var blocks = JsonNode.Parse(after)!["components"]!.AsArray().OfType<JsonObject>().Where(x => (string?)x["props"]?["slot"] == "block").ToArray();
        var block = Assert.Single(blocks);
        Assert.Equal("section", (string?)block["type"]);
        Assert.Equal(new[] { "m1", "m2", "m3", "rozet" }, Strings(block["props"]!["members"]));
        Assert.Equal(3, (int)block["props"]!["columns"]!);
        foreach (var id in new[] { "m1", "m2", "m3", "rozet" })
        {
            Assert.Equal("\"item\"", Prop(after, id, "slot"));
            Assert.Null(Prop(after, id, "width"));
        }
        // Yeni bölüm ilk üyesinin önüne konur; var olan bileşenlerin sırası değişmez.
        Assert.Equal(new[] { (string)block["id"]!, "m1", "m2", "m3", "rozet" }, Ids(after));
    }

    [Fact]
    public void Section_headings_split_into_blocks()
    {
        var after = Converted(SectionPage(), "free").ConvertedJson!;
        var components = JsonNode.Parse(after)!["components"]!.AsArray().OfType<JsonObject>().ToArray();
        var blocks = components.Where(x => (string?)x["props"]?["slot"] == "block").ToArray();
        Assert.Equal(3, blocks.Length);
        Assert.Equal(new[] { "t0" }, Strings(blocks[0]["props"]!["members"]));
        Assert.Null(blocks[0]["props"]!["title"]);
        Assert.Equal("s1", (string?)blocks[1]["id"]);
        Assert.Equal(new[] { "m1", "m2" }, Strings(blocks[1]["props"]!["members"]));
        Assert.Equal(2, (int)blocks[1]["props"]!["columns"]!);
        Assert.Equal("Özet", (string?)Component(after, "s1")["props"]!["title"]);
        Assert.Equal("s2", (string?)blocks[2]["id"]);
        Assert.Equal(new[] { "t2" }, Strings(blocks[2]["props"]!["members"]));
        Assert.Equal(1, (int)blocks[2]["props"]!["columns"]!);
    }

    [Fact]
    public void Tabs_with_supported_content_become_free_tabs()
    {
        var after = Converted(TabsPage(), "free").ConvertedJson!;
        var components = JsonNode.Parse(after)!["components"]!.AsArray().OfType<JsonObject>().ToArray();
        var firstBlock = components.Single(x => (string?)x["props"]?["slot"] == "block" && (string?)x["id"] != "s2");
        Assert.Equal(new[] { $"Genel={firstBlock["id"]}", "Diğer=s2" }, Strings(Component(after, "sekme")["props"]!["tabs"]));
        Assert.Equal("\"tabs\"", Prop(after, "sekme", "slot"));
        Assert.Equal(new[] { "t1", "m1" }, Strings(firstBlock["props"]!["members"]));
        Assert.Equal(new[] { "t2" }, Strings(Component(after, "s2")["props"]!["members"]));
        Assert.Equal("\"actions\"", Prop(after, "k1", "slot"));
    }

    public static TheoryData<string, string> UnsupportedFeatures() => new()
    {
        { Page([C("cubuk", "actionBar"), NoTools("tablo")]), "İşlem çubuğu kalıplarda yok." },
        { Page([C("pencere", "dialog"), NoTools("tablo")]), "Pencere kalıplarda yok." },
        { Page([C("adimlar", "steps"), NoTools("tablo")]), "Sihirbaz adımları kalıplarda yok." },
        { Page([C("satirlar", "editableGrid"), NoTools("tablo")]), "Düzenlenebilir satır tablosu (Belge kalıbı bekleniyor)." },
        { Page([C("ad", "input"), NoTools("tablo")]), "Form alanları (Kayıt kartı adayı)." },
        { Page([C("kart", "formCard", new { inputs = new[] { "ad" } }), NoTools("tablo")]), "Form alanları (Kayıt kartı adayı)." },
        { Page([C("ozel", "customFieldsBlock"), NoTools("tablo")]), "Form alanları (Kayıt kartı adayı)." },
        { Page([C("eskiForm", "form"), NoTools("tablo")]), "Form alanları (Kayıt kartı adayı)." },
        { Page([C("sekme", "tabs", new { tabs = new[] { "Genel=t1" } }), C("t1", "text"), C("t2", "text")]), "Sekmeler bileşenlere göre bölünemiyor." },
        { Page([C("kod", "code", new { javascript = "1" }), NoTools("tablo")]), "Satır içi kod alanı kalıplarda yok." },
        { Page([C("cipler", "filterChips"), NoTools("tablo")]), "filterChips bu kalıpta yok." },
        { Page([C("yuzey", "facetPanel"), NoTools("tablo")]), "facetPanel bu kalıpta yok." },
        { Page([C("ozet", "recordHeader"), NoTools("tablo")]), "recordHeader bu kalıpta yok." },
        { Page([C("panel", "contextPanel", new { table = "tablo" }), C("t1", "text")]), "contextPanel bu kalıpta yok." },
        { Page([C("t1", "text", new { widthWhen = "6=sayfa.genis == true" }), NoTools("tablo")]), "Koşula bağlı genişlik kalıplarda yok." },
        { Page([C("t1", "text", new { formulas = new[] { "x=1" } }), NoTools("tablo")]), "formulas ayarı kalıplarda yok." },
        { Page([C("cubuk", "button", new { commandWhen = new[] { "x" } })]), "commandWhen ayarı kalıplarda yok." }
    };

    [Theory]
    [MemberData(nameof(UnsupportedFeatures))]
    public void Each_unsupported_feature_reports_its_reason(string json, string reason)
    {
        var result = PageTemplateMigration.Classify(json, hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Null(result.ConvertedJson);
        Assert.Contains(reason, result.Reasons);
    }

    [Fact]
    public void Page_can_carry_several_reasons()
    {
        var result = PageTemplateMigration.Classify(Page([C("cubuk", "actionBar"), C("pencere", "dialog"), C("ad", "input")]), hasOpenDraft: true);
        Assert.Null(result.Target);
        Assert.Contains("İşlem çubuğu kalıplarda yok.", result.Reasons);
        Assert.Contains("Pencere kalıplarda yok.", result.Reasons);
        Assert.Contains("Form alanları (Kayıt kartı adayı).", result.Reasons);
        Assert.Contains("Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.", result.Reasons);
    }

    [Fact]
    public void Open_draft_is_not_converted()
    {
        var result = PageTemplateMigration.Classify(ListPage(), hasOpenDraft: true);
        Assert.Null(result.Target);
        Assert.Null(result.ConvertedJson);
        Assert.Equal(new[] { "Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli." }, result.Reasons);
    }

    [Fact]
    public void Schema_v1_is_not_converted()
    {
        var json = """{"schemaVersion":1,"components":[{"id":"t1","type":"text","props":{"text":"Merhaba"}}]}""";
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        var result = PageTemplateMigration.Classify(json, hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Null(result.ConvertedJson);
        Assert.Equal(new[] { "Eski şema (sürüm 1); önce tasarımcıda kaydedilmeli." }, result.Reasons);
    }

    [Fact]
    public void Already_templated_page_is_not_converted()
    {
        var after = Converted(ListPage(), "list").ConvertedJson!;
        var result = PageTemplateMigration.Classify(after, hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Null(result.ConvertedJson);
        Assert.NotEmpty(result.Reasons);
    }

    [Fact]
    public void Free_target_refuses_tables_whose_grid_tools_would_disappear()
    {
        // İki tablo Liste'ye uymaz; serbest gövde tablo araçlarını (arama, dışa aktarma…) çizmez.
        var result = PageTemplateMigration.Classify(Page([C("a", "dataTable", new { query = "liste" }), NoTools("b")]), hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Contains(result.Reasons, x => x.Contains("tablo araçları", StringComparison.Ordinal));

        var converted = Converted(Page([NoTools("a"), NoTools("b")]), "free");
        Assert.NotNull(converted.ConvertedJson);
    }

    [Fact]
    public void Conditional_section_heading_is_not_turned_into_a_block()
    {
        var result = PageTemplateMigration.Classify(Page([C("s1", "section", new { title = "Özet", visibleWhen = "sayfa.genis == true" }), C("t1", "text")]), hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.NotEmpty(result.Reasons);
    }

    [Fact]
    public void Equivalence_rejects_changed_action_type_query_param_and_visibleWhen()
    {
        var before = ListPage();
        var after = Converted(before, "list").ConvertedJson!;
        Assert.Null(BehaviorEquivalence.Check(before, after));

        var actionType = JsonNode.Parse(after)!;
        actionType["components"]!.AsArray().Single(x => (string?)x!["id"] == "yeni")!["props"]!["actionType"] = "page";
        Assert.Contains("actionType", BehaviorEquivalence.Check(before, actionType.ToJsonString()));

        var parameter = JsonNode.Parse(after)!;
        parameter["queries"]![1]!["parameters"]![0]!["binding"] = "{{tablo.secili.id}}";
        Assert.NotNull(BehaviorEquivalence.Check(before, parameter.ToJsonString()));

        var visible = JsonNode.Parse(after)!;
        visible["components"]!.AsArray().Single(x => (string?)x!["id"] == "not")!["props"]!["visibleWhen"] = "sayfa.genis == true";
        Assert.Contains("visibleWhen", BehaviorEquivalence.Check(before, visible.ToJsonString()));

        // Silinen bileşen, değişen ad ve bölüm/sekme dışında eklenen bileşen de düşer.
        var removed = JsonNode.Parse(after)!;
        var components = removed["components"]!.AsArray();
        components.Remove(components.Single(x => (string?)x!["id"] == "not"));
        Assert.NotNull(BehaviorEquivalence.Check(before, removed.ToJsonString()));

        var renamed = JsonNode.Parse(after)!;
        renamed["components"]!.AsArray().Single(x => (string?)x!["id"] == "tablo")!["name"] = "liste2";
        Assert.NotNull(BehaviorEquivalence.Check(before, renamed.ToJsonString()));

        var added = JsonNode.Parse(after)!;
        added["components"]!.AsArray().Add(JsonNode.Parse("""{"id":"yeniMetin","type":"text","props":{"slot":"below","text":"x"}}"""));
        Assert.NotNull(BehaviorEquivalence.Check(before, added.ToJsonString()));

        var retitled = JsonNode.Parse(after)!;
        retitled["components"]!.AsArray().Single(x => (string?)x!["id"] == "baslik")!["props"]!["title"] = "Başka";
        Assert.NotNull(BehaviorEquivalence.Check(before, retitled.ToJsonString()));
    }

    [Fact]
    public void Equivalence_allows_only_id_lists_to_change_in_tabs()
    {
        var before = TabsPage();
        var after = Converted(before, "free").ConvertedJson!;
        Assert.Null(BehaviorEquivalence.Check(before, after));
        var relabeled = JsonNode.Parse(after)!;
        var tabs = relabeled["components"]!.AsArray().Single(x => (string?)x!["id"] == "sekme")!["props"]!["tabs"]!.AsArray();
        tabs[1] = "Başka=s2";
        Assert.NotNull(BehaviorEquivalence.Check(before, relabeled.ToJsonString()));
    }

    [Fact]
    public void Converted_definition_passes_schema_and_template_validation()
    {
        foreach (var (json, target) in new[] { (ListPage(), "list"), (DashboardPage(), "free"), (SectionPage(), "free"), (TabsPage(), "free") })
        {
            var converted = Converted(json, target).ConvertedJson!;
            Assert.True(TenantCustomPageSchema.Validate(converted, out var error), error);
            using var doc = JsonDocument.Parse(converted);
            Assert.Equal(target, PageTemplateRules.TemplateName(doc.RootElement));
            Assert.Null(PageTemplateRules.ValidateTemplate(doc.RootElement, doc.RootElement.GetProperty("components"), doc.RootElement.GetProperty("queries")));
        }
    }

    [Fact]
    public void All_50_standards_classify_without_exception()
    {
        var standards = SystemPageStandards.All.Values.OrderBy(x => x.ScreenKey, StringComparer.Ordinal).ToArray();
        Assert.Equal(50, standards.Length);
        var results = standards.Select(x => (x.ScreenKey, Result: PageTemplateMigration.Classify(x.DefinitionJson, hasOpenDraft: false))).ToArray();
        foreach (var (key, result) in results)
        {
            if (result.Target is null) Assert.True(result.Reasons.Count > 0, $"{key}: hedefsiz ama nedensiz");
            else
            {
                Assert.NotNull(result.ConvertedJson);
                Assert.Null(BehaviorEquivalence.Check(standards.Single(x => x.ScreenKey == key).DefinitionJson, result.ConvertedJson!));
            }
        }

        output.WriteLine("Hedefe göre: " + string.Join(", ", results.GroupBy(x => x.Result.Target ?? "—").OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => $"{x.Key}={x.Count()}")));
        output.WriteLine("En sık nedenler:");
        foreach (var group in results.SelectMany(x => x.Result.Reasons).GroupBy(x => x).OrderByDescending(x => x.Count()).ThenBy(x => x.Key, StringComparer.Ordinal).Take(15))
            output.WriteLine($"  {group.Count(),2} × {group.Key}");
        output.WriteLine("Sayfalar:");
        foreach (var (key, result) in results)
            output.WriteLine($"  {key}: {result.Target ?? "—"} | {string.Join(" | ", result.Reasons)}");
    }
}
