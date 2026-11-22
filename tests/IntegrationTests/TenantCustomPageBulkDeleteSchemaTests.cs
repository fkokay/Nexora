using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// dataTable <c>bulkDeleteQuery</c> (schema v2): "Seçilenleri sil" runs a manual delete query once per ticked row, the row bound
/// as <c>{{&lt;table&gt;.seciliSatir…}}</c>. The query must exist, be a delete, bind the table's selected row, and the table must be
/// named and bound to a query.
/// </summary>
public sealed class TenantCustomPageBulkDeleteSchemaTests
{
    private static object List() => new { id = "cariler", name = "cariler", kind = "read", operation = "cari.listele", parameters = Array.Empty<object>(), runOn = "load" };
    private static object Delete(string binding = "{{liste.seciliSatir.id}}", string kind = "delete", string operation = "cari.sil") =>
        new { id = "kartSil", name = "kartSil", kind, operation, parameters = new[] { new { name = "id", binding, type = "guid" } }, runOn = "manual" };

    private static string Page(object table, object? delete = null) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new[] { List(), delete ?? Delete() },
        components = new[] { table }
    });

    private static object Table(object props, string? name = "liste") => name is null
        ? new { id = "liste", type = "dataTable", props }
        : new { id = "liste", type = "dataTable", name, props };

    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void A_named_query_table_may_bulk_delete_with_a_delete_query_bound_to_its_selected_row() =>
        Assert.True(TenantCustomPageSchema.Validate(Page(Table(new { query = "cariler", bulkDeleteQuery = "kartSil" })), out var error), error);

    [Fact]
    public void Bulk_delete_needs_an_existing_delete_query()
    {
        AssertRejected(Page(Table(new { query = "cariler", bulkDeleteQuery = "yok" })), "'bulkDeleteQuery' sorgusu sayfada yok");
        AssertRejected(Page(Table(new { query = "cariler", bulkDeleteQuery = "cariler" })), "elle çalışan delete türünde");
        AssertRejected(Page(Table(new { query = "cariler", bulkDeleteQuery = 1 })), "'bulkDeleteQuery' sorgusu sayfada yok");
    }

    [Fact]
    public void Bulk_delete_needs_a_named_query_table_and_a_row_bound_query()
    {
        AssertRejected(Page(Table(new { query = "cariler", bulkDeleteQuery = "kartSil" }, name: null)), "Toplu silme için veri listesinin adı olmalıdır");
        AssertRejected(Page(Table(new { query = "cariler", bulkDeleteQuery = "kartSil" }), Delete("{{cariler.rows[0].id}}")), "seçili satırına bağlı olmalıdır");
        AssertRejected(Page(new { id = "metin", type = "text", props = new { text = "Metin", bulkDeleteQuery = "kartSil" } }), "'bulkDeleteQuery' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Customers_standard_uses_bulk_delete_on_its_list()
    {
        var standard = JsonDocument.Parse(SystemPageStandards.EmbeddedFiles().Single(x => x.FileName == "customers.json").Json).RootElement;
        var definition = standard.GetProperty("definition");
        var list = definition.GetProperty("components").EnumerateArray().Single(x => x.GetProperty("id").GetString() == "liste");
        Assert.Equal("kartSil", list.GetProperty("props").GetProperty("bulkDeleteQuery").GetString());
        var query = definition.GetProperty("queries").EnumerateArray().Single(x => x.GetProperty("id").GetString() == "kartSil");
        Assert.Equal(("delete", "cari.sil", "manual"), (query.GetProperty("kind").GetString(), query.GetProperty("operation").GetString(), query.GetProperty("runOn").GetString()));
        var bar = definition.GetProperty("components").EnumerateArray().Single(x => x.GetProperty("id").GetString() == "komutlar").GetProperty("props");
        Assert.Equal("kartSil", bar.GetProperty("deleteQuery").GetString());
        Assert.DoesNotContain("delete", bar.GetProperty("hiddenCommands").EnumerateArray().Select(x => x.GetString()));
        Assert.True(TenantCustomPageSchema.Validate(definition.GetRawText(), out var error), error);
    }
}
