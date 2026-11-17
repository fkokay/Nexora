using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantCustomPageSchemaV2Tests
{
    private static string V2(object[]? queries = null, object[]? components = null) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = queries ?? [],
        components = components ?? []
    });

    private static object Query(string id, string name, string sql, params object[] parameters) =>
        new { id, name, kind = "read", sql, parameters, runOn = "load" };

    private static object Param(string name, string binding, string type = "text") => new { name, binding, type };

    private static void AssertRejected(string json, string? contains = null)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.False(string.IsNullOrWhiteSpace(error));
        if (contains is not null) Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_v1_definition_unchanged()
    {
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            components = new object[] { new { id = "h1", type = "heading", props = new { title = "Başlık" } } }
        });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        Assert.Empty(TenantCustomPageQueries.ReadQueries(json));
        Assert.False(TenantCustomPageQueries.HasQueries(json));
    }

    [Fact]
    public void Accepts_v2_with_query_label_input_and_bindings()
    {
        var json = V2(
            [
                Query("q1", "musteriler", "SELECT Code, Name FROM CustomerAccounts WHERE Code = @code", Param("code", "{{arama.value}}")),
                Query("q2", "detay", "SELECT Name FROM CustomerAccounts WHERE Code = @kod", Param("kod", "{{ musteriler.rows[0].Code }}"))
            ],
            [
                new { id = "c1", type = "input", name = "arama", props = new { inputType = "text", placeholder = "Kod ara", defaultValue = "{{bugun}}", label = "Arama" } },
                new { id = "c2", type = "label", name = "baslik", props = new { text = "Merhaba {{kullanici.ad}}, ilk kayıt: {{musteriler.rows[0].Name}}" } },
                new { id = "c3", type = "dataTable", name = "izgara", props = new { query = "q1", title = "Müşteriler" } },
                new { id = "c4", type = "metric", props = new { query = "q2", value = "{{detay.rows[0].Name}}" } },
                new { id = "c5", type = "input", name = "secim", props = new { inputType = "select", optionsQuery = "q1", optionLabelColumn = "Name", optionValueColumn = "Code" } }
            ]);

        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        var queries = TenantCustomPageQueries.ReadQueries(json);
        Assert.Equal(["q1", "q2"], queries.Select(x => x.Id));
        Assert.Equal("{{ musteriler.rows[0].Code }}", queries[1].Parameters[0].Binding);
        Assert.Equal("load", queries[0].RunOn);
        Assert.True(TenantCustomPageQueries.HasQueries(json));
    }

    [Fact]
    public void Rejects_bindings_in_v1()
    {
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            components = new object[] { new { id = "t1", type = "text", props = new { text = "{{kullanici.ad}}" } } }
        });
        AssertRejected(json);
        // v1 does not know v2-only structure either.
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, queries = Array.Empty<object>(), components = Array.Empty<object>() }));
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { new { id = "l1", type = "label" } } }));
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { new { id = "h1", type = "heading", name = "x" } } }));
    }

    [Fact]
    public void Rejects_binding_in_non_bindable_prop()
    {
        AssertRejected(V2(components: [new { id = "t1", type = "dataTable", props = new { source = "{{q1.rows}}" } }]));
        AssertRejected(V2(components: [new { id = "t1", type = "heading", props = new { title = "Kırık {{ bağlama" } }]));
        AssertRejected(V2(components: [new { id = "t1", type = "heading", props = new { title = "{{1abc}}" } }]));
    }

    [Fact]
    public void Rejects_non_select_or_invalid_sql()
    {
        AssertRejected(V2([Query("q1", "silme", "DELETE FROM X")]), "SELECT");
        AssertRejected(V2([Query("q1", "yorum", "SELECT 1 -- x")]));
        AssertRejected(V2([Query("q1", "kume", "SELECT '{{x}}' AS a")]));
    }

    [Fact]
    public void Rejects_undeclared_or_unused_sql_parameters()
    {
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x WHERE 1 = @eksik")]), "@eksik");
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x", Param("fazla", "{{bugun}}"))]), "fazla");
        Assert.True(TenantCustomPageSchema.Validate(V2([Query("q1", "a", "SELECT 1 AS x WHERE @Ad = 'y'", Param("ad", "{{bugun}}"))]), out var error), error);
    }

    [Fact]
    public void Rejects_duplicate_or_reserved_names()
    {
        AssertRejected(V2([Query("q1", "kullanici", "SELECT 1 AS x")]), "kullanici");
        AssertRejected(V2([Query("q1", "Bugun", "SELECT 1 AS x")]));
        AssertRejected(V2([Query("q1", "sayilar", "SELECT 1 AS x")]), "sayilar");
        AssertRejected(V2(components: [new { id = "c1", type = "input", name = "Sayilar", props = new { inputType = "text" } }]));
        AssertRejected(V2([Query("q1", "Liste", "SELECT 1 AS x")], [new { id = "c1", type = "dataTable", name = "liste" }]));
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x"), Query("q1", "b", "SELECT 1 AS x")]));
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x WHERE @p = @P", Param("p", "{{bugun}}"), Param("P", "{{bugun}}"))]));
        AssertRejected(V2([Query("q 1", "a", "SELECT 1 AS x")]));
    }

    [Theory]
    [InlineData("__proto__")]
    [InlineData("__PROTO__")]
    [InlineData("constructor")]
    [InlineData("Constructor")]
    [InlineData("prototype")]
    [InlineData("PROTOTYPE")]
    public void Rejects_javascript_object_key_names_for_queries_components_and_parameters(string name)
    {
        AssertRejected(V2([Query("q1", name, "SELECT 1 AS x")]), "ayrılmış");
        AssertRejected(V2(components: [new { id = "c1", type = "input", name, props = new { inputType = "text" } }]), "ayrılmış");
        AssertRejected(V2([Query("q1", "a", $"SELECT 1 AS x WHERE @{name} = 1", Param(name, "{{bugun}}", "int"))]), "ayrılmış");
        Assert.False(TenantCustomPageQueries.IsValidName(name));
        Assert.True(TenantCustomPageQueries.IsValidName(name + "_x"));
    }

    [Fact]
    public void Rejects_cyclic_query_dependencies()
    {
        var json = V2(
        [
            Query("q1", "a", "SELECT 1 AS x WHERE 1 = @p", Param("p", "{{b.rows[0].x}}", "int")),
            Query("q2", "b", "SELECT 1 AS x WHERE 1 = @p", Param("p", "{{a.rows[0].x}}", "int"))
        ]);
        AssertRejected(json, "a → b → a");
        AssertRejected(V2([Query("q1", "kendi", "SELECT 1 AS x WHERE 1 = @p", Param("p", "{{kendi.rows[0].x}}", "int"))]), "kendi → kendi");
    }

    [Fact]
    public void Rejects_unknown_query_reference_in_dataTable_query_prop()
    {
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x")], [new { id = "c1", type = "dataTable", props = new { query = "yok" } }]), "yok");
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x")], [new { id = "c1", type = "input", props = new { inputType = "select", optionsQuery = "yok" } }]));
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x")], [new { id = "c1", type = "heading", props = new { query = "q1" } }]));
        AssertRejected(V2(components: [new { id = "c1", type = "input", props = new { inputType = "radio" } }]));
    }

    private static object WriteQuery(string id, string name, string kind, string sql, string runOn = "manual", params object[] parameters) =>
        new { id, name, kind, sql, parameters, runOn };

    private static object Button(string id, object props) => new { id, type = "button", props };

    [Fact]
    public void Accepts_write_query_kinds_with_manual_trigger()
    {
        var json = V2(
        [
            WriteQuery("ekle", "notEkle", "insert", "INSERT INTO Notlar (Metin) VALUES (@metin)", "manual", Param("metin", "{{notGirdi.value}}")),
            WriteQuery("guncelle", "notGuncelle", "update", "UPDATE Notlar SET Metin = @metin WHERE Id = @id", "manual",
                Param("metin", "{{notGirdi.value}}"), Param("id", "{{bugun}}", "int")),
            WriteQuery("sil", "notSil", "delete", "DELETE FROM Notlar WHERE Id = @id", "manual", Param("id", "{{bugun}}", "int"))
        ],
        [new { id = "c1", type = "input", name = "notGirdi", props = new { inputType = "text" } }]);

        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        Assert.Equal(["insert", "update", "delete"], TenantCustomPageQueries.ReadQueries(json).Select(x => x.Kind));
    }

    [Fact]
    public void Rejects_write_query_with_runOn_load()
    {
        AssertRejected(V2([WriteQuery("q1", "ekle", "insert", "INSERT INTO Notlar (Metin) VALUES ('x')", "load")]), "manual");
        AssertRejected(V2([WriteQuery("q1", "sil", "delete", "DELETE FROM Notlar", "load")]), "manual");
        // Kind and SQL must agree, and unknown kinds stay rejected.
        AssertRejected(V2([WriteQuery("q1", "sil", "update", "DELETE FROM Notlar")]), "UPDATE");
        AssertRejected(V2([WriteQuery("q1", "sil", "merge", "DELETE FROM Notlar")]));
        AssertRejected(V2([WriteQuery("q1", "oku", "read", "UPDATE Notlar SET Metin = 'x'", "manual")]), "SELECT");
        AssertRejected(V2([WriteQuery("q1", "sil", "delete", "DELETE FROM Notlar; DROP TABLE Notlar")]));
    }

    [Fact]
    public void Accepts_button_query_action_and_rejects_unknown_query_or_write_refresh_target()
    {
        object[] queries =
        [
            Query("liste", "notlar", "SELECT Id, Metin FROM Notlar"),
            WriteQuery("sil", "notSil", "delete", "DELETE FROM Notlar WHERE Id = @id", "manual", Param("id", "{{notlar.rows[0].Id}}", "int"))
        ];
        var json = V2(queries,
        [
            Button("b1", new
            {
                label = "Sil", actionType = "query", queryId = "sil", confirmEnabled = true, confirmText = "{{notlar.rows[0].Metin}} silinsin mi?",
                refreshQueries = new[] { "liste" }, successMessage = "Silindi", errorMessage = "Silinemedi: {{kullanici.ad}}"
            }),
            Button("b2", new { label = "Yenile", actionType = "query", queryId = "liste" }),
            Button("b3", new { label = "Akış", actionType = "workflow", workflowId = "" }),
            new { id = "t1", type = "dataTable", props = new { query = "liste" } }
        ]);
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "yok" })]), "yok");
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query" })]), "queryId");
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", refreshQueries = new[] { "sil" } })]), "okuma");
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", refreshQueries = new[] { "yok" } })]));
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", refreshQueries = Enumerable.Repeat("liste", 11).ToArray() })]));
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", confirmEnabled = "evet" })]));
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", confirmText = new string('a', 301) })]), "300");
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", successMessage = new string('a', 201) })]), "200");
        AssertRejected(V2(queries, [Button("b1", new { actionType = "query", queryId = "sil", errorMessage = "<b>x</b>" })]));
        AssertRejected(V2(queries, [Button("b1", new { actionType = "script" })]));
        // Query action props belong to buttons only, and grids/inputs cannot read from a write query.
        AssertRejected(V2(queries, [new { id = "t1", type = "dataTable", props = new { queryId = "sil" } }]));
        AssertRejected(V2(queries, [new { id = "t1", type = "dataTable", props = new { query = "sil" } }]));
        AssertRejected(V2(queries, [new { id = "i1", type = "input", props = new { inputType = "select", optionsQuery = "sil" } }]));
        // v1 has no queries, so its buttons still only run workflows.
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { Button("b1", new { actionType = "query" }) } }));
    }

    [Fact]
    public void SqlParameterNames_ignores_strings_brackets_and_system_variables()
    {
        var names = TenantCustomPageQueries.SqlParameterNames(
            "SELECT @a AS [x@y], '@b' AS c, \"@q\" AS d, @@ROWCOUNT AS e, N'it''s @c' AS f FROM T WHERE x = @A OR y = @d_2");
        Assert.Equal(["a", "d_2"], names.Order(StringComparer.Ordinal));
        Assert.Contains("A", names);
        Assert.True(TenantCustomPageQueries.TryParseBindingPath("{{q1.rows[0].Id}}", out var root));
        Assert.Equal("q1", root);
        Assert.False(TenantCustomPageQueries.TryParseBindingPath("{{q1.rows[0].Id}} x", out _));
        Assert.False(TenantCustomPageQueries.TryParseBindingPath("q1.rows", out _));
    }

    [Fact]
    public void Enforces_128KiB_for_v2_and_64KiB_for_v1()
    {
        string Padded(int version, int targetBytes)
        {
            var components = new List<object>();
            var text = new string('a', 1900);
            for (var i = 0; i < 70 && components.Count * 3850 < targetBytes; i++)
                components.Add(new { id = $"t{i}", type = "text", props = new { text, description = text } });
            return version == 1
                ? JsonSerializer.Serialize(new { schemaVersion = 1, components })
                : JsonSerializer.Serialize(new { schemaVersion = 2, queries = Array.Empty<object>(), components });
        }

        var v1Large = Padded(1, 100 * 1024);
        Assert.InRange(System.Text.Encoding.UTF8.GetByteCount(v1Large), 64 * 1024 + 1, 128 * 1024);
        AssertRejected(v1Large, "64 KiB");

        var v2Large = Padded(2, 100 * 1024);
        Assert.True(TenantCustomPageSchema.Validate(v2Large, out var error), error);

        var v2TooLarge = V2(components: [new { id = "t1", type = "text", props = new { text = new string('a', 130 * 1024) } }]);
        AssertRejected(v2TooLarge, "128 KiB");
    }

    private static object[] Q1 => [Query("q1", "liste", "SELECT 1 AS x")];

    private static string Page(params object[] components) => V2(Q1, components);

    [Fact]
    public void Accepts_design_language_props()
    {
        var json = Page(
            new { id = "m1", type = "metric", props = new { query = "q1", variant = "danger", icon = "alert", trendQuery = "q1", filterInput = "in1", filterValue = "kritik" } },
            new { id = "in1", type = "input", name = "durum" },
            new { id = "b1", type = "badge", props = new { toneMap = new[] { "Aktif=success" } } },
            new { id = "t1", type = "dataTable", props = new { query = "q1", density = "dense", columnFormats = new[] { "Tutar=money", "Durum=status" }, toneMap = new[] { "Pasif=danger" }, totals = new[] { "Tutar" } } });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    [Fact]
    public void Filter_input_may_be_declared_after_metric_or_nested()
    {
        var after = Page(
            new { id = "m1", type = "metric", props = new { query = "q1", filterInput = "in1" } },
            new { id = "in1", type = "input", name = "durum" });
        Assert.True(TenantCustomPageSchema.Validate(after, out var error), error);
        var nested = Page(
            new { id = "m1", type = "metric", props = new { query = "q1", filterInput = "in1", filterValue = "x" } },
            new { id = "c1", type = "card", children = new object[] { new { id = "in1", type = "input", name = "durum" } } });
        Assert.True(TenantCustomPageSchema.Validate(nested, out error), error);
    }

    [Fact]
    public void Rejects_invalid_design_language_props()
    {
        object Metric(object props) => new { id = "m1", type = "metric", props };
        object Table(object props) => new { id = "t1", type = "dataTable", props };
        object Badge(object props) => new { id = "b1", type = "badge", props };
        var tones21 = Enumerable.Range(0, 21).Select(i => $"K{i}=info").ToArray();
        var totals13 = Enumerable.Range(0, 13).Select(i => $"C{i}").ToArray();

        AssertRejected(Page(Metric(new { query = "q1", variant = "mor" })), "görünüm türü");
        AssertRejected(Page(Metric(new { query = "q1", icon = "rocket" })), "icon");
        AssertRejected(Page(Metric(new { query = "q1", trendQuery = "yok" })), "trendQuery");
        AssertRejected(Page(Metric(new { query = "q1", filterInput = "yok" })), "giriş");
        AssertRejected(Page(new { id = "h1", type = "heading" }, Metric(new { query = "q1", filterInput = "h1" })), "giriş");
        AssertRejected(Page(Metric(new { query = "q1", filterValue = "x" })), "filterValue");
        AssertRejected(Page(Badge(new { toneMap = new[] { "Aktif=mor" } })), "toneMap");
        AssertRejected(Page(Table(new { query = "q1", toneMap = tones21 })), "toneMap");
        AssertRejected(Page(Table(new { query = "q1", columnFormats = new[] { "Tutar=para" } })), "columnFormats");
        AssertRejected(Page(Table(new { query = "q1", density = "tight" })), "density");
        AssertRejected(Page(Table(new { source = "customers", totals = new[] { "Tutar" } })), "totals");
        AssertRejected(Page(Table(new { query = "q1", totals = totals13 })), "totals");
        AssertRejected(Page(new { id = "h1", type = "heading", props = new { toneMap = new[] { "A=info" } } }), "toneMap");
        AssertRejected(Page(Metric(new { query = "q1", filterInput = "in1", filterValue = new string('a', 201) }), new { id = "in1", type = "input", name = "d" }), "filterValue");
    }

    [Fact]
    public void Metric_variant_stays_unvalidated_in_v1()
    {
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            components = new object[] { new { id = "m1", type = "metric", props = new { variant = "mor" } } }
        });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    private static object In(string id, string type = "text", string? optionsQuery = null) =>
        optionsQuery is null
            ? new { id, type = "input", name = id + "n", props = (object)new { inputType = type } }
            : new { id, type = "input", name = id + "n", props = (object)new { inputType = type, optionsQuery } };

    [Fact]
    public void Accepts_layout_components()
    {
        var json = Page(
            new { id = "fc1", type = "formCard", props = new { title = "Filtre", inputs = new[] { "in1", "in2" }, columns = 3 } },
            In("in1"), In("in2", "select", "q1"),
            new { id = "cp1", type = "contextPanel", props = new { title = "Detay", table = "t1", fields = new[] { "Tutar=Toplam", "Durum=Durum" }, relatedQuery = "q1", relatedTitle = "İlgili" } },
            new { id = "chips", type = "filterChips", props = new { inputs = new[] { "in1", "in3" } } },
            new { id = "fp1", type = "facetPanel", props = new { title = "Yan", inputs = new[] { "in4" }, facetCounts = new[] { "in4=Adet" } } },
            new { id = "t1", type = "dataTable", name = "tablo", props = new { query = "q1" } },
            new { id = "c1", type = "card", children = new object[] { In("in3"), In("in4", "select", "q1") } });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        Assert.True(TenantCustomPageSchema.Validate(Page(new { id = "fc1", type = "formCard", props = new { inputs = new[] { "in1" } } }, In("in1")), out error), error);
    }

    [Fact]
    public void Rejects_invalid_layout_components()
    {
        object Fc(object props, string id = "fc1") => new { id, type = "formCard", props };
        object Cp(object props) => new { id = "cp1", type = "contextPanel", props };
        object Fp(object props, string id = "fp1") => new { id, type = "facetPanel", props };
        var tbl = new { id = "t1", type = "dataTable", name = "tablo", props = new { query = "q1" } };
        var ids13 = Enumerable.Range(0, 13).Select(i => $"i{i}").ToArray();
        var fields13 = Enumerable.Range(0, 13).Select(i => $"C{i}=E{i}").ToArray();

        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { new { id = "f1", type = "formCard" } } }), "İzin verilmeyen bileşen türü");
        AssertRejected(Page(Fc(new { inputs = Array.Empty<string>() })), "inputs");
        AssertRejected(Page(Fc(new { inputs = ids13 })), "inputs");
        AssertRejected(Page(Fc(new { inputs = new object[] { 5 } })), "inputs");
        AssertRejected(Page(Fc(new { inputs = new[] { "yok" } })), "sayfada yok");
        AssertRejected(Page(new { id = "h1", type = "heading" }, Fc(new { inputs = new[] { "h1" } })), "giriş bileşeni değil");
        AssertRejected(Page(In("in1"), Fc(new { inputs = new[] { "in1" } }), Fc(new { inputs = new[] { "in1" } }, "fc2")), "birden fazla");
        AssertRejected(Page(In("in1", "select", "q1"), Fc(new { inputs = new[] { "in1" } }), Fp(new { inputs = new[] { "in1" } })), "birden fazla");
        AssertRejected(Page(In("in1"), Fc(new { inputs = new[] { "in1" }, columns = 4 })), "columns");
        AssertRejected(Page(In("in1"), tbl, Cp(new { table = "t1", fields = new[] { "Tutar" } })), "fields");
        AssertRejected(Page(tbl, Cp(new { table = "t1", fields = fields13 })), "fields");
        AssertRejected(Page(new { id = "t1", type = "dataTable", props = new { query = "q1" } }, Cp(new { table = "t1", fields = new[] { "A=B" } })), "table");
        AssertRejected(Page(new { id = "t1", type = "dataTable", name = "tablo", props = new { source = "customers" } }, Cp(new { table = "t1", fields = new[] { "A=B" } })), "table");
        AssertRejected(Page(Cp(new { table = "yok", fields = new[] { "A=B" } })), "table");
        var queries = new object[] { Query("q1", "liste", "SELECT 1 AS x"), new { id = "w1", name = "ekle", kind = "insert", sql = "INSERT INTO Notlar (Metin) VALUES ('x')", parameters = Array.Empty<object>(), runOn = "manual" } };
        AssertRejected(V2(queries, [new { id = "t1", type = "dataTable", name = "tbl", props = new { query = "q1" } }, Cp(new { table = "t1", fields = new[] { "A=B" }, relatedQuery = "w1" })]), "relatedQuery");
        AssertRejected(Page(In("in1"), Fp(new { inputs = new[] { "in1" } })), "seçenek sorgulu");
        AssertRejected(Page(In("in1", "select"), Fp(new { inputs = new[] { "in1" } })), "seçenek sorgulu");
        AssertRejected(Page(In("in1", "select", "q1"), Fp(new { inputs = new[] { "in1" }, facetCounts = new[] { "in9=Adet" } })), "facetCounts");
    }
}
