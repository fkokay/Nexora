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
}
