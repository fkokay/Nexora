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

    private static object OpQuery(string id, string name, string kind, string operation, string runOn = "manual", params object[] parameters) =>
        new { id, name, kind, operation, parameters, runOn };

    private static object StockList() => OpQuery("liste", "kartlar", "read", "stok.kart.listele", "load", Param("q", "{{arama.value}}"));
    private static object StockRead() => OpQuery("oku", "kart", "read", "stok.kart.getir", "load", Param("id", "{{kartlar.rows[0].id}}", "guid"));
    private static readonly object SearchInput = new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } };

    [Fact]
    public void Accepts_operation_query_and_binds_to_table()
    {
        var json = V2([StockList()], [SearchInput, new { id = "t1", type = "dataTable", props = new { query = "liste" } }]);
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        var query = Assert.Single(TenantCustomPageQueries.ReadQueries(json));
        Assert.Equal("stok.kart.listele", query.Operation);
        Assert.Equal("", query.Sql);
        // Runtime consumers keep the operation name; only SQL text is stripped.
        Assert.Contains("stok.kart.listele", TenantCustomPageQueries.WithoutQuerySql(json));
    }

    [Fact]
    public void Rejects_unknown_operation()
    {
        AssertRejected(V2([OpQuery("q1", "x", "read", "yok.islem", "load")]), "ERP işlemi bulunamadı: yok.islem");
    }

    [Fact]
    public void Rejects_sql_and_operation_together()
    {
        AssertRejected(V2([new { id = "q1", name = "x", kind = "read", sql = "SELECT 1 AS x", operation = "stok.kart.listele", parameters = Array.Empty<object>(), runOn = "load" }]));
        // Neither sql nor operation.
        AssertRejected(V2([new { id = "q1", name = "x", kind = "read", parameters = Array.Empty<object>(), runOn = "load" }]));
    }

    [Fact]
    public void Rejects_kind_mismatch()
    {
        AssertRejected(V2([OpQuery("q1", "sil", "update", "stok.kart.sil", "manual", Param("id", "{{bugun}}", "guid"))]), "stok.kart.sil");
        AssertRejected(V2([OpQuery("q1", "liste", "read", "stok.kart.olustur", "manual", Param("code", "{{bugun}}"), Param("name", "{{bugun}}"))]));
    }

    [Fact]
    public void Rejects_parameter_type_mismatch()
    {
        AssertRejected(V2([OpQuery("q1", "sil", "delete", "stok.kart.sil", "manual", Param("id", "{{bugun}}", "text"))]), "id");
        // Unknown parameter names and missing required parameters are rejected too.
        AssertRejected(V2([OpQuery("q1", "sil", "delete", "stok.kart.sil", "manual", Param("id", "{{bugun}}", "guid"), Param("fazla", "{{bugun}}"))]), "fazla");
        AssertRejected(V2([OpQuery("q1", "sil", "delete", "stok.kart.sil", "manual")]), "id");
        // A write operation still runs only manually.
        AssertRejected(V2([OpQuery("q1", "sil", "delete", "stok.kart.sil", "load", Param("id", "{{bugun}}", "guid"))]), "manual");
    }

    [Fact]
    public void Rejects_update_without_source_read_on_page()
    {
        AssertRejected(V2([OpQuery("q1", "kaydet", "update", "stok.kart.guncelle", "manual", Param("name", "{{arama.value}}"))], [SearchInput]), "stok.kart.getir");
    }

    [Fact]
    public void Accepts_update_with_source_read_and_actionBar_save()
    {
        var json = V2(
            [StockList(), StockRead(), OpQuery("kaydet", "kartKaydet", "update", "stok.kart.guncelle", "manual", Param("name", "{{arama.value}}"))],
            [SearchInput, new { id = "t1", type = "dataTable", props = new { query = "liste" } }, new { id = "ab1", type = "actionBar", props = new { saveQuery = "kaydet" } }]);
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        // A write operation cannot feed a table, same as a write SQL query.
        AssertRejected(V2([StockList(), StockRead(), OpQuery("kaydet", "kartKaydet", "update", "stok.kart.guncelle", "manual")],
            [new { id = "t1", type = "dataTable", props = new { query = "kaydet" } }]));
    }

    [Fact]
    public void Accepts_operation_query_with_more_than_20_parameters()
    {
        var names = new[] { "code", "name", "barcode", "unitCode", "category", "priceCurrencyCode", "productImageUrl", "purchaseAccountCode",
            "salesAccountCode", "costAccountCode", "marketplaceProductId", "trackingMode", "rowVersion" };
        var decimals = new[] { "minimumStock", "purchaseVatPercent", "salesVatPercent", "exciseTaxPercent", "communicationTaxPercent",
            "purchaseDiscountPercent", "salesDiscountPercent", "safetyStock", "withholdingTaxPercent", "stampTaxPercent", "netWeight", "grossWeight" };
        var parameters = names.Select(x => Param(x, "{{arama.value}}")).Concat(decimals.Select(x => Param(x, "{{arama.value}}", "decimal"))).ToArray();
        Assert.Equal(25, parameters.Length);
        var json = V2([StockList(), StockRead(), OpQuery("kaydet", "kartKaydet", "update", "stok.kart.guncelle", "manual", parameters)], [SearchInput]);
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

        // SQL queries keep the 20-parameter limit.
        var sqlParameters = Enumerable.Range(1, 21).Select(i => Param($"p{i}", "{{arama.value}}")).ToArray();
        var sql = "SELECT " + string.Join(", ", Enumerable.Range(1, 21).Select(i => $"@p{i} AS c{i}"));
        AssertRejected(V2([Query("q1", "liste", sql, sqlParameters)], [SearchInput]), "20");
    }

    [Fact]
    public void Deprecated_operation_is_rejected_for_new_use_but_kept_where_the_page_already_uses_it()
    {
        // A test lookup marks a live operation as deprecated.
        Assert.True(Api.ErpOperationCatalog.TryGet("stok.kart.sil", out var real));
        var deprecated = real with { Deprecated = true };
        bool Lookup(string name, out Api.ErpOperation operation)
        {
            if (name == deprecated.Name) { operation = deprecated; return true; }
            return Api.ErpOperationCatalog.TryGet(name, out operation);
        }
        var json = V2([OpQuery("q1", "sil", "delete", "stok.kart.sil", "manual", Param("id", "{{bugun}}", "guid"))]);

        Assert.False(TenantCustomPageSchema.Validate(json, out var error, null, Lookup));
        Assert.Equal("ERP işlemi artık kullanılamıyor: stok.kart.sil", error);
        Assert.False(TenantCustomPageSchema.Validate(json, out error, new HashSet<string> { "stok.kart.listele" }, Lookup));
        Assert.True(TenantCustomPageSchema.Validate(json, out error, new HashSet<string> { "stok.kart.sil" }, Lookup), error);
        // The production lookup still accepts it: it is not deprecated there.
        Assert.True(TenantCustomPageSchema.Validate(json, out error), error);
    }

    private static readonly object[] BodyMapComponents =
    [
        SearchInput,
        new { id = "t1", type = "dataTable", name = "liste", props = new { query = "liste" } },
        new { id = "c2", type = "input", name = "renk", props = new { inputType = "text" } }
    ];

    private static object CustomFieldRead(string idBinding = "{{liste.seciliSatir.id}}") =>
        OpQuery("degerOku", "degerler", "read", "stok.kart.ozelAlanDegerleri", "load", Param("id", idBinding, "guid"));

    private static object CustomFieldSave(string idBinding = "{{liste.seciliSatir.id}}", string fieldName = "RENK", string fieldType = "text") =>
        OpQuery("alanKaydet", "alanlar", "update", "stok.kart.ozelAlanKaydet", "manual", Param("id", idBinding, "guid"),
            Param(fieldName, "{{renk.value}}", fieldType));

    [Fact]
    public void Accepts_body_map_write_with_custom_field_parameters()
    {
        var json = V2([StockList(), CustomFieldRead(), CustomFieldSave()], BodyMapComponents);
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    [Fact]
    public void Rejects_body_map_parameter_with_lowercase_name()
    {
        AssertRejected(V2([StockList(), CustomFieldRead(), CustomFieldSave(fieldName: "renk")], BodyMapComponents),
            "'renk' parametresi 'stok.kart.ozelAlanKaydet' işleminde tanımlı değil");
        // A code colliding case-insensitively with a declared parameter is not a map value either.
        AssertRejected(V2([StockList(), CustomFieldRead(),
                OpQuery("alanKaydet", "alanlar", "update", "stok.kart.ozelAlanKaydet", "manual", Param("ID", "{{liste.seciliSatir.id}}"))], BodyMapComponents),
            "'ID' parametresi 'stok.kart.ozelAlanKaydet' işleminde tanımlı değil");
        // An operation without a body map still rejects undeclared parameters.
        AssertRejected(V2([OpQuery("q1", "sil", "delete", "stok.kart.sil", "manual", Param("id", "{{bugun}}", "guid"), Param("RENK", "{{bugun}}"))]),
            "'RENK' parametresi 'stok.kart.sil' işleminde tanımlı değil");
    }

    [Fact]
    public void Rejects_body_map_parameter_of_non_text_type()
    {
        AssertRejected(V2([StockList(), CustomFieldRead(), CustomFieldSave(fieldType: "int")], BodyMapComponents), "türü text olmalıdır");
    }

    [Fact]
    public void Rejects_body_map_write_without_source_read()
    {
        AssertRejected(V2([StockList(), CustomFieldSave()], BodyMapComponents), "'stok.kart.ozelAlanDegerleri' okuma sorgusu olmalıdır");
    }

    [Fact]
    public void Rejects_body_map_write_with_different_id_binding()
    {
        AssertRejected(V2([StockList(), CustomFieldRead(), CustomFieldSave("{{kart.rows[0].id}}")], BodyMapComponents),
            "'alanlar' sorgusu: 'id' bağlaması 'stok.kart.ozelAlanDegerleri' sorgusununkiyle aynı olmalıdır.");
    }

    [Fact]
    public void Accepts_balance_page_without_warehouse_binding()
    {
        var json = V2([OpQuery("bakiye", "bakiyeler", "read", "stok.bakiye.sayfa", "load", Param("q", "{{arama.value}}"))],
            [SearchInput, new { id = "t1", type = "dataTable", props = new { query = "bakiye" } }]);
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    [Fact]
    public void Operation_names_are_collected_from_saved_definitions()
    {
        var withOps = V2([StockList(), StockRead()], [SearchInput]);
        var withSql = V2([Query("q1", "liste", "SELECT 1 AS x")]);
        Assert.Equal(new HashSet<string> { "stok.kart.listele", "stok.kart.getir" }, TenantCustomPageQueries.OperationNames(withOps, withSql, "{bozuk"));
        Assert.True(TenantCustomPageQueries.HasSqlQueries(withSql));
        Assert.False(TenantCustomPageQueries.HasSqlQueries(withOps));
        // Fails safe: an entry that is not clearly an operation query counts as SQL.
        Assert.True(TenantCustomPageQueries.HasSqlQueries("""{"schemaVersion":2,"queries":[{"id":"q1"}],"components":[]}"""));
        Assert.False(TenantCustomPageQueries.HasSqlQueries("""{"schemaVersion":1,"components":[]}"""));
        Assert.True(TenantCustomPageQueries.HasQueries(withOps));
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
            new { id = "a1", type = "alert", props = new { title = "Koruma açık", variant = "success", icon = "shield", value = "Etkin" } },
            new { id = "t1", type = "dataTable", props = new { query = "q1", density = "dense", columnFormats = new[] { "Tutar=money", "Durum=status" }, toneMap = new[] { "Pasif=danger" }, totals = new[] { "Tutar" } } });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        // Alert icon/value were never constrained: pages saved before the status strip keep validating.
        Assert.True(TenantCustomPageSchema.Validate(Page(new { id = "a2", type = "alert", props = new { icon = "rocket", value = new string('a', 300) } }), out error), error);
        // Extended metric icon set (hyphenated lucide names) next to the original eight.
        foreach (var icon in new[] { "wallet", "warehouse", "shopping-cart", "building-2", "refresh-cw" })
            Assert.True(TenantCustomPageSchema.Validate(Page(new { id = "m2", type = "metric", props = new { query = "q1", icon } }), out error), $"{icon}: {error}");
    }

    [Fact]
    public void Count_when_counts_rows_of_the_metric_query()
    {
        // Legacy Lot / Seri İzleme summary cards: the row is "<query name>.satir"; ordering operators and bugun + n are allowed.
        var json = Page(
            new { id = "m1", type = "metric", props = new { query = "q1", title = "Süresi geçmiş", variant = "danger", icon = "calendar-x", countWhen = "liste.satir.expiryDate < bugun" } },
            new { id = "m2", type = "metric", props = new { query = "q1", variant = "warning", icon = "calendar-clock",
                countWhen = "liste.satir.expiryDate >= bugun && liste.satir.expiryDate <= bugun + 30 && durum.value != 'x'" } },
            new { id = "in1", type = "input", name = "durum" });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

        object Metric(object props) => new { id = "m1", type = "metric", props };
        AssertRejected(Page(new { id = "t1", type = "dataTable", props = new { query = "q1", countWhen = "liste.satir.x == 1" } }), "countWhen");
        AssertRejected(Page(new { id = "h1", type = "heading", props = new { countWhen = "liste.satir.x == 1" } }), "countWhen");
        AssertRejected(Page(Metric(new { source = "customers", countWhen = "liste.satir.x == 1" })), "yalnızca sorgusu olan gösterge");
        AssertRejected(Page(Metric(new { query = "q1", countWhen = "liste.satir.x <" })), "'countWhen' koşulu geçersiz");
        AssertRejected(Page(Metric(new { query = "q1", countWhen = 3 })), "countWhen");
        AssertRejected(Page(Metric(new { query = "q1", countWhen = "bugun == '2026-01-01'" })), "liste.satir.<alan>");
        AssertRejected(Page(Metric(new { query = "q1", countWhen = "liste.satir.x == yok.value" })), "sayfada olmayan bir ada başvuruyor: yok");
        // Quoted literals keep rejecting markup.
        AssertRejected(Page(Metric(new { query = "q1", countWhen = "liste.satir.x == '<b>'" })), "countWhen");
        // v1 pages have no query metrics.
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { Metric(new { countWhen = "a.satir.x == 1" }) } }));
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

    private static object Write(string id, string name, string kind, string sql) =>
        new { id, name, kind, sql, parameters = Array.Empty<object>(), runOn = "manual" };

    private static object[] ActionQueries => [
        Query("q1", "liste", "SELECT 1 AS x"),
        Write("w1", "ekle", "insert", "INSERT INTO Notlar (Metin) VALUES ('x')"),
        Write("w2", "guncelle", "update", "UPDATE Notlar SET Metin = 'x' WHERE Id = 1"),
        Write("w3", "sil", "delete", "DELETE FROM Notlar WHERE Id = 1")];

    private static object Bar(object props, string id = "ab1") => new { id, type = "actionBar", props };
    private static object Btn(string id) => new { id, type = "button", props = new { text = id } };

    [Fact]
    public void Accepts_action_bar()
    {
        var tbl = new { id = "t1", type = "dataTable", props = new { query = "q1" } };
        var full = V2(ActionQueries, [
            Bar(new { newInputs = new[] { "in1", "in2" }, saveQuery = "w1", deleteQuery = "w3", focusInput = "in1", printEnabled = true, exportTable = "t1", moreButtons = new[] { "b1", "b2" } }),
            In("in1"), tbl, Btn("b1"),
            new { id = "c1", type = "card", children = new object[] { In("in2"), Btn("b2") } }]);
        Assert.True(TenantCustomPageSchema.Validate(full, out var error), error);
        Assert.True(TenantCustomPageSchema.Validate(V2(ActionQueries, [Bar(new { saveQuery = "w2", printEnabled = false })]), out error), error);
        Assert.True(TenantCustomPageSchema.Validate(V2(ActionQueries, [Bar(new { })]), out error), error);
        Assert.True(TenantCustomPageSchema.Validate(V2(ActionQueries, [Bar(new { titleCount = "{{q1.meta.totalCount}}" })]), out error), error);
    }

    [Fact]
    public void Accepts_action_bar_hidden_commands_conditions_and_look()
    {
        var bar = Bar(new
        {
            hiddenCommands = new[] { "print", "more" },
            commandWhen = new[] { "delete=kullanici.rol == 'TenantAdmin'", "export=kullanici.rol in ['TenantAdmin', 'Muhasebe']" },
            barLook = new[] { "align=end", "size=lg", "style=plain", "content=icon", "unbound=hide", "sticky=true", "accent=#534AB7", "background=#FFFFFF", "title=false" },
        });
        Assert.True(TenantCustomPageSchema.Validate(V2(ActionQueries, [bar]), out var error), error);
    }

    [Fact]
    public void Rejects_invalid_action_bar_hidden_commands_conditions_and_look()
    {
        string P(object props) => V2(ActionQueries, [Bar(props)]);
        AssertRejected(P(new { hiddenCommands = new[] { "undo" } }), "hiddenCommands");
        AssertRejected(P(new { hiddenCommands = new[] { "print", "print" } }), "hiddenCommands");
        AssertRejected(P(new { hiddenCommands = Array.Empty<string>() }), "hiddenCommands");
        AssertRejected(P(new { commandWhen = new[] { "delete" } }), "commandWhen");
        AssertRejected(P(new { commandWhen = new[] { "yok=kullanici.rol == 'A'" } }), "commandWhen");
        AssertRejected(P(new { commandWhen = new[] { "delete=kullanici.rol == 'A'", "delete=kullanici.rol == 'B'" } }), "commandWhen");
        AssertRejected(P(new { commandWhen = new[] { "delete=kullanici.rol ==" } }), "commandWhen");
        AssertRejected(P(new { commandWhen = new[] { "delete=bilinmeyen.alan == 1" } }));
        AssertRejected(P(new { barLook = new[] { "size=xl" } }), "barLook");
        AssertRejected(P(new { barLook = new[] { "accent=red" } }), "barLook");
        AssertRejected(P(new { barLook = new[] { "align=end", "align=start" } }), "barLook");
        AssertRejected(V2(ActionQueries, [new { id = "h1", type = "heading", props = new { hiddenCommands = new[] { "print" } } }]), "yalnızca İşlem Çubuğu");
    }

    [Fact]
    public void Rejects_invalid_action_bar()
    {
        string P(params object[] components) => V2(ActionQueries, components);
        var tbl = new { id = "t1", type = "dataTable", props = new { query = "q1" } };
        var buttons11 = Enumerable.Range(0, 11).Select(i => $"b{i}").ToArray();
        var buttonObjs = Enumerable.Range(0, 11).Select(i => Btn($"b{i}")).ToArray();

        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { new { id = "a1", type = "actionBar" } } }), "İzin verilmeyen bileşen türü");
        AssertRejected(P(Bar(new { }), Bar(new { }, "ab2")), "en fazla bir");
        AssertRejected(P(Bar(new { saveQuery = "w3" })), "saveQuery");
        AssertRejected(P(Bar(new { saveQuery = "q1" })), "saveQuery");
        AssertRejected(P(Bar(new { deleteQuery = "w1" })), "deleteQuery");
        AssertRejected(P(Bar(new { deleteQuery = "w2" })), "deleteQuery");
        AssertRejected(P(Bar(new { deleteQuery = "q1" })), "deleteQuery");
        AssertRejected(P(In("in1"), Bar(new { newInputs = new[] { "in1", "in1" } })), "newInputs");
        AssertRejected(P(Bar(new { }), new { id = "c9", type = "card", children = new object[] { Bar(new { }, "ab2") } }), "en fazla bir");
        AssertRejected(P(Bar(new { saveQuery = "yok" })), "sayfada yok");
        AssertRejected(P(Bar(new { deleteQuery = "yok" })), "sayfada yok");
        AssertRejected(P(Bar(new { newInputs = new[] { "yok" } })), "sayfada yok");
        AssertRejected(P(Btn("h1"), Bar(new { newInputs = new[] { "h1" } })), "giriş bileşeni değil");
        AssertRejected(P(Btn("h1"), Bar(new { focusInput = "h1" })), "giriş bileşeni ya da arama kutulu süzgeç alanı değil");
        AssertRejected(P(Bar(new { focusInput = "yok" })), "sayfada yok");
        AssertRejected(P(Bar(new { newInputs = Array.Empty<string>() })), "newInputs");
        AssertRejected(P(Bar(new { newInputs = Enumerable.Range(0, 13).Select(i => $"i{i}").ToArray() })), "newInputs");
        AssertRejected(P(new { id = "t1", type = "dataTable", props = new { source = "customers" } }, Bar(new { exportTable = "t1" })), "exportTable");
        AssertRejected(P(Bar(new { exportTable = "yok" })), "exportTable");
        AssertRejected(P(In("in1"), Bar(new { exportTable = "in1" })), "exportTable");
        AssertRejected(P(In("in1"), Bar(new { moreButtons = new[] { "in1" } })), "düğme bileşeni değil");
        AssertRejected(P(Bar(new { moreButtons = new[] { "yok" } })), "sayfada yok");
        AssertRejected(P(new[] { Bar(new { moreButtons = buttons11 }) }.Concat(buttonObjs).ToArray()), "moreButtons");
        AssertRejected(P(Bar(new { moreButtons = Array.Empty<string>() })), "moreButtons");
        AssertRejected(P(Btn("b1"), Bar(new { moreButtons = new[] { "b1", "b1" } })), "moreButtons");
        AssertRejected(P(Bar(new { printEnabled = "evet" })), "printEnabled");
        AssertRejected(P(Bar(new { titleCount = 5 })), "titleCount");
        AssertRejected(P(Bar(new { titleCount = "" })), "titleCount");
        AssertRejected(P(new { id = "h1", type = "heading", props = new { titleCount = "3" } }), "yalnızca İşlem Çubuğu");
        AssertRejected(P(new { id = "h1", type = "heading", props = new { saveQuery = "w1" } }), "yalnızca İşlem Çubuğu");
        AssertRejected(P(tbl, new { id = "t2", type = "dataTable", props = new { exportTable = "t1" } }), "yalnızca İşlem Çubuğu");
        AssertRejected(P(new { id = "ab1", type = "actionBar", props = new { }, children = new object[] { Btn("b1") } }), "alt bileşen");
    }

    private static string CodeJson(int version, object props) => JsonSerializer.Serialize(new
    {
        schemaVersion = version,
        components = new object[] { new { id = "k1", type = "code", props } }
    });

    [Fact]
    public void Accepts_hidden_code_component_v2()
    {
        var json = CodeJson(2, new { javascript = "nexora.on('load',()=>{})", hidden = true });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    [Fact]
    public void Rejects_hidden_on_non_code()
    {
        var json = V2(components: [new { id = "t1", type = "text", props = new { text = "x", hidden = true } }]);
        AssertRejected(json, "hidden");
    }

    [Fact]
    public void Rejects_non_bool_hidden_on_code()
    {
        AssertRejected(CodeJson(2, new { javascript = "1", hidden = "yes" }), "hidden");
    }

    [Fact]
    public void Accepts_20000_char_javascript_in_v2()
    {
        var json = CodeJson(2, new { javascript = new string('a', 20000) });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    [Fact]
    public void Rejects_20001_char_javascript_in_v2()
    {
        AssertRejected(CodeJson(2, new { javascript = new string('a', 20001) }), "javascript");
    }

    [Fact]
    public void Keeps_4000_char_limit_in_v1()
    {
        Assert.True(TenantCustomPageSchema.Validate(CodeJson(1, new { javascript = new string('a', 4000) }), out var error), error);
        AssertRejected(CodeJson(1, new { javascript = new string('a', 4001) }), "javascript");
    }

    [Fact]
    public void Keeps_4000_char_css_limit_in_v2()
    {
        AssertRejected(CodeJson(2, new { css = new string('a', 4001) }), "css");
    }

    [Fact]
    public void Rejects_hidden_in_v1()
    {
        AssertRejected(CodeJson(1, new { javascript = "1", hidden = true }));
    }
}
