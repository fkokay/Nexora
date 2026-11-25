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
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Catalog developer actions (create/activate a release, store/run a preview, SQL in the catalog view) are open to a verified
/// TenantAdmin and to a member whose Studio work role is Developer, both read from the membership row.
/// </summary>
public sealed class TenantCatalogDeveloperAccessIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    // Mehmet is a TenantUser in TenantA in the shared seed; each case rewrites his membership.
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private const string Releases = "/api/custom-pages/catalog/releases";
    private const string Previews = "/api/custom-pages/catalog/previews";
    private const string StoredSql = "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q";

    private static string BundleJson => $$"""
        { "schemaVersion": 1,
          "dataSources": [ { "code": "cariler", "label": "Cari hesaplar", "source": { "sql": "{{StoredSql}}" }, "parameters": [ { "name": "q", "type": "text" } ] } ],
          "actions": [] }
        """;

    private static JsonElement Bundle => JsonDocument.Parse(BundleJson).RootElement;

    private static Task<HttpResponseMessage> CreateRelease(HttpClient client, string version) =>
        client.PostAsJsonAsync(Releases, new { version, bundle = Bundle });

    private static Task<HttpResponseMessage> Activate(HttpClient client, Guid id, Guid? expected) =>
        client.PostAsJsonAsync($"{Releases}/{id}/activate", new { expectedActiveReleaseId = expected });

    private static Task<HttpResponseMessage> StorePreview(HttpClient client) => client.PostAsJsonAsync(Previews, new { bundle = Bundle });

    private static Task<HttpResponseMessage> Run(HttpClient client, Guid id) =>
        client.PostAsJsonAsync($"{Previews}/{id}/items/cariler/run", new { parameters = new { q = "%A%" } });

    private static async Task<Guid> IdOf(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task SetMembershipAsync(WebApplication app, string role, string? studioRole)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var membership = await platform.TenantMemberships.SingleAsync(x => x.TenantId == TenantA && x.UserId == Mehmet);
        membership.Role = role;
        membership.StudioRole = studioRole;
        await platform.SaveChangesAsync();
    }

    [Theory]
    [InlineData("TenantUser", "Developer", "TenantUser")]
    [InlineData("TenantDeveloper", null, "TenantDeveloper")]
    [InlineData("TenantAdmin", "None", "TenantAdmin")]
    public async Task Developer_or_admin_creates_activates_previews_and_sees_sql(string membershipRole, string? studioRole, string claim)
    {
        var executor = new CountingExecutor();
        await using var app = await StartApplicationAsync(executor);
        await SetMembershipAsync(app, membershipRole, studioRole);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var adminsPreview = await IdOf(await StorePreview(client));

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Mehmet, claim);
        var release = await IdOf(await CreateRelease(client, "1.0.0"));
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, release, null)).StatusCode);
        var catalog = await (await client.GetAsync("/api/custom-pages/catalog")).Content.ReadAsStringAsync();
        Assert.Contains("\"sql\":\"SELECT Code, Name FROM CustomerAccounts", catalog);
        var preview = await IdOf(await StorePreview(client));
        Assert.Equal(HttpStatusCode.OK, (await Run(client, preview)).StatusCode);
        Assert.Equal(1, executor.Calls);
        // The preview run still reads only the caller's own preview row.
        Assert.Equal(HttpStatusCode.NotFound, (await Run(client, adminsPreview)).StatusCode);
        Assert.Equal(1, executor.Calls);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(Mehmet, (await db.TenantCatalogReleases.SingleAsync()).ActivatedByUserId);
        Assert.Equal(Mehmet, (await db.TenantCatalogPreviews.SingleAsync(x => x.Id == preview)).CreatedByUserId);
    }

    [Theory]
    [InlineData("TenantUser", "Consultant", "TenantUser")]
    [InlineData("TenantUser", null, "TenantUser")]
    [InlineData("TenantUser", "None", "TenantUser")]
    // An explicit Studio role wins over the TenantDeveloper default.
    [InlineData("TenantDeveloper", "Consultant", "TenantDeveloper")]
    // The role claim must match the membership row: a stale admin claim is not enough.
    [InlineData("TenantUser", "Consultant", "TenantAdmin")]
    [InlineData("TenantUser", "Developer", "TenantAdmin")]
    public async Task Non_developer_or_stale_claim_gets_403_and_no_sql(string membershipRole, string? studioRole, string claim)
    {
        var executor = new CountingExecutor();
        await using var app = await StartApplicationAsync(executor);
        await SetMembershipAsync(app, membershipRole, studioRole);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var active = await IdOf(await CreateRelease(client, "1.0.0"));
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, active, null)).StatusCode);
        var draft = await IdOf(await CreateRelease(client, "1.0.1"));
        Guid ownPreview;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            // A preview row the caller owns, so only the access gate can refuse the run.
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var row = new TenantCatalogPreview { TenantId = TenantA, CreatedByUserId = Mehmet, BundleJson = BundleJson, BundleSha256 = new string('0', 64) };
            db.TenantCatalogPreviews.Add(row);
            await db.SaveChangesAsync();
            ownPreview = row.Id;
        }

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Mehmet, claim);
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateRelease(client, "1.0.2")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Activate(client, draft, active)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await StorePreview(client)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Run(client, ownPreview)).StatusCode);
        Assert.Equal(0, executor.Calls);
        var response = await client.GetAsync("/api/custom-pages/catalog");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"sql\":", text);
        Assert.DoesNotContain("CustomerAccounts", text);
    }

    [Fact]
    public async Task Inactive_developer_gets_403()
    {
        var executor = new CountingExecutor();
        await using var app = await StartApplicationAsync(executor);
        await SetMembershipAsync(app, "TenantUser", "Developer");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            (await platform.Users.SingleAsync(x => x.Id == Mehmet)).IsActive = false;
            await platform.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Mehmet, "TenantUser");

        Assert.Equal(HttpStatusCode.Forbidden, (await CreateRelease(client, "1.0.0")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await StorePreview(client)).StatusCode);
    }

    private sealed class CountingExecutor
    {
        public int Calls { get; private set; }

        public async Task<CustomSqlResult> ExecuteAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId,
            ITenantQueryConnectionFactory factory, CancellationToken ct, int maxRows)
        {
            Calls++;
            using var table = new DataTable();
            table.Columns.Add("Code", typeof(string));
            table.Rows.Add("C001");
            using var reader = table.CreateDataReader();
            return await CustomSqlReportRunner.ReadAsync(reader, maxRows, ct);
        }
    }

    private static async Task<WebApplication> StartApplicationAsync(CountingExecutor executor)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"catalog-developer-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"catalog-developer-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        // The production permission pipeline (PermissionRequirement + PermissionAuthorizationHandler) is not wired in this
        // host, so route-to-permission mapping and tenant Allow/Deny rules are not exercised here; only the catalog
        // developer gate can deny.
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
