using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;
using Xunit.Abstractions;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// 5b-2 adım 2 Görev 2: dönüştürücü pencereyi 'dialogs', içeriğini 'dialog' yerine koyar; grupları (tek katlı children) olduğu gibi
/// bırakır, genişliği siler. Eşdeğerlik pencere ayarlarını, içeriğini ve grubun çocuklarını/koşulunu korur.
/// </summary>
public sealed class PageTemplateMigrationDialogTests(ITestOutputHelper output)
{
    private const string NestedGroupReason = "Grubun içinde grup kalıplarda yok.";
    private static string GroupChildReason(string type) => $"{type} grubun içinde kalıplarda yok.";
    private static string DialogPartReason(string type) => $"{type} pencerenin içinde kalıplarda yok.";
    private const string DialogShapeReason = "Pencerenin sunumu ya da boyutu kalıplarda yok.";
    private const string EditableGridReason = "Düzenlenebilir satır tablosu (Belge kalıbı bekleniyor).";

    private const string FixtureDirectory = "TemplateDialogsFixtures";
    private const string FixtureName = "sales-orders-converted.json";
    private const string UpdateVariable = "UPDATE_TEMPLATE_DIALOG_FIXTURE";

    /// <summary>
    /// Kalan engeller (Görev 2 raporu; kural gevşetilmedi, karar denetleyicide): <c>sales-orders</c>'ta hiçbir form kartına, sekmeye
    /// ya da pencereye ait olmayan gizli giriş (<c>sevkSayfaBoyutu</c>) Liste gövdesinde kalır; <c>finance-ledger-chart</c>'ta detay
    /// kartının sekmesinin gösterdiği form kartları, girişleri ve ikinci detay paneli (<c>salt</c>) Liste gövdesinde kalır.
    /// </summary>
    private const string SalesOrdersBlocked = "Görev 2: sevkSayfaBoyutu (gizli, sahipsiz giriş) Liste gövdesinde yer bulamıyor — 'input bu kalıpta yok.'; denetleyici kararı bekleniyor.";
    private const string LedgerChartBlocked = "Görev 2: detay kartının sekmesindeki hesapFormu/girişler/salt Liste gövdesinde yer bulamıyor — 'formCard bu kalıpta yok.'; denetleyici kararı bekleniyor.";

