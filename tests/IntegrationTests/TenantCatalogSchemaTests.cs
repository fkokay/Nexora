using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Tenant catalog bundle (schemaVersion 1): strict keys, SQL/operation exclusivity, parameter agreement and limits.</summary>
public sealed class TenantCatalogSchemaTests
{
    private const string ValidBundle = """
        { "schemaVersion": 1,
          "dataSources": [ { "code": "cariler", "label": "Cari hesaplar",
              "source": { "sql": "SELECT Kod, Unvan FROM Cari WHERE Unvan LIKE @q" },
              "parameters": [ { "name": "q", "type": "text" } ],
              "columns": [ { "code": "Kod", "label": "Cari kodu", "type": "text", "key": true } ],
              "opens": "cari-karti" } ],
          "actions": [ { "code": "cariSil", "label": "Sil", "target": "row", "kind": "delete",
              "run": { "erpOperation": "cari.sil" }, "confirm": { "text": "Cari silinsin mi?" } } ] }
        """;

    private static string Reject(string json)
    {
        Assert.False(TenantCatalogSchema.TryParse(json, ErpOperationCatalog.TryGet, out var bundle, out var error));
        Assert.Null(bundle);
        Assert.False(string.IsNullOrWhiteSpace(error));
        return error!;
    }

    private static string DataSource(string source, string parameters = "[]", string code = "cariler") =>
        $$"""{ "schemaVersion": 1, "dataSources": [ { "code": "{{code}}", "label": "L", "source": {{source}}, "parameters": {{parameters}} } ] }""";

    private static string Action(string run, string kind = "update", string code = "pasifeAl") =>
        $$"""{ "schemaVersion": 1, "actions": [ { "code": "{{code}}", "label": "L", "target": "row", "kind": "{{kind}}", "run": {{run}} } ] }""";

    [Fact]
    public void Valid_bundle_parses_items_in_order()
    {
        Assert.True(TenantCatalogSchema.TryParse(ValidBundle, ErpOperationCatalog.TryGet, out var bundle, out var error), error);
        Assert.NotNull(bundle);
        Assert.Equal(["cariler", "cariSil"], bundle!.Items.Select(x => x.Code));
        var source = bundle.Find("cariler")!;
        Assert.NotNull(source.Sql);
        Assert.Equal("dataSource", source.ItemKind);
        Assert.Equal("read", source.QueryKind);
        Assert.Equal("q", Assert.Single(source.Parameters).Name);
        Assert.True(Assert.Single(source.Columns).Key);
        Assert.Equal("cari-karti", source.Opens);
        var action = bundle.Find("cariSil")!;
        Assert.Equal("cari.sil", action.ErpOperation);
        Assert.Equal("action", action.ItemKind);
        Assert.Equal("delete", action.QueryKind);
        Assert.Equal("row", action.Target);
        Assert.Equal("Cari silinsin mi?", action.ConfirmText);
        Assert.Empty(action.Parameters);
        Assert.Null(bundle.Find("yok"));
    }

    [Fact]
    public void Rejects_unknown_key()
    {
        var error = Reject(ValidBundle.Replace("\"opens\": \"cari-karti\"", "\"opens\": \"cari-karti\", \"extra\": 1"));
        Assert.Contains("dataSources[0] (cariler)", error);
    }

    [Fact]
    public void Rejects_permission_on_action()
    {
        var error = Reject(ValidBundle.Replace("\"target\": \"row\"", "\"target\": \"row\", \"permission\": \"x\""));
        Assert.Contains("actions[0] (cariSil)", error);
    }

    [Fact]
    public void Rejects_both_sql_and_operation()
    {
        var error = Reject(DataSource("""{ "sql": "SELECT Kod FROM Cari", "erpOperation": "cari.listele" }"""));
        Assert.Contains("dataSources[0] (cariler)", error);
    }

