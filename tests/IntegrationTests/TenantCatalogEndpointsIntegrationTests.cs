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

/// <summary>Catalog release creation, listing, the active catalog view and guarded activation.</summary>
public sealed class TenantCatalogEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string Releases = "/api/custom-pages/catalog/releases";

    private static string BundleJson(string parameterType = "text", bool keepCariler = true, bool cariSil = true) => $$"""
        { "schemaVersion": 1,
          "dataSources": [ {{(keepCariler ? $$"""{ "code": "cariler", "label": "Cari hesaplar", "source": { "sql": "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q" }, "parameters": [ { "name": "q", "type": "{{parameterType}}" } ] }""" : """{ "code": "diger", "label": "Diğer", "source": { "sql": "SELECT Code FROM CustomerAccounts" } }""")}} ],
          "actions": [ {{(cariSil ? """{ "code": "cariSil", "label": "Sil", "target": "row", "kind": "delete", "run": { "erpOperation": "cari.sil" } }""" : "")}} ] }
        """;

    private static JsonElement Bundle(string json) => JsonDocument.Parse(json).RootElement;

    private static async Task<HttpResponseMessage> Create(HttpClient client, string version, string bundleJson) =>
        await client.PostAsJsonAsync(Releases, new { version, bundle = Bundle(bundleJson), sourceRepository = "acme/catalog", sourceCommit = "abc123", sourcePath = "catalog.json" });

    private static async Task<Guid> CreateOk(HttpClient client, string version, string bundleJson)
    {
        var response = await Create(client, version, bundleJson);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static Task<HttpResponseMessage> Activate(HttpClient client, Guid id, Guid? expected) =>
        client.PostAsJsonAsync($"{Releases}/{id}/activate", new { expectedActiveReleaseId = expected });

    private static async Task<JsonElement> Json(HttpResponseMessage response) => await response.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task SeedPageAsync(WebApplication app, string code, bool published, string definitionJson)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        db.TenantCustomPages.Add(new TenantCustomPage
        {
            TenantId = TenantA, Code = code, Name = $"Sayfa {code}", Revision = 1, IsPublished = published, DefinitionJson = definitionJson,
            CreatedByUserId = Admin, UpdatedByUserId = Admin,
        });
        await db.SaveChangesAsync();
    }

    private static string DataSourcePage() =>
        CustomPageCatalogReferenceSchemaTests.Page(CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariler"));

    [Fact]
    public async Task Admin_creates_draft_release_and_sha_is_recorded()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var json = BundleJson();

        var response = await Create(client, "1.0.0", json);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await Json(response);
        Assert.Equal("Draft", body.GetProperty("status").GetString());
        Assert.Equal("1.0.0", body.GetProperty("version").GetString());
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var row = await db.TenantCatalogReleases.SingleAsync();
        Assert.True(JsonElement.DeepEquals(Bundle(json), Bundle(row.BundleJson)));
        Assert.Equal(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(row.BundleJson))), row.BundleSha256);
        Assert.Equal(row.BundleSha256, body.GetProperty("bundleSha256").GetString());
        Assert.Equal("acme/catalog", row.SourceRepository);
        var audit = await db.AuditEvents.SingleAsync(x => x.Action == "catalog.release.created");
        Assert.Equal($"1.0.0:{row.BundleSha256[..12]}", audit.Resource);

        var list = await Json(await client.GetAsync(Releases));
        var item = Assert.Single(list.EnumerateArray());
        Assert.Equal("Draft", item.GetProperty("status").GetString());
        Assert.False(item.TryGetProperty("bundleJson", out _));
        Assert.Equal(row.BundleSha256, item.GetProperty("bundleSha256").GetString());
        Assert.Equal("catalog.json", item.GetProperty("sourcePath").GetString());
    }

    [Fact]
    public async Task Non_admin_cannot_create_or_activate()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var id = await CreateOk(client, "1.0.0", BundleJson());

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await Create(client, "1.0.1", BundleJson())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Activate(client, id, null)).StatusCode);
        // A stale TenantAdmin claim without an admin membership is not enough either.
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await Create(client, "1.0.1", BundleJson())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Activate(client, id, null)).StatusCode);
    }

    [Fact]
    public async Task Invalid_bundle_returns_400_with_location()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        var response = await Create(client, "1.0.0", """{ "schemaVersion": 1, "dataSources": [ { "code": "x y", "label": "Hatalı", "source": { "sql": "SELECT 1 AS A" } } ] }""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("dataSource", (await Json(response)).GetProperty("error").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(client, "1.0", BundleJson())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(client, "v1.0.0", BundleJson())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Releases, new { version = "1.0.0", bundle = "metin" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Releases, new { version = "1.0.0" })).StatusCode);
    }

    [Fact]
    public async Task Duplicate_version_returns_409()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        await CreateOk(client, "1.0.0", BundleJson());
        Assert.Equal(HttpStatusCode.Conflict, (await Create(client, "1.0.0", BundleJson("int"))).StatusCode);
    }

    [Fact]
    public async Task Activate_makes_single_active_and_supersedes_previous()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        var second = await CreateOk(client, "1.1.0", BundleJson("text", cariSil: false));

        var activated = await Activate(client, first, null);
        Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
        Assert.Equal("Active", (await Json(activated)).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, second, first)).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var rows = await db.TenantCatalogReleases.ToListAsync();
        Assert.Equal("Superseded", rows.Single(x => x.Id == first).Status);
        var active = rows.Single(x => x.Status == "Active");
        Assert.Equal(second, active.Id);
        Assert.Equal(Admin, active.ActivatedByUserId);
        Assert.NotNull(active.ActivatedAt);
        Assert.Equal(2, await db.AuditEvents.CountAsync(x => x.Action == "catalog.release.activated"));

        var catalog = await Json(await client.GetAsync("/api/custom-pages/catalog"));
        Assert.Equal(second, catalog.GetProperty("releaseId").GetGuid());
        Assert.Equal("catalog.json", catalog.GetProperty("sourcePath").GetString());
        Assert.Empty(catalog.GetProperty("actions").EnumerateArray());
        // Activating the already active release is rejected.
        Assert.Equal(HttpStatusCode.Conflict, (await Activate(client, second, second)).StatusCode);
    }

    [Fact]
    public async Task Catalog_view_returns_new_column_flags()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var bundle = """
            { "schemaVersion": 1, "dataSources": [ { "code": "notlar", "label": "Notlar", "source": { "sql": "SELECT Code, Name FROM CustomerAccounts" },
              "columns": [ { "code": "Code", "label": "Kod", "type": "text", "key": true },
                           { "code": "Name", "label": "Not", "type": "text", "longText": true, "required": true, "maxLength": 200 } ] } ] }
            """;
        var id = await CreateOk(client, "1.0.0", bundle);
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, id, null)).StatusCode);

        var catalog = await Json(await client.GetAsync("/api/custom-pages/catalog"));
        var columns = catalog.GetProperty("dataSources")[0].GetProperty("columns");
        var plain = columns[0];
        Assert.False(plain.GetProperty("longText").GetBoolean());
        Assert.False(plain.GetProperty("required").GetBoolean());
        Assert.Equal(JsonValueKind.Null, plain.GetProperty("maxLength").ValueKind);
        var note = columns[1];
        Assert.True(note.GetProperty("longText").GetBoolean());
        Assert.True(note.GetProperty("required").GetBoolean());
        Assert.Equal(200, note.GetProperty("maxLength").GetInt32());
    }

    [Fact]
    public async Task Rollback_reactivates_superseded_release()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        var second = await CreateOk(client, "1.1.0", BundleJson());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, second, first)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, second)).StatusCode);

        var catalog = await Json(await client.GetAsync("/api/custom-pages/catalog"));
        Assert.Equal(first, catalog.GetProperty("releaseId").GetGuid());
        Assert.Equal("1.0.0", catalog.GetProperty("version").GetString());
    }

    [Fact]
    public async Task Activate_with_stale_expected_id_returns_409_and_keeps_active()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        var second = await CreateOk(client, "1.1.0", BundleJson());
        var third = await CreateOk(client, "1.2.0", BundleJson());

        Assert.Equal(HttpStatusCode.OK, (await Activate(client, second, null)).StatusCode);
        var stale = await Activate(client, third, null);

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("Katalog başka bir kullanıcı tarafından değiştirildi.", (await Json(stale)).GetProperty("error").GetString());
        Assert.Equal(second, (await Json(await client.GetAsync("/api/custom-pages/catalog"))).GetProperty("releaseId").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict, (await Activate(client, first, third)).StatusCode);
    }

    [Fact]
    public async Task Activate_blocked_when_published_page_uses_removed_code()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        await SeedPageAsync(app, "cari-arama", published: true, DataSourcePage());
        var second = await CreateOk(client, "2.0.0", BundleJson(keepCariler: false));

        var blocked = await Activate(client, second, first);

        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var body = await Json(blocked);
        Assert.Equal("Bu sürüm yayımlanmış sayfaların kullandığı yapı taşlarını bozuyor.", body.GetProperty("error").GetString());
        var page = Assert.Single(body.GetProperty("pages").EnumerateArray());
        Assert.Equal("cari-arama", page.GetProperty("code").GetString());
        Assert.Equal("cariler", Assert.Single(page.GetProperty("references").EnumerateArray()).GetString());
        Assert.Equal(first, (await Json(await client.GetAsync("/api/custom-pages/catalog"))).GetProperty("releaseId").GetGuid());
    }

    [Fact]
    public async Task Activate_blocked_when_parameter_type_changes()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        await SeedPageAsync(app, "cari-arama", published: true, DataSourcePage());
        var second = await CreateOk(client, "1.1.0", BundleJson("int"));

        var blocked = await Activate(client, second, first);

        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal("cari-arama", (await Json(blocked)).GetProperty("pages")[0].GetProperty("code").GetString());
        // The same parameters with an unchanged type activate fine.
        var compatible = await CreateOk(client, "1.2.0", BundleJson("text", cariSil: false));
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, compatible, first)).StatusCode);
    }

    private const string CarilerSql = """{ "code": "cariler", "label": "Cari hesaplar", "source": { "sql": "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q" }, "parameters": [ { "name": "q", "type": "text" } ] }""";

    private static string Pack(string dataSources, string actions = "") => $$"""{ "schemaVersion": 1, "dataSources": [ {{dataSources}} ], "actions": [ {{actions}} ] }""";

    private static async Task<JsonElement> AssertBlockedAsync(HttpClient client, Guid release, Guid expected, string page, string reference)
    {
        var blocked = await Activate(client, release, expected);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var body = await Json(blocked);
        var broken = Assert.Single(body.GetProperty("pages").EnumerateArray());
        Assert.Equal(page, broken.GetProperty("code").GetString());
        Assert.Contains(reference, broken.GetProperty("references").EnumerateArray().Select(x => x.GetString()));
        return broken;
    }

    [Fact]
    public async Task Activate_blocked_when_item_kind_changes()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        await SeedPageAsync(app, "cari-arama", published: true, DataSourcePage());
        // Same code, now an action.
        var second = await CreateOk(client, "2.0.0", Pack("", """{ "code": "cariler", "label": "Sil", "kind": "delete", "run": { "sql": "DELETE FROM CustomerAccounts WHERE Name LIKE @q" }, "parameters": [ { "name": "q", "type": "text" } ] }"""));

        await AssertBlockedAsync(client, second, first, "cari-arama", "cariler");
    }

    [Fact]
    public async Task Activate_blocked_when_sql_item_becomes_erp_operation_even_if_active_bundle_has_a_stale_item()
    {
        await using var app = await StartApplicationAsync();
        Guid first;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            // The active release (written directly) also holds an item whose operation no longer exists.
            var release = CustomPageCatalogReferenceSchemaTests.Release(TenantA, "1.0.0", "Active",
                Pack(CarilerSql + """, { "code": "eski", "label": "Eski", "source": { "erpOperation": "yok.boyle.islem" } }"""));
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.TenantCatalogReleases.Add(release);
            await db.SaveChangesAsync();
            first = release.Id;
        }
        await SeedPageAsync(app, "cari-arama", published: true, DataSourcePage());
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        // cari.listele also takes q: text, so the page alone would still validate; the source change must still block.
        var second = await CreateOk(client, "2.0.0", Pack("""{ "code": "cariler", "label": "Cari hesaplar", "source": { "erpOperation": "cari.listele" } }"""));

        await AssertBlockedAsync(client, second, first, "cari-arama", "cariler");
    }

    [Fact]
    public async Task Activate_blocked_when_operation_is_swapped_for_one_the_page_does_not_satisfy()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", Pack("""{ "code": "cariListe", "label": "Cari liste", "source": { "erpOperation": "cari.listele" } }"""));
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        await SeedPageAsync(app, "cari-liste", published: true,
            CustomPageCatalogReferenceSchemaTests.Page(CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariListe", parameters: [])));
        // Same code and kind, but cari.getir needs a route id the page does not bind.
        var second = await CreateOk(client, "2.0.0", Pack("""{ "code": "cariListe", "label": "Cari liste", "source": { "erpOperation": "cari.getir" } }"""));

        var broken = await AssertBlockedAsync(client, second, first, "cari-liste", "cariListe");
        Assert.Contains("id", broken.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Activate_blocked_when_parameter_name_case_changes()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", Pack(CarilerSql));
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        await SeedPageAsync(app, "cari-arama", published: true, DataSourcePage());
        // Parameter names are compared exactly (Ordinal) at save, at activation and at run: q and Q differ.
        var second = await CreateOk(client, "1.1.0", Pack(CarilerSql.Replace("@q", "@Q").Replace("\"name\": \"q\"", "\"name\": \"Q\"")));

        await AssertBlockedAsync(client, second, first, "cari-arama", "cariler");
    }

    [Fact]
    public async Task Page_invalid_for_unrelated_reason_does_not_block_activation_or_rollback()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        // Published page with an intact catalog reference plus an inline SQL query today's validator rejects.
        var stale = new { id = "q2", name = "eski", kind = "read", sql = "SELECT 1; SELECT 2", parameters = Array.Empty<object>(), runOn = "manual" };
        await SeedPageAsync(app, "cari-arama", published: true,
            CustomPageCatalogReferenceSchemaTests.Page(CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariler"), stale));
        var second = await CreateOk(client, "1.1.0", BundleJson());

        Assert.Equal(HttpStatusCode.OK, (await Activate(client, second, first)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, second)).StatusCode);
    }

    [Fact]
    public async Task Reference_missing_from_both_old_and_new_release_does_not_block_activation()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson(keepCariler: false));
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        // Already broken under the active release (restored from an old revision, for example).
        await SeedPageAsync(app, "cari-arama", published: true, DataSourcePage());
        var second = await CreateOk(client, "1.1.0", BundleJson(keepCariler: false));

        Assert.Equal(HttpStatusCode.OK, (await Activate(client, second, first)).StatusCode);
    }

    [Fact]
    public async Task Draft_page_reference_does_not_block_activation()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateOk(client, "1.0.0", BundleJson());
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, first, null)).StatusCode);
        await SeedPageAsync(app, "cari-arama", published: false, DataSourcePage());
        var second = await CreateOk(client, "2.0.0", BundleJson(keepCariler: false));

        Assert.Equal(HttpStatusCode.OK, (await Activate(client, second, first)).StatusCode);
    }

    [Fact]
    public async Task Catalog_list_hides_sql_for_non_admin()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await Activate(client, await CreateOk(client, "1.0.0", BundleJson()), null)).StatusCode);

        var adminText = await (await client.GetAsync("/api/custom-pages/catalog")).Content.ReadAsStringAsync();
        Assert.Contains("\"sql\":\"SELECT Code, Name FROM CustomerAccounts", adminText);

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        var response = await client.GetAsync("/api/custom-pages/catalog");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"sql\":", text);
        Assert.DoesNotContain("CustomerAccounts", text);
        var catalog = JsonDocument.Parse(text).RootElement;
        Assert.Equal("sql", catalog.GetProperty("dataSources")[0].GetProperty("source").GetString());
        var action = catalog.GetProperty("actions")[0];
        Assert.Equal("erpOperation", action.GetProperty("source").GetString());
        Assert.Equal("cari.sil", action.GetProperty("erpOperation").GetString());
        Assert.Equal("delete", action.GetProperty("kind").GetString());
    }

    [Fact]
    public async Task Catalog_with_a_stale_item_still_shows_the_active_release()
    {
        await using var app = await StartApplicationAsync();
        Guid id;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            // Written directly: "cariler" carries SQL that today's validator rejects, "eski" an operation that no longer exists.
            var stale = BundleJson().Replace("SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q", "DELETE FROM CustomerAccounts WHERE Name LIKE @q")
                .Replace("\"actions\": [", "\"actions\": [ { \"code\": \"eski\", \"label\": \"Eski\", \"kind\": \"delete\", \"run\": { \"erpOperation\": \"yok.boyle.islem\" } },");
            var release = CustomPageCatalogReferenceSchemaTests.Release(TenantA, "3.0.0", "Active", stale);
            scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCatalogReleases.Add(release);
            await scope.ServiceProvider.GetRequiredService<TenantDbContext>().SaveChangesAsync();
            id = release.Id;
        }
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        var catalog = await Json(await client.GetAsync("/api/custom-pages/catalog"));

        Assert.Equal(id, catalog.GetProperty("releaseId").GetGuid());
        Assert.Equal("3.0.0", catalog.GetProperty("version").GetString());
        Assert.Empty(catalog.GetProperty("dataSources").EnumerateArray());
        Assert.Equal("cariSil", Assert.Single(catalog.GetProperty("actions").EnumerateArray()).GetProperty("code").GetString());
        Assert.Equal(["cariler", "eski"], catalog.GetProperty("invalidItems").EnumerateArray().Select(x => x.GetString()!).ToArray());
    }

    [Fact]
    public async Task Catalog_without_active_release_is_empty()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        var catalog = await Json(await client.GetAsync("/api/custom-pages/catalog"));
        Assert.Equal(JsonValueKind.Null, catalog.GetProperty("releaseId").ValueKind);
        Assert.Equal(JsonValueKind.Null, catalog.GetProperty("sourcePath").ValueKind);
        Assert.Empty(catalog.GetProperty("dataSources").EnumerateArray());
        Assert.Empty(catalog.GetProperty("actions").EnumerateArray());
    }

    [Theory]
    [InlineData("GET", "/api/custom-pages/catalog", "/api/custom-pages/catalog", "erp.tenant-customizations.read")]
    [InlineData("GET", "/api/custom-pages/catalog/releases", "/api/custom-pages/catalog/releases", "erp.tenant-customizations.read")]
    [InlineData("POST", "/api/custom-pages/catalog/releases", "/api/custom-pages/catalog/releases", "erp.tenant-customizations.create")]
    [InlineData("POST", "/api/custom-pages/catalog/previews", "/api/custom-pages/catalog/previews", "erp.tenant-customizations.create")]
    [InlineData("POST", "/api/custom-pages/catalog/previews/7d7b5b0e-7c1f-4c38-9d55-2a8f1f7b3a10/items/cariler/run", "/api/custom-pages/catalog/previews/{id:guid}/items/{code}/run", "erp.tenant-customizations.execute")]
    [InlineData("POST", "/api/custom-pages/catalog/releases/7d7b5b0e-7c1f-4c38-9d55-2a8f1f7b3a10/activate", "/api/custom-pages/catalog/releases/{id:guid}/activate", "erp.tenant-customizations.execute")]
    public void Catalog_routes_resolve_to_tenant_customizations_permission(string method, string path, string routePattern, string expectedCode)
    {
        Assert.True(PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            TenantA, Guid.NewGuid(), "TenantUser", out var resolved));
        Assert.Equal(expectedCode, resolved!.Permission.Code);
    }

    [Fact]
    public async Task Catalog_route_is_not_swallowed_by_page_routes()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        var catalog = await Json(await client.GetAsync("/api/custom-pages/catalog"));
        Assert.True(catalog.TryGetProperty("dataSources", out _));
    }

    [Fact]
    public async Task Other_tenant_release_is_not_visible_or_activatable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Guid foreign;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var release = CustomPageCatalogReferenceSchemaTests.Release(TenantB, "9.9.9", "Draft", Bundle(BundleJson()).GetRawText());
            db.TenantCatalogReleases.Add(release);
            await db.SaveChangesAsync();
            foreign = release.Id;
        }
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        Assert.Equal(HttpStatusCode.NotFound, (await Activate(client, foreign, null)).StatusCode);
        Assert.Empty((await Json(await client.GetAsync(Releases))).EnumerateArray());
    }

    /// <summary>The catalog-reference test host: an allow-all permission authorizer so only the admin gate can deny.</summary>
    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"catalog-endpoints-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"catalog-endpoints-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomPageQueryRulesIntegrationTests.AllowAllPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
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
