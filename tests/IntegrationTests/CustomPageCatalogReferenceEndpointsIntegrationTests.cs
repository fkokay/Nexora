using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Save and publish gates for pages whose queries reference the tenant's active catalog.</summary>
public sealed class CustomPageCatalogReferenceEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private const string Bundle = """
        { "schemaVersion": 1,
          "dataSources": [ { "code": "cariler", "label": "Cari hesaplar",
              "source": { "sql": "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q" },
              "parameters": [ { "name": "q", "type": "text" } ] },
            { "code": "cariListe", "label": "Cari liste", "source": { "erpOperation": "cari.listele" } } ],
          "actions": [ { "code": "cariSil", "label": "Sil", "target": "row", "kind": "delete", "run": { "erpOperation": "cari.sil" } } ] }
        """;

    private static JsonElement DataSourcePage() =>
        JsonDocument.Parse(CustomPageCatalogReferenceSchemaTests.Page(CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariler"))).RootElement;

    private static JsonElement ActionPage() => JsonDocument.Parse(CustomPageCatalogReferenceSchemaTests.Page(
        CustomPageCatalogReferenceSchemaTests.Reference("action", "cariSil", "delete", [new { name = "id", binding = "{{arama.value}}", type = "guid" }], "manual"))).RootElement;

    private static JsonElement OperationDataSourcePage() => JsonDocument.Parse(CustomPageCatalogReferenceSchemaTests.Page(
        CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariListe", parameters: []))).RootElement;

    [Fact]
    public async Task Non_admin_can_save_page_with_operation_backed_data_source_reference()
    {
        await using var app = await StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");

        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "cari-liste", name = "Cari liste", definition = OperationDataSourcePage() });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{id}",
            new { expectedRevision = 1, name = "Cari liste 2", definition = OperationDataSourcePage() })).StatusCode);
    }

    [Fact]
    public async Task Non_admin_cannot_save_or_publish_page_with_sql_backed_data_source_reference()
    {
        await using var app = await StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "cari-arama", name = "Cari arama", definition = DataSourcePage() })).StatusCode);

        // A verified TenantAdmin may save it; a non-admin may then neither update nor publish that draft.
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "cari-arama", name = "Cari arama", definition = DataSourcePage() });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-pages/cari-arama/access", new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-pages/{id}",
            new { expectedRevision = 1, name = "Cari arama 2", definition = DataSourcePage() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
    }

    [Fact]
    public async Task Admin_can_save_both_reference_kinds()
    {
        await using var app = await StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "cari-arama", name = "Cari arama", definition = DataSourcePage() })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "cari-liste", name = "Cari liste", definition = OperationDataSourcePage() })).StatusCode);
    }

    [Fact]
    public async Task Non_admin_cannot_save_page_with_action_reference()
    {
        await using var app = await StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "cari-sil", name = "Cari sil", definition = ActionPage() })).StatusCode);

        // Control: the same definition is valid; a verified TenantAdmin may save it.
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = "cari-sil", name = "Cari sil", definition = ActionPage() })).StatusCode);
    }

    [Fact]
    public async Task Save_with_reference_is_rejected_without_active_catalog()
    {
        await using var app = await StartApplicationAsync(withActiveCatalog: false);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var response = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "cari-arama", name = "Cari arama", definition = DataSourcePage() });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Sayfa katalog öğesine başvuruyor ama etkin katalog sürümü yok.",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Publish_with_reference_requires_access_row()
    {
        await using var app = await StartApplicationAsync(withActiveCatalog: true);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "cari-arama", name = "Cari arama", definition = DataSourcePage() });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-pages/cari-arama/access", new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
    }

    /// <summary>The query-endpoint test host, but with an allow-all permission authorizer so only the page gates can deny.</summary>
    private static async Task<WebApplication> StartApplicationAsync(bool withActiveCatalog)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"catalog-reference-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"catalog-reference-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomPageQueryRulesIntegrationTests.AllowAllPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageAccessEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" });
        if (withActiveCatalog) tenantDb.TenantCatalogReleases.Add(CustomPageCatalogReferenceSchemaTests.Release(TenantA, "1.0.0", "Active", Bundle));
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }
}
