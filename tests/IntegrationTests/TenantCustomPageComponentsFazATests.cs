using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Proje 2 Faz A component props: conditions, tabs, lookup, server paging and input validation.</summary>
public sealed class TenantCustomPageComponentsFazATests
{
    private static string V2(object[]? queries = null, object[]? components = null) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = queries ?? [],
        components = components ?? []
    });

    private static object SqlQuery(string id, string name) => new { id, name, kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" };
    private static object Param(string name, string binding, string type = "text") => new { name, binding, type };
    private static object OpQuery(string id, string name, string operation, params object[] parameters) =>
        new { id, name, kind = "read", operation, parameters, runOn = "load" };

    /// <summary>
    /// A stand-in for <c>stok.bakiye.sayfa</c> (added to the production catalog by another task): int query parameters
    /// page/pageSize and the page metadata names, so these tests do not depend on that catalog entry.
    /// </summary>
    private static bool Lookup(string name, out Api.ErpOperation operation)
    {
        if (name == "stok.bakiye.sayfa" && Api.ErpOperationCatalog.TryGet("stok.kart.listele", out var list))
        {
            operation = list with
            {
                Name = name,
                Route = "/api/warehouses/balances/page",
                Parameters =
                [
                    new Api.ErpOperationParameter("warehouseId", "route", "guid", false),
                    new Api.ErpOperationParameter("q", "query", "text", false),
                    new Api.ErpOperationParameter("belowMinimumOnly", "query", "bool", false),
                    new Api.ErpOperationParameter("page", "query", "int", false),
                    new Api.ErpOperationParameter("pageSize", "query", "int", false)
                ],
                Result = list.Result with { MetaPaths = ["page", "pageSize", "totalCount", "belowMinimumCount"] }
            };
            return true;
        }
        return Api.ErpOperationCatalog.TryGet(name, out operation);
    }

    private static void AssertAccepted(string json)
    {
        Assert.True(TenantCustomPageSchema.Validate(json, out var error, null, Lookup), error);
    }

    private static void AssertRejected(string json, string? contains = null)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error, null, Lookup));
        Assert.False(string.IsNullOrWhiteSpace(error));
        if (contains is not null) Assert.Contains(contains, error);
    }

    private static object Heading(string id, object props) => new { id, type = "heading", props };
    private static object Input(string id, string name, object props) => new { id, type = "input", name, props };

    [Fact]
    public void Accepts_visibleWhen_on_any_component()
    {
        AssertAccepted(V2(components: [Heading("h1", new { text = "Yönetici", visibleWhen = "kullanici.rol == 'TenantAdmin'" })]));
        // Roots may be component or query names.
        AssertAccepted(V2([SqlQuery("q1", "veri")],
        [
            Input("i1", "ad", new { inputType = "text" }),
            new { id = "d1", type = "divider", props = new { visibleWhen = "ad.value != '' && veri.rows[0].x == 1" } }
        ]));
    }

    [Fact]
    public void Accepts_ordering_and_relative_date_conditions()
    {
        AssertAccepted(V2([SqlQuery("q1", "veri")],
        [
            Input("i1", "ad", new { inputType = "number" }),
            new { id = "d1", type = "divider", props = new { visibleWhen = "veri.rows[0].x < bugun && veri.rows[0].x >= bugun + -30" } },
            new { id = "d2", type = "divider", props = new { visibleWhen = "ad.value<=3||ad.value>9" } },
            Input("i2", "miktar", new { inputType = "number", disabledWhen = "ad.value > 0", requiredWhen = "ad.value >= 1" })
        ]));
        // < and > are operators only: inside a quoted literal they are still rejected, and markup is not a condition.
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text" }),
            Heading("h1", new { text = "x", visibleWhen = "ad.value == '<b>'" })]), "'visibleWhen'");
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text" }),
            Heading("h1", new { text = "x", visibleWhen = "<script>ad.value</script>" })]), "'visibleWhen' koşulu geçersiz: ");
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text" }),
            Heading("h1", new { text = "x", visibleWhen = "ad.value < 'javascript:x'" })]), "'visibleWhen'");
        // Every condition prop is parsed after the text check: markup outside quotes is rejected in each of them.
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text" }),
            Heading("h1", new { text = "x", widthWhen = "8=<img src=x>" })]), "'widthWhen' koşulu geçersiz: ");
        AssertAccepted(V2(components: [Input("i1", "ad", new { inputType = "number" }),
            Heading("h1", new { text = "x", widthWhen = "8=ad.value > 2" })]));
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text", requiredWhen = "<b>" })]), "'requiredWhen' koşulu geçersiz: ");
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text" }),
            new { id = "k1", type = "card", props = new { title = "Kart" }, children = new object[]
            {
                new { id = "b1", type = "button", props = new { text = "Düğme", visibleWhen = "<img src=x onerror=1>", disabledWhen = "ad.value > 1" } }
            } }]), "'visibleWhen' koşulu geçersiz: ");
    }

    [Fact]
    public void Rejects_visibleWhen_with_unknown_root()
    {
        AssertRejected(V2(components: [Heading("h1", new { text = "x", visibleWhen = "yok.value == 1" })]),
            "'visibleWhen' koşulu sayfada olmayan bir ada başvuruyor: yok");
        AssertRejected(V2(components: [Heading("h1", new { text = "x", visibleWhen = "a.value = 1" })]), "'visibleWhen' koşulu geçersiz: ");
    }

    [Fact]
    public void Rejects_disabledWhen_on_heading()
    {
        AssertRejected(V2(components: [Heading("h1", new { text = "x", disabledWhen = "kullanici.rol == 'TenantUser'" })]),
            "'disabledWhen' yalnız düğme ve giriş bileşenlerinde kullanılabilir.");
        AssertAccepted(V2(components: [new { id = "b1", type = "button", props = new { label = "Kaydet", disabledWhen = "kullanici.rol == 'TenantUser'", disabledReason = "Yetkiniz yok: {{kullanici.rol}}" } }]));
    }

    [Fact]
    public void Accepts_requiredWhen_only_on_inputs()
    {
        AssertAccepted(V2([SqlQuery("q1", "kart")], [Input("i1", "miktar", new { inputType = "number", requiredWhen = "kart.rows[0].x != null" })]));
        AssertRejected(V2(components: [Heading("h1", new { text = "x", requiredWhen = "kullanici.rol == 'TenantUser'" })]),
            "'requiredWhen' yalnız giriş bileşeninde kullanılabilir.");
        AssertRejected(V2(components: [Input("i1", "miktar", new { inputType = "number", requiredWhen = "yok.value == 1" })]),
            "'requiredWhen' koşulu sayfada olmayan bir ada başvuruyor: yok");
    }

    [Fact]
    public void Rejects_disabledReason_without_disabledWhen()
    {
        AssertRejected(V2(components: [new { id = "b1", type = "button", props = new { label = "Kaydet", disabledReason = "Yetkiniz yok" } }]),
            "'disabledReason' için 'disabledWhen' de tanımlı olmalıdır.");
        AssertRejected(V2(components: [new { id = "b1", type = "button", props = new { label = "K", disabledWhen = "bugun", disabledReason = new string('a', 201) } }]), "200");
    }

    private static object[] TabPage(object tabsProps, params object[] extra) =>
    [
        Input("i1", "ad", new { inputType = "text" }),
        new { id = "fc1", type = "formCard", props = new { inputs = new[] { "i1" } } },
        new { id = "t1", type = "dataTable", props = new { query = "q1" } },
        new { id = "tb", type = "tabs", props = tabsProps },
        .. extra
    ];

    [Fact]
    public void Accepts_tabs_owning_top_level_formCard_and_table()
    {
        AssertAccepted(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "Genel=fc1", "Hareketler=t1", "Boş=" }, defaultTab = 1 })));
    }

    [Fact]
    public void Rejects_tab_owning_child_of_section()
    {
        var section = new { id = "s1", type = "section", children = new object[] { Heading("h2", new { text = "iç" }) } };
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "Genel=h2" } }, section)),
            "Sekmeler yalnız üst düzey bileşenleri içerebilir: h2");
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "Genel=yok1" } })), "Sekmenin bileşeni sayfada yok: yok1");
        // An input owned by a formCard cannot also be placed in a tab.
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "Genel=i1" } })), "'i1' birden fazla sekmede veya yerleşimde kullanılamaz.");
    }

    [Fact]
    public void Rejects_component_in_two_tabs()
    {
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "A=t1", "B=fc1,t1" } })),
            "'t1' birden fazla sekmede veya yerleşimde kullanılamaz.");
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "A=t1" } },
            new { id = "tb2", type = "tabs", props = new { tabs = new[] { "C=t1" } } })), "'t1' birden fazla sekmede veya yerleşimde kullanılamaz.");
    }

    [Fact]
    public void Rejects_tabs_owning_actionBar()
    {
        var actionBar = new { id = "ab", type = "actionBar", props = new { printEnabled = true } };
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "A=ab" } }, actionBar)), "ab");
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "A=tb" } })), "tb");
        AssertRejected(V2(components: [new { id = "tb", type = "tabs" }]), "props gerekli");
        AssertRejected(V2(components: [new { id = "tb", type = "tabs", props = new { tabs = new[] { "A=x=y" } } }]),
            "'tabs' 1–8 adet Etiket=kimlik,kimlik öğesi içermelidir.");
        AssertRejected(V2(components: [new { id = "tb", type = "tabs", props = new { tabs = Enumerable.Range(0, 9).Select(i => $"S{i}=").ToArray() } }]),
            "'tabs' 1–8 adet Etiket=kimlik,kimlik öğesi içermelidir.");
    }

    [Fact]
    public void Rejects_defaultTab_out_of_range()
    {
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "A=t1", "B=fc1" }, defaultTab = 2 })),
            "'defaultTab' sekme sırası (0'dan başlar) olmalıdır.");
        AssertRejected(V2([SqlQuery("q1", "veri")], TabPage(new { tabs = new[] { "A=t1" }, defaultTab = -1 })), "'defaultTab'");
    }

    [Fact]
    public void Accepts_lookup_with_static_options_only()
    {
        AssertAccepted(V2(components: [Input("i1", "yon", new { inputType = "lookup", staticOptions = new[] { "Receipt=Giriş", "=Hepsi" }, minChars = 0, allowClear = true })]));
        AssertAccepted(V2([SqlQuery("q1", "kartlar")], [Input("i1", "kart", new
        {
            inputType = "lookup", optionsQuery = "q1", optionLabelColumn = "name", optionValueColumn = "id", optionDescriptionColumn = "code", minChars = 2
        })]));
        AssertRejected(V2(components: [Input("i1", "yon", new { inputType = "lookup", staticOptions = new[] { "Receipt" } })]),
            "'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır.");
    }

    [Fact]
    public void Rejects_lookup_without_options()
    {
        AssertRejected(V2(components: [Input("i1", "kart", new { inputType = "lookup" })]), "Arama kutusu için seçenek sorgusu veya sabit seçenek gerekli.");
    }

    [Fact]
    public void Rejects_minChars_on_text_input()
    {
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text", minChars = 2 })]), "minChars");
        AssertRejected(V2(components: [Input("i1", "kart", new { inputType = "lookup", staticOptions = new[] { "a=A" }, minChars = 6 })]), "minChars");
    }

    private static object BalanceQuery(string pageBinding = "{{liste.sayfa}}", string sizeBinding = "{{liste.sayfaBoyutu}}") =>
        OpQuery("bakiye", "bakiyeler", "stok.bakiye.sayfa",
            Param("q", "{{ara.value}}"), Param("page", pageBinding, "int"), Param("pageSize", sizeBinding, "int"));

    private static object PagedTable(object props, string name = "liste") => new { id = "t1", type = "dataTable", name, props };
    private static readonly object SearchBox = Input("araInput", "ara", new { inputType = "text" });

    [Fact]
    public void Accepts_server_paged_table_on_balance_page()
    {
        AssertAccepted(V2([BalanceQuery()],
        [
            SearchBox,
            PagedTable(new { query = "bakiye", paging = "server", pageSize = 50, searchInput = "araInput", footerMeta = new[] { "belowMinimumCount=Minimum altı" } }),
            new { id = "m1", type = "metric", props = new { query = "bakiye", value = "{{bakiyeler.meta.totalCount}}" } }
        ]));
    }

    [Fact]
    public void Rejects_paged_table_with_wrong_page_binding()
    {
        AssertRejected(V2([BalanceQuery(pageBinding: "{{ara.value}}")], [SearchBox, PagedTable(new { query = "bakiye", paging = "server" })]),
            "'liste' listesinin 'page' parametresi {{liste.sayfa}} ile bağlanmalıdır.");
        AssertRejected(V2([BalanceQuery(sizeBinding: "{{liste.sayfa}}")], [SearchBox, PagedTable(new { query = "bakiye", paging = "server" })]),
            "'liste' listesinin 'pageSize' parametresi {{liste.sayfaBoyutu}} ile bağlanmalıdır.");
        // A custom page parameter name the operation does not declare.
        AssertRejected(V2([BalanceQuery()], [SearchBox, PagedTable(new { query = "bakiye", paging = "server", pageParam = "sayfaNo" })]), "sayfaNo");
        // An unnamed paged table.
        AssertRejected(V2([BalanceQuery()], [SearchBox, new { id = "t1", type = "dataTable", props = new { query = "bakiye", paging = "server" } }]),
            "Sunucu sayfalı liste adlı ve ERP işlemine bağlı olmalıdır: t1");
    }

    [Fact]
    public void Rejects_paged_table_on_manual_query()
    {
        var manual = new
        {
            id = "bakiye", name = "bakiyeler", kind = "read", operation = "stok.bakiye.sayfa", runOn = "manual",
            parameters = new[] { Param("q", "{{ara.value}}"), Param("page", "{{liste.sayfa}}", "int"), Param("pageSize", "{{liste.sayfaBoyutu}}", "int") }
        };
        AssertRejected(V2([manual], [SearchBox, PagedTable(new { query = "bakiye", paging = "server" })]),
            "Sayfalı listenin sorgusu sayfa açılınca çalışmalı (runOn: load).");
    }

    [Fact]
    public void Rejects_paged_table_on_sql_query()
    {
        AssertRejected(V2([SqlQuery("q1", "veri")], [PagedTable(new { query = "q1", paging = "server" })]),
            "Sunucu sayfalı liste adlı ve ERP işlemine bağlı olmalıdır: t1");
    }

    [Fact]
    public void Rejects_footerMeta_key_not_in_metaPaths()
    {
        AssertRejected(V2([BalanceQuery()], [SearchBox, PagedTable(new { query = "bakiye", paging = "server", footerMeta = new[] { "foo=Bar" } })]),
            "'footerMeta' anahtarı işlemin üst bilgileri arasında yok: foo");
    }

    [Fact]
    public void Rejects_paging_props_without_server_paging()
    {
        foreach (var (key, value) in new (string, object)[] { ("pageParam", "page"), ("pageSizeParam", "pageSize"), ("pageSize", 25), ("searchInput", "araInput"), ("footerMeta", new[] { "page=Sayfa" }) })
        {
            var props = new Dictionary<string, object> { ["query"] = "q1", [key] = value };
            AssertRejected(V2([SqlQuery("q1", "veri")], [SearchBox, new { id = "t1", type = "dataTable", name = "liste", props }]),
                $"'{key}' yalnız sunucu sayfalı (paging: server) veri listesinde kullanılabilir.");
        }
        AssertRejected(V2([SqlQuery("q1", "veri")], [new { id = "t1", type = "dataTable", props = new { query = "q1", paging = "client" } }]), "paging");
        AssertRejected(V2([BalanceQuery()], [SearchBox, PagedTable(new { query = "bakiye", paging = "server", pageSize = 101 })]), "pageSize");
        // searchInput must be a text input no layout owns.
        AssertRejected(V2([BalanceQuery()],
        [
            SearchBox, new { id = "fc1", type = "formCard", props = new { inputs = new[] { "araInput" } } },
            PagedTable(new { query = "bakiye", paging = "server", searchInput = "araInput" })
        ]), "'araInput' birden fazla sekmede veya yerleşimde kullanılamaz.");
    }

    [Fact]
    public void Accepts_validation_props_on_number_and_text_inputs()
    {
        AssertAccepted(V2(components:
        [
            Input("i1", "miktar", new { inputType = "number", required = true, min = 0, max = 1000.5, step = 0.5 }),
            Input("i2", "kod", new { inputType = "text", required = false, upperCase = true, maxLength = 30, pattern = "^[A-Z0-9-]+$", patternMessage = "Yalnız büyük harf, rakam ve tire." }),
            Input("i3", "tarih", new { inputType = "date", min = "2026-01-01", max = "2026-12-31" }),
            Input("i4", "serbest", new { required = true, maxLength = 10 })
        ]));
    }

    [Fact]
    public void Rejects_maxLength_on_number_input()
    {
        AssertRejected(V2(components: [Input("i1", "miktar", new { inputType = "number", maxLength = 5 })]), "maxLength");
        AssertRejected(V2(components: [Input("i1", "miktar", new { inputType = "number", upperCase = true })]), "upperCase");
        AssertRejected(V2(components: [Input("i1", "ad", new { inputType = "text", min = 1 })]), "'min' yalnız sayı veya tarih girişinde kullanılabilir.");
        AssertRejected(V2(components: [Input("i1", "t", new { inputType = "date", max = "31.12.2026" })]), "max");
        AssertRejected(V2(components: [Input("i1", "m", new { inputType = "number", step = 0 })]), "step");
        AssertRejected(V2(components: [Input("i1", "m", new { inputType = "text", patternMessage = "x" })]), "patternMessage");
        AssertRejected(V2(components: [Input("i1", "m", new { inputType = "text", required = "evet" })]), "required");
    }

    [Fact]
    public void Rejects_invalid_pattern()
    {
        AssertRejected(V2(components: [Input("i1", "kod", new { inputType = "text", pattern = "(" })]), "'pattern' geçerli bir düzenli ifade değil.");
    }

    [Theory]
    [InlineData("(?i)abc")]
    [InlineData("(?m:^a)")]
    [InlineData("(?-i)a")]
    [InlineData(@"\Aabc")]
    [InlineData(@"abc\Z")]
    [InlineData(@"abc\z")]
    [InlineData(@"x\\\z")]
    public void Rejects_pattern_constructs_ecmascript_lacks(string pattern)
    {
        AssertRejected(V2(components: [Input("i1", "kod", new { inputType = "text", pattern })]), "Desen tarayıcıda desteklenmeyen bir yapı içeriyor.");
    }

    [Theory]
    [InlineData(@"[A-Z]{3}\d+")]
    [InlineData(@"(?:ab)+")]
    [InlineData(@"a\\z")]
    [InlineData(@"(?=a)a")]
    public void Accepts_pattern_shared_by_dotnet_and_ecmascript(string pattern)
    {
        AssertAccepted(V2(components: [Input("i1", "kod", new { inputType = "text", pattern })]));
    }

    [Fact]
    public void Rejects_min_greater_than_max()
    {
        AssertRejected(V2(components: [Input("i1", "miktar", new { inputType = "number", min = 10, max = 5 })]), "min");
        AssertRejected(V2(components: [Input("i1", "tarih", new { inputType = "date", min = "2026-12-31", max = "2026-01-01" })]), "min");
    }

    [Fact]
    public void Accepts_40_props_in_v2()
    {
        // No component type has 40 meaningful props today, so the cap is checked in two parts: a paged table with 37
        // valid props (more than the v1 limit of 30) is accepted, and 40 props pass the count gate while 41 do not.
        var props = new Dictionary<string, object>
        {
            ["title"] = "t", ["text"] = "t", ["label"] = "t", ["value"] = "t", ["description"] = "t", ["variant"] = "info", ["size"] = "m",
            ["icon"] = "box", ["source"] = "s", ["columns"] = new[] { "a" }, ["format"] = "f", ["target"] = "x", ["required"] = false,
            ["placeholder"] = "p", ["formCode"] = "f", ["width"] = 6, ["margin"] = 0, ["padding"] = 0, ["backgroundColor"] = "#ffffff",
            ["textColor"] = "#000000", ["borderRadius"] = 4, ["rowActionsEnabled"] = false, ["rowActionWorkflowId"] = "", ["rowActionLabel"] = "Aç",
            ["query"] = "bakiye", ["defaultValue"] = "d", ["toneMap"] = new[] { "A=info" }, ["density"] = "dense", ["columnFormats"] = new[] { "a=text" },
            ["totals"] = new[] { "a" }, ["visibleWhen"] = "kullanici.rol", ["paging"] = "server", ["pageParam"] = "page", ["pageSizeParam"] = "pageSize",
            ["pageSize"] = 25, ["searchInput"] = "araInput", ["footerMeta"] = new[] { "totalCount=Toplam" }
        };
        Assert.Equal(37, props.Count);
        AssertAccepted(V2([BalanceQuery()], [SearchBox, PagedTable(props)]));

        for (var i = props.Count; i < 40; i++) props[$"x{i}"] = "y";
        Assert.False(TenantCustomPageSchema.Validate(V2([BalanceQuery()], [SearchBox, PagedTable(props)]), out var error, null, Lookup));
        Assert.DoesNotContain("en fazla 40", error);
        props["x40"] = "y";
        AssertRejected(V2([BalanceQuery()], [SearchBox, PagedTable(props)]), "en fazla 40");
    }

    [Fact]
    public void Accepts_30_queries_in_v2()
    {
        AssertAccepted(V2(Enumerable.Range(1, 30).Select(i => SqlQuery($"q{i}", $"n{i}")).ToArray()));
    }

    [Fact]
    public void Rejects_31_queries_in_v2()
    {
        AssertRejected(V2(Enumerable.Range(1, 31).Select(i => SqlQuery($"q{i}", $"n{i}")).ToArray()), "en fazla 30 sorgu");
    }

    [Fact]
    public void Keeps_30_props_limit_in_v1()
    {
        var v1Props = new Dictionary<string, object>
        {
            ["title"] = "t", ["text"] = "t", ["label"] = "t", ["value"] = "t", ["description"] = "t", ["variant"] = "info", ["size"] = "m",
            ["icon"] = "box", ["source"] = "s", ["format"] = "f", ["target"] = "x", ["required"] = false, ["placeholder"] = "p", ["formCode"] = "f",
            ["width"] = 6, ["margin"] = 0, ["padding"] = 0, ["backgroundColor"] = "#ffffff", ["textColor"] = "#000000", ["borderRadius"] = 4,
            ["rowActionsEnabled"] = false, ["rowActionWorkflowId"] = "", ["rowActionLabel"] = "Aç", ["columns"] = new[] { "a" }
        };
        string V1(object props) => JsonSerializer.Serialize(new { schemaVersion = 1, components = new[] { new { id = "t1", type = "dataTable", props } } });
        Assert.True(TenantCustomPageSchema.Validate(V1(v1Props), out var error), error);
        // v1 only knows 29 prop names, so 31 props always fail; the v2-only names stay unknown in v1.
        for (var i = 0; i < 7; i++) v1Props[$"x{i}"] = "y";
        Assert.Equal(31, v1Props.Count);
        Assert.False(TenantCustomPageSchema.Validate(V1(v1Props), out error));
        Assert.Equal("Bileşen özellikleri izin verilen statik alanlarla sınırlıdır.", error);
        Assert.False(TenantCustomPageSchema.Validate(V1(new { visibleWhen = "kullanici.rol" }), out _));
    }
}
