using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Navigation actions of buttons and dataTable row actions: link (Bağlantıya git), erpPage (ERP ekranı aç) and page
/// (Sayfa aç). They never write data; links must keep a literal http(s) scheme and host.
/// </summary>
public sealed class TenantCustomPageNavigationActionTests
{
    private static string V2(object[] components, object[]? queries = null) =>
        JsonSerializer.Serialize(new { schemaVersion = 2, queries = queries ?? [Liste()], components });

    private static object Liste() => new { id = "kargolar", name = "kargolar", kind = "read", sql = "SELECT 'x' AS takipNo", parameters = Array.Empty<object>(), runOn = "load" };
    private static object C(string id, string type, object props) => new { id, type, props };
    private static object N(string id, string type, string name, object props) => new { id, type, name, props };
    private static object Link(string href, object? extra = null) => C("b1", "button", Merge(new { label = "Takip", actionType = "link", href }, extra));

    private static Dictionary<string, object?> Merge(object first, object? second)
    {
        var result = JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(first))!;
        if (second is not null)
            foreach (var (key, value) in JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(second))!) result[key] = value;
        return result;
    }

    private static void AssertAccepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.NotNull(error);
        Assert.Contains(contains, error);
    }

    // ---- link ----

    [Theory]
    [InlineData("https://kargo.example.com/takip?no={{liste.seciliSatir.takipNo}}")]
    [InlineData("http://kargo.example.com:8080/takip/{{kullanici.id}}")]
    [InlineData("https://kargo.example.com")]
    [InlineData("https://kargo.example.com#{{bugun}}")]
    public void Link_with_literal_scheme_and_host_is_accepted(string href) =>
        AssertAccepted(V2([Link(href, new { target = "newTab", confirmEnabled = true, confirmText = "Kargo sitesi açılsın mı?" })]));

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("JavaScript:alert(1)")]
    [InlineData("data:text/html,x")]
    [InlineData("vbscript:msgbox(1)")]
    [InlineData("//evil.example.com/x")]
    [InlineData("ftp://files.example.com/a")]
    [InlineData("mailto:a@example.com")]
    [InlineData("/relative/path")]
    [InlineData("{{liste.seciliSatir.url}}")]
    [InlineData("https://{{liste.seciliSatir.host}}/x")]
    [InlineData("https://kargo.example.com{{liste.seciliSatir.x}}")]
    [InlineData("https://user@evil.example.com/")]
    [InlineData("https://kargo.example.com\\@evil.example.com/")]
    [InlineData("https://kargo.example.com/a b")]
    [InlineData("https:///x")]
    public void Unsafe_or_bound_scheme_or_host_link_is_rejected(string href) =>
        AssertRejected(V2([Link(href)]), "'href'");

    [Fact]
    public void Link_requires_href_and_valid_target()
    {
        AssertRejected(V2([C("b1", "button", new { label = "Git", actionType = "link" })]), "'href' gerekli");
        AssertRejected(V2([Link("https://a.example.com/", new { target = "popup" })]), "'target' newTab veya sameTab");
    }

    [Fact]
    public void Navigation_props_belong_to_their_own_action_type()
    {
        AssertRejected(V2([C("b1", "button", new { label = "Git", actionType = "query", queryId = "kargolar", href = "https://a.example.com/" })]), "'href' yalnız");
        AssertRejected(V2([C("h1", "heading", new { text = "x", href = "https://a.example.com/" })]), "'href' yalnız");
        AssertRejected(V2([C("b1", "button", new { label = "Git", actionType = "link", href = "https://a.example.com/", pageKey = "customers" })]), "'pageKey' yalnız");
        AssertRejected(V2([C("b1", "button", new { label = "Git", actionType = "link", href = "https://a.example.com/", queryId = "kargolar" })]), "'queryId'");
    }

    // ---- erpPage ----

    [Fact]
    public void ErpPage_accepts_a_standard_menu_page_key_and_bound_search_text() =>
        AssertAccepted(V2([C("b1", "button", new { label = "Cari", actionType = "erpPage", pageKey = "customers", queryText = "{{liste.seciliSatir.takipNo}}", target = "newTab" })]));

    [Fact]
    public void ErpPage_rejects_an_unknown_page_key()
    {
        AssertRejected(V2([C("b1", "button", new { label = "Cari", actionType = "erpPage", pageKey = "yok-boyle" })]), "ERP ekranı bulunamadı: yok-boyle");
        AssertRejected(V2([C("b1", "button", new { label = "Cari", actionType = "erpPage" })]), "'pageKey' gerekli");
    }

    // ---- page ----

    [Fact]
    public void Page_accepts_custom_code_or_system_screen_and_named_parameters()
    {
        AssertAccepted(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "kargo-detay", @params = new[] { "no={{liste.seciliSatir.takipNo}}", "kaynak=liste" } })]));
        AssertAccepted(V2([C("b1", "button", new { label = "Stok", actionType = "page", pageCode = "@inventory-stock", target = "newTab" })]));
    }

    [Fact]
    public void Page_rejects_bad_codes_and_parameters()
    {
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page" })]), "'pageCode' gerekli");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "kötü kod" })]), "'pageCode'");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "@yok-boyle" })]), "'pageCode'");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "p", @params = new[] { "No=1" } })]), "'params'");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "p", @params = new[] { "no=1", "no=2" } })]), "'params'");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "p", @params = new[] { "a=1", "b=1", "c=1", "d=1", "e=1", "f=1", "g=1" } })]), "'params'");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "page", pageCode = "p", @params = new[] { "no=<b>" } })]), "'params'");
        AssertRejected(V2([C("b1", "button", new { label = "Detay", actionType = "erpPage", pageKey = "customers", @params = new[] { "no=1" } })]), "'params' yalnız");
    }

    // ---- row actions, sayfa root ----

    [Fact]
    public void Navigation_buttons_can_be_row_actions()
    {
        AssertAccepted(V2([
            N("t1", "dataTable", "liste", new { query = "kargolar", rowActions = new[] { "b1", "b2", "b3", "b4" } }),
            C("b1", "button", new { label = "Takip", actionType = "link", href = "https://kargo.example.com/takip?no={{liste.seciliSatir.takipNo}}" }),
            C("b2", "button", new { label = "Cari", actionType = "erpPage", pageKey = "customers" }),
            C("b3", "button", new { label = "Detay", actionType = "page", pageCode = "kargo-detay", @params = new[] { "no={{liste.seciliSatir.takipNo}}" } }),
            C("b4", "button", new { label = "Pencere", actionType = "openDialog", dialogId = "d1" }),
            C("d1", "dialog", new { title = "Ayrıntı", contains = new[] { "h1" } }),
            C("h1", "heading", new { text = "{{sayfa.parametre.no}}" })]));
    }

    [Fact]
    public void Sayfa_is_a_reserved_root_usable_in_conditions_and_bindings()
    {
        AssertAccepted(V2([C("h1", "heading", new { text = "Takip: {{sayfa.parametre.no}}" }),
            C("b1", "button", new { label = "Takip", actionType = "link", href = "https://kargo.example.com/{{sayfa.parametre.no}}", visibleWhen = "sayfa.parametre.no != ''" })]));
        AssertRejected(V2([N("h1", "heading", "sayfa", new { text = "x" })]), "'sayfa' ayrılmış bir addır");
    }

    // ---- actionBar Yeni / Aç / after-save buttons, page title heading ----

    [Fact]
    public void Action_bar_runs_buttons_for_yeni_ac_and_after_save()
    {
        object Bar(object props) => N("bar", "actionBar", "komutlar", props);
        var buttons = new object[]
        {
            N("t1", "dataTable", "liste", new { query = "kargolar" }),
            C("yeni", "button", new { label = "Yeni", actionType = "page", pageCode = "@inventory-stock-create", target = "newTab" }),
            C("ac", "button", new { label = "Aç", actionType = "page", pageCode = "@inventory-stock-create", @params = new[] { "id={{liste.seciliSatir.takipNo}}" }, visibleWhen = "liste.seciliSatir.takipNo != null" }),
            C("geri", "button", new { label = "Listeye dön", actionType = "erpPage", pageKey = "inventory-stock" }),
            C("bos", "button", new { label = "Eylemsiz" }),
            C("d1", "dialog", new { title = "Kayıt", contains = new[] { "h1" } }),
            C("h1", "heading", new { text = "x" }),
        };
        AssertAccepted(V2([Bar(new { newButton = "yeni", openButton = "ac", afterSaveButton = "geri" }), .. buttons]));
        AssertRejected(V2([Bar(new { newButton = "yok" }), .. buttons]), "sayfada yok");
        AssertRejected(V2([Bar(new { openButton = "h1" }), .. buttons]), "bir düğme bileşeni değil");
        AssertRejected(V2([Bar(new { afterSaveButton = "bos" }), .. buttons]), "eylemi olmalıdır");
        AssertRejected(V2([Bar(new { openButton = "ac", formDialog = "d1" }), .. buttons]), "'openButton' ve 'formDialog' birlikte kullanılamaz");
        AssertRejected(V2([Bar(new { newButton = 3 }), .. buttons]), "'newButton'");
        // The button props are actionBar-only.
        AssertRejected(V2([C("b1", "button", new { label = "x", actionType = "erpPage", pageKey = "customers", newButton = "b1" })]), "'newButton' özelliği yalnızca İşlem Çubuğu");
    }

    [Fact]
    public void Page_title_is_a_heading_flag()
    {
        AssertAccepted(V2([C("h1", "heading", new { text = "Stok kartı {{sayfa.parametre.id}}", pageTitle = true, visibleWhen = "sayfa.parametre.id != ''" })]));
        AssertRejected(V2([C("h1", "heading", new { text = "x", pageTitle = "evet" })]), "'pageTitle' true veya false");
        AssertRejected(V2([C("t1", "text", new { text = "x", pageTitle = true })]), "'pageTitle' özelliği bu bileşen türünde kullanılamaz");
    }
}
