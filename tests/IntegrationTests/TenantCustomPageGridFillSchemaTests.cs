using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Generic engine props of a list editable grid: fill from a query (<c>fillQuery</c>, <c>fillColumns</c>, <c>skipWhenZero</c>),
/// lookup fills (<c>lookupFills</c>) and formula columns (<c>formulas</c>). Uses a fake operation catalog, so the rules do not
/// depend on the real purchasing operations.
/// </summary>
public sealed class TenantCustomPageGridFillSchemaTests
{
    private static ErpOperationColumn Col(string code, string type = "text") => new(code, code, type);
    private static ErpOperationParameterItem Item(string code, string type = "decimal") => new(code, code, type, false);

    private static readonly Dictionary<string, ErpOperation> Operations = new(StringComparer.Ordinal)
    {
        ["test.kalanlar"] = new("test.kalanlar", "Kalanlar", "Test", "read", "read", "GET", "/api/orders/{orderId}/remaining",
            [new ErpOperationParameter("orderId", "route", "guid", true)],
            new ErpOperationResult("list", null, [Col("lineNumber", "int"), Col("stockItemId", "guid"), Col("remainingQuantity", "decimal"), Col("unitPrice", "decimal")]),
            null, null, "2026-11-22"),
        ["test.stoklar"] = new("test.stoklar", "Stoklar", "Test", "read", "read", "GET", "/api/stock-options", [],
            new ErpOperationResult("list", null, [Col("id", "guid"), Col("code"), Col("name"), Col("purchasePrice", "decimal"), Col("unit.code")]),
            null, null, "2026-11-22"),
        ["test.kabul"] = new("test.kabul", "Kabul", "Test", "write", "insert", "POST", "/api/receipts",
            [new ErpOperationParameter("lines", "body", "list", false) { Items = [Item("lineNumber", "int"), Item("stockItemId", "guid"), Item("quantity"), Item("unitPrice"), Item("lineNet"), Item("note", "text"), Item("isFree", "bool")] }],
            new ErpOperationResult("none", null, []), null, null, "2026-11-22"),
    };

    private static bool Lookup(string name, out ErpOperation operation) => Operations.TryGetValue(name, out operation!);

    private static readonly string[] Columns =
    [
        "lineNumber|Satır|number|readOnly", "stockItemId|Stok|lookup:qs:id:code:name|required", "quantity|Miktar|number|min:0",
        "unitPrice|Fiyat|number", "lineNet|Net|number", "lineVat|KDV|number", "note|Not|text",
        "stockName|Stok adı|text|readOnly", "remainingQuantity|Kalan|number|readOnly", "isFree|Bedelsiz|checkbox",
    ];

    /// <summary>A valid page: an order input, the fill and option reads, the list grid with every engine prop and a write binding it.</summary>
    private static JsonObject Page(Action<JsonObject>? gridProps = null, string mode = "list")
    {
        var props = new JsonObject
        {
            ["gridMode"] = mode,
            ["gridColumns"] = new JsonArray([.. Columns.Select(x => (JsonNode)JsonValue.Create(x)!)]),
            ["fillQuery"] = "qk",
            ["fillColumns"] = new JsonObject { ["quantity"] = "remainingQuantity", ["stockName"] = "stockItemId" },
            ["skipWhenZero"] = "quantity",
            ["lookupFills"] = new JsonObject { ["stockItemId"] = new JsonObject { ["unitPrice"] = "purchasePrice", ["note"] = "unit.code" } },
            ["formulas"] = new JsonObject { ["lineNet"] = "quantity * unitPrice", ["lineVat"] = "quantity * unitPrice * 20 / 100" },
            ["totals"] = new JsonArray("lineNet", "lineVat"),
        };
        gridProps?.Invoke(props);
        JsonObject Query(string id, string kind, string operation, string runOn, params (string Name, string Binding, string Type)[] parameters) => new()
        {
            ["id"] = id, ["name"] = id, ["kind"] = kind, ["operation"] = operation, ["runOn"] = runOn,
            ["parameters"] = new JsonArray([.. parameters.Select(x => (JsonNode)new JsonObject { ["name"] = x.Name, ["binding"] = x.Binding, ["type"] = x.Type })]),
        };
        return new JsonObject
        {
            ["schemaVersion"] = 2,
            ["queries"] = new JsonArray(
                Query("qk", "read", "test.kalanlar", "load", ("orderId", "{{siparis.value}}", "guid")),
                Query("qs", "read", "test.stoklar", "load"),
                Query("qy", "insert", "test.kabul", "manual", ("lines", "{{g.satirlar}}", "list"))),
            ["components"] = new JsonArray(
                new JsonObject { ["id"] = "siparis", ["type"] = "input", ["name"] = "siparis", ["props"] = new JsonObject { ["inputType"] = "text", ["label"] = "Sipariş" } },
                new JsonObject { ["id"] = "g", ["type"] = "editableGrid", ["name"] = "g", ["props"] = props },
                new JsonObject { ["id"] = "kaydet", ["type"] = "button", ["props"] = new JsonObject { ["text"] = "Kaydet", ["actionType"] = "query", ["queryId"] = "qy" } }),
        };
    }

