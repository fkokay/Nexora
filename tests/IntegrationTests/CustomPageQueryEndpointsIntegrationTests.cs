using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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

public sealed class CustomPageQueryEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    internal static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private const string Code = "musteri-panosu";

    private static object Query(string id, string name) => new
    {
        id, name, kind = "read", runOn = "load",
        sql = "SELECT TOP (@adet) Code, Name FROM CustomerAccounts WHERE Code <> @kod",
        parameters = new object[]
        {
            new { name = "kod", binding = "{{arama.value}}", type = "text" },
            new { name = "adet", binding = "{{arama.value}}", type = "int" }
        }
    };

    private static object Definition(params object[] queries) => new
    {
        schemaVersion = 2,
        queries,
        components = new object[] { new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } } }
    };

    private static readonly object ValidRun = new { parameters = new { kod = "X", adet = 10 } };

    [Fact]
    public async Task Run_without_view_right_is_forbidden_and_factory_not_called()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(app, client, accessForAyse: true);

        SetIdentity(client, Mehmet, "TenantUser");
        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/q1/run", ValidRun);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        // Rights are checked before the query lookup, so an unknown id is not distinguishable.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/yok/run", ValidRun)).StatusCode);
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Run_unknown_or_draft_only_query_returns_404()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(app, client, accessForAyse: true);
        // An open draft adds q2; it must not be runnable through the published endpoint.
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = Code, name = "Pano v2", definition = Definition(Query("q1", "liste"), Query("q2", "taslak")) })).StatusCode);

        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/yok/run", ValidRun)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/q2/run", ValidRun)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/Q1/run", ValidRun)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/custom-pages/olmayan-sayfa/queries/q1/run", ValidRun)).StatusCode);
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Run_with_missing_extra_or_mistyped_parameter_returns_400()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(app, client, accessForAyse: true);
        SetIdentity(client, Ayse, "TenantUser");

        async Task<string?> Run(object body)
        {
            var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/q1/run", body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString();
        }

        Assert.Equal("'adet' parametresi eksik.", await Run(new { parameters = new { kod = "X" } }));
        Assert.Equal("'fazla' parametresi bu sorguda tanımlı değil.", await Run(new { parameters = new { kod = "X", adet = 1, fazla = 2 } }));
        Assert.Equal("'adet' parametresi tam sayı olmalı.", await Run(new { parameters = new { kod = "X", adet = "on" } }));
        Assert.Equal("'kod' parametresi eksik.", await Run(new { }));
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Run_returns_503_when_query_connection_unavailable()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(app, client, accessForAyse: true);
        SetIdentity(client, Ayse, "TenantUser");

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/q1/run", new { parameters = new { kod = (string?)null, adet = "5" } });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("Sorgu veritabanı erişimi bu firma için hazır değil.", await response.Content.ReadAsStringAsync());
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);
        Assert.Equal(TenantA, factory.LastTenant);
    }

    [Fact]
    public async Task Preview_run_is_admin_only_and_uses_draft_definition()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        var publishedId = await PublishAsync(app, client, accessForAyse: true);
        var draft = await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = Code, name = "Pano v2", definition = Definition(Query("q1", "liste"), Query("q2", "taslak")) });
        var draftId = (await draft.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/q2/run", ValidRun)).StatusCode);
        // A stale TenantAdmin claim without an admin membership is not enough.
        SetIdentity(client, Ayse, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/q2/run", ValidRun)).StatusCode);
        Assert.Equal(0, factory.Calls);

        SetIdentity(client, Admin, "TenantAdmin");
        // Preview only serves open drafts.
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/custom-pages/{publishedId}/preview/queries/q1/run", ValidRun)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/yok/run", ValidRun)).StatusCode);
        Assert.Equal(0, factory.Calls);
        // q2 exists only in the draft: reaching the connection factory proves the draft definition was used.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/q2/run", ValidRun)).StatusCode);
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);
    }

    [Fact]
    public async Task Published_and_preview_definitions_do_not_contain_query_sql()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        var publishedId = await PublishAsync(app, client, accessForAyse: true);
        var draftId = (await (await client.PostAsJsonAsync("/api/custom-pages/drafts",
            new { code = Code, name = "Pano v2", definition = Definition(Query("q1", "liste")) })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        static void AssertNoSql(JsonElement page)
        {
            var definitionJson = page.GetProperty("definitionJson").GetString()!;
            var query = Assert.Single(JsonDocument.Parse(definitionJson).RootElement.GetProperty("queries").EnumerateArray());
            Assert.False(query.TryGetProperty("sql", out _));
            Assert.Equal(["id", "kind", "name", "parameters", "runOn"], query.EnumerateObject().Select(x => x.Name).Order(StringComparer.Ordinal));
            Assert.Equal(2, query.GetProperty("parameters").GetArrayLength());
            Assert.DoesNotContain("CustomerAccounts", definitionJson, StringComparison.Ordinal);
        }

        AssertNoSql(await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{draftId}/preview"));
        SetIdentity(client, Ayse, "TenantUser");
        AssertNoSql(await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/published"));

        // The admin designer still reads the full definition by id.
        SetIdentity(client, Admin, "TenantAdmin");
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{publishedId}");
        Assert.Contains("CustomerAccounts", detail.GetProperty("definitionJson").GetString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Run_rejects_stored_sql_that_fails_read_only_validation_before_connecting()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory);
        // Seed a published row directly: the API itself would never store this SQL.
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var now = DateTimeOffset.UtcNow;
            tenantDb.TenantCustomPages.Add(new TenantCustomPage
            {
                TenantId = TenantA, Code = Code, Name = "Bozuk", Revision = 1, IsPublished = true,
                DefinitionJson = JsonSerializer.Serialize(new
                {
                    schemaVersion = 2,
                    queries = new object[] { new { id = "q1", name = "liste", kind = "read", runOn = "load", sql = "DELETE FROM CustomerAccounts", parameters = Array.Empty<object>() } },
                    components = Array.Empty<object>()
                }),
                CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = now, UpdatedAt = now
            });
            await tenantDb.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/q1/run", new { parameters = new { } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CustomPageQueryEndpoints.InvalidStoredSqlError, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Run_endpoint_rejects_operation_query()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var definition = new
        {
            schemaVersion = 2,
            queries = new object[] { new { id = "q1", name = "kartlar", kind = "read", operation = "stok.kart.listele", runOn = "load",
                parameters = new object[] { new { name = "q", binding = "{{arama.value}}", type = "text" } } } },
            components = new object[] { new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } } }
        };
        var created = await TemplatelessPageSeed.PostDraftAsync(app.Services, client, Code, "Stok", definition);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var preview = await client.PostAsJsonAsync($"/api/custom-pages/{id}/preview/queries/q1/run", new { parameters = new { q = "x" } });
        Assert.Equal(HttpStatusCode.BadRequest, preview.StatusCode);
        Assert.Equal("ERP işlemi sayfa üzerinden doğrudan çalıştırılır.", (await preview.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        var run = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/q1/run", new { parameters = new { q = "x" } });
        Assert.Equal(HttpStatusCode.BadRequest, run.StatusCode);
        Assert.Equal("ERP işlemi sayfa üzerinden doğrudan çalıştırılır.", (await run.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Equal(0, factory.Calls);
    }

    /// <summary>Publishes a page with query q1 as admin; optionally grants Ayse View. Leaves the admin identity set.</summary>
    private static async Task<Guid> PublishAsync(WebApplication app, HttpClient client, bool accessForAyse)
    {
        SetIdentity(client, Admin, "TenantAdmin");
        var created = await TemplatelessPageSeed.PostDraftAsync(app.Services, client, Code, "Pano", Definition(Query("q1", "liste")));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        object access = accessForAyse
            ? new { mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = true } }, expectedRevision = 0 }
            : new { mode = "AdminsOnly", expectedRevision = 0 };
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", access)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        return id;
    }

    internal static async Task<WebApplication> StartApplicationAsync(RecordingQueryConnectionFactory factory)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-query-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-query-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSingleton<ITenantQueryConnectionFactory>(factory);
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageAccessEndpoints();
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

    internal static void SetIdentity(HttpClient client, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    internal sealed class RecordingQueryConnectionFactory(bool unavailable) : ITenantQueryConnectionFactory
    {
        public int Calls { get; private set; }
        public TenantQueryAccess? LastAccess { get; private set; }
        public Guid? LastTenant { get; private set; }

        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
        {
            Calls++;
            LastAccess = access;
            LastTenant = tenantId;
            if (unavailable) throw new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil.");
            throw new InvalidOperationException("Sorgu bağlantı fabrikası bu testte çağrılmamalıydı.");
        }
    }
}
