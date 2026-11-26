using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Sub-project 5c: the "free" (Serbest gövde) template and the <c>members</c> prop.</summary>
public sealed class TenantCustomPageSchemaFreeTemplateTests
{
    private static readonly object[] Queries =
    [
        new { id = "kayit", name = "kayit", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "yaz", name = "yaz", kind = "delete", operation = "stok.kart.sil", runOn = "manual", parameters = new object[] { new { name = "id", binding = "{{bugun}}", type = "guid" } } }
    ];

    private static object Template => new { name = "free" };

    private static string Page(object? template, object[] components, object[]? queries = null) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["template"] = template,
        ["queries"] = queries ?? Queries,
        ["components"] = components
    }.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value));

    private static Dictionary<string, object?> Merge(Dictionary<string, object?> props, object? extra)
    {
        if (extra is not null)
            foreach (var property in extra.GetType().GetProperties()) props[property.Name] = property.GetValue(extra);
        return props;
    }

    private static object Block(string id, string[]? members = null, object? extra = null) =>
        new { id, type = "section", name = id, props = Merge(new Dictionary<string, object?> { ["slot"] = "block", ["title"] = "Bölüm", ["columns"] = 2, ["members"] = members ?? [] }, extra) };
    private static object Tabs(params string[] tabs) => new { id = "sekmeler", type = "tabs", name = "sekmeler", props = new { slot = "tabs", tabs } };
    private static object Item(string id, string type = "text", object? extra = null) =>
        new { id, type, name = id, props = Merge(new Dictionary<string, object?> { ["slot"] = "item", ["text"] = "Metin" }, extra) };
    private static object Table(string id, string query = "kayit", object? extra = null) =>
        new { id, type = "dataTable", name = id, props = Merge(new Dictionary<string, object?> { ["slot"] = "item", ["query"] = query }, extra) };

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Free_page_with_one_empty_block_is_valid() => Accepted(Page(Template, [Block("b1")]));

    [Fact]
    public void Free_page_with_actions_blocks_and_items_is_valid()
    {
        var button = new { id = "k1", type = "button", name = "k1", props = new { slot = "actions", label = "Kaydet" } };
        Accepted(Page(Template, [button, Block("b1", ["t1", "d1"]), Block("b2"), Item("t1"), Table("d1")]));
    }

    [Fact]
    public void Free_page_without_block_is_rejected()
    {
        Rejected(Page(Template, []), "Serbest gövdede en az bir bölüm (section) olmalı.");
        Rejected(Page(Template, [Item("t1")]), "Serbest gövdede en az bir bölüm (section) olmalı.");
    }

    [Fact]
    public void Free_item_outside_any_block_is_rejected() =>
        Rejected(Page(Template, [Block("b1"), Item("t1")]), "Serbest gövdede her bileşen tam bir bölüme ait olmalı.");

    [Fact]
    public void Free_item_in_two_blocks_is_rejected() =>
        Rejected(Page(Template, [Block("b1", ["t1"]), Block("b2", ["t1"]), Item("t1")]), "Serbest gövdede her bileşen tam bir bölüme ait olmalı.");

    [Fact]
    public void Free_block_outside_tab_is_rejected_when_tabs_exist()
    {
        Rejected(Page(Template, [Tabs("Genel=b1"), Block("b1"), Block("b2")]), "Serbest gövdede sekme varsa her bölüm tam bir sekmede yer almalı.");
        // A block listed in two tabs is already refused by the generic tab ownership rule.
        Rejected(Page(Template, [Tabs("Genel=b1", "Diğer=b1"), Block("b1")]), "birden fazla sekmede");
    }

    [Fact]
    public void Free_page_without_tabs_is_valid() => Accepted(Page(Template, [Block("b1"), Block("b2")]));

    [Fact]
    public void Free_page_with_tabs_is_valid() => Accepted(Page(Template, [Tabs("Genel=b1", "Diğer=b2"), Block("b1"), Block("b2")]));

    [Fact]
    public void Free_second_tabs_is_rejected()
    {
        object second = new { id = "sekmeler2", type = "tabs", name = "sekmeler2", props = new { slot = "tabs", tabs = new[] { "Diğer=b2" } } };
        Rejected(Page(Template, [Tabs("Genel=b1"), second, Block("b1"), Block("b2")]), "Serbest gövdede en fazla bir sekme bileşeni (tabs) olabilir.");
    }

    [Fact]
    public void Free_block_with_13_members_is_rejected()
    {
        var ids = Enumerable.Range(1, 13).Select(i => $"t{i}").ToArray();
        Rejected(Page(Template, [Block("b1", ids), .. ids.Select(x => Item(x))]), "Serbest gövdede bir bölüm en fazla 12 bileşen içerebilir.");
        Accepted(Page(Template, [Block("b1", ids[..12]), .. ids[..12].Select(x => Item(x))]));
    }

    [Fact]
    public void Free_children_are_rejected()
    {
        object child = new { id = "c2", type = "text", name = "c2", props = new { text = "x" } };
        var card = new { id = "c1", type = "card", name = "c1", props = new { slot = "item" }, children = new[] { child } };
        Rejected(Page(Template, [Block("b1", ["c1"]), card]),
            "Serbest gövdede iç içe bileşen (children) kullanılmaz; bileşenler bölümün üyeleri olarak eklenir.");
    }

    [Fact]
    public void Free_item_of_type_formCard_is_rejected_with_expected_list()
    {
        var form = new { id = "f1", type = "formCard", name = "f1", props = new { slot = "item", inputs = new[] { "a1" } } };
        var input = new { id = "a1", type = "input", name = "a1", props = new { slot = "item", label = "Ad" } };
        Rejected(Page(Template, [Block("b1", ["f1"]), form, input]),
            "'item' yerine 'formCard' bileşeni konamaz; bu yere yalnız 'heading, text, label, section, alert, card, list, metric, progress, badge, image, dataTable' konabilir.");
    }

    [Fact]
    public void Free_wrong_type_in_other_slots_is_rejected()
    {
        var heading = new { id = "h1", type = "heading", name = "h1", props = new { slot = "actions", text = "x" } };
        Rejected(Page(Template, [Block("b1"), heading]), "'actions' yerine 'heading' bileşeni konamaz; bu yere yalnız 'button' konabilir.");
        var text = new { id = "t1", type = "text", name = "t1", props = new { slot = "block", text = "x" } };
        Rejected(Page(Template, [text]), "'block' yerine 'text' bileşeni konamaz; bu yere yalnız 'section' konabilir.");
    }

    [Fact]
    public void Free_item_section_is_a_subheading_when_slot_is_item() =>
        Accepted(Page(Template, [Block("b1", ["s1"]), Item("s1", "section", new { title = "Alt başlık" })]));

    [Fact]
    public void Free_item_dataTable_needs_read_query()
    {
        Rejected(Page(Template, [Block("b1", ["d1"]), Table("d1", "yaz")]), "Bileşenin sorgusu sayfada tanımlı bir oku");
        Accepted(Page(Template, [Block("b1", ["d1"]), Table("d1")]));
    }

    [Fact]
    public void Free_panel_card_item_is_rejected()
    {
        Rejected(Page(Template, [Block("b1", ["c1"]), Item("c1", "card", new { variant = "panel" })]), "panel");
        Accepted(Page(Template, [Block("b1", ["c1"]), Item("c1", "card")]));
    }

    [Fact]
    public void Members_outside_free_block_is_rejected()
    {
        const string message = "'members' yalnız serbest gövdenin bölümünde kullanılabilir.";
        Rejected(Page(null, [Block("b1")]), message);
        Rejected(Page(new { name = "list" }, [Block("b1")]), message);
        // An item-slot section and a plain text cannot carry members either.
        Rejected(Page(Template, [Block("b1", ["s1"]), Item("s1", "section", new { members = new[] { "t1" } })]), message);
        Rejected(Page(Template, [Block("b1", ["t1"]), Item("t1", "text", new { members = new string[0] })]), message);
    }

    [Fact]
    public void Members_must_be_distinct_ids()
    {
        Rejected(Page(Template, [Block("b1", ["t1", "t1"]), Item("t1")]), "'members' farklı bileşen kimliklerinden oluşan bir dizi olmalıdır.");
        Rejected(Page(Template, [Block("b1", extra: new { members = "t1" })]), "'members' farklı bileşen kimliklerinden oluşan bir dizi olmalıdır.");
    }

    [Fact]
    public void Free_block_columns_must_be_1_to_3()
    {
        foreach (var columns in new[] { 1, 2, 3 }) Accepted(Page(Template, [Block("b1", extra: new { columns })]));
        foreach (var columns in new[] { 0, 4 }) Rejected(Page(Template, [Block("b1", extra: new { columns })]), "'columns' değeri 1, 2 veya 3 olmalıdır.");
        Rejected(Page(Template, [Block("b1", extra: new { columns = "iki" })]), "'columns' değeri 1, 2 veya 3 olmalıdır.");
    }

    [Fact]
    public void Section_columns_outside_free_block_unchanged()
    {
        // A legacy section with any columns value keeps being accepted; so does a free-page item section.
        object legacy = new { id = "s1", type = "section", name = "s1", props = new { title = "Bölüm", columns = 7 } };
        Accepted(Page(null, [legacy]));
        Accepted(Page(Template, [Block("b1", ["s1"]), Item("s1", "section", new { title = "Alt", columns = 7 })]));
    }

    [Theory]
    [InlineData(10)]
    [InlineData(25)]
    [InlineData(50)]
    [InlineData(100)]
    public void Free_item_table_accepts_pageSize_10_25_50_100(int pageSize) =>
        Accepted(Page(Template, [Block("b1", ["d1"]), Table("d1", extra: new { pageSize })]));

    [Fact]
    public void Free_item_table_pageSize_outside_choices_is_rejected()
    {
        Rejected(Page(Template, [Block("b1", ["d1"]), Table("d1", extra: new { pageSize = 7 })]), "Sayfa başına kayıt 10, 25, 50 ya da 100 olmalı.");
        Rejected(Page(null, [Table("d1", extra: new { pageSize = 25 })]), "'pageSize' yalnız sunucu sayfalı");
    }

    [Fact]
    public void Free_empty_tab_is_rejected()
    {
        Rejected(Page(Template, [Tabs("Genel=b1", "Boş="), Block("b1")]), "Serbest gövdede boş sekme olamaz");
        Rejected(Page(Template, [Tabs("Genel=b1,t1"), Block("b1", ["t1"]), Item("t1")]), "Serbest gövdede sekmeler yalnız bölümleri içerebilir.");
    }

    [Fact]
    public void Width_actionBar_spacer_divider_are_rejected_on_free_page()
    {
        Rejected(Page(Template, [Block("b1", ["t1"]), Item("t1", extra: new { width = 6 })]), "Kalıplı sayfada genişlik ayarı kullanılmaz.");
        var bar = new { id = "ab", type = "actionBar", name = "ab", props = new { slot = "actions" } };
        Rejected(Page(Template, [Block("b1"), bar]), "Kalıplı sayfada işlem çubuğu bileşeni kullanılmaz; düğmeler 'actions' yerine konur.");
        foreach (var type in new[] { "spacer", "divider" })
            Rejected(Page(Template, [Block("b1", ["x1"]), new { id = "x1", type, props = new { slot = "item" } }]), "Kalıplı sayfada boşluk ve ayırıcı bileşenleri kullanılmaz.");
    }

    [Fact]
    public void Component_without_free_slot_is_rejected() =>
        Rejected(Page(Template, [Block("b1"), new { id = "h1", type = "heading", name = "h1", props = new { slot = "above", text = "x" } }]),
            "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.");

    [Fact]
    public void Unknown_template_message_names_three_templates()
    {
        const string message = "Kalıp yalnız \"list\", \"record\", \"belge\" ya da \"free\" olabilir.";
        object plain = new { id = "b1", type = "section", name = "b1", props = new { slot = "block", title = "Bölüm" } };
        Rejected(Page(new { name = "card" }, [plain]), message);
        Rejected(Page(new { name = "free", level = 3 }, [plain]), message);
    }
}
