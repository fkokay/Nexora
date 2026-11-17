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

public sealed class CustomSqlReportIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid CurrentUser = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Theory]
    [InlineData("/api/reports/run")]
    [InlineData("/api/reports/export")]
    public async Task CustomSql_is_forbidden_for_tenant_user(string endpoint)
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory, tenantBRole: "TenantAdmin");
        using var client = CreateClient(app, role: "TenantUser");

        var response = await client.PostAsJsonAsync(endpoint, Definition(TenantA));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, factory.Calls);
    }

    [Theory]
    [InlineData("/api/reports/run")]
    [InlineData("/api/reports/export")]
    public async Task CustomSql_is_forbidden_when_user_is_not_admin_in_every_selected_company(string endpoint)
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory, tenantBRole: "TenantUser");
        using var client = CreateClient(app, role: "TenantAdmin");

        var response = await client.PostAsJsonAsync(endpoint, Definition(TenantA, TenantB));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task CustomSql_is_forbidden_for_company_without_membership()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory, tenantBRole: null);
        using var client = CreateClient(app, role: "TenantAdmin");

        var response = await client.PostAsJsonAsync("/api/reports/run", Definition(TenantA, TenantB));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, factory.Calls);
    }

    [Theory]
    [InlineData("/api/reports/run")]
    [InlineData("/api/reports/export")]
    public async Task CustomSql_returns_503_when_query_connection_is_unavailable(string endpoint)
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: true);
        await using var app = await StartApplicationAsync(factory, tenantBRole: "TenantAdmin");
        using var client = CreateClient(app, role: "TenantAdmin");

        var response = await client.PostAsJsonAsync(endpoint, Definition(TenantA, TenantB));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("Sorgu veritabanı erişimi bu firma için hazır değil.", await response.Content.ReadAsStringAsync());
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);
    }

    [Theory]
    [InlineData("/api/reports/run")]
    [InlineData("/api/reports/export")]
    public async Task CustomSql_rejects_database_enumeration_before_opening_a_connection(string endpoint)
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory, tenantBRole: "TenantAdmin");
        using var client = CreateClient(app, role: "TenantAdmin");

        var response = await client.PostAsJsonAsync(endpoint,
            new { source = "customSql", sqlQuery = "SELECT DB_NAME(5) AS name", companyIds = new[] { TenantA }, page = 1, pageSize = 50 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var message = problem.RootElement.GetProperty("errors").GetProperty("sqlQuery")[0].GetString();
        Assert.Contains("veritabanlarını", message);
        Assert.Equal(0, factory.Calls);
    }

    [Fact]
    public async Task Catalog_lists_customSql_only_for_tenant_admin()
    {
        var factory = new RecordingQueryConnectionFactory(unavailable: false);
        await using var app = await StartApplicationAsync(factory, tenantBRole: "TenantAdmin");

        using var adminClient = CreateClient(app, role: "TenantAdmin");
        var adminSources = await CatalogSourcesAsync(adminClient);
        Assert.Contains("customSql", adminSources);

        using var userClient = CreateClient(app, role: "TenantUser");
        var userSources = await CatalogSourcesAsync(userClient);
        Assert.DoesNotContain("customSql", userSources);
        Assert.Contains("customers", userSources);
    }

    private static async Task<string[]> CatalogSourcesAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/reports/catalog");
        response.EnsureSuccessStatusCode();
        var catalog = await response.Content.ReadFromJsonAsync<JsonElement[]>();
        return catalog!.Select(source => source.GetProperty("code").GetString()!).ToArray();
    }

    private static object Definition(params Guid[] companyIds) =>
        new { source = "customSql", sqlQuery = "SELECT 1 AS value", companyIds, page = 1, pageSize = 50 };

    private static HttpClient CreateClient(WebApplication app, string role)
    {
        var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", CurrentUser.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        return client;
    }

    private static async Task<WebApplication> StartApplicationAsync(RecordingQueryConnectionFactory factory, string? tenantBRole)
    {
        var databaseName = $"custom-sql-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer>(new CustomizationTestPermissionAuthorizer());
        builder.Services.AddSingleton<ITenantQueryConnectionFactory>(factory);
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapReportEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platformDb.Database.EnsureCreatedAsync();
        platformDb.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        platformDb.TenantMemberships.Add(new TenantMembership { UserId = CurrentUser, TenantId = TenantA, Role = "TenantAdmin" });
        if (tenantBRole is not null)
            platformDb.TenantMemberships.Add(new TenantMembership { UserId = CurrentUser, TenantId = TenantB, Role = tenantBRole });
        await platformDb.SaveChangesAsync();
        return app;
    }

    private sealed class RecordingQueryConnectionFactory(bool unavailable) : ITenantQueryConnectionFactory
    {
        public int Calls { get; private set; }
        public TenantQueryAccess? LastAccess { get; private set; }

        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
        {
            Calls++;
            LastAccess = access;
            if (unavailable) throw new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil.");
            throw new InvalidOperationException("Sorgu bağlantı fabrikası bu testte çağrılmamalıydı.");
        }
    }
}
