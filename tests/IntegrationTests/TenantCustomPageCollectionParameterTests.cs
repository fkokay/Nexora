using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Proje 2 Faz B: list and map parameters of ERP operation queries (query rules only).</summary>
public sealed class TenantCustomPageCollectionParameterTests
{
    private static string V2(object[]? queries = null, object[]? components = null) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = queries ?? [],
        components = components ?? []
    });

    private static object Param(string name, string binding, string type = "text") => new { name, binding, type };

    private static object OpQuery(string id, string name, string kind, string operation, string runOn, params object[] parameters) =>
        new { id, name, kind, operation, parameters, runOn };

    private static readonly object[] CardInputs =
    [
        new { id = "c1", type = "input", name = "kod", props = new { inputType = "text" } },
        new { id = "c2", type = "input", name = "ad", props = new { inputType = "text" } }
    ];

    /// <summary>The components the collection bindings resolve to (Faz B component rules): a variant grid and a custom-fields block.</summary>
    private static readonly object VariantGrid =
        new { id = "g1", type = "editableGrid", name = "varyant", props = new { gridMode = "matrix", matrixCode = "{{kod.value}}", matrixName = "{{ad.value}}" } };

    private static readonly object CustomFieldsBlock =
        new { id = "cf", type = "customFieldsBlock", name = "ozel", props = new { definitionsQuery = "tanimlar" } };

    private static object Definitions() => OpQuery("tanimlar", "tanimlar", "read", "stok.ozelAlanTanimlari", "load");

    private static object Create(params object[] extra) =>
        OpQuery("olustur", "olustur", "insert", "stok.kart.olustur", "manual",
            [Param("code", "{{kod.value}}"), Param("name", "{{ad.value}}"), .. extra]);

    private static void AssertAccepted(string json) =>
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.NotNull(error);
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_list_parameter_with_satirlar_binding()
    {
        AssertAccepted(V2([Create(Param("variants", "{{varyant.satirlar}}", "list"))], [.. CardInputs, VariantGrid]));
    }

    [Fact]
    public void Accepts_map_parameter_with_degerler_binding()
    {
        AssertAccepted(V2([Definitions(), Create(Param("customFields", "{{ozel.degerler}}", "map"))], [.. CardInputs, CustomFieldsBlock]));
    }

    [Fact]
    public void Rejects_list_parameter_bound_to_value()
    {
        AssertRejected(V2([Create(Param("variants", "{{varyant.value}}", "list"))], CardInputs),
            "'olustur' sorgusundaki 'variants' parametresi {{<ızgara>.satirlar}} biçiminde bağlanmalıdır.");
        // Exactly two segments: deeper paths and bare roots are refused too.
        AssertRejected(V2([Create(Param("variants", "{{varyant.satirlar[0]}}", "list"))], CardInputs), "{{<ızgara>.satirlar}} biçiminde");
        AssertRejected(V2([Create(Param("variants", "{{varyant}}", "list"))], CardInputs), "{{<ızgara>.satirlar}} biçiminde");
        AssertRejected(V2([Create(Param("customFields", "{{ozel.satirlar}}", "map"))], CardInputs),
            "'olustur' sorgusundaki 'customFields' parametresi {{<blok>.degerler}} biçiminde bağlanmalıdır.");
    }

    [Fact]
    public void Rejects_map_type_mismatch()
    {
        AssertRejected(V2([Create(Param("customFields", "{{ozel.degerler}}", "text"))], CardInputs), "türü map olmalıdır");
        // A scalar parameter cannot be declared as a collection either.
        AssertRejected(V2([Create(Param("barcode", "{{ozel.degerler}}", "map"))], CardInputs), "türü text olmalıdır");
        AssertRejected(V2([Create(Param("variants", "{{varyant.satirlar}}", "map"))], CardInputs), "türü list olmalıdır");
    }

    [Fact]
    public void Rejects_list_type_on_sql_query()
    {
        var sql = new
        {
            id = "q1", name = "liste", kind = "read", runOn = "load", sql = "SELECT Code FROM CustomerAccounts WHERE Code <> @kod",
            parameters = new object[] { Param("kod", "{{varyant.satirlar}}", "list") }
        };
        AssertRejected(V2([sql]), "text, int, decimal, date, bool veya guid");
    }

    private static readonly object[] BodyMapComponents =
    [
        new { id = "t0", type = "input", name = "arama", props = new { inputType = "text" } },
        new { id = "t1", type = "dataTable", name = "liste", props = new { query = "liste" } },
        new { id = "c2", type = "input", name = "renk", props = new { inputType = "text" } },
        new { id = "cf", type = "customFieldsBlock", name = "ozel", props = new { definitionsQuery = "tanimlar", valuesQuery = "degerOku" } }
    ];

    private static object StockList() => OpQuery("liste", "kartlar", "read", "stok.kart.listele", "load", Param("q", "{{arama.value}}"));

    private static object CustomFieldRead(string idBinding = "{{liste.seciliSatir.id}}") =>
        OpQuery("degerOku", "degerler", "read", "stok.kart.ozelAlanDegerleri", "load", Param("id", idBinding, "guid"));

    private static object CustomFieldSave(string idBinding = "{{liste.seciliSatir.id}}") =>
        OpQuery("alanKaydet", "alanlar", "update", "stok.kart.ozelAlanKaydet", "manual", Param("id", idBinding, "guid"),
            Param("values", "{{ozel.degerler}}", "map"), Param("RENK", "{{renk.value}}"));

    [Fact]
    public void Accepts_values_map_on_body_map_operation()
    {
        AssertAccepted(V2([StockList(), Definitions(), CustomFieldRead(), CustomFieldSave()], BodyMapComponents));
        // Faz A's same-id rule still applies.
        AssertRejected(V2([StockList(), CustomFieldRead(), CustomFieldSave("{{liste.rows[0].id}}")], BodyMapComponents),
            "'id' bağlaması 'stok.kart.ozelAlanDegerleri' sorgusununkiyle aynı olmalıdır.");
        // A custom field code may not collide with the declared map parameter.
        AssertRejected(V2([StockList(), CustomFieldRead(),
                OpQuery("alanKaydet", "alanlar", "update", "stok.kart.ozelAlanKaydet", "manual",
                    Param("id", "{{liste.seciliSatir.id}}", "guid"), Param("VALUES", "{{renk.value}}"))], BodyMapComponents),
            "'VALUES' parametresi 'stok.kart.ozelAlanKaydet' işleminde tanımlı değil");
    }

    [Fact]
    public void Rejects_onceki_as_component_name()
    {
        AssertRejected(V2(components: [new { id = "c1", type = "input", name = "onceki", props = new { inputType = "text" } }]),
            "'onceki' ayrılmış bir addır; başka bir ad seçin.");
        AssertRejected(V2(components: [new { id = "c1", type = "input", name = "Onceki", props = new { inputType = "text" } }]),
            "ayrılmış bir addır");
    }

    [Fact]
    public void Rejects_onceki_as_query_name()
    {
        var sql = new { id = "q1", name = "onceki", kind = "read", runOn = "load", sql = "SELECT 1 AS x", parameters = Array.Empty<object>() };
        AssertRejected(V2([sql]), "'onceki' ayrılmış bir addır; başka bir ad seçin.");
    }

    private const string PageCode = "stok-kart";

    private static object SqlRead() => new
    {
        id = "q1", name = "liste", kind = "read", runOn = "load", sql = "SELECT Code FROM CustomerAccounts WHERE Code <> @kod",
        parameters = new object[] { Param("kod", "{{kod.value}}") }
    };

    /// <summary>Creates and publishes (AdminsOnly) a page with the SQL read q1 and the create query bound to a variant list.</summary>
    private static async Task PublishCollectionPageAsync(WebApplication app, HttpClient client)
    {
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, CustomPageQueryEndpointsIntegrationTests.Admin, "TenantAdmin");
        var definition = new
        {
            schemaVersion = 2,
            queries = new[] { SqlRead(), Create(Param("variants", "{{varyant.satirlar}}", "list")) },
            components = CardInputs.Append(VariantGrid).ToArray()
        };
        var created = await TemplatelessPageSeed.PostDraftAsync(app.Services, client, PageCode, "Stok kartı", definition);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{PageCode}/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
    }

    [Fact]
    public async Task Run_endpoint_refuses_operation_query()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await CustomPageQueryEndpointsIntegrationTests.StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishCollectionPageAsync(app, client);

        var run = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/olustur/run",
            new { parameters = new { code = "A", name = "B", variants = new[] { new { code = "A-1", name = "B 1" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, run.StatusCode);
        Assert.Equal(CustomPageQueryEndpoints.OperationQueryRunError, (await run.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Published_page_with_collection_parameter_runs_sql_query()
    {
        // The factory reports "unavailable": reaching it proves the SQL read passed loading and parameter conversion.
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await CustomPageQueryEndpointsIntegrationTests.StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishCollectionPageAsync(app, client);

        var published = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{PageCode}/published");
        Assert.Contains("varyant.satirlar", published.GetProperty("definitionJson").GetString(), StringComparison.Ordinal);
        var run = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/q1/run", new { parameters = new { kod = "X" } });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, run.StatusCode);
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);
    }
}
