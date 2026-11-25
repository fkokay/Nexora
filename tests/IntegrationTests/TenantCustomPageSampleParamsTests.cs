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
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Sub-project 4: GET /api/custom-pages/{id}/preview/sample-params, the designer canvas's sample record key.</summary>
public sealed class TenantCustomPageSampleParamsTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string PageCode = "cari-kart";
    private const string ListSql = "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE '%' + @q + '%'";

    private static object DataSource(string code, string opens, string sql = ListSql, object[]? parameters = null) => new
    {
        code, label = code, source = new { sql },
        parameters = parameters ?? [new { name = "q", type = "text" }],
        columns = new object[] { new { code = "Code", label = "Kod", type = "text", key = true }, new { code = "Name", label = "Ad", type = "text", key = false } },
        opens
    };

    private static string Bundle(params object[] dataSources) => JsonSerializer.Serialize(new { schemaVersion = 1, dataSources, actions = Array.Empty<object>() });

    /// <summary>A record page whose record query reads the page parameter <c>kartId</c> (deliberately not the key column's name).</summary>
    private static string RecordPage(string template = "record") => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        template = new { name = template },
        queries = new object[]
        {
            new { id = "kayit", name = "kayit", kind = "read", sql = "SELECT Code, Name FROM CustomerAccounts WHERE Code = @kod", runOn = "load",
                parameters = new object[] { new { name = "kod", binding = "{{sayfa.parametre.kartId}}", type = "text" } } }
        },
        components = new object[]
        {
            new { id = "ozet", type = "recordHeader", name = "ozet", props = new { slot = "summary", title = "Kart" } },
            new { id = "sekmeler", type = "tabs", name = "sekmeler", props = new { slot = "tabs", tabs = new[] { "Genel=b1" } } },
            new { id = "b1", type = "formCard", name = "b1", props = new { slot = "section", inputs = new[] { "a1" }, recordKey = "{{kayit.rows[0].Code}}", trackChanges = true } },
            new { id = "a1", type = "input", name = "a1", props = new { slot = "field", label = "Ad", defaultValue = "{{kayit.rows[0].Name}}" } },
        }
    });

    [Fact]
    public async Task Sample_params_return_first_key_of_list_source_that_opens_this_page()
    {
        var executor = new FakeReadExecutor([new Dictionary<string, object?> { ["Code"] = "C-001", ["Name"] = "Ana" }, new Dictionary<string, object?> { ["Code"] = "C-002" }]);
        await using var app = await StartApplicationAsync(executor);
        await SeedReleaseAsync(app, Bundle(
            DataSource("baskaListe", "baska-sayfa", "SELECT Code, Name FROM Other"),
            // Opens this page but needs a parameter other than q: skipped.
            DataSource("filtreli", PageCode, "SELECT Code, Name FROM Filtered WHERE Kind = @tur", [new { name = "tur", type = "text" }]),
            DataSource("cariler", PageCode),
            DataSource("ikinci", PageCode, "SELECT Code, Name FROM Second")));
        var draftId = await SeedPageAsync(app, RecordPage());
        using var client = Client(app, Admin, "TenantAdmin");

        var response = await client.GetAsync($"/api/custom-pages/{draftId}/preview/sample-params");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var values = body.GetProperty("params").EnumerateObject().ToDictionary(x => x.Name, x => x.Value.GetString());
        Assert.Equal(new Dictionary<string, string?> { ["kartId"] = "C-001" }, values);
        var call = Assert.Single(executor.Calls);
        Assert.Equal(ListSql, call.Sql);
        var q = Assert.Single(call.Parameters);
        Assert.Equal("@q", q.ParameterName);
        Assert.Equal("", q.Value);
        Assert.Equal(TenantA, call.Tenant);
    }

    [Fact]
    public async Task Sample_params_return_key_of_parameterless_source()
    {
        var executor = new FakeReadExecutor([new Dictionary<string, object?> { ["code"] = 42 }]);
        await using var app = await StartApplicationAsync(executor);
        await SeedReleaseAsync(app, Bundle(DataSource("cariler", PageCode, "SELECT Code, Name FROM CustomerAccounts", [])));
        var draftId = await SeedPageAsync(app, RecordPage());
        using var client = Client(app, Admin, "TenantAdmin");

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{draftId}/preview/sample-params");

        // The key column is matched case-insensitively and formatted invariantly.
        Assert.Equal("42", body.GetProperty("params").GetProperty("kartId").GetString());
        Assert.Empty(Assert.Single(executor.Calls).Parameters);
    }

    [Fact]
    public async Task Sample_params_empty_when_no_source_opens_page()
    {
        var executor = new FakeReadExecutor([new Dictionary<string, object?> { ["Code"] = "C-001" }]);
        await using var app = await StartApplicationAsync(executor);
        await SeedReleaseAsync(app, Bundle(DataSource("baskaListe", "baska-sayfa")));
        var draftId = await SeedPageAsync(app, RecordPage());
        using var client = Client(app, Admin, "TenantAdmin");

        await AssertEmptyAsync(client, draftId);
        Assert.Empty(executor.Calls);
    }

    [Fact]
    public async Task Sample_params_empty_when_no_catalog_row_or_failure()
    {
        var empty = new FakeReadExecutor([]);
        await using (var app = await StartApplicationAsync(empty))
        {
            // No active catalog at all.
            var draftId = await SeedPageAsync(app, RecordPage());
            using var client = Client(app, Admin, "TenantAdmin");
            await AssertEmptyAsync(client, draftId);
            Assert.Empty(empty.Calls);
            // A source with no rows.
            await SeedReleaseAsync(app, Bundle(DataSource("cariler", PageCode)));
            await AssertEmptyAsync(client, draftId);
            Assert.Single(empty.Calls);
        }

        var failing = new FakeReadExecutor([], new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil."));
        await using (var app = await StartApplicationAsync(failing))
        {
            await SeedReleaseAsync(app, Bundle(DataSource("cariler", PageCode)));
            var draftId = await SeedPageAsync(app, RecordPage());
            using var client = Client(app, Admin, "TenantAdmin");
            await AssertEmptyAsync(client, draftId);
            Assert.Single(failing.Calls);
        }

        var nullKey = new FakeReadExecutor([new Dictionary<string, object?> { ["Code"] = null }]);
        await using (var app = await StartApplicationAsync(nullKey))
        {
            await SeedReleaseAsync(app, Bundle(DataSource("cariler", PageCode)));
            var draftId = await SeedPageAsync(app, RecordPage());
            using var client = Client(app, Admin, "TenantAdmin");
            await AssertEmptyAsync(client, draftId);
        }
    }

    [Fact]
    public async Task Sample_params_empty_for_list_template()
    {
        var executor = new FakeReadExecutor([new Dictionary<string, object?> { ["Code"] = "C-001" }]);
        await using var app = await StartApplicationAsync(executor);
        await SeedReleaseAsync(app, Bundle(DataSource("cariler", PageCode)));
        var listDraft = await SeedPageAsync(app, RecordPage(template: "list"));
        var noTemplate = await SeedPageAsync(app, JsonSerializer.Serialize(new { schemaVersion = 2, components = Array.Empty<object>() }), code: "duz-sayfa");
        using var client = Client(app, Admin, "TenantAdmin");

        await AssertEmptyAsync(client, listDraft);
        await AssertEmptyAsync(client, noTemplate);
        Assert.Empty(executor.Calls);
    }

    [Fact]
    public async Task Sample_params_requires_preview_permission()
    {
        var executor = new FakeReadExecutor([new Dictionary<string, object?> { ["Code"] = "C-001" }]);
        await using var app = await StartApplicationAsync(executor);
        await SeedReleaseAsync(app, Bundle(DataSource("cariler", PageCode)));
        var draftId = await SeedPageAsync(app, RecordPage());
        var published = await SeedPageAsync(app, RecordPage(), published: true);

        // A page with queries is admin-only for members without an access row: the same 403 as GET /preview.
        using var user = Client(app, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync($"/api/custom-pages/{draftId}/preview")).StatusCode);
        var forbidden = await user.GetAsync($"/api/custom-pages/{draftId}/preview/sample-params");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal(TenantCustomPageEndpointsViewForbidden, (await forbidden.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Empty(executor.Calls);

        // A role the route permission refuses is stopped before the page lookup, like GET /preview.
        using var other = Client(app, Ayse, "Misafir");
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/custom-pages/{draftId}/preview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/custom-pages/{draftId}/preview/sample-params")).StatusCode);
        Assert.Empty(executor.Calls);

        // Only open drafts are previewed; a published row or an unknown id is not found.
        using var admin = Client(app, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/custom-pages/{published}/preview/sample-params")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/custom-pages/{Guid.NewGuid()}/preview/sample-params")).StatusCode);
        Assert.Empty(executor.Calls);

        // The route resolves to the same permission as GET /preview.
        var id = Guid.NewGuid().ToString("D");
        Assert.True(PlatformPermissionCatalog.TryResolve($"/api/custom-pages/{id}/preview", "GET", "/api/custom-pages/{id:guid}/preview",
            new Dictionary<string, string?> { ["id"] = id }, TenantA, Admin, "TenantAdmin", out var preview));
        Assert.True(PlatformPermissionCatalog.TryResolve($"/api/custom-pages/{id}/preview/sample-params", "GET", "/api/custom-pages/{id:guid}/preview/sample-params",
            new Dictionary<string, string?> { ["id"] = id }, TenantA, Admin, "TenantAdmin", out var sample));
        Assert.Equal(preview!.Permission.ResourceType, sample!.Permission.ResourceType);
        Assert.Equal(preview.Permission.Action, sample.Permission.Action);
        Assert.Equal("erp.tenant-customizations", sample.Permission.ResourceType);
        Assert.Equal("read", sample.Permission.Action);
    }

    private const string TenantCustomPageEndpointsViewForbidden = "Bu sayfayı görüntüleme yetkiniz yok.";

    private static async Task AssertEmptyAsync(HttpClient client, Guid draftId)
    {
        var response = await client.GetAsync($"/api/custom-pages/{draftId}/preview/sample-params");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Object, body.GetProperty("params").ValueKind);
        Assert.Empty(body.GetProperty("params").EnumerateObject());
    }

    private sealed record ExecutorCall(string Sql, IReadOnlyList<SqlParameter> Parameters, Guid Tenant);

    private sealed class FakeReadExecutor(IReadOnlyList<IReadOnlyDictionary<string, object?>> rows, Exception? failure = null) : ICustomPageReadExecutor
    {
        public List<ExecutorCall> Calls { get; } = [];

        public Task<CustomSqlResult> ExecuteAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenant, CancellationToken ct)
        {
            Calls.Add(new ExecutorCall(sql, parameters, tenant));
            if (failure is not null) throw failure;
            var columns = rows.SelectMany(x => x.Keys).Distinct().Select(x => new ReportColumn(x, x, "text")).ToList();
            return Task.FromResult(new CustomSqlResult(columns, rows, false));
        }
    }

    private static HttpClient Client(WebApplication app, Guid user, string role)
    {
        var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, user, role);
        return client;
    }

    private static async Task SeedReleaseAsync(WebApplication app, string bundleJson)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        db.TenantCatalogReleases.Add(new TenantCatalogRelease
        {
            TenantId = TenantA, Version = "1.0.0", Status = "Active", BundleJson = bundleJson,
            BundleSha256 = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(bundleJson))),
            CreatedByUserId = Admin, ActivatedByUserId = Admin, ActivatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedPageAsync(WebApplication app, string definitionJson, bool published = false, string code = PageCode)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var page = new TenantCustomPage
        {
            TenantId = TenantA, Code = code, Name = $"Sayfa {code}", Revision = 1, IsPublished = published, DefinitionJson = definitionJson,
            CreatedByUserId = Admin, UpdatedByUserId = Admin,
        };
        db.TenantCustomPages.Add(page);
        await db.SaveChangesAsync();
        return page.Id;
    }

    private static async Task<WebApplication> StartApplicationAsync(ICustomPageReadExecutor executor)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"sample-params-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"sample-params-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSystemPages();
        // The real connection factory must never be reached: the fake executor replaces the SQL run.
        builder.Services.AddSingleton<ITenantQueryConnectionFactory>(new CustomPageQueryEndpointsIntegrationTests.RecordingQueryConnectionFactory(unavailable: false));
        builder.Services.AddSingleton(executor);
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageQueryEndpoints();
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
