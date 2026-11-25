using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
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

/// <summary>Catalog references resolved when the ERP runtime fetches a page and when it runs a page query.</summary>
public sealed class CustomPageCatalogRuntimeIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    private const string PageCode = "katalog-sayfasi";
    /// <summary>A fragment that exists only in the catalog's SQL, never on the page.</summary>
    private const string CatalogSqlMarker = "katalogImza7f3a";

    private static string BundleJson(string readSql = $"SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q AND Code <> '{CatalogSqlMarker}'",
        bool keepCariler = true) => $$"""
        { "schemaVersion": 1,
          "dataSources": [
            {{(keepCariler ? $$"""{ "code": "cariler", "label": "Cari hesaplar", "source": { "sql": {{JsonSerializer.Serialize(readSql)}} }, "parameters": [ { "name": "q", "type": "text" } ] },""" : "")}}
            { "code": "cariListe", "label": "Cari liste", "source": { "erpOperation": "cari.listele" } } ],
          "actions": [
            { "code": "cariSil", "label": "Sil", "target": "row", "kind": "delete", "run": { "sql": "DELETE FROM CustomerAccounts WHERE Code = @kod" }, "parameters": [ { "name": "kod", "type": "text" } ] } ] }
        """;

    private static Dictionary<string, object> Query(string id, string key, string code, string kind = "read", string type = "text", string parameter = "q",
        string? straySql = null)
    {
        var query = new Dictionary<string, object>
        {
            ["id"] = id, ["name"] = id, ["kind"] = kind, [key] = code, ["runOn"] = kind == "read" ? "load" : "manual",
            ["parameters"] = parameter.Length == 0 ? Array.Empty<object>() : new object[] { new { name = parameter, binding = "{{arama.value}}", type } },
        };
        if (straySql is not null) query["sql"] = straySql;
        return query;
    }

    private static string Page(params object[] queries) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries,
        components = new object[] { new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } } }
    });

    private static string StandardPage() => Page(
        Query("liste", "dataSource", "cariler"),
        Query("op", "dataSource", "cariListe", parameter: ""),
        Query("sil", "action", "cariSil", "delete", parameter: "kod"));

    [Fact]
    public async Task Published_page_resolves_operation_backed_source_to_operation()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedReleaseAsync(app, "1.0.0", BundleJson());
        await SeedPageAsync(app, PageCode, published: true, StandardPage());
        var draftId = await SeedPageAsync(app, PageCode, published: false, StandardPage());
        using var client = Client(app);

        foreach (var url in new[] { $"/api/custom-pages/{PageCode}/published", $"/api/custom-pages/{draftId}/preview" })
        {
            var queries = await QueriesAsync(client, url);
            var op = queries.Single(x => x.GetProperty("id").GetString() == "op");
            Assert.Equal("cari.listele", op.GetProperty("operation").GetString());
            Assert.False(op.TryGetProperty("dataSource", out _));
            Assert.False(op.TryGetProperty("catalogError", out _));
            // SQL-backed items stay ordinary SQL-less queries, run by id.
            var liste = queries.Single(x => x.GetProperty("id").GetString() == "liste");
            Assert.False(liste.TryGetProperty("dataSource", out _));
            Assert.False(liste.TryGetProperty("operation", out _));
            Assert.False(liste.TryGetProperty("catalogError", out _));
            var sil = queries.Single(x => x.GetProperty("id").GetString() == "sil");
            Assert.False(sil.TryGetProperty("action", out _));
            Assert.False(sil.TryGetProperty("operation", out _));
        }
    }

    [Fact]
    public async Task Published_page_never_contains_catalog_sql()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedReleaseAsync(app, "1.0.0", BundleJson());
        await SeedPageAsync(app, PageCode, published: true, Page(Query("liste", "dataSource", "cariler", straySql: "SELECT 1 AS sayfaSql")));
        using var client = Client(app);

        var response = await client.GetAsync($"/api/custom-pages/{PageCode}/published");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(CatalogSqlMarker, text);
        Assert.DoesNotContain("CustomerAccounts", text);
        Assert.DoesNotContain("sayfaSql", text);
    }

    [Fact]
    public async Task Run_sql_backed_data_source_uses_catalog_sql()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedReleaseAsync(app, "1.0.0", BundleJson());
        // "liste" has no SQL of its own; "kirli" carries a stray page SQL that today's read-only validator rejects.
        await SeedPageAsync(app, PageCode, published: true, Page(
            Query("liste", "dataSource", "cariler"),
            Query("kirli", "dataSource", "cariler", straySql: "DELETE FROM CustomerAccounts")));
        using var client = Client(app);

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/liste/run", new { parameters = new { q = "A%" } });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);

        // The catalog's SQL runs, never the page's: the stray SQL would have been rejected before the connection.
        response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/kirli/run", new { parameters = new { q = "A%" } });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(2, factory.Calls);

        // An operation-backed item runs through its own ERP endpoint, not here.
        await SeedPageAsync(app, "op-sayfasi", published: true, Page(Query("op", "dataSource", "cariListe", parameter: "")));
        response = await client.PostAsJsonAsync("/api/custom-pages/op-sayfasi/queries/op/run", new { parameters = new { } });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CustomPageQueryEndpoints.OperationQueryRunError, await ErrorAsync(response));
        Assert.Equal(2, factory.Calls);
    }

    [Fact]
    public async Task Run_reference_to_missing_code_returns_404_and_page_still_loads()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        var first = await SeedReleaseAsync(app, "1.0.0", BundleJson());
        await SeedPageAsync(app, PageCode, published: true, StandardPage());
        // A release without "cariler" becomes Active directly in the database (bypassing the activation guard).
        await SupersedeAsync(app, first);
        await SeedReleaseAsync(app, "2.0.0", BundleJson(keepCariler: false));
        using var client = Client(app);

        var queries = await QueriesAsync(client, $"/api/custom-pages/{PageCode}/published");
        var liste = queries.Single(x => x.GetProperty("id").GetString() == "liste");
        Assert.Equal("Katalogda bulunamadı: cariler", liste.GetProperty("catalogError").GetString());
        Assert.False(liste.TryGetProperty("dataSource", out _));
        // The other references on the page still resolve.
        Assert.Equal("cari.listele", queries.Single(x => x.GetProperty("id").GetString() == "op").GetProperty("operation").GetString());

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/liste/run", new { parameters = new { q = "A%" } });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Katalogda bulunamadı: cariler", await ErrorAsync(response));
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Run_without_active_catalog_returns_404_and_page_reports_error()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedPageAsync(app, PageCode, published: true, StandardPage());
        using var client = Client(app);

        var queries = await QueriesAsync(client, $"/api/custom-pages/{PageCode}/published");
        Assert.All(queries, query => Assert.StartsWith("Katalogda bulunamadı: ", query.GetProperty("catalogError").GetString()));
        var response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/sil/run", new { parameters = new { kod = "C-1" } });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, factory.Calls);
        Assert.Empty(await WriteAuditsAsync(app));
    }

    [Fact]
    public async Task Run_rejects_catalog_sql_that_todays_validator_rejects_without_opening_connection()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        // Written directly: the create endpoint would have rejected this SQL.
        await SeedReleaseAsync(app, "1.0.0", BundleJson(readSql: "DELETE FROM CustomerAccounts WHERE Name LIKE @q"));
        await SeedPageAsync(app, PageCode, published: true, StandardPage());
        using var client = Client(app);

        // The stored bundle no longer validates, so the catalog counts as absent and nothing runs.
        var response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/liste/run", new { parameters = new { q = "A%" } });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/sil/run", new { parameters = new { kod = "C-1" } });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, factory.Calls);
        Assert.Empty(await WriteAuditsAsync(app));
        Assert.DoesNotContain("DELETE", await (await client.GetAsync($"/api/custom-pages/{PageCode}/published")).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Run_after_parameter_change_returns_409()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedReleaseAsync(app, "1.0.0", BundleJson());
        // The page still declares q as int while the catalog item now takes text; "tur" references an action as a data source.
        await SeedPageAsync(app, PageCode, published: true, Page(
            Query("liste", "dataSource", "cariler", type: "int"),
            Query("tur", "dataSource", "cariSil", parameter: "kod")));
        using var client = Client(app);

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/liste/run", new { parameters = new { q = 5 } });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Yapı taşı değişti; sayfayı yeniden yükleyin.", await ErrorAsync(response));
        response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/tur/run", new { parameters = new { kod = "C-1" } });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(0, factory.Calls);

        var queries = await QueriesAsync(client, $"/api/custom-pages/{PageCode}/published");
        Assert.All(queries, query => Assert.Equal($"Katalogda bulunamadı: {(query.GetProperty("id").GetString() == "liste" ? "cariler" : "cariSil")}",
            query.GetProperty("catalogError").GetString()));
    }

    [Fact]
    public async Task Catalog_sql_action_write_is_audited_with_catalog_code()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedReleaseAsync(app, "1.2.0", BundleJson());
        await SeedPageAsync(app, PageCode, published: true, StandardPage());
        using var client = Client(app);

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{PageCode}/queries/sil/run", new { parameters = new { kod = "C-1" } });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Write, factory.LastAccess);
        var audit = Assert.Single(await WriteAuditsAsync(app));
        Assert.Equal((TenantA, Admin, PageCode, "sil", "delete"), (audit.TenantId, audit.UserId, audit.PageCode, audit.QueryName, audit.Kind));
        Assert.Equal("cariSil@1.2.0", audit.CatalogReference);
        Assert.False(audit.Succeeded);
    }

    [Fact]
    public async Task System_page_runtime_resolves_references()
    {
        var factory = new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        await SeedReleaseAsync(app, "1.0.0", BundleJson());
        const string screenKey = "sales-requests";
        await SeedPageAsync(app, SystemPageCodes.CodeFor(screenKey), published: true, StandardPage(), screenKey);
        using var client = Client(app);

        var response = await client.GetAsync($"/api/system-pages/{screenKey}/published");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(CatalogSqlMarker, text);
        var queries = QueriesOf(JsonDocument.Parse(text).RootElement);
        Assert.Equal("cari.listele", queries.Single(x => x.GetProperty("id").GetString() == "op").GetProperty("operation").GetString());
        Assert.All(queries, query => Assert.False(query.TryGetProperty("dataSource", out _) || query.TryGetProperty("action", out _)));
    }

    private static HttpClient Client(WebApplication app)
    {
        var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        return client;
    }

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString();

    private static async Task<JsonElement[]> QueriesAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return QueriesOf(await response.Content.ReadFromJsonAsync<JsonElement>());
    }

    private static JsonElement[] QueriesOf(JsonElement page) =>
        JsonDocument.Parse(page.GetProperty("definitionJson").GetString()!).RootElement.GetProperty("queries").EnumerateArray().ToArray();

    private static async Task<Guid> SeedReleaseAsync(WebApplication app, string version, string bundleJson, string status = "Active")
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var release = new TenantCatalogRelease
        {
            TenantId = TenantA, Version = version, Status = status, BundleJson = bundleJson,
            BundleSha256 = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(bundleJson))),
            CreatedByUserId = Admin, ActivatedByUserId = Admin, ActivatedAt = DateTimeOffset.UtcNow,
        };
        db.TenantCatalogReleases.Add(release);
        await db.SaveChangesAsync();
        return release.Id;
    }

    private static async Task SupersedeAsync(WebApplication app, Guid releaseId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var release = await db.TenantCatalogReleases.SingleAsync(x => x.Id == releaseId);
        release.Status = "Superseded";
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedPageAsync(WebApplication app, string code, bool published, string definitionJson, string? screenKey = null)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var page = new TenantCustomPage
        {
            TenantId = TenantA, Code = code, Name = $"Sayfa {code}", Revision = 1, IsPublished = published, DefinitionJson = definitionJson,
            ScreenKey = screenKey, CreatedByUserId = Admin, UpdatedByUserId = Admin,
        };
        db.TenantCustomPages.Add(page);
        await db.SaveChangesAsync();
        return page.Id;
    }

    private static async Task<List<TenantCustomPageWriteAudit>> WriteAuditsAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TenantCustomPageWriteAudits.AsNoTracking().ToListAsync();
    }

    private static async Task<WebApplication> StartApplicationAsync(ITenantQueryConnectionFactory factory)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"catalog-runtime-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"catalog-runtime-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSystemPages();
        builder.Services.AddSingleton(factory);
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageQueryEndpoints();
        app.MapSystemPageEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" });
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }
}
