using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Süzgeç alanı (filterBar): tabloya bağlı arama kutusu ve süzgeçlerin sunucu doğrulaması.</summary>
public sealed class TenantCustomPageFilterBarTests
{
    private static string V2(object[] queries, params object[] components) => JsonSerializer.Serialize(new { schemaVersion = 2, queries, components });
    private static object Param(string name, string binding, string type = "text") => new { name, binding, type };
    private static object CustomersQuery(params object[] parameters) => new
    {
        id = "q1", name = "musteriler", kind = "read", runOn = "load", parameters,
        sql = parameters.Length == 0 ? "SELECT Code, Name, Type FROM CustomerAccounts" : "SELECT Code, Name, Type FROM CustomerAccounts WHERE Type = @tur",
    };
    private static object TypesQuery() => new { id = "q2", name = "turler", kind = "read", runOn = "load", parameters = Array.Empty<object>(), sql = "SELECT DISTINCT Type FROM CustomerAccounts" };
    private static readonly object Table = new { id = "t1", type = "dataTable", name = "liste", props = new { query = "q1", columns = new[] { "Code", "Name", "Type" } } };
    private static object Bar(object props, string name = "suzgec") => new { id = "f1", type = "filterBar", name, props };

    private static void AssertValid(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_client_side_search_and_filters()
    {
        AssertValid(V2([CustomersQuery(), TypesQuery()], Table, Bar(new
        {
            table = "t1", search = true, searchPlaceholder = "Kod veya adla ara", searchColumns = new[] { "Code", "Name" },
            filters = new[] { "Type|select|row||Tür|q2:Type", "Name|text|more", "Code|auto|more|||" },
        })));
    }

    [Fact]
    public void Accepts_server_parameter_bound_to_filter_bar()
    {
        AssertValid(V2([CustomersQuery(Param("tur", "{{suzgec.tur}}"))], Table, Bar(new { table = "t1", filters = new[] { "Type|select|row|tur" } })));
    }

    [Fact]
    public void Rejects_parameter_missing_from_query_or_bound_elsewhere()
    {
        AssertRejected(V2([CustomersQuery()], Table, Bar(new { table = "t1", filters = new[] { "Type|select|row|tur" } })), "'tur' parametresi 'musteriler' sorgusunda tanımlı değil");
        AssertRejected(V2([CustomersQuery(Param("tur", "{{baska.value}}"))], Table, Bar(new { table = "t1", filters = new[] { "Type|select|row|tur" } })),
            "{{suzgec.tur}} ile bağlanmalıdır");
    }

    [Theory]
    [InlineData("Type|liste|row", "anahtar|tür|yer")]
    [InlineData("Type|text|left", "anahtar|tür|yer")]
    [InlineData("Type|text", "anahtar|tür|yer")]
    [InlineData("Type|text|row|tur|Etiket|q2|fazla", "anahtar|tür|yer")]
    [InlineData("Type|range|row|tur", "Aralık ve tarih süzgeçleri yalnız bu sayfada uygulanır")]
    [InlineData("Type|text|row|1tur", "parametre adı geçersiz")]
    [InlineData("Type|text|row||Etiket|q2", "yalnız seçim süzgecinde")]
    [InlineData("Type|select|row|||yok", "okuma sorgusu olmalıdır")]
    public void Rejects_malformed_filter_entries(string entry, string contains)
    {
        AssertRejected(V2([CustomersQuery(), TypesQuery()], Table, Bar(new { table = "t1", filters = new[] { entry } })), contains);
    }

    [Fact]
    public void Rejects_structural_mistakes()
    {
        var queries = new[] { CustomersQuery(), TypesQuery() };
        AssertRejected(V2(queries, Table, new { id = "f1", type = "filterBar", props = new { table = "t1", search = true } }), "Süzgeç alanının adı olmalıdır");
        AssertRejected(V2(queries, Table, Bar(new { search = true })), "'table'");
        AssertRejected(V2(queries, Table, Bar(new { table = "yok", search = true })), "sorguya bağlı bir veri listesi olmalıdır: yok");
        AssertRejected(V2(queries, Table, Bar(new { table = "t1" })), "arama kutusu ya da en az bir süzgeç");
        AssertRejected(V2(queries, Table, Bar(new { table = "t1", searchColumns = new[] { "Code" }, filters = new[] { "Type|text|row" } })), "yalnız arama kutusu açıkken");
        AssertRejected(V2(queries, Table, Bar(new { table = "t1", filters = new[] { "Type|text|row", "Type|select|more" } })), "benzersiz");
        AssertRejected(V2(queries, Table, Bar(new { table = "t1", search = true, searchParam = "tur", filters = new[] { "Type|select|row|tur" } })), "birden fazla kez");
        AssertRejected(V2(queries, Table, Bar(new { table = "t1", search = "evet" })), "'search' true veya false");
        // Süzgeç alanı özellikleri yalnız bu bileşende.
        AssertRejected(V2(queries, new { id = "t1", type = "dataTable", props = new { query = "q1", filters = new[] { "Type|text|row" } } }), "'filters' özelliği bu bileşen türünde kullanılamaz");
        AssertRejected(V2(queries, Table, new { id = "x1", type = "metric", props = new { table = "t1" } }), "'table' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Filter_bar_bound_to_the_stock_list_validates()
    {
        var standard = SystemPageStandards.All["inventory-stock"];
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        var components = definition["components"]!.AsArray();
        // Yalnız sayfada uygulanan süzgeçler: standardın sorgusuna dokunulmaz.
        components.Add(JsonNode.Parse("""
            { "id": "stokSuzgec", "type": "filterBar", "name": "stokSuzgec", "props": { "table": "liste", "search": true,
              "searchPlaceholder": "Kod veya stok adıyla ara", "searchColumns": ["balance.code", "balance.name"],
              "filters": ["stockItem.category|select|more", "balance.quantityOnHand|range|more||Depo bakiyesi", "status|auto|row"] } }
            """));
        var clientOnly = definition.ToJsonString();
        Assert.True(TenantCustomPageSchema.Validate(clientOnly, out var error), error);

        // Sunucuya giden süzgeçler: Stok Kartları'nın kendi süzgeç alanı (suzgec) arama, depo ve pasifler parametrelerini taşır.
        var serverParams = standard.DefinitionJson;
        var query = definition["queries"]!.AsArray().Single(x => (string)x!["id"]! == "bakiye")!;
        foreach (var name in new[] { "q", "warehouseId", "includeInactive" })
            Assert.Equal($"{{{{suzgec.{name}}}}}", (string)query["parameters"]!.AsArray().Single(x => (string)x!["name"]! == name)!["binding"]!);
        var bar = components.Single(x => (string)x!["id"]! == "suzgec")!["props"]!.AsObject();

        // SQL'siz sistem sayfası: süzgeç alanı sayfa haklarını değiştirmez (her işlem kendi uç noktasında yetkilendirilir).
        var viewOnly = new CustomPageRights(true, false, false, false);
        Assert.Equal(new CustomPageRightsView(true, true, true, true), SystemPageEndpoints.RuntimeRights(viewOnly, serverParams));

        // Sayfa parametresi (page) süzgeç alanına bağlanamaz: listenin {{liste.sayfa}} bağlaması kalmalıdır.
        bar["filters"]!.AsArray().Add("page|text|more|page");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("{{suzgec.page}}", error);
    }

    [Fact]
    public void Action_bar_filter_command_may_focus_a_search_bar()
    {
        object ActionBar(string focus) => new { id = "ab1", type = "actionBar", props = new { focusInput = focus } };
        AssertValid(V2([CustomersQuery()], Table, Bar(new { table = "t1", search = true }), ActionBar("f1")));
        // Arama kutusu olmayan süzgeç alanına odaklanılamaz.
        AssertRejected(V2([CustomersQuery()], Table, Bar(new { table = "t1", filters = new[] { "Type|text|row" } }), ActionBar("f1")),
            "arama kutulu süzgeç alanı değil");
    }
}
