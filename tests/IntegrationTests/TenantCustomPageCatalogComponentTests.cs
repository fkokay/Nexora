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

/// <summary>
/// Yazılımcı bileşeni on a page: a <c>code</c> component with <c>catalogComponent</c> + <c>componentSettings</c>. Saving needs
/// only page write permission and a component of the active catalog; reading resolves its CSS/JavaScript/height from the
/// active catalog, or marks it <c>catalogMissing</c>.
/// </summary>
public sealed class TenantCustomPageCatalogComponentTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = CustomPageQueryEndpointsIntegrationTests.Admin;
    private static readonly Guid Ayse = CustomPageCatalogReferenceEndpointsIntegrationTests.Ayse;
    private const string ComponentCss = ".grafik { color: #123456; }";
    private const string ComponentJs = "bridge.ready(); /* katalog-kodu */";

    private static string ComponentJson(string code = "satisGrafigi") => $$"""
        { "code": "{{code}}", "label": "Satış grafiği", "height": 320,
          "css": {{JsonSerializer.Serialize(ComponentCss)}}, "javascript": {{JsonSerializer.Serialize(ComponentJs)}},
          "settings": [ { "name": "baslik", "label": "Başlık", "type": "text", "default": "Satışlar" },
                        { "name": "adet", "label": "Adet", "type": "number" },
                        { "name": "goster", "label": "Göster", "type": "bool", "default": true },
                        { "name": "tur", "label": "Tür", "type": "choice", "options": [ "cizgi", "sutun" ], "default": "sutun" } ] }
        """;

    private static string BundleJson(bool withComponent = true, string? component = null) => $$"""
        { "schemaVersion": 1,
          "dataSources": [ { "code": "cariler", "label": "Cari hesaplar",
              "source": { "sql": "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q" },
              "parameters": [ { "name": "q", "type": "text" } ] } ],
          "components": [ {{component ?? (withComponent ? ComponentJson() : "")}} ] }
        """;

    private static Dictionary<string, object> CodeComponent(object props) =>
        new() { ["id"] = "k1", ["type"] = "code", ["props"] = props };

    private static object Settings(object? settings = null) => new Dictionary<string, object>
    {
        ["catalogComponent"] = "satisGrafigi",
        ["componentSettings"] = settings ?? new Dictionary<string, object> { ["baslik"] = "Aylık", ["adet"] = 3, ["goster"] = false, ["tur"] = "cizgi" },
    };

    /// <summary>A v2 page; the code component sits inside a section when <paramref name="nested"/>.</summary>
    private static string Page(object props, bool nested = false, bool withQuery = false)
    {
        var code = CodeComponent(props);
        var components = new List<object> { new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } } };
        components.Add(nested ? new { id = "s1", type = "section", props = new { title = "Bölüm" }, children = new object[] { code } } : code);
        var page = new Dictionary<string, object> { ["schemaVersion"] = 2, ["components"] = components };
        if (withQuery) page["queries"] = new[] { CustomPageCatalogReferenceSchemaTests.Reference("dataSource", "cariler") };
        return JsonSerializer.Serialize(page);
    }

    private static JsonElement Element(string json) => JsonDocument.Parse(json).RootElement;

    private static Task<HttpResponseMessage> CreateDraft(HttpClient client, string definition, string code = "satis-sayfasi") =>
        client.PostAsJsonAsync("/api/custom-pages/drafts", new { code, name = "Satış sayfası", definition = Element(definition) });

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString();

    private static async Task AssertRejected(HttpClient client, string definition, string expected)
    {
        var response = await CreateDraft(client, definition);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(expected, await ErrorAsync(response));
    }

    // ---- Save ----

    [Fact]
    public async Task Page_with_catalog_component_saves_for_page_writer()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");

        var created = await CreateDraft(client, Page(Settings(), nested: true));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        // No settings at all is fine too (the defaults apply).
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{id}",
            new { expectedRevision = 1, name = "Satış sayfası 2", definition = Element(Page(new { catalogComponent = "satisGrafigi" })) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{id}",
            new { expectedRevision = 2, name = "Satış sayfası 3", definition = Element(Page(Settings(), withQuery: true)) })).StatusCode);

        // The stored definition carries only the reference, never the component's code.
        await using var scope = app.Services.CreateAsyncScope();
        var stored = (await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.SingleAsync()).DefinitionJson;
        Assert.DoesNotContain("katalog-kodu", stored);
        Assert.DoesNotContain("grafik", stored);
    }

    [Fact]
    public async Task Inline_code_still_needs_tenant_admin()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        var inline = Page(new { css = ".a { color: red; }", javascript = "bridge.ready();" });

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateDraft(client, inline)).StatusCode);
        // A stale TenantAdmin claim without the membership is not enough.
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateDraft(client, inline)).StatusCode);

        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Created, (await CreateDraft(client, inline)).StatusCode);
    }

    [Fact]
    public async Task Catalog_component_with_css_or_javascript_is_rejected()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        const string message = "Katalogdan seçilen bileşende kod (css, javascript) yazılmaz.";
        foreach (var (user, role) in new[] { (Admin, "TenantAdmin"), (Ayse, "TenantUser") })
        {
            CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, user, role);
            await AssertRejected(client, Page(new { catalogComponent = "satisGrafigi", css = ".a { color: red; }" }), message);
            await AssertRejected(client, Page(new { catalogComponent = "satisGrafigi", javascript = "alert(1);" }), message);
            await AssertRejected(client, Page(new { catalogComponent = "satisGrafigi", javascript = "" }, nested: true), message);
        }
    }

    [Fact]
    public async Task Malformed_reference_is_rejected_by_the_schema()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        await AssertRejected(client, Page(new { catalogComponent = "Satis-grafigi" }), "Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
        await AssertRejected(client, Page(new { catalogComponent = 5 }), "Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
        // Settings without a component, settings that are not an object or hold a non-scalar value.
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(new { componentSettings = new { baslik = "x" } }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(new { catalogComponent = "satisGrafigi", componentSettings = new[] { "x" } }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(Settings(new { baslik = new { ic = 1 } })))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(Settings(new { baslik = (string?)null })))).StatusCode);
        // Only the code component may reference a catalog component.
        var onText = JsonSerializer.Serialize(new { schemaVersion = 2, components = new[] { new { id = "t1", type = "text", props = new { text = "a", catalogComponent = "satisGrafigi" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, onText)).StatusCode);
        // Not in schema v1.
        var v1 = JsonSerializer.Serialize(new { schemaVersion = 1, components = new[] { CodeComponent(new { catalogComponent = "satisGrafigi" }) } });
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, v1)).StatusCode);
    }

    [Fact]
    public async Task Unknown_setting_and_wrong_type_are_rejected()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");

        await AssertRejected(client, Page(Settings(new { yok = 1 })), "Bileşen ayarı 'yok' bileşende tanımlı değil.");
        await AssertRejected(client, Page(Settings(new { adet = "3" })), "Bileşen ayarı 'adet' için değer türü uygun değil.");
        await AssertRejected(client, Page(Settings(new { baslik = 3 })), "Bileşen ayarı 'baslik' için değer türü uygun değil.");
        await AssertRejected(client, Page(Settings(new { goster = "true" })), "Bileşen ayarı 'goster' için değer türü uygun değil.");
        await AssertRejected(client, Page(Settings(new { tur = "pasta" })), "Bileşen ayarı 'tur' için değer türü uygun değil.");
        Assert.Equal(HttpStatusCode.Created, (await CreateDraft(client, Page(Settings(new { adet = 2.5, tur = "sutun" })))).StatusCode);
    }

    [Fact]
    public async Task Unknown_component_is_rejected_on_save()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");
        const string message = "Seçilen bileşen etkin katalogda yok.";

        await AssertRejected(client, Page(new { catalogComponent = "yokBilesen" }, nested: true), message);
        // Case matters: codes are compared ordinally.
        await AssertRejected(client, Page(new { catalogComponent = "satisgrafigi" }), message);

        // Without any active catalog nothing can be referenced.
        await using var empty = await StartApplicationAsync(activeBundle: null);
        using var other = empty.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(other, Ayse, "TenantUser");
        await AssertRejected(other, Page(new { catalogComponent = "satisGrafigi" }), message);
    }

    [Fact]
    public async Task Saved_page_with_componentDefaults_is_rejected()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        // componentDefaults, catalogMissing and the resolved height are written by the server only.
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(new { catalogComponent = "satisGrafigi", componentDefaults = new { baslik = "x" } }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(new { catalogComponent = "satisGrafigi", catalogMissing = true }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateDraft(client, Page(new { catalogComponent = "satisGrafigi", height = 300 }))).StatusCode);
    }

    // ---- Read ----

    [Fact]
    public async Task Read_resolves_code_from_active_catalog()
    {
        await using var app = await StartApplicationAsync();
        var page = Page(Settings(), nested: true);
        await SeedPageAsync(app, "satis", published: true, page);
        var draftId = await SeedPageAsync(app, "satis", published: false, page);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        foreach (var url in new[] { "/api/custom-pages/satis/published", $"/api/custom-pages/{draftId}/preview" })
        {
            var props = await CodePropsAsync(client, url);
            Assert.Equal("satisGrafigi", props.GetProperty("catalogComponent").GetString());
            Assert.Equal(ComponentCss, props.GetProperty("css").GetString());
            Assert.Equal(ComponentJs, props.GetProperty("javascript").GetString());
            Assert.Equal(320, props.GetProperty("height").GetInt32());
            Assert.True(JsonElement.DeepEquals(Element("""{ "baslik": "Aylık", "adet": 3, "goster": false, "tur": "cizgi" }"""), props.GetProperty("componentSettings")));
            Assert.False(props.TryGetProperty("catalogMissing", out _));
        }

        // The designer read stays unresolved: it is the stored definition.
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{draftId}");
        Assert.DoesNotContain("katalog-kodu", detail.GetProperty("definitionJson").GetString());
    }

    [Fact]
    public async Task Read_adds_component_defaults()
    {
        await using var app = await StartApplicationAsync();
        // A stored componentDefaults (written around the save gate) is replaced by the catalog's.
        await SeedPageAsync(app, "satis", published: true,
            Page(new { catalogComponent = "satisGrafigi", componentSettings = new { adet = 1 }, componentDefaults = new { baslik = "sahte" } }));
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");

        var props = await CodePropsAsync(client, "/api/custom-pages/satis/published");
        // Only settings with a default; the page's own value does not replace a default here.
        Assert.True(JsonElement.DeepEquals(Element("""{ "baslik": "Satışlar", "goster": true, "tur": "sutun" }"""), props.GetProperty("componentDefaults")));
        Assert.True(JsonElement.DeepEquals(Element("""{ "adet": 1 }"""), props.GetProperty("componentSettings")));

        // A component without any default gets no componentDefaults.
        await using var bare = await StartApplicationAsync(BundleJson(component: """{ "code": "satisGrafigi", "label": "S", "javascript": "x();" }"""));
        await SeedPageAsync(bare, "satis", published: true, Page(new { catalogComponent = "satisGrafigi" }));
        using var bareClient = bare.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(bareClient, Ayse, "TenantUser");
        var bareProps = await CodePropsAsync(bareClient, "/api/custom-pages/satis/published");
        Assert.False(bareProps.TryGetProperty("componentDefaults", out _));
        Assert.False(bareProps.TryGetProperty("componentSettings", out _));
        Assert.Equal("", bareProps.GetProperty("css").GetString());
        Assert.Equal(240, bareProps.GetProperty("height").GetInt32());
    }

    [Fact]
    public async Task Read_marks_missing_component_after_new_release()
    {
        await using var app = await StartApplicationAsync(activeBundle: null);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var first = await CreateAndActivateAsync(client, "1.0.0", BundleJson(), expected: null);
        // A published page with a surviving data source reference and the component; stale inline code was planted around the gate.
        await SeedPageAsync(app, "satis", published: true, Page(new Dictionary<string, object>
        {
            ["catalogComponent"] = "satisGrafigi", ["componentSettings"] = new { baslik = "Aylık" },
            ["css"] = ".eski { color: red; }", ["javascript"] = "eskiKod();", ["height"] = 999, ["componentDefaults"] = new { baslik = "eski" },
        }, nested: true, withQuery: true));
        Assert.Equal(ComponentJs, (await CodePropsAsync(client, "/api/custom-pages/satis/published")).GetProperty("javascript").GetString());

        // The new release drops the component: activation is not blocked by the page.
        await CreateAndActivateAsync(client, "1.1.0", BundleJson(withComponent: false), expected: first);

        var response = await client.GetAsync("/api/custom-pages/satis/published");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("eskiKod", text);
        Assert.DoesNotContain("katalog-kodu", text);
        var props = CodeProps(JsonDocument.Parse(text).RootElement);
        Assert.True(props.GetProperty("catalogMissing").GetBoolean());
        Assert.Equal("satisGrafigi", props.GetProperty("catalogComponent").GetString());
        Assert.True(JsonElement.DeepEquals(Element("""{ "baslik": "Aylık" }"""), props.GetProperty("componentSettings")));
        foreach (var key in new[] { "css", "javascript", "height", "componentDefaults" }) Assert.False(props.TryGetProperty(key, out _), key);
        // The rest of the page still resolves.
        var query = Assert.Single(Definition(JsonDocument.Parse(text).RootElement).GetProperty("queries").EnumerateArray());
        Assert.False(query.TryGetProperty("catalogError", out _));
        Assert.False(query.TryGetProperty("dataSource", out _));
    }

    [Fact]
    public async Task Read_drops_settings_that_no_longer_fit()
    {
        // A newer component version: "baslik" became a number, "tur" lost its "pasta" option and "eski" was removed.
        await using var app = await StartApplicationAsync(BundleJson(component: $$"""
            { "code": "satisGrafigi", "label": "Satış grafiği", "javascript": {{JsonSerializer.Serialize(ComponentJs)}},
              "settings": [ { "name": "baslik", "label": "Başlık", "type": "number", "default": 1 },
                            { "name": "adet", "label": "Adet", "type": "number" },
                            { "name": "goster", "label": "Göster", "type": "bool" },
                            { "name": "tur", "label": "Tür", "type": "choice", "options": [ "cizgi", "sutun" ], "default": "sutun" } ] }
            """));
        // Saved against the older version, whose settings all fitted.
        var stored = Page(Settings(new { baslik = "Aylık", tur = "pasta", eski = "x", adet = 3, goster = true }));
        var id = await SeedPageAsync(app, "satis", published: true, stored);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Ayse, "TenantUser");

        var props = await CodePropsAsync(client, "/api/custom-pages/satis/published");
        // Only values that still fit reach the runtime; the others fall back to componentDefaults.
        Assert.True(JsonElement.DeepEquals(Element("""{ "adet": 3, "goster": true }"""), props.GetProperty("componentSettings")));
        Assert.True(JsonElement.DeepEquals(Element("""{ "baslik": 1, "tur": "sutun" }"""), props.GetProperty("componentDefaults")));
        Assert.Equal(ComponentJs, props.GetProperty("javascript").GetString());

        // The stored page is not changed by the read.
        await using var scope = app.Services.CreateAsyncScope();
        var row = await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(stored, row.DefinitionJson);
    }

    [Fact]
    public async Task Page_without_catalog_component_is_unchanged()
    {
        await using var app = await StartApplicationAsync();
        var inline = Page(new { css = ".a { color: red; }", javascript = "bridge.ready();" }, nested: true);
        await SeedPageAsync(app, "ic-kod", published: true, inline);
        using var client = app.GetTestClient();
        CustomPageQueryEndpointsIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");

        var body = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/ic-kod/published");
        Assert.Equal(inline, body.GetProperty("definitionJson").GetString());
        Assert.False(TenantCustomPageQueries.HasCatalogReferences(inline));
        var catalog = new CatalogBundle([]);
        Assert.Same(inline, TenantCustomPageQueries.ResolveCatalogReferences(inline, catalog));
    }

    // ---- Helpers ----

    private static async Task<Guid> CreateAndActivateAsync(HttpClient client, string version, string bundle, Guid? expected)
    {
        var created = await client.PostAsJsonAsync("/api/custom-pages/catalog/releases", new { version, bundle = Element(bundle) });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var activated = await client.PostAsJsonAsync($"/api/custom-pages/catalog/releases/{id}/activate", new { expectedActiveReleaseId = expected });
        Assert.True(activated.StatusCode == HttpStatusCode.OK, await activated.Content.ReadAsStringAsync());
        return id;
    }

    private static JsonElement Definition(JsonElement body) => JsonDocument.Parse(body.GetProperty("definitionJson").GetString()!).RootElement;

    /// <summary>The props of the page's code component (top level or inside the section).</summary>
    private static JsonElement CodeProps(JsonElement body)
    {
        foreach (var component in Definition(body).GetProperty("components").EnumerateArray())
        {
            if (component.GetProperty("type").GetString() == "code") return component.GetProperty("props");
            if (component.TryGetProperty("children", out var children))
                foreach (var child in children.EnumerateArray())
                    if (child.GetProperty("type").GetString() == "code") return child.GetProperty("props");
        }
        throw new InvalidOperationException("Kod bileşeni yok.");
    }

    private static async Task<JsonElement> CodePropsAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{url}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return CodeProps(await response.Content.ReadFromJsonAsync<JsonElement>());
    }

    private static async Task<Guid> SeedPageAsync(WebApplication app, string code, bool published, string definitionJson)
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

    private static Task<WebApplication> StartApplicationAsync() => StartApplicationAsync(BundleJson());

    /// <summary>Allow-all permission authorizer, so only the page gates deny; <paramref name="activeBundle"/> null seeds no active release.</summary>
    private static async Task<WebApplication> StartApplicationAsync(string? activeBundle)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"catalog-component-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"catalog-component-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomPageQueryRulesIntegrationTests.AllowAllPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageAccessEndpoints();
        app.MapTenantCatalogEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" });
        if (activeBundle is not null) tenantDb.TenantCatalogReleases.Add(CustomPageCatalogReferenceSchemaTests.Release(TenantA, "1.0.0", "Active", activeBundle));
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }
}
