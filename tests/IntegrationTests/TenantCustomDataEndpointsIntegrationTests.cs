using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantCustomDataEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Custom_data_lifecycle_is_versioned_audited_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var create = await client.PostAsJsonAsync("/api/custom-data/entities", new
        {
            code = "asset-notes",
            name = "Varlık notları",
            fields = new[] { new { code = "note", label = "Not", dataType = "Text", isRequired = true, maxLength = 120 } }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var entityId = created.RootElement.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, entityId);
        Assert.Equal(1, created.RootElement.GetProperty("version").GetInt32());
        Assert.Equal("Draft", created.RootElement.GetProperty("status").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/custom-data/entities", new
        {
            code = "Invalid Code",
            name = "Hatalı model",
            fields = new[] { new { code = "note", label = "Not", dataType = "Unsupported", isRequired = false } }
        })).StatusCode);

        await using (var entityScope = app.Services.CreateAsyncScope())
        {
            var entityDb = entityScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.True(await entityDb.TenantCustomDataEntities.AnyAsync(x => x.TenantId == TenantA && x.Id == entityId));
        }
        var publish = await client.PostAsync($"/api/custom-data/entities/{entityId}/publish", null);
        Assert.True(publish.StatusCode == HttpStatusCode.OK, $"Publish returned {(int)publish.StatusCode}: {await publish.Content.ReadAsStringAsync()}");
        var recordResponse = await client.PostAsJsonAsync("/api/custom-data/entities/asset-notes/records", new
        {
            values = new Dictionary<string, string?> { ["note"] = "Sayım sırasında kontrol edildi" }
        });
        Assert.Equal(HttpStatusCode.Created, recordResponse.StatusCode);
        using var recordJson = JsonDocument.Parse(await recordResponse.Content.ReadAsStringAsync());
        var recordId = recordJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Sayım sırasında kontrol edildi", recordJson.RootElement.GetProperty("values").GetProperty("note").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/custom-data/entities/asset-notes/records", new
        {
            values = new Dictionary<string, string?> { ["unknown"] = "ret" }
        })).StatusCode);

        var draft = await client.PostAsync($"/api/custom-data/entities/{entityId}/draft", null);
        Assert.Equal(HttpStatusCode.Created, draft.StatusCode);
        using var draftJson = JsonDocument.Parse(await draft.Content.ReadAsStringAsync());
        var draftId = draftJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(2, draftJson.RootElement.GetProperty("version").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/custom-data/entities/{entityId}")).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var visibleEntities = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-data/entities");
        var visibleEntity = Assert.Single(visibleEntities!);
        Assert.Equal("Published", visibleEntity.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-data/entities/{draftId}", new
        {
            name = "Yetkisiz",
            fields = new[] { new { code = "note", label = "Not", dataType = "Text", isRequired = true, maxLength = 120 } }
        })).StatusCode);

        SetIdentity(client, TenantB, UserA, "TenantAdmin");
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/custom-data/entities"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/custom-data/records/{recordId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/custom-data/entities/asset-notes/records")).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(4, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action.StartsWith("custom-data.")));
        Assert.Empty(await db.TenantCustomDataEntities.Where(x => x.TenantId == TenantB).ToListAsync());
    }

    [Fact]
    public async Task Custom_data_schema_has_tenant_code_version_and_published_uniqueness_constraints()
    {
        await using var app = await StartApplicationAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var entityType = db.Model.FindEntityType(typeof(TenantCustomDataEntity))!;
        var uniqueVersionIndex = entityType.GetIndexes().Single(x => x.IsUnique &&
            x.Properties.Select(property => property.Name).SequenceEqual(["TenantId", "Code", "Version"]));
        var publishedCodeIndex = entityType.GetIndexes().Single(x => x.IsUnique &&
            x.Properties.Select(property => property.Name).SequenceEqual(["TenantId", "Code"]));
        Assert.Null(uniqueVersionIndex.GetFilter());
        Assert.Equal("[Status] = 'Published'", publishedCodeIndex.GetFilter());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"custom-data-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomDataEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        return app;
    }

    private static void SetIdentity(HttpClient client, Guid tenant, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenant.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }
}