    [Fact]
    public void Rejects_write_sql_in_data_source()
    {
        var error = Reject(DataSource("""{ "sql": "UPDATE Cari SET Unvan = @u" }""", """[ { "name": "u", "type": "text" } ]"""));
        Assert.Contains("dataSources[0] (cariler)", error);
    }

    [Fact]
    public void Rejects_read_kind_action()
    {
        var error = Reject(Action("""{ "erpOperation": "cari.listele" }""", "read"));
        Assert.Contains("actions[0] (pasifeAl)", error);
    }

    [Fact]
    public void Rejects_sql_parameter_mismatch()
    {
        var error = Reject(DataSource("""{ "sql": "SELECT Kod FROM Cari WHERE Unvan LIKE @q" }"""));
        Assert.Contains("dataSources[0] (cariler)", error);
        Assert.Contains("SQL parametreleri", error);
    }

    [Fact]
    public void Rejects_duplicate_code_across_kinds()
    {
        var json = """
            { "schemaVersion": 1,
              "dataSources": [ { "code": "ortak", "label": "L", "source": { "erpOperation": "cari.listele" } } ],
              "actions": [ { "code": "ortak", "label": "L", "kind": "delete", "run": { "erpOperation": "cari.sil" } } ] }
            """;
        var error = Reject(json);
        Assert.Contains("actions[0] (ortak)", error);
    }

    [Fact]
    public void Rejects_unknown_operation()
    {
        var error = Reject(Action("""{ "erpOperation": "yok.yok" }"""));
        Assert.Contains("actions[0] (pasifeAl)", error);
        Assert.Contains("yok.yok", error);
    }

    [Fact]
    public void Rejects_operation_with_kind_mismatch()
    {
        var error = Reject(Action("""{ "erpOperation": "cari.listele" }"""));
        Assert.Contains("actions[0] (pasifeAl)", error);
    }

    [Fact]
    public void Rejects_operation_with_source_operation()
    {
        // cari.pasifeAl reads the whole card through a source operation (cari.getir), so it needs a source query on the page.
        Assert.True(ErpOperationCatalog.TryGet("cari.pasifeAl", out var operation));
        Assert.NotNull(operation.SourceOperation);
        var error = Reject(Action("""{ "erpOperation": "cari.pasifeAl" }"""));
        Assert.Contains("actions[0] (pasifeAl)", error);
    }

    [Fact]
    public void Rejects_oversized_bundle()
    {
        var error = Reject(new string(' ', 512 * 1024 + 1));
        Assert.Contains("Katalog paketi", error);
    }

    [Fact]
    public void Rejects_invalid_code()
    {
        var error = Reject(DataSource("""{ "erpOperation": "cari.listele" }""", code: "1-bad"));
        Assert.Contains("dataSources[0]", error);
    }

    [Fact]
    public void Accepts_valid_action_sql_and_rejects_malformed_json()
    {
        var json = Action("""{ "sql": "UPDATE Cari SET Unvan = @u WHERE Kod = @kod" }""");
        var withParameters = json.Replace("\"run\":", "\"parameters\": [ { \"name\": \"u\", \"type\": \"text\" }, { \"name\": \"kod\", \"type\": \"text\" } ], \"run\":");
        Assert.True(TenantCatalogSchema.TryParse(withParameters, ErpOperationCatalog.TryGet, out var bundle, out var error), error);
        Assert.Equal(2, bundle!.Find("pasifeAl")!.Parameters.Count);
        Assert.Contains("JSON", Reject("{ not json"));
        using var _ = JsonDocument.Parse(withParameters);
    }

    private static string WithColumn(string column) =>
        $$"""{ "schemaVersion": 1, "dataSources": [ { "code": "d", "label": "L", "source": { "sql": "SELECT 1" }, "columns": [ {{column}} ] } ] }""";

    [Fact]
    public void Column_long_text_required_max_length_are_parsed()
    {
        Assert.True(TenantCatalogSchema.TryParse(WithColumn("""{ "code": "Not", "label": "Not", "type": "text", "longText": true, "required": true, "maxLength": 500 }"""),
            ErpOperationCatalog.TryGet, out var bundle, out var error), error);
        var column = Assert.Single(bundle!.Find("d")!.Columns);
        Assert.True(column.LongText);
        Assert.True(column.Required);
        Assert.Equal(500, column.MaxLength);
    }

