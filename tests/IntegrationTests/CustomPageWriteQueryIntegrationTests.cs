using System.Net;
using System.Net.Http.Json;
using System.Reflection;
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

public sealed class CustomPageWriteQueryIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string Code = "not-panosu";

    internal static object Definition() => new
    {
        schemaVersion = 2,
        queries = new object[]
        {
            new { id = "liste", name = "notlar", kind = "read", runOn = "load", sql = "SELECT Code, Name FROM CustomerAccounts", parameters = Array.Empty<object>() },
            new
            {
                id = "ekle", name = "notEkle", kind = "insert", runOn = "manual",
                sql = "INSERT INTO CustomerNotes (Code, Note) VALUES (@kod, @metin)",
                parameters = new object[] { new { name = "kod", binding = "{{kod.value}}", type = "text" }, new { name = "metin", binding = "{{metin.value}}", type = "text" } }
            },
            new
            {
                id = "guncelle", name = "notGuncelle", kind = "update", runOn = "manual",
                sql = "UPDATE CustomerAccounts SET Name = @metin WHERE Code = @kod",
                parameters = new object[] { new { name = "kod", binding = "{{kod.value}}", type = "text" }, new { name = "metin", binding = "{{metin.value}}", type = "text" } }
            }
        },
        components = new object[]
        {
            new { id = "c1", type = "input", name = "kod", props = new { inputType = "text" } },
            new { id = "c2", type = "input", name = "metin", props = new { inputType = "text" } },
            new { id = "b1", type = "button", props = new { label = "Ekle", actionType = "query", queryId = "ekle", refreshQueries = new[] { "liste" } } }
        }
    };

    private static readonly object WriteBody = new { parameters = new { kod = "C-1", metin = "Ayşe'nin notu" } };

    [Fact]
    public async Task Write_without_matching_right_is_forbidden_and_factory_not_called()
    {
        var factory = new FakeWriteConnectionFactory(_ => new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil."));
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(client);

        SetIdentity(client, Ayse, "TenantUser");
        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/guncelle/run", WriteBody);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(CustomPageQueryEndpoints.ForbiddenWriteError, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        // The right is checked before the parameters, so a malformed body is also 403.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/guncelle/run", new { })).StatusCode);
        Assert.Equal(0, factory.Calls);
        Assert.Empty(await WriteAuditsAsync(app));
    }

    [Fact]
    public async Task Write_uses_write_connection_access()
    {
        var factory = new FakeWriteConnectionFactory(_ => new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil."));
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(client);

        SetIdentity(client, Ayse, "TenantUser");
        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/ekle/run", WriteBody);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(1, factory.Calls);
        Assert.Equal(TenantQueryAccess.Write, factory.LastAccess);
        Assert.Equal(TenantA, factory.LastTenant);
        // A read query on the same page still uses the read login.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/liste/run", new { parameters = new { } })).StatusCode);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);
    }

    [Fact]
    public async Task Failed_write_attempt_is_audited()
    {
        var factory = new FakeWriteConnectionFactory(_ => CreateSqlException(2627, "Yinelenen anahtar."));
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        await PublishAsync(client);

        SetIdentity(client, Ayse, "TenantUser");
        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/ekle/run", WriteBody);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("SQL hatası", await response.Content.ReadAsStringAsync());
        var audit = Assert.Single(await WriteAuditsAsync(app));
        Assert.False(audit.Succeeded);
        Assert.Equal(2627, audit.ErrorNumber);
        Assert.Null(audit.AffectedRows);
        Assert.False(audit.IsPreview);
        Assert.Equal((TenantA, Ayse, Code, "notEkle", "insert"), (audit.TenantId, audit.UserId, audit.PageCode, audit.QueryName, audit.Kind));
        // Write audit keeps the parameter values.
        var parameters = JsonDocument.Parse(audit.ParametersJson).RootElement;
        Assert.Equal("C-1", parameters.GetProperty("kod").GetString());
        Assert.Equal("Ayşe'nin notu", parameters.GetProperty("metin").GetString());
    }

    [Fact]
    public async Task Preview_write_requires_explicit_confirmation()
    {
        var factory = new FakeWriteConnectionFactory(_ => new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil."));
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = Code, name = "Not", definition = Definition() });
        var draftId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        foreach (var body in new object[] { WriteBody, new { parameters = new { kod = "C-1", metin = "x" }, confirmWrite = false } })
        {
            var blocked = await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/ekle/run", body);
            Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
            Assert.Equal(CustomPageQueryEndpoints.PreviewWriteConfirmationError, (await blocked.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
        Assert.Equal(0, factory.Calls);
        // Read queries need no confirmation in preview.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/liste/run", new { parameters = new { } })).StatusCode);
        Assert.Equal(TenantQueryAccess.Read, factory.LastAccess);

        var confirmed = await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/preview/queries/ekle/run",
            new { parameters = new { kod = "C-1", metin = "x" }, confirmWrite = true });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, confirmed.StatusCode);
        Assert.Equal(TenantQueryAccess.Write, factory.LastAccess);
        var audit = Assert.Single(await WriteAuditsAsync(app));
        Assert.True(audit.IsPreview);
        Assert.False(audit.Succeeded);
        Assert.Null(audit.ErrorNumber);
    }

    [Fact]
    public async Task Published_response_includes_user_rights()
    {
        var factory = new FakeWriteConnectionFactory(_ => new InvalidOperationException("Bu testte bağlantı açılmamalı."));
        await using var app = await StartApplicationAsync(factory);
        using var client = app.GetTestClient();
        var publishedId = await PublishAsync(client);

        static void AssertRights(JsonElement page, bool view, bool insert, bool update, bool delete)
        {
            var rights = page.GetProperty("rights");
            Assert.Equal((view, insert, update, delete),
                (rights.GetProperty("view").GetBoolean(), rights.GetProperty("insert").GetBoolean(), rights.GetProperty("update").GetBoolean(), rights.GetProperty("delete").GetBoolean()));
        }

        SetIdentity(client, Ayse, "TenantUser");
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/published"), true, true, false, false);
        SetIdentity(client, Admin, "TenantAdmin");
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/published"), true, true, true, true);

        // Preview carries the previewing admin's rights.
        var draft = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = Code, name = "Not v2", definition = Definition() });
        var draftId = (await draft.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.NotEqual(publishedId, draftId);
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{draftId}/preview"), true, true, true, true);
        Assert.Equal(0, factory.Calls);
    }

    /// <summary>Publishes the page as admin and grants Ayse View + Insert only. Leaves the admin identity set.</summary>
    private static async Task<Guid> PublishAsync(HttpClient client)
    {
        SetIdentity(client, Admin, "TenantAdmin");
        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = Code, name = "Not", definition = Definition() });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access",
            new { mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = true, canInsert = true } }, expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        return id;
    }

    private static async Task<List<TenantCustomPageWriteAudit>> WriteAuditsAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TenantCustomPageWriteAudits.AsNoTracking().ToListAsync();
    }

    internal static async Task<WebApplication> StartApplicationAsync(ITenantQueryConnectionFactory factory)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-write-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-write-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSingleton(factory);
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);

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

    /// <summary>
    /// SqlException has no public constructor; build one through the client's internal factory so the endpoint sees a
    /// real SQL error number.
    /// </summary>
    private static SqlException CreateSqlException(int number, string message)
    {
        const BindingFlags Flags = BindingFlags.NonPublic | BindingFlags.Instance;
        var errorConstructor = typeof(SqlError).GetConstructors(Flags).OrderByDescending(x => x.GetParameters().Length).First();
        var arguments = errorConstructor.GetParameters().Select(parameter => parameter.Name switch
        {
            "infoNumber" => (object?)number,
            "errorMessage" => message,
            "server" or "procedure" => "",
            _ => parameter.ParameterType.IsValueType ? Activator.CreateInstance(parameter.ParameterType) : null
        }).ToArray();
        var error = (SqlError)errorConstructor.Invoke(arguments);
        var errors = (SqlErrorCollection)typeof(SqlErrorCollection).GetConstructors(Flags).Single(x => x.GetParameters().Length == 0).Invoke(null);
        typeof(SqlErrorCollection).GetMethod("Add", Flags)!.Invoke(errors, [error]);
        var create = typeof(SqlException).GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
            .Where(x => x.Name == "CreateException").OrderBy(x => x.GetParameters().Length).First();
        var createArguments = create.GetParameters().Select(parameter => parameter.ParameterType == typeof(SqlErrorCollection) ? errors
            : parameter.ParameterType == typeof(string) ? "16.0" : parameter.ParameterType.IsValueType ? Activator.CreateInstance(parameter.ParameterType) : null).ToArray();
        return (SqlException)create.Invoke(null, createArguments)!;
    }

    private sealed class FakeWriteConnectionFactory(Func<TenantQueryAccess, Exception> failure) : ITenantQueryConnectionFactory
    {
        public int Calls { get; private set; }
        public TenantQueryAccess? LastAccess { get; private set; }
        public Guid? LastTenant { get; private set; }

        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
        {
            Calls++;
            LastAccess = access;
            LastTenant = tenantId;
            throw failure(access);
        }
    }
}
