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
        { Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "print" } }), C("cubuk2", "actionBar", new { hiddenCommands = new[] { "print" } }), NoTools("tablo")]), "İşlem çubuğu kalıplarda yok." },
        { Page([C("pencere", "dialog"), NoTools("tablo")]), "Pencere kalıplarda yok." },
        { Page([C("adimlar", "steps"), NoTools("tablo")]), "Sihirbaz adımları kalıplarda yok." },
        { Page([C("satirlar", "editableGrid"), NoTools("tablo")]), "Düzenlenebilir satır tablosu (Belge kalıbı bekleniyor)." },
        { Page([C("ad", "input"), NoTools("tablo")]), "input bu kalıpta yok." },
        { Page([C("kart", "formCard", new { inputs = new[] { "ad" } }), C("ad", "input"), NoTools("tablo")]), "Kayıt kartı tam bir kayıt özeti (recordHeader) ister." },
        { Page([C("ozel", "customFieldsBlock"), NoTools("tablo")]), "customFieldsBlock bu kalıpta yok." },
        { Page([C("eskiForm", "form"), NoTools("tablo")]), "form bu kalıpta yok." },
        { Page([C("sekme", "tabs", new { tabs = new[] { "Genel=t1" } }), C("t1", "text"), C("t2", "text")]), "Sekmeler bileşenlere göre bölünemiyor." },
        { Page([C("kod", "code", new { javascript = "1" }), NoTools("tablo")]), "Satır içi kod alanı kalıplarda yok." },
        { Page([C("cipler", "filterChips"), NoTools("tablo")]), "filterChips bu kalıpta yok." },
        { Page([C("yuzey", "facetPanel"), NoTools("tablo")]), "facetPanel bu kalıpta yok." },
        { Page([C("ozet", "recordHeader"), NoTools("tablo")]), "recordHeader bu kalıpta yok." },
        { Page([C("panel", "contextPanel", new { table = "tablo" }), C("t1", "text")]), "contextPanel bu kalıpta yok." },
        { Page([C("t1", "text", new { widthWhen = "6=sayfa.genis == true" }), NoTools("tablo")]), "Koşula bağlı genişlik kalıplarda yok." },
        { Page([C("t1", "text", new { formulas = new[] { "x=1" } }), NoTools("tablo")]), "formulas ayarı kalıplarda yok." }
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
        Assert.Contains("Yazdır görünür ama bağlı değil; kalıpta görünen Yazdır yazdırır.", result.Reasons);
        Assert.Contains("Pencere kalıplarda yok.", result.Reasons);
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
    public void Equivalence_rejects_components_moved_between_tabs()
    {
        var before = TabsPage();
        var after = Converted(before, "free").ConvertedJson!;
        var tabs = Strings(Component(after, "sekme")["props"]!["tabs"]);
        Assert.Equal(2, tabs.Length);

        // Same labels, same count, but the tabs' contents swapped: the item set per label changed.
        var swapped = JsonNode.Parse(after)!;
        var ids = tabs.Select(x => x[(x.IndexOf('=') + 1)..]).ToArray();
        swapped["components"]!.AsArray().Single(x => (string?)x!["id"] == "sekme")!["props"]!["tabs"] =
            new JsonArray($"Genel={ids[1]}", $"Diğer={ids[0]}");
        Assert.Contains("sekmesindeki bileşenler", BehaviorEquivalence.Check(before, swapped.ToJsonString()));

        // A member moved from one block to another across tabs is caught through the section members too.
        var moved = JsonNode.Parse(after)!;
        var blocks = moved["components"]!.AsArray().OfType<JsonObject>().Where(x => (string?)x["type"] == "section" && x["props"]?["members"] is JsonArray).ToList();
        var first = blocks.Single(x => Strings(x["props"]!["members"]).Contains("m1"));
        var second = blocks.Single(x => Strings(x["props"]!["members"]).Contains("t2"));
        first["props"]!["members"] = new JsonArray("t1");
        second["props"]!["members"] = new JsonArray("m1", "t2");
        Assert.NotNull(BehaviorEquivalence.Check(before, moved.ToJsonString()));
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
    public void All_50_standards_classify_without_exception_and_none_reports_action_bar_or_form_reason()
    {
        var standards = SystemPageStandards.All.Values.OrderBy(x => x.ScreenKey, StringComparer.Ordinal).ToArray();
        Assert.Equal(50, standards.Length);
        var results = standards.Select(x => (x.ScreenKey, Result: PageTemplateMigration.Classify(x.DefinitionJson, hasOpenDraft: false))).ToArray();
        foreach (var (key, result) in results)
        {
            Assert.DoesNotContain("İşlem çubuğu kalıplarda yok.", result.Reasons);
            Assert.DoesNotContain("Form alanları (Kayıt kartı adayı).", result.Reasons);
            Assert.DoesNotContain("hiddenCommands ayarı kalıplarda yok.", result.Reasons);
            Assert.DoesNotContain("commandWhen ayarı kalıplarda yok.", result.Reasons);
            if (result.Target is null) Assert.True(result.Reasons.Count > 0, $"{key}: hedefsiz ama nedensiz");
            else
            {
                Assert.NotNull(result.ConvertedJson);
                Assert.Null(BehaviorEquivalence.Check(standards.Single(x => x.ScreenKey == key).DefinitionJson, result.ConvertedJson!));
                Assert.True(TenantCustomPageSchema.Validate(result.ConvertedJson!, out var error), $"{key}: {error}");
            }
        }

        output.WriteLine($"Kayıt kartı (record): {results.Count(x => x.Result.Target == "record")}");
        output.WriteLine("Hedefe göre: " + string.Join(", ", results.GroupBy(x => x.Result.Target ?? "—").OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => $"{x.Key}={x.Count()}")));
        output.WriteLine("En sık 10 neden:");
        foreach (var group in results.SelectMany(x => x.Result.Reasons).GroupBy(x => x).OrderByDescending(x => x.Count()).ThenBy(x => x.Key, StringComparer.Ordinal).Take(10))
            output.WriteLine($"  {group.Count(),2} × {group.Key}");
        output.WriteLine("Sayfalar:");
        foreach (var (key, result) in results)
            output.WriteLine($"  {key}: {result.Target ?? "—"} | {string.Join(" | ", result.Reasons)}");
    }

    // ---------------- 5b-2a: işlem çubuğu ve Kayıt kartı ----------------

    private static readonly object[] RecordQueries =
    [
        new { id = "kayit", name = "kayit", kind = "read", sql = "SELECT @id AS id", runOn = "load", parameters = new object[] { new { name = "id", binding = "{{sayfa.parametre.kayit}}", type = "guid" } } },
        new { id = "sil", name = "sil", kind = "delete", operation = "stok.kart.sil", runOn = "manual", parameters = new object[] { new { name = "id", binding = "{{bugun}}", type = "guid" } } }
    ];

    private static object Bar(object? props = null) => C("cubuk", "actionBar", props ?? new { hiddenCommands = new[] { "print" } });

    private static string BarListPage() => Page(
    [
        C("cubuk", "actionBar", new { hiddenCommands = new[] { "print", "save" }, moreButtons = new[] { "yeniTeklif" }, openButton = "ac", exportTable = "tablo", titleCount = "{{liste.rows.length}}" }),
        C("baslik", "heading", new { text = "Kartlar" }),
        C("tablo", "dataTable", new { query = "liste" }),
        C("yeniTeklif", "button", new { label = "Yeni teklif", actionType = "query", queryId = "sil" }),
        C("ac", "button", new { label = "Aç", actionType = "query", queryId = "sil" })
    ]);

    /// <summary>Başlık, tek özet, iki bölüm (aralarında açıklama), üç alan, alt not; çubukta Yazdır gizli.</summary>
    private static object[] RecordComponents(object? bar = null, object? between = null, object? keyedCard = null) =>
    [
        C("baslik", "heading", new { text = "Cari kartı" }),
        C("ozet", "recordHeader", new { title = "Kart" }),
        bar ?? Bar(),
        keyedCard ?? C("b1", "formCard", new { inputs = new[] { "a1", "a2" }, recordKey = "{{kayit.rows[0].id}}" }),
        C("a1", "input", new { label = "Kod" }),
        C("a2", "input", new { label = "Ad", width = 6 }),
        between ?? C("n1", "text", new { text = "Açıklama" }),
        C("b2", "formCard", new { inputs = new[] { "a3" } }),
        C("a3", "input", new { label = "Telefon" }),
        C("alt", "text", new { text = "Alt not" })
    ];

    private static string RecordPage(object? bar = null, object? between = null, object? keyedCard = null) =>
        Page(RecordComponents(bar, between, keyedCard), RecordQueries);

    [Fact]
    public void List_page_with_mappable_bar_becomes_list_with_commands_slot()
    {
        var before = BarListPage();
        var after = Converted(before, "list").ConvertedJson!;
        Assert.Equal(Ids(before), Ids(after));
        Assert.Equal("\"commands\"", Prop(after, "cubuk", "slot"));
        var barBefore = (JsonObject)Component(before, "cubuk")["props"]!.DeepClone();
        var barAfter = (JsonObject)Component(after, "cubuk")["props"]!.DeepClone();
        barAfter.Remove("slot");
        Assert.True(JsonNode.DeepEquals(barBefore, barAfter));
        Assert.Equal("\"actions\"", Prop(after, "yeniTeklif", "slot"));
        Assert.Equal("\"actions\"", Prop(after, "ac", "slot"));
        using var doc = JsonDocument.Parse(after);
        Assert.Equal("cubuk", PageTemplateRules.CommandBarId(doc.RootElement.GetProperty("components")));
    }

    public static TheoryData<string, string> UnmappableBarSettings() => new()
    {
        { """{"hiddenCommands":["print"],"barLook":["unbound=hide"]}""", "İşlem çubuğunun barLook ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"formDialog":"pencere"}""", "İşlem çubuğunun formDialog ayarının kalıpta karşılığı yok." },
        { """{"printEnabled":true}""", "İşlem çubuğunun printEnabled ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"exportCsv":false}""", "İşlem çubuğunun exportCsv ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"visibleWhen":"liste.rows.length > 0"}""", "İşlem çubuğunun visibleWhen ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"disabledWhen":"liste.rows.length > 0"}""", "İşlem çubuğunun disabledWhen ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"margin":2}""", "İşlem çubuğunun margin ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"newAction":"dialog"}""", "İşlem çubuğunun newAction ayarının kalıpta karşılığı yok." },
        { """{"hiddenCommands":["print"],"openAction":"dialog"}""", "İşlem çubuğunun openAction ayarının kalıpta karşılığı yok." }
    };

    [Theory]
    [MemberData(nameof(UnmappableBarSettings))]
    public void Each_unmappable_bar_setting_reports_its_reason(string props, string reason)
    {
        var result = PageTemplateMigration.Classify(Page([C("cubuk", "actionBar", JsonNode.Parse(props)), NoTools("tablo")]), hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Null(result.ConvertedJson);
        Assert.Contains(reason, result.Reasons);
    }

    [Fact]
    public void Visible_unbound_print_is_not_converted()
    {
        var result = PageTemplateMigration.Classify(Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "save" } }), NoTools("tablo")]), hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Equal(new[] { "Yazdır görünür ama bağlı değil; kalıpta görünen Yazdır yazdırır." }, result.Reasons);
        // Gizli Yazdır taşınır.
        Converted(Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "print" } }), NoTools("tablo")]), "list");
    }

    [Fact]
    public void Free_page_keeps_bar_and_does_not_count_bar_buttons()
    {
        var buttons = Enumerable.Range(1, 9).Select(i => C($"d{i}", "button", new { label = $"D{i}", actionType = "query", queryId = "sil" })).ToArray();
        var before = Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "print" }, moreButtons = Enumerable.Range(1, 9).Select(i => $"d{i}").ToArray() }), C("m1", "metric", new { title = "A", value = "1" }), .. buttons]);
        var after = Converted(before, "free").ConvertedJson!;
        Assert.Equal("\"commands\"", Prop(after, "cubuk", "slot"));
        Assert.All(Enumerable.Range(1, 9), i => Assert.Equal("\"actions\"", Prop(after, $"d{i}", "slot")));
    }

    [Fact]
    public void Form_page_with_one_summary_becomes_record()
    {
        var before = RecordPage();
        var after = Converted(before, "record").ConvertedJson!;
        var root = JsonNode.Parse(after)!;
        Assert.Equal("""{"name":"record"}""", root["template"]!.ToJsonString());
        Assert.Equal("\"above\"", Prop(after, "baslik", "slot"));
        Assert.Equal("\"summary\"", Prop(after, "ozet", "slot"));
        Assert.Equal("\"commands\"", Prop(after, "cubuk", "slot"));
        Assert.Equal("\"section\"", Prop(after, "b1", "slot"));
        Assert.Equal("\"section\"", Prop(after, "b2", "slot"));
        foreach (var id in new[] { "a1", "a2", "a3" }) Assert.Equal("\"field\"", Prop(after, id, "slot"));
        Assert.Null(Prop(after, "a2", "width"));
        Assert.Equal("\"note\"", Prop(after, "n1", "slot"));
        Assert.Equal("\"below\"", Prop(after, "alt", "slot"));
        var tabs = Component(after, "sekmeler");
        Assert.Equal("tabs", (string?)tabs["type"]);
        Assert.Equal("\"tabs\"", tabs["props"]!["slot"]!.ToJsonString());
        Assert.Equal(new[] { "Genel=b1,n1,b2" }, Strings(tabs["props"]!["tabs"]));
        Assert.Equal(Ids(before), Ids(after).Where(x => x != "sekmeler").ToArray());
    }

    [Fact]
    public void Form_page_with_existing_tabs_keeps_them()
    {
        var before = Page(
        [
            C("ozet", "recordHeader", new { title = "Kart" }),
            Bar(),
            C("sekme", "tabs", new { tabs = new[] { "Genel=b1", "Satırlar=satirlar,n1" } }),
            C("b1", "formCard", new { inputs = new[] { "a1" }, recordKey = "{{kayit.rows[0].id}}" }),
            C("a1", "input", new { label = "Kod" }),
            C("satirlar", "dataTable", new { query = "kayit" }),
            C("n1", "text", new { text = "Not" }),
            C("alt", "text", new { text = "Alt" })
        ], RecordQueries);
        var after = Converted(before, "record").ConvertedJson!;
        Assert.Equal(Ids(before), Ids(after));
        Assert.Equal("\"tabs\"", Prop(after, "sekme", "slot"));
        Assert.Equal("\"lines\"", Prop(after, "satirlar", "slot"));
        Assert.Equal("\"note\"", Prop(after, "n1", "slot"));
        Assert.Equal("\"below\"", Prop(after, "alt", "slot"));
        Assert.Equal(new[] { "Genel=b1", "Satırlar=satirlar,n1" }, Strings(Component(after, "sekme")["props"]!["tabs"]));
    }

    [Fact]
    public void Form_page_without_summary_reports_reason()
    {
        var without = Page(RecordComponents().Where(x => !JsonSerializer.Serialize(x).Contains("\"recordHeader\"")).ToArray(), RecordQueries);
        Assert.Contains("Kayıt kartı tam bir kayıt özeti (recordHeader) ister.", PageTemplateMigration.Classify(without, false).Reasons);
        var four = Page([.. RecordComponents(), C("ozet2", "recordHeader", new { title = "2" }), C("ozet3", "recordHeader", new { title = "3" }), C("ozet4", "recordHeader", new { title = "4" })], RecordQueries);
        var result = PageTemplateMigration.Classify(four, false);
        Assert.Null(result.Target);
        Assert.Contains("Kayıt kartı tam bir kayıt özeti (recordHeader) ister.", result.Reasons);
    }

    [Fact]
    public void Form_page_without_param_key_reports_reason()
    {
        var unkeyed = RecordPage(keyedCard: C("b1", "formCard", new { inputs = new[] { "a1", "a2" } }));
        Assert.Contains("Kayıt kartının bölümleri sayfa parametresiyle okunan bir kayda bağlı değil.", PageTemplateMigration.Classify(unkeyed, false).Reasons);
        var notParam = Page(RecordComponents(),
        [
            new { id = "kayit", name = "kayit", kind = "read", sql = "SELECT @id AS id", runOn = "load", parameters = new object[] { new { name = "id", binding = "{{bugun}}", type = "guid" } } },
            RecordQueries[1]
        ]);
        var result = PageTemplateMigration.Classify(notParam, false);
        Assert.Null(result.Target);
        Assert.Contains("Kayıt kartının bölümleri sayfa parametresiyle okunan bir kayda bağlı değil.", result.Reasons);
    }

    [Fact]
    public void Loose_input_reports_reason()
    {
        var result = PageTemplateMigration.Classify(Page([.. RecordComponents(), C("musteriTuru", "input", new { label = "Tür" })], RecordQueries), false);
        Assert.Null(result.Target);
        Assert.Contains("Kayıt kartında her alan bir bölümde olmalı: musteriTuru.", result.Reasons);
    }

    [Fact]
    public void Badge_between_sections_reports_reason()
    {
        var result = PageTemplateMigration.Classify(RecordPage(between: C("rozet", "badge", new { text = "Durum" })), false);
        Assert.Null(result.Target);
        Assert.Contains("Kayıt kartında bölümlerin arasına yalnız açıklama (text) konabilir: rozet.", result.Reasons);
    }

    [Fact]
    public void Record_bar_title_count_reports_reason()
    {
        var result = PageTemplateMigration.Classify(RecordPage(bar: Bar(new { hiddenCommands = new[] { "print" }, titleCount = "{{kayit.rows.length}}" })), false);
        Assert.Null(result.Target);
        Assert.Contains("Kayıt kartında başlıkta kayıt sayısı yok.", result.Reasons);
    }

    [Fact]
    public void Record_converted_definition_passes_schema_and_template_validation()
    {
        var converted = Converted(RecordPage(), "record").ConvertedJson!;
        Assert.True(TenantCustomPageSchema.Validate(converted, out var error), error);
        using var doc = JsonDocument.Parse(converted);
        Assert.Equal("record", PageTemplateRules.TemplateName(doc.RootElement));
        Assert.Null(PageTemplateRules.ValidateTemplate(doc.RootElement, doc.RootElement.GetProperty("components"), doc.RootElement.GetProperty("queries")));
        Assert.Equal("kayit", CustomPageQueryEndpoints.RecordKeyParam(converted));
    }

    /// <summary>Elle kalıba çevrilmiş sonraki tanım: <paramref name="before"/>'un bileşenlerine yer verilir.</summary>
    private static string HandConverted(string before, Action<JsonObject>? edit = null)
    {
        var root = JsonNode.Parse(before)!.AsObject();
        root["template"] = new JsonObject { ["name"] = "list" };
        foreach (var component in root["components"]!.AsArray().OfType<JsonObject>())
        {
            var props = (JsonObject)component["props"]!;
            props.Remove("width");
            props["slot"] = (string?)component["type"] switch { "actionBar" => "commands", "dataTable" => "list", "button" => "actions", _ => "above" };
        }
        edit?.Invoke(root);
        return root.ToJsonString();
    }

    [Fact]
    public void Equivalence_rejects_unmappable_bar_key_after_conversion()
    {
        var before = Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "print" }, barLook = new[] { "unbound=hide" } }), NoTools("tablo")]);
        Assert.Equal("İşlem çubuğunun 'barLook' ayarının kalıpta karşılığı yok.", BehaviorEquivalence.Check(before, HandConverted(before)));
        // Kalıpsız sonraki tanımda (yalnız genişlik değişti) bu kural uygulanmaz.
        var legacyAfter = JsonNode.Parse(before)!;
        legacyAfter["components"]![0]!["props"]!["width"] = 12;
        Assert.Null(BehaviorEquivalence.Check(before, legacyAfter.ToJsonString()));
    }

    [Fact]
    public void Equivalence_rejects_visible_print_without_printEnabled()
    {
        var before = Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "save" } }), NoTools("tablo")]);
        Assert.Equal("Kalıpta görünen Yazdır yazdırır; önceki sayfada bağlı değildi.", BehaviorEquivalence.Check(before, HandConverted(before)));
        var hidden = Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "print" } }), NoTools("tablo")]);
        Assert.Null(BehaviorEquivalence.Check(hidden, HandConverted(hidden)));
    }

    [Fact]
    public void Equivalence_rejects_changed_hiddenCommands_and_saveSequence()
    {
        var before = Page([C("cubuk", "actionBar", new { hiddenCommands = new[] { "print" }, saveSequence = new[] { "sil" } }), NoTools("tablo")]);
        Assert.Null(BehaviorEquivalence.Check(before, HandConverted(before)));
        var hidden = HandConverted(before, root => root["components"]![0]!["props"]!["hiddenCommands"] = new JsonArray("print", "delete"));
        Assert.Contains("hiddenCommands", BehaviorEquivalence.Check(before, hidden));
        var sequence = HandConverted(before, root => root["components"]![0]!["props"]!["saveSequence"] = new JsonArray("liste"));
        Assert.Contains("saveSequence", BehaviorEquivalence.Check(before, sequence));
    }
}