    [Fact]
    public void Old_catalog_without_flags_still_parses()
    {
        Assert.True(TenantCatalogSchema.TryParse(ValidBundle, ErpOperationCatalog.TryGet, out var bundle, out var error), error);
        var column = Assert.Single(bundle!.Find("cariler")!.Columns);
        Assert.False(column.LongText);
        Assert.False(column.Required);
        Assert.Null(column.MaxLength);
    }

    [Theory]
    [InlineData("int")]
    [InlineData("date")]
    [InlineData("bool")]
    public void Long_text_on_non_text_column_is_rejected(string type)
    {
        Assert.Contains("longText", Reject(WithColumn($$"""{ "code": "A", "label": "A", "type": "{{type}}", "longText": true }""")));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("4001")]
    [InlineData("-1")]
    [InlineData("1.5")]
    [InlineData("\"10\"")]
    public void Max_length_out_of_range_is_rejected(string value)
    {
        Assert.Contains("maxLength", Reject(WithColumn($$"""{ "code": "A", "label": "A", "type": "text", "maxLength": {{value}} }""")));
    }

    [Fact]
    public void Max_length_on_non_text_column_is_rejected()
    {
        Assert.Contains("maxLength", Reject(WithColumn("""{ "code": "A", "label": "A", "type": "int", "maxLength": 10 }""")));
    }

    [Fact]
    public void Max_length_bounds_are_accepted()
    {
        Assert.True(TenantCatalogSchema.TryParse(WithColumn("""{ "code": "A", "label": "A", "type": "text", "maxLength": 1 }"""), ErpOperationCatalog.TryGet, out _, out var e1), e1);
        Assert.True(TenantCatalogSchema.TryParse(WithColumn("""{ "code": "A", "label": "A", "type": "text", "maxLength": 4000 }"""), ErpOperationCatalog.TryGet, out _, out var e2), e2);
    }

    [Theory]
    [InlineData("\"required\": \"true\"")]
    [InlineData("\"required\": 1")]
    [InlineData("\"longText\": \"yes\"")]
    public void Required_must_be_bool(string flag)
    {
        Assert.Contains("kolon", Reject(WithColumn($$"""{ "code": "A", "label": "A", "type": "text", {{flag}} }""")));
    }

    // ---- Yazılımcı bileşeni (components) ----

    private const string ComponentJs = "bridge.ready();";

    private static string ComponentBundle(string components, string extra = "") =>
        $$"""{ "schemaVersion": 1{{extra}}, "components": [ {{components}} ] }""";

    private static string Component(string code = "satisGrafigi", string settings = "[]", string js = ComponentJs, string css = ".k { color: red; }", string more = "") =>
        $$"""{ "code": "{{code}}", "label": "Satış grafiği", "css": {{JsonSerializer.Serialize(css)}}, "javascript": {{JsonSerializer.Serialize(js)}}, "settings": {{settings}}{{more}} }""";

    private static string Settings(int count) =>
        "[" + string.Join(", ", Enumerable.Range(0, count).Select(i => $$"""{ "name": "a{{i}}", "label": "A", "type": "text" }""")) + "]";

    private static void Accept(string json)
    {
        Assert.True(TenantCatalogSchema.TryParse(json, ErpOperationCatalog.TryGet, out _, out var error), error);
    }