    private static bool Validate(JsonObject page, out string? error) => TenantCustomPageSchema.Validate(page.ToJsonString(), out error, null, Lookup);

    private static void AssertAccepted(JsonObject page) => Assert.True(Validate(page, out var error), error);

    private static void AssertRejected(JsonObject page, string contains)
    {
        Assert.False(Validate(page, out var error));
        Assert.NotNull(error);
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_list_grid_with_fill_lookup_fills_and_formulas()
    {
        AssertAccepted(Page());
    }

    [Fact]
    public void Accepts_each_prop_alone_and_fill_without_fillColumns()
    {
        AssertAccepted(Page(p => { p.Remove("fillColumns"); p.Remove("lookupFills"); p.Remove("skipWhenZero"); }));
        AssertAccepted(Page(p => { p.Remove("fillQuery"); p.Remove("fillColumns"); }));
        AssertAccepted(Page(p => p["skipWhenZero"] = "lineNet"));
    }

    [Fact]
    public void Formula_column_may_lack_a_list_item_but_other_columns_may_not()
    {
        // lineVat has no item in test.kabul's lines: accepted because it is a formula column.
        AssertAccepted(Page());
        AssertRejected(Page(p => ((JsonObject)p["formulas"]!).Remove("lineVat")), "'lineVat' sütunu 'lines' parametresinin alanlarında yok");
    }

    [Fact]
    public void Read_only_display_column_may_lack_a_list_item_and_be_a_fill_target()
    {
        // stockName and remainingQuantity have no item in test.kabul's lines; both are read-only display columns.
        AssertAccepted(Page(p => p["lookupFills"] = new JsonObject { ["stockItemId"] = new JsonObject { ["stockName"] = "name", ["unitPrice"] = "purchasePrice" } }));
        AssertRejected(Page(p => ((JsonArray)p["gridColumns"]!)[7] = "stockName|Stok adı|text"), "'stockName' sütunu 'lines' parametresinin alanlarında yok");
        // A display column must still be a grid column.
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject { ["stockTitle"] = "stockItemId" }), "'fillColumns' sütunu ızgarada yok: stockTitle");
    }

    [Theory]
    [InlineData("stage")]
    [InlineData("matrix")]
    public void Rejects_engine_props_outside_list_mode(string mode)
    {
        foreach (var key in new[] { "fillQuery", "fillColumns", "skipWhenZero", "lookupFills", "formulas", "rowNumberColumn", "lockColumnsWhen" })
        {
            var page = Page(p =>
            {
                foreach (var other in new[] { "fillQuery", "fillColumns", "skipWhenZero", "lookupFills", "formulas", "rowNumberColumn", "totals" }) if (other != key) p.Remove(other);
                if (key == "rowNumberColumn") p["rowNumberColumn"] = "lineNumber";
                if (key == "lockColumnsWhen") p["lockColumnsWhen"] = new JsonArray("unitPrice=satir.isFree == true");
                if (mode == "stage") { p["sourceQuery"] = "qk"; p["rowKey"] = "lineNumber"; }
                else { p.Remove("gridColumns"); p["matrixCode"] = "X"; p["matrixName"] = "Y"; }
            }, mode);
            // The write binds satirlar of a list grid; drop it so only the engine rule can fail.
            page["queries"]!.AsArray().RemoveAt(2);
            page["components"]!.AsArray().RemoveAt(2);
            AssertRejected(page, $"'{key}' yalnız listeli (list) kipte kullanılabilir.");
        }
    }

    [Fact]
    public void Rejects_engine_props_on_other_component_types()
    {
        var page = Page();
        page["components"]!.AsArray().Add(new JsonObject { ["id"] = "t", ["type"] = "text", ["props"] = new JsonObject { ["text"] = "x", ["formulas"] = new JsonObject { ["a"] = "1" } } });
        Assert.False(Validate(page, out _));
        var other = Page();
        other["components"]!.AsArray().Add(new JsonObject { ["id"] = "t", ["type"] = "text", ["props"] = new JsonObject { ["text"] = "x", ["fillQuery"] = "qk" } });
        AssertRejected(other, "'fillQuery' özelliği bu bileşen türünde kullanılamaz.");
    }

    [Theory]
    [InlineData("qy")]
    [InlineData("yok")]
    public void Rejects_fillQuery_that_is_not_a_read_query_of_the_page(string query)
    {
        AssertRejected(Page(p => p["fillQuery"] = query), "'fillQuery' sayfadaki bir okuma sorgusu olmalıdır.");
    }

    [Fact]
    public void Rejects_bad_fillColumns()
    {
        AssertRejected(Page(p => p.Remove("fillQuery")), "'fillColumns' yalnız 'fillQuery' ile kullanılabilir.");
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject { ["yok"] = "remainingQuantity" }), "'fillColumns' sütunu ızgarada yok: yok");
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject { ["quantity"] = "kalan" }), "'kalan' sütunu 'qk' sorgusunun sonucunda yok");
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject { ["lineNet"] = "unitPrice" }), "'fillColumns' formül sütununu dolduramaz: lineNet");
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject { ["quantity"] = "a b" }), "sorgu sütunu geçersiz");
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject()), "'fillColumns' 1–16");
        AssertRejected(Page(p => p["fillColumns"] = new JsonArray("quantity=remainingQuantity")), "'fillColumns' 1–16");
        AssertRejected(Page(p => p["fillColumns"] = new JsonObject { ["quantity"] = 5 }), "'fillColumns' 1–16");
    }

    [Theory]
    [InlineData("note")]
    [InlineData("stockItemId")]
    [InlineData("yok")]
    public void Rejects_skipWhenZero_that_is_not_a_number_column(string column)
    {
        AssertRejected(Page(p => p["skipWhenZero"] = column), "'skipWhenZero' ızgaranın sayı (number) sütunu olmalıdır.");
    }

    [Fact]
    public void Rejects_bad_lookupFills()
    {
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject { ["quantity"] = new JsonObject { ["unitPrice"] = "purchasePrice" } }),
            "'lookupFills' anahtarı ızgaranın bir seçim (lookup) sütunu olmalıdır: quantity");
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject { ["stockItemId"] = new JsonObject { ["yok"] = "purchasePrice" } }),
            "hedefi ızgaranın başka bir sütunu olmalıdır: yok");
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject { ["stockItemId"] = new JsonObject { ["stockItemId"] = "id" } }),
            "hedefi ızgaranın başka bir sütunu olmalıdır: stockItemId");
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject { ["stockItemId"] = new JsonObject { ["unitPrice"] = "salePrice" } }),
            "'salePrice' sütunu 'qs' sorgusunun sonucunda yok");
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject { ["stockItemId"] = new JsonObject { ["lineNet"] = "purchasePrice" } }),
            "'lookupFills' formül sütununu dolduramaz: lineNet");
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject { ["stockItemId"] = "purchasePrice" }), "'lookupFills' 'stockItemId' değeri");
        AssertRejected(Page(p => p["lookupFills"] = new JsonObject()), "'lookupFills' 1–16");
    }

    [Fact]
    public void Rejects_bad_formulas()
    {
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["note"] = "1" }), "'formulas' sütunu ızgaranın sayı (number) sütunu olmalıdır: note");
        // Formulas may chain (acyclic); self-reference and cycles are rejected.
        AssertAccepted(Page(p => p["formulas"] = new JsonObject { ["lineVat"] = "lineNet * 0.2", ["lineNet"] = "quantity * unitPrice" }));
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["lineNet"] = "lineNet + 1", ["lineVat"] = "1" }), "'lineNet' kullanılabilecek bir sayı sütunu değil");
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["lineNet"] = "lineVat * 5", ["lineVat"] = "lineNet * 0.2" }),
            "'formulas' döngüsel başvuru içeriyor: lineNet, lineVat");
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["lineNet"] = "quantity * note", ["lineVat"] = "1" }), "'note' kullanılabilecek bir sayı sütunu değil");
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["lineNet"] = "max(quantity, 1)", ["lineVat"] = "1" }), "'formulas' 'lineNet' sütunu: Formül geçersiz");
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["lineNet"] = 5, ["lineVat"] = "1" }), "'formulas' 1–16");
        AssertRejected(Page(p => p["formulas"] = new JsonObject()), "'formulas' 1–16");
        AssertRejected(Page(p => p["formulas"] = new JsonObject { ["lineNet"] = "<script>", ["lineVat"] = "1" }), "Formül geçersiz");
    }

    [Fact]
    public void Row_number_column_rules()
    {
        // lineNumber has a list item: the numbered value is sent.
        AssertAccepted(Page(p => p["rowNumberColumn"] = "lineNumber"));
        AssertRejected(Page(p => p["rowNumberColumn"] = "note"), "'rowNumberColumn' ızgaranın sayı (number) sütunu olmalıdır.");
        AssertRejected(Page(p => p["rowNumberColumn"] = "yok"), "'rowNumberColumn' ızgaranın sayı (number) sütunu olmalıdır.");
        AssertRejected(Page(p => p["rowNumberColumn"] = "lineNet"), "'rowNumberColumn' formül sütunu olamaz: lineNet");
        AssertRejected(Page(p => { p["rowNumberColumn"] = "quantity"; p.Remove("formulas"); p.Remove("totals"); }), "'fillColumns' sıra numarası sütununu dolduramaz: quantity");
        AssertRejected(Page(p => { p["rowNumberColumn"] = "quantity"; p.Remove("fillColumns"); p.Remove("formulas"); p.Remove("totals"); }), "'rowNumberColumn' ve 'skipWhenZero' aynı sütun olamaz.");
        AssertRejected(Page(p => { p["rowNumberColumn"] = "unitPrice"; p.Remove("formulas"); p.Remove("totals"); }), "'lookupFills' sıra numarası sütununu dolduramaz: unitPrice");
        AssertRejected(Page(p => { p["rowNumberColumn"] = "lineNumber"; p["formulas"] = new JsonObject { ["lineNet"] = "lineNumber * 2", ["lineVat"] = "1" }; }),
            "'lineNumber' kullanılabilecek bir sayı sütunu değil");
    }

    [Fact]
    public void Formula_graph_vectors_match_order()
    {
        foreach (var graph in FormulaVectors().GetProperty("graphs").EnumerateArray())
        {
            var refs = graph.GetProperty("refs").EnumerateObject()
                .Select(x => (x.Name, (IReadOnlyList<string>)x.Value.EnumerateArray().Select(y => y.GetString()!).ToArray())).ToArray();
            var order = GridFormula.Order(refs, out var cyclic);
            Assert.Equal(graph.GetProperty("order").EnumerateArray().Select(x => x.GetString()!), order);
            Assert.Equal(graph.GetProperty("cyclic").EnumerateArray().Select(x => x.GetString()!), cyclic);
        }
    }

    // ---- Shared parser vectors (gridFormula.vectors.json, also read by erp-web gridFormula.test.ts) ----

    private static JsonElement FormulaVectors()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "GridFormulaVectors.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return doc.RootElement.Clone();
    }

    private static IReadOnlySet<string> VectorColumns() =>
        FormulaVectors().GetProperty("columns").EnumerateArray().Select(x => x.GetString()!).ToHashSet(StringComparer.Ordinal);

    [Fact]
    public void Formula_vectors_valid_parse_with_refs()
    {
        var valid = FormulaVectors().GetProperty("valid").EnumerateArray().ToList();
        Assert.NotEmpty(valid);
        foreach (var vector in valid)
        {
            var text = vector.GetProperty("text").GetString()!;
            Assert.True(GridFormula.TryParse(text, VectorColumns(), out var refs, out var error), $"{text}: {error}");
            Assert.Equal(vector.GetProperty("refs").EnumerateArray().Select(x => x.GetString()!), refs);
        }
    }

    [Fact]
    public void Formula_vectors_invalid_are_rejected()
    {
        var invalid = FormulaVectors().GetProperty("invalid").EnumerateArray().ToList();
        Assert.NotEmpty(invalid);
        foreach (var vector in invalid)
        {
            var text = vector.GetString()!;
            Assert.False(GridFormula.TryParse(text, VectorColumns(), out _, out var error), text);
            Assert.StartsWith("Formül geçersiz (", error);
        }
    }

    [Fact]
    public void Formula_nesting_and_length_limits()
    {
        Assert.True(GridFormula.TryParse(new string('(', 19) + "1" + new string(')', 19), VectorColumns(), out _, out _));
        Assert.False(GridFormula.TryParse("quantity" + string.Concat(Enumerable.Repeat(" + 1", 60)), VectorColumns(), out _, out _));
    }

    // ---- lockColumnsWhen ----

    private static Action<JsonObject> Locks(params string[] rules) => p => p["lockColumnsWhen"] = new JsonArray([.. rules.Select(x => (JsonNode)JsonValue.Create(x)!)]);

    [Fact]
    public void Accepts_lock_rules_on_fill_lookup_and_formula_columns()
    {
        // unitPrice is a lookup fill target and lineNet a formula; both may be locked.
        AssertAccepted(Page(Locks("unitPrice,lineNet,lineVat=satir.isFree == true")));
        AssertAccepted(Page(Locks("unitPrice=satir.isFree == true && satir.quantity > 0", "note=satir.stockItemId == null")));
        // Quoted literals are not row paths.
        AssertAccepted(Page(Locks("note=satir.stockName == 'satir.unitPrice'")));
    }

    [Fact]
    public void Rejects_bad_lock_rules()
    {
        AssertRejected(Page(Locks()), "'lockColumnsWhen' 1–8");
        AssertRejected(Page(Locks([.. Enumerable.Repeat("note=satir.isFree == true", 9)])), "'lockColumnsWhen' 1–8");
        AssertRejected(Page(p => p["lockColumnsWhen"] = "unitPrice=satir.isFree == true"), "'lockColumnsWhen' 1–8");
        AssertRejected(Page(Locks("unitPrice")), "biçiminde olmalıdır");
        AssertRejected(Page(Locks("=satir.isFree == true")), "biçiminde olmalıdır");
        AssertRejected(Page(Locks("unitPrice=")), "biçiminde olmalıdır");
        AssertRejected(Page(Locks("unitPrice,unitPrice=satir.isFree == true")), "farklı sütun kodu");
        AssertRejected(Page(Locks("fiyat=satir.isFree == true")), "'lockColumnsWhen' sütunu ızgarada yok: fiyat");
        AssertRejected(Page(Locks("quantity=satir.isFree == true")), "'skipWhenZero' sütununu kilitleyemez: quantity");
        AssertRejected(Page(p => { p["rowNumberColumn"] = "lineNumber"; Locks("lineNumber=satir.isFree == true")(p); }), "sıra numarası sütununu kilitleyemez");
        AssertRejected(Page(Locks("unitPrice=satir.isFree ==")), "'lockColumnsWhen' koşulu geçersiz");
        AssertRejected(Page(Locks("unitPrice=siparis.value == null")), "yalnız satırın sütunlarına (satir.<sütun>) başvurabilir: siparis");
        AssertRejected(Page(Locks("unitPrice=satir.bedelsiz == true")), "ızgarada olmayan bir sütuna başvuruyor: bedelsiz");
        AssertRejected(Page(Locks("unitPrice,isFree=satir.isFree == true")), "kilitlediği sütuna başvuramaz: isFree");
    }

    [Fact]
    public void Rejects_lock_rules_on_calc_columns()
    {
        var page = Page(p =>
        {
            ((JsonArray)p["gridColumns"]!).Add("lineTotal|Tutar|calc:qk:unitPrice");
            Locks("lineTotal=satir.isFree == true")(p);
        });
        AssertRejected(page, "hesaplanan (calc) sütunu kilitleyemez: lineTotal");
    }
}