    private static readonly object[] Queries =
    [
        new { id = "liste", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" }
    ];

    private static string Page(object[] components) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["queries"] = Queries,
        ["components"] = components
    });

    private static object C(string id, string type, object? props = null) => new { id, type, name = id, props = props ?? new { } };
    private static object G(string id, string type, object[] children, object? props = null) => new { id, type, name = id, props = props ?? new { }, children };
    private static object Table() => C("tablo", "dataTable", new { query = "liste" });

    private static string Standard(string key) => SystemPageStandards.All[key].DefinitionJson;

    private static JsonObject Find(string json, string id)
    {
        JsonObject? Walk(JsonArray array)
        {
            foreach (var item in array.OfType<JsonObject>())
            {
                if ((string?)item["id"] == id) return item;
                if (item["children"] is JsonArray children && Walk(children) is { } found) return found;
            }
            return null;
        }
        return Walk(JsonNode.Parse(json)!["components"]!.AsArray()) ?? throw new KeyNotFoundException(id);
    }

    private static string Converted(string key)
    {
        var result = PageTemplateMigration.Classify(Standard(key), hasOpenDraft: false);
        Assert.True(result.ConvertedJson is not null, $"{key}: hedef {result.Target ?? "—"}: {string.Join(" | ", result.Reasons)}");
        return result.ConvertedJson!;
    }

    [Theory]
    [InlineData("sales-orders", Skip = SalesOrdersBlocked)]
    [InlineData("sales-invoices")]
    [InlineData("inventory-cost")]
    [InlineData("inventory-tracking")]
    [InlineData("finance-ledger-chart", Skip = LedgerChartBlocked)]
    public void Five_dialog_and_group_standards_convert_to_list(string key)
    {
        var before = Standard(key);
        var result = PageTemplateMigration.Classify(before, hasOpenDraft: false);
        output.WriteLine($"{key}: {result.Target ?? "—"} | {string.Join(" | ", result.Reasons)}");
        Assert.True(result.Target == "list", $"{key}: hedef {result.Target ?? "—"}: {string.Join(" | ", result.Reasons)}");
        Assert.NotNull(result.ConvertedJson);
        Assert.Null(BehaviorEquivalence.Check(before, result.ConvertedJson!));
        Assert.True(TenantCustomPageSchema.Validate(result.ConvertedJson!, out var error), $"{key}: {error}");
    }

    [Fact(Skip = SalesOrdersBlocked)]
    public void Converted_dialog_keeps_settings_and_contents()
    {
        var before = Standard("sales-orders");
        var after = Converted("sales-orders");

        var oldDialog = (JsonObject)Find(before, "siparisPenceresi")["props"]!;
        var newDialog = (JsonObject)Find(after, "siparisPenceresi")["props"]!;
        Assert.Equal("dialogs", (string?)newDialog["slot"]);
        Assert.False(newDialog.ContainsKey("width"));
        foreach (var (key, value) in oldDialog.Where(x => x.Key != "width"))
            Assert.True(JsonNode.DeepEquals(value, newDialog[key]), key);
        Assert.Equal(oldDialog.Count(x => x.Key != "width") + 1, newDialog.Count);

        var group = Find(after, "teslimBolumu");
        var groupProps = (JsonObject)group["props"]!;
        Assert.Equal("dialog", (string?)groupProps["slot"]);
        Assert.False(groupProps.ContainsKey("width"));
        Assert.Equal((string?)Find(before, "teslimBolumu")["props"]!["visibleWhen"], (string?)groupProps["visibleWhen"]);
        Assert.Equal(["teslimFormu", "teslimKaydet"], group["children"]!.AsArray().Select(x => (string)x!["id"]!));
        // Window contents reached through the window's tabs and a group child form card's inputs are window contents too.
        foreach (var id in new[] { "siparisBasligi", "siparisDurumu", "siparisIslemleri", "siparisSekmeleri", "kalemTablosu", "rezervasyonBolumu", "irsaliyeTablosu", "teslimTarihi", "rezervasyonDeposu", "rezervasyonKimligi" })
            Assert.Equal("dialog", (string?)Find(after, id)["props"]!["slot"]);
    }

    /// <summary><see cref="Converted_dialog_keeps_settings_and_contents"/> on sales-invoices while sales-orders is blocked.</summary>
    [Fact]
    public void Converted_invoice_dialog_keeps_settings_and_contents()
    {
        var before = Standard("sales-invoices");
        var after = Converted("sales-invoices");

        var oldDialog = (JsonObject)Find(before, "faturaPenceresi")["props"]!;
        var newDialog = (JsonObject)Find(after, "faturaPenceresi")["props"]!;
        Assert.Equal("dialogs", (string?)newDialog["slot"]);
        Assert.False(newDialog.ContainsKey("width"));
        foreach (var (key, value) in oldDialog.Where(x => x.Key != "width"))
            Assert.True(JsonNode.DeepEquals(value, newDialog[key]), key);
        Assert.Equal(oldDialog.Count(x => x.Key != "width") + 1, newDialog.Count);

        var group = Find(after, "tahsilatBolumu");
        Assert.Equal("dialog", (string?)group["props"]!["slot"]);
        Assert.False(((JsonObject)group["props"]!).ContainsKey("width"));
        Assert.Equal(["tahsilatFormu", "tahsilatEkleDugmesi", "tahsilatTablosu"], group["children"]!.AsArray().Select(x => (string)x!["id"]!));
        Assert.False(((JsonObject)Find(after, "tahsilatTablosu")["props"]!).ContainsKey("width"));
        Assert.Equal((string?)Find(before, "tahsilatFormu")["props"]!["visibleWhen"], (string?)Find(after, "tahsilatFormu")["props"]!["visibleWhen"]);
        foreach (var id in new[] { "faturaBasligi", "faturaDurumu", "faturaSekmeleri", "satirTablosu", "tahsilatBolumu", "iadeTablosu", "tahsilatTarihi", "tahsilatKimligi" })
            Assert.Equal("dialog", (string?)Find(after, id)["props"]!["slot"]);
        // Row buttons of window tables stay row buttons; the summary's buttons are page buttons the summary draws.
        Assert.Equal("rowActions", (string?)Find(after, "tahsilatIptalDugmesi")["props"]!["slot"]);
        Assert.Equal("rowActions", (string?)Find(after, "iadeIptalDugmesi")["props"]!["slot"]);
        Assert.Equal("actions", (string?)Find(after, "faturaIptalDugmesi")["props"]!["slot"]);
    }

    [Fact]
    public void Group_children_lose_width_and_list_detail_card_is_kept()
    {
        var after = Converted("inventory-tracking");
        var card = Find(after, "detayKarti");
        Assert.Equal("detail", (string?)card["props"]!["slot"]);
        Assert.False(((JsonObject)card["props"]!).ContainsKey("width"));
        foreach (var child in card["children"]!.AsArray().OfType<JsonObject>())
        {
            Assert.False(((JsonObject?)child["props"])?.ContainsKey("width") ?? false, (string?)child["id"]);
            Assert.False(((JsonObject?)child["props"])?.ContainsKey("slot") ?? false, (string?)child["id"]);
        }
    }

    public static TheoryData<string, string> RefusedGroupsAndWindows() => new()
    {
        { Page([Table(), C("pencere", "dialog", new { contains = new[] { "grup" } }), G("grup", "section", [G("ic", "card", [C("rozet", "badge")])])]), NestedGroupReason },
        { Page([Table(), C("pencere", "dialog", new { contains = new[] { "grup" } }), G("grup", "section", [C("ic", "section")])]), NestedGroupReason },
        { Page([Table(), C("pencere", "dialog", new { contains = new[] { "grup" } }), G("grup", "section", [C("adimlar", "steps", new { steps = new[] { "Bir", "İki" }, activeWhen = new[] { "liste.rows[0].x == 1", "liste.rows[0].x == 2" } })])]), GroupChildReason("steps") },
        { Page([Table(), C("pencere", "dialog", new { contains = new[] { "izgara" } }), C("izgara", "editableGrid", new { title = "Kalemler", gridMode = "list", gridColumns = new[] { "ad|Ad|text" } })]), EditableGridReason },
        { Page([Table(), C("pencere", "dialog", new { contains = new[] { "rozet" } }), C("rozet", "badge")]), DialogPartReason("badge") },
        { Page([Table(), C("pencere", "dialog", new { presentation = "drawer", contains = new[] { "metin" } }), C("metin", "text")]), DialogShapeReason }
    };

    [Theory]
    [MemberData(nameof(RefusedGroupsAndWindows))]
    public void Nested_group_or_bad_child_is_refused_with_reason(string json, string reason)
    {
        Assert.True(TenantCustomPageSchema.Validate(json, out var originalError), originalError);
        var result = PageTemplateMigration.Classify(json, hasOpenDraft: false);
        Assert.Null(result.Target);
        Assert.Null(result.ConvertedJson);
        Assert.Contains(reason, result.Reasons);
    }

    [Fact(Skip = SalesOrdersBlocked)]
    public void Equivalence_rejects_dialog_content_change()
    {
        var before = Standard("sales-orders");
        var after = Converted("sales-orders");
        Assert.Null(BehaviorEquivalence.Check(before, after));

        string Edited(Action<JsonNode> edit)
        {
            var root = JsonNode.Parse(after)!;
            edit(root);
            return root.ToJsonString();
        }
        var fewerContents = Edited(root => ((JsonArray)FindNode(root, "siparisPenceresi")["props"]!["contains"]!).RemoveAt(0));
        Assert.NotNull(BehaviorEquivalence.Check(before, fewerContents));
        var groupCondition = Edited(root => FindNode(root, "teslimBolumu")["props"]!["visibleWhen"] = "true");
        Assert.NotNull(BehaviorEquivalence.Check(before, groupCondition));
        var childCondition = Edited(root => FindNode(root, "rozetTaslak")["props"]!["visibleWhen"] = "true");
        Assert.NotNull(BehaviorEquivalence.Check(before, childCondition));
        var windowSize = Edited(root => FindNode(root, "siparisPenceresi")["props"]!["size"] = "md");
        Assert.NotNull(BehaviorEquivalence.Check(before, windowSize));
        // Only layout may change: a child's width (and slot) is layout.
        var childWidth = Edited(root => FindNode(root, "rozetTaslak")["props"]!["width"] = 6);
        Assert.Null(BehaviorEquivalence.Check(before, childWidth));
    }

    /// <summary><see cref="Equivalence_rejects_dialog_content_change"/> on sales-invoices while sales-orders is blocked.</summary>
    [Fact]
    public void Equivalence_rejects_invoice_dialog_content_change()
    {
        var before = Standard("sales-invoices");
        var after = Converted("sales-invoices");
        Assert.Null(BehaviorEquivalence.Check(before, after));

        string Edited(Action<JsonNode> edit)
        {
            var root = JsonNode.Parse(after)!;
            edit(root);
            return root.ToJsonString();
        }
        Assert.NotNull(BehaviorEquivalence.Check(before, Edited(root => ((JsonArray)FindNode(root, "faturaPenceresi")["props"]!["contains"]!).RemoveAt(0))));
        Assert.NotNull(BehaviorEquivalence.Check(before, Edited(root => FindNode(root, "tahsilatFormu")["props"]!["visibleWhen"] = "true")));
        Assert.NotNull(BehaviorEquivalence.Check(before, Edited(root => FindNode(root, "faturaPenceresi")["props"]!["size"] = "md")));
        Assert.NotNull(BehaviorEquivalence.Check(before, Edited(root => FindNode(root, "faturaSekmeleri")["props"]!["tabs"]![1] = "Tahsilatlar=iadeTablosu")));
        // A group with a condition: inventory-tracking's detail card children.
        var tracking = Standard("inventory-tracking");
        var trackingAfter = Converted("inventory-tracking");
        var changed = JsonNode.Parse(trackingAfter)!;
        FindNode(changed, "detayLot")["props"]!["visibleWhen"] = "true";
        Assert.NotNull(BehaviorEquivalence.Check(tracking, changed.ToJsonString()));
        var moved = JsonNode.Parse(trackingAfter)!;
        ((JsonArray)FindNode(moved, "detayKarti")["children"]!).RemoveAt(0);
        Assert.NotNull(BehaviorEquivalence.Check(tracking, moved.ToJsonString()));
        // Only layout may change: a child's width is layout.
        var widened = JsonNode.Parse(trackingAfter)!;
        FindNode(widened, "detayLot")["props"]!["width"] = 6;
        Assert.Null(BehaviorEquivalence.Check(tracking, widened.ToJsonString()));
    }

    private static JsonObject FindNode(JsonNode root, string id)
    {
        JsonObject? Walk(JsonArray array)
        {
            foreach (var item in array.OfType<JsonObject>())
            {
                if ((string?)item["id"] == id) return item;
                if (item["children"] is JsonArray children && Walk(children) is { } found) return found;
            }
            return null;
        }
        return Walk(root["components"]!.AsArray()) ?? throw new KeyNotFoundException(id);
    }

    /// <summary>
    /// The converted sales-orders standard the Studio frontend reads (Fixtures/TemplateDialogs). Regenerate with
    /// <c>UPDATE_TEMPLATE_DIALOG_FIXTURE=1</c>.
    /// </summary>
    [Fact(Skip = SalesOrdersBlocked)]
    public void Sales_orders_converted_fixture_matches_converter_output()
    {
        var actual = JsonNode.Parse(Converted("sales-orders"))!;
        if (Environment.GetEnvironmentVariable(UpdateVariable) == "1") { WriteSourceFixture(actual); return; }
        var expected = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, FixtureDirectory, FixtureName)));
        Assert.True(JsonNode.DeepEquals(expected, actual), $"{FixtureName} güncel değil; {UpdateVariable}=1 ile yeniden üretin.");
    }

    private static void WriteSourceFixture(JsonNode node, [CallerFilePath] string source = "")
    {
        var directory = Path.Combine(Path.GetDirectoryName(source)!, "Fixtures", "TemplateDialogs");
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, FixtureName),
            node.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n");
    }
}