    [Fact]
    public void Component_is_parsed_with_settings_and_defaults()
    {
        var json = ComponentBundle(Component(settings: """
            [ { "name": "baslik", "label": "Başlık", "type": "text", "default": "Satışlar" },
              { "name": "adet", "label": "Adet", "type": "number", "default": 5 },
              { "name": "goster", "label": "Göster", "type": "bool" },
              { "name": "tur", "label": "Tür", "type": "choice", "options": [ "cizgi", "sutun" ], "default": "sutun" } ]
            """, more: """, "description": "Aylık satış", "height": 320"""));

        Assert.True(TenantCatalogSchema.TryParse(json, ErpOperationCatalog.TryGet, out var bundle, out var error), error);
        Assert.Empty(bundle!.Items);
        var component = Assert.Single(bundle.Components);
        Assert.Same(component, bundle.FindComponent("satisGrafigi"));
        Assert.Null(bundle.FindComponent("SatisGrafigi"));
        Assert.Equal("Satış grafiği", component.Label);
        Assert.Equal("Aylık satış", component.Description);
        Assert.Equal(".k { color: red; }", component.Css);
        Assert.Equal(ComponentJs, component.JavaScript);
        Assert.Equal(320, component.Height);
        Assert.Equal(["baslik", "adet", "goster", "tur"], component.Settings.Select(x => x.Name));
        Assert.Equal(["text", "number", "bool", "choice"], component.Settings.Select(x => x.Type));
        Assert.Equal("Satışlar", component.Settings[0].Default!.Value.GetString());
        Assert.Equal(5, component.Settings[1].Default!.Value.GetInt32());
        Assert.Null(component.Settings[2].Default);
        Assert.Equal(["cizgi", "sutun"], component.Settings[3].Options);
        Assert.Empty(component.Settings[0].Options);
        Assert.Equal("sutun", component.Settings[3].Default!.Value.GetString());

        // Optional keys: no description, no css, no settings, default height 240.
        Assert.True(TenantCatalogSchema.TryParse(ComponentBundle("""{ "code": "a", "label": "A", "javascript": "x();" }"""), ErpOperationCatalog.TryGet, out var minimal, out error), error);
        var plain = Assert.Single(minimal!.Components);
        Assert.Null(plain.Description);
        Assert.Equal("", plain.Css);
        Assert.Equal(240, plain.Height);
        Assert.Empty(plain.Settings);
    }

    [Fact]
    public void Component_code_must_be_unique_across_items()
    {
        var withSource = """, "dataSources": [ { "code": "cariler", "label": "L", "source": { "sql": "SELECT Kod FROM Cari" } } ]""";
        Assert.Contains("kod başka bir öğede de kullanılmış", Reject(ComponentBundle(Component("cariler"), withSource)));
        Assert.Contains("kod başka bir öğede de kullanılmış", Reject(ComponentBundle(Component("a") + ", " + Component("a"))));
        Accept(ComponentBundle(Component("a"), withSource));
    }

    [Theory]
    [InlineData("Satis")]
    [InlineData("1satis")]
    [InlineData("satis_grafik")]
    [InlineData("satis-grafik")]
    [InlineData("a1234567890123456789012345678901234567890")]
    public void Component_code_pattern_is_enforced(string code)
    {
        Assert.Contains("Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.", Reject(ComponentBundle(Component(code))));
    }

    [Fact]
    public void Component_without_javascript_is_rejected()
    {
        const string message = "Katalog bileşeninin kodu ve JavaScript'i olmalı.";
        Assert.Contains(message, Reject(ComponentBundle("""{ "code": "a", "label": "A" }""")));
        Assert.Contains(message, Reject(ComponentBundle("""{ "code": "a", "label": "A", "javascript": "   " }""")));
        Assert.Contains(message, Reject(ComponentBundle("""{ "label": "A", "javascript": "x();" }""")));
    }

    [Theory]
    [InlineData("@import 'x.css';")]
    [InlineData(".k { background: url(https://x/y.png); }")]
    [InlineData(".k { width: expression(1); }")]
    public void Component_css_with_external_resource_is_rejected(string css)
    {
        Assert.Contains("css", Reject(ComponentBundle(Component(css: css))));
    }

