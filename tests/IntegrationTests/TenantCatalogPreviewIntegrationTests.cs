using System.Data;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Stored catalog previews and the 50-row data source preview run.</summary>
public sealed class TenantCatalogPreviewIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string Previews = "/api/custom-pages/catalog/previews";
    private const string StoredSql = "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q";

    private const string BundleJson = $$"""
        { "schemaVersion": 1,
          "dataSources": [
            { "code": "cariler", "label": "Cari hesaplar", "source": { "sql": "{{StoredSql}}" }, "parameters": [ { "name": "q", "type": "text" } ] },
            { "code": "cariListe", "label": "Cari liste", "source": { "erpOperation": "cari.listele" } } ],
          "actions": [ { "code": "cariSil", "label": "Sil", "target": "row", "kind": "delete", "run": { "sql": "DELETE FROM CustomerAccounts WHERE Id = @id" }, "parameters": [ { "name": "id", "type": "guid" } ] } ] }
        """;

    private static JsonElement Bundle(string json) => JsonDocument.Parse(json).RootElement;

    private static async Task<Guid> CreatePreview(HttpClient client)
    {
        var response = await client.PostAsJsonAsync(Previews, new { bundle = Bundle(BundleJson) });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static Task<HttpResponseMessage> Run(HttpClient client, Guid id, string code, object body) =>
        client.PostAsJsonAsync($"{Previews}/{id}/items/{code}/run", body);

    private static async Task<string?> Error(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString();

    [Fact]
    public async Task Admin_stores_preview_and_runs_data_source_with_50_row_cap()
    {
        var executor = new RecordingExecutor(rowCount: 60);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        var id = await CreatePreview(client);
        var response = await Run(client, id, "cariler", new { parameters = new { q = "%A%" } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(50, body.GetProperty("rowCount").GetInt32());
        Assert.Equal(50, body.GetProperty("rows").GetArrayLength());
        Assert.True(body.GetProperty("truncated").GetBoolean());
        var column = body.GetProperty("columns")[0];
        Assert.Equal("Code", column.GetProperty("code").GetString());
        Assert.Equal("Code", column.GetProperty("label").GetString());
        Assert.Equal("text", column.GetProperty("dataType").GetString());
        Assert.Equal(50, executor.LastMaxRows);
        Assert.Equal(TenantA, executor.LastTenant);
        Assert.Equal(StoredSql, executor.LastSql);
        Assert.Equal("%A%", Assert.Single(executor.LastParameters!).Value);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var row = await db.TenantCatalogPreviews.SingleAsync();
        Assert.Equal(TenantA, row.TenantId);
        Assert.Equal(Admin, row.CreatedByUserId);
        Assert.True(JsonElement.DeepEquals(Bundle(BundleJson), Bundle(row.BundleJson)));
        Assert.Equal(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(row.BundleJson))), row.BundleSha256);
        Assert.Equal($"{row.Id:D}:{row.BundleSha256[..12]}", (await db.AuditEvents.SingleAsync(x => x.Action == "catalog.preview.created")).Resource);
        Assert.Equal("cariler:rows=50", (await db.AuditEvents.SingleAsync(x => x.Action == "catalog.preview.run")).Resource);
    }

    [Fact]
    public async Task Non_admin_cannot_store_or_run_preview()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var id = await CreatePreview(client);

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Previews, new { bundle = Bundle(BundleJson) })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Run(client, id, "cariler", new { parameters = new { q = "x" } })).StatusCode);
        // A stale TenantAdmin claim without an admin membership is not enough either.
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Previews, new { bundle = Bundle(BundleJson) })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Run(client, id, "cariler", new { parameters = new { q = "x" } })).StatusCode);
        Assert.Equal(0, executor.Calls);
    }

    [Fact]
    public async Task Run_request_carries_only_parameters()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var id = await CreatePreview(client);

        var response = await Run(client, id, "cariler", new { sql = "SELECT * FROM Users", bundle = Bundle(BundleJson), parameters = new { q = "x" } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(StoredSql, executor.LastSql);
    }

    [Fact]
    public async Task Run_with_unbound_parameter_returns_400_without_connection()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var id = await CreatePreview(client);

        var missing = await Run(client, id, "cariler", new { parameters = new { } });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal("'q' parametresi eksik.", await Error(missing));
        Assert.Equal(HttpStatusCode.BadRequest, (await Run(client, id, "cariler", new { parameters = new { q = "x", fazla = 1 } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Run(client, id, "cariler", new { parameters = new { q = 5 } })).StatusCode);
        Assert.Equal(0, executor.Calls);
    }

    [Fact]
    public async Task Run_of_stored_sql_rejected_by_todays_rules_returns_400_without_connection()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        Guid id;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var preview = new TenantCatalogPreview
            {
                TenantId = TenantA, CreatedByUserId = Admin, BundleSha256 = new string('0', 64),
                BundleJson = BundleJson.Replace(StoredSql, "DELETE FROM CustomerAccounts"),
            };
            db.TenantCatalogPreviews.Add(preview);
            await db.SaveChangesAsync();
            id = preview.Id;
        }

        var response = await Run(client, id, "cariler", new { parameters = new { q = "x" } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CustomPageQueryEndpoints.InvalidStoredSqlError, await Error(response));
        Assert.Equal(0, executor.Calls);
    }

    [Fact]
    public async Task Run_of_action_or_unknown_code_returns_404()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var id = await CreatePreview(client);

        foreach (var code in new[] { "cariSil", "yok", "Cariler" })
        {
            var response = await Run(client, id, code, new { parameters = new { id = Guid.NewGuid() } });
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("Önizlenecek veri kaynağı bulunamadı.", await Error(response));
        }
        Assert.Equal(0, executor.Calls);
    }

    [Fact]
    public async Task Run_of_operation_backed_item_returns_400()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var id = await CreatePreview(client);

        var response = await Run(client, id, "cariListe", new { parameters = new { } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("ERP işlemine dayanan veri kaynağı önizlenmez; sonuç kolonları işlem kataloğundan gelir.", await Error(response));
        Assert.Equal(0, executor.Calls);
    }

    [Fact]
    public async Task Other_users_preview_is_404()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        Guid otherAdmins, otherTenants;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var byOtherUser = new TenantCatalogPreview { TenantId = TenantA, CreatedByUserId = Guid.NewGuid(), BundleJson = BundleJson, BundleSha256 = new string('0', 64) };
            var inOtherTenant = new TenantCatalogPreview { TenantId = TenantB, CreatedByUserId = Admin, BundleJson = BundleJson, BundleSha256 = new string('0', 64) };
            db.TenantCatalogPreviews.AddRange(byOtherUser, inOtherTenant);
            await db.SaveChangesAsync();
            (otherAdmins, otherTenants) = (byOtherUser.Id, inOtherTenant.Id);
        }
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        Assert.Equal(HttpStatusCode.NotFound, (await Run(client, otherAdmins, "cariler", new { parameters = new { q = "x" } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Run(client, otherTenants, "cariler", new { parameters = new { q = "x" } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Run(client, Guid.NewGuid(), "cariler", new { parameters = new { q = "x" } })).StatusCode);
        Assert.Equal(0, executor.Calls);
    }

    [Fact]
    public async Task Invalid_bundle_returns_400_with_location()
    {
        var executor = new RecordingExecutor(rowCount: 1);
        await using var app = await StartApplicationAsync(executor);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsJsonAsync(Previews, new { bundle = Bundle("""{ "schemaVersion": 1, "dataSources": [ { "code": "x y", "label": "Hatalı", "source": { "sql": "SELECT 1 AS A" } } ] }""") });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("dataSource", await Error(response));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Previews, new { bundle = "metin" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Previews, new { })).StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCatalogPreviews.ToListAsync());
    }

    [Fact]
    public async Task Both_preview_routes_use_the_preview_rate_limit_policy()
    {
        await using var app = await StartApplicationAsync(new RecordingExecutor(rowCount: 1));
        var endpoints = ((IEndpointRouteBuilder)app).DataSources.SelectMany(x => x.Endpoints).OfType<RouteEndpoint>().ToArray();
        foreach (var pattern in new[] { "/api/custom-pages/catalog/previews", "/api/custom-pages/catalog/previews/{id:guid}/items/{code}/run" })
        {
            var endpoint = Assert.Single(endpoints, x => x.RoutePattern.RawText == pattern && x.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("POST") == true);
            Assert.Equal(CustomPageQueryEndpoints.PreviewRateLimitPolicy, endpoint.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName);
        }
    }

    /// <summary>
    /// Stands in for the tenant SQL connection: records what the endpoint passes and reads a fixed result set through the
    /// real runner reader with the <c>maxRows</c> it was given, so the cap is applied by production code.
    /// </summary>
    private sealed class RecordingExecutor(int rowCount)
    {
        public int Calls { get; private set; }
        public string? LastSql { get; private set; }
        public int? LastMaxRows { get; private set; }
        public Guid? LastTenant { get; private set; }
        public IReadOnlyList<SqlParameter>? LastParameters { get; private set; }

        public async Task<CustomSqlResult> ExecuteAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId,
            ITenantQueryConnectionFactory factory, CancellationToken ct, int maxRows)
        {
            Calls++;
            (LastSql, LastParameters, LastTenant, LastMaxRows) = (sql, parameters, tenantId, maxRows);
            using var table = new DataTable();
            table.Columns.Add("Code", typeof(string));
            table.Columns.Add("Name", typeof(string));
            for (var i = 1; i <= rowCount; i++) table.Rows.Add($"C{i:000}", $"Cari {i}");
            using var reader = table.CreateDataReader();
            return await CustomSqlReportRunner.ReadAsync(reader, maxRows, ct);
        }
    }

    private static async Task<WebApplication> StartApplicationAsync(RecordingExecutor executor)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"catalog-preview-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"catalog-preview-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomPageQueryRulesIntegrationTests.AllowAllPermissionAuthorizer>();
        builder.Services.AddSingleton<ITenantQueryConnectionFactory>(new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: true));
        builder.Services.AddSingleton<CatalogPreviewExecutor>(executor.ExecuteAsync);
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCatalogEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }
}
