using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Karar 1: a catalog reference (data source or action) needs only page write permission; inline SQL stays TenantAdmin-only.</summary>
public sealed class TenantCustomPageCatalogWriteGateTests
{
    private static readonly Guid Ayse = CustomPageCatalogReferenceEndpointsIntegrationTests.Ayse;

    private static JsonElement InlineSqlPage() => JsonDocument.Parse(CustomPageCatalogReferenceSchemaTests.Page(
        new { id = "q1", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" })).RootElement;

    [Fact]
    public async Task Non_admin_can_save_page_referencing_catalog_action_and_sql_data_source()
    {
        await using var app = await CustomPageCatalogReferenceEndpointsIntegrationTests.StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");

        var both = JsonDocument.Parse(CustomPageCatalogReferenceSchemaTests.Page(
            CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariler"),
            new Dictionary<string, object>
            {
                ["id"] = "q2", ["name"] = "sil", ["kind"] = "delete", ["action"] = "cariSil", ["runOn"] = "manual",
                ["parameters"] = new object[] { new { name = "id", binding = "{{arama.value}}", type = "guid" } },
            })).RootElement;
        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "cari-liste", name = "Cari liste", definition = both });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{id}",
            new { expectedRevision = 1, name = "Cari liste 2", definition = both })).StatusCode);
    }

    [Fact]
    public async Task Non_admin_still_cannot_save_inline_sql()
    {
        await using var app = await CustomPageCatalogReferenceEndpointsIntegrationTests.StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "ic-sql", name = "İç SQL", definition = InlineSqlPage() })).StatusCode);

        // Mixing a catalog reference with inline SQL is still inline SQL.
        var mixed = JsonDocument.Parse(CustomPageCatalogReferenceSchemaTests.Page(
            CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariler"),
            new { id = "q2", name = "ic", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" })).RootElement;
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "karisik", name = "Karışık", definition = mixed })).StatusCode);

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, CustomPageQueryEndpointsIntegrationTests.Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "ic-sql", name = "İç SQL", definition = InlineSqlPage() })).StatusCode);
    }
}