    [Fact]
    public void Component_over_limits_is_rejected()
    {
        Assert.Contains("Katalog bileşeni en fazla 10 ayar tanımlayabilir.", Reject(ComponentBundle(Component(settings: Settings(11)))));
        Accept(ComponentBundle(Component(settings: Settings(10))));

        Assert.Contains("javascript", Reject(ComponentBundle(Component(js: new string('x', 20001)))));
        Accept(ComponentBundle(Component(js: new string('x', 20000))));
        Assert.Contains("css", Reject(ComponentBundle(Component(css: new string('x', 4001)))));

        var many = string.Join(", ", Enumerable.Range(0, 101).Select(i => $$"""{ "code": "b{{i}}", "label": "B", "javascript": "x();" }"""));
        Assert.Contains("en fazla 100", Reject(ComponentBundle(many)));
        Accept(ComponentBundle(string.Join(", ", Enumerable.Range(0, 100).Select(i => $$"""{ "code": "b{{i}}", "label": "B", "javascript": "x();" }"""))));

        Assert.Contains("height", Reject(ComponentBundle(Component(more: """, "height": 79"""))));
        Assert.Contains("height", Reject(ComponentBundle(Component(more: """, "height": 1201"""))));
        Accept(ComponentBundle(Component(more: """, "height": 80""")));
        Accept(ComponentBundle(Component(more: """, "height": 1200""")));
        Assert.Contains("etiket", Reject(ComponentBundle("""{ "code": "a", "label": "", "javascript": "x();" }""")));
        Assert.Contains("etiket", Reject(ComponentBundle($$"""{ "code": "a", "label": "{{new string('e', 81)}}", "javascript": "x();" }""")));
        Assert.Contains("açıklama", Reject(ComponentBundle(Component(more: $$""", "description": "{{new string('d', 201)}}" """))));
        Assert.Contains("bilinmeyen", Reject(ComponentBundle(Component(more: """, "sql": "SELECT 1" """))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "text", "extra": 1 } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "date" } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "A", "label": "A", "type": "text" } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: $$"""[ { "name": "a", "label": "{{new string('e', 61)}}", "type": "text" } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "text" }, { "name": "a", "label": "B", "type": "text" } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "number", "default": "5" } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "bool", "default": 1 } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "text", "options": [ "x" ] } ]"""))));
    }

    [Fact]
    public void Choice_setting_needs_options_and_default_in_options()
    {
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "choice" } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "choice", "options": [] } ]"""))));
        var many = "[" + string.Join(", ", Enumerable.Range(0, 21).Select(i => $"\"s{i}\"")) + "]";
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: $$"""[ { "name": "a", "label": "A", "type": "choice", "options": {{many}} } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "choice", "options": [ "x", "x" ] } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "choice", "options": [ "x", 1 ] } ]"""))));
        Assert.Contains("ayar", Reject(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "choice", "options": [ "x", "y" ], "default": "z" } ]"""))));
        Accept(ComponentBundle(Component(settings: """[ { "name": "a", "label": "A", "type": "choice", "options": [ "x", "y" ], "default": "y" } ]""")));
    }

    [Fact]
    public void Bundle_without_components_still_valid()
    {
        Assert.True(TenantCatalogSchema.TryParse(ValidBundle, ErpOperationCatalog.TryGet, out var bundle, out var error), error);
        Assert.Empty(bundle!.Components);
        Assert.Null(bundle.FindComponent("cariler"));
        Assert.Empty(new CatalogBundle([]).Components);
        Assert.Contains("dizi", Reject("""{ "schemaVersion": 1, "components": {} }"""));
    }

    [Fact]
    public void Lenient_read_sets_an_invalid_component_aside()
    {
        var json = ComponentBundle(Component("iyi") + ", " + Component("kotu", css: "@import 'x';"));
        Reject(json);
        Assert.True(TenantCatalogSchema.TryParseLenient(json, ErpOperationCatalog.TryGet, out var bundle, out var problems, out var error), error);
        Assert.Equal(["iyi"], bundle!.Components.Select(x => x.Code));
        Assert.Equal(["kotu"], bundle.InvalidCodes);
        Assert.Single(problems);
    }
}
