using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>The <c>/api/system-pages</c> routes: catalog, runtime map, published definition, draft open, reset, "Yeni" and history.</summary>
public sealed class SystemPageEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid Outsider = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private const string ScreenKey = "inventory-warehouses";
    private const string SystemCode = "@inventory-warehouses";
    private const string NotFoundText = "Sistem sayfası bulunamadı.";
    private const string AdminOnlyText = "Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir.";
    private const string StaleDraftText = "Taslak güncel değil. Son sürümü yeniden yükleyin.";

    [Fact]
    public async Task Catalog_lists_demo_with_status_and_new_count()
    {
        await using var app = await StartApplicationAsync(standards: new VersionTwoStandardSet());
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var empty = Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages") ?? []);
        Assert.Equal(ScreenKey, empty.GetProperty("screenKey").GetString());
        Assert.Equal("Depo Yönetimi", empty.GetProperty("title").GetString());
        Assert.Equal("Depo tanımlarının listesi.", empty.GetProperty("description").GetString());
        Assert.Equal("Stok & Depo", empty.GetProperty("module").GetString());
        Assert.Equal(2, empty.GetProperty("version").GetInt32());
        Assert.Equal("preview", empty.GetProperty("stage").GetString());
        Assert.Equal([ScreenKey], empty.GetProperty("screenViewKeys").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("draftId").ValueKind);
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("publishedId").ValueKind);
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("standardVersion").ValueKind);
        Assert.Equal(0, empty.GetProperty("newItemCount").GetInt32());
        Assert.True(empty.GetProperty("canEdit").GetBoolean());

        var publishedId = await SeedRowAsync(app, StandardV1Json(), published: true, standardVersion: 1);
        var draftId = await SeedRowAsync(app, StandardV1Json(), published: false, standardVersion: 1);
        var listed = Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages") ?? []);
        Assert.Equal(publishedId, listed.GetProperty("publishedId").GetGuid());
        Assert.Equal(draftId, listed.GetProperty("draftId").GetGuid());
        Assert.Equal(1, listed.GetProperty("standardVersion").GetInt32());
        // The two version-2 items are absent from the draft (compared before the published row).
        Assert.Equal(2, listed.GetProperty("newItemCount").GetInt32());

        SetIdentity(client, Mehmet, "TenantUser");
        Assert.False(Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages") ?? []).GetProperty("canEdit").GetBoolean());
    }

    [Fact]
    public async Task Runtime_map_empty_by_default()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, StandardV1Json(), published: false, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        var map = await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime");
        Assert.Empty(map.GetProperty("screens").EnumerateObject());
    }

    [Fact]
    public async Task Runtime_map_lists_standard_when_enabled_in_config()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        // An open draft alone never changes the mode.
        await SeedRowAsync(app, StandardV1Json(), published: false, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        var screen = Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens").EnumerateObject());
        Assert.Equal(ScreenKey, screen.Name);
        Assert.Equal("standard", screen.Value.GetProperty("mode").GetString());
        Assert.Equal(1, screen.Value.GetProperty("revision").GetInt32());
    }

    [Fact]
    public async Task Runtime_map_lists_override_when_published()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        await SeedRowAsync(app, StandardV1Json(), published: true, standardVersion: 1, revision: 3);
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        var screen = Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens").EnumerateObject());
        Assert.Equal(ScreenKey, screen.Name);
        Assert.Equal("override", screen.Value.GetProperty("mode").GetString());
        Assert.Equal(3, screen.Value.GetProperty("revision").GetInt32());
    }

    [Fact]
    public async Task Published_returns_standard_with_synthetic_id()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        // Drafts are ignored by the runtime, and so is a leftover access row of the code.
        await SeedRowAsync(app, StaticJson(), published: false, standardVersion: 1);
        await SeedAccessAsync(app, CustomPageAccessModes.AdminsOnly);
        using var client = app.GetTestClient();

        foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Admin, "TenantAdmin") })
        {
            SetIdentity(client, user, role);
            var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published");
            Assert.Equal(SystemPageStandards.SyntheticId(ScreenKey), page.GetProperty("id").GetGuid());
            Assert.Equal(SystemCode, page.GetProperty("code").GetString());
            Assert.Equal("Depo Yönetimi", page.GetProperty("name").GetString());
            Assert.Equal(1, page.GetProperty("revision").GetInt32());
            Assert.Equal(ScreenKey, page.GetProperty("screenKey").GetString());
            Assert.Equal("standard", page.GetProperty("source").GetString());
            Assert.Equal(1, page.GetProperty("standardVersion").GetInt32());
            Assert.Empty(page.GetProperty("forms").EnumerateArray());
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(StandardV1Json()), JsonNode.Parse(page.GetProperty("definitionJson").GetString()!)));
            // A standard has no SQL: page write rights equal view rights, the ERP endpoints authorize each operation.
            AssertRights(page, true, true, true, true);
        }

        SetIdentity(client, Outsider, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
    }

    [Fact]
    public async Task Published_returns_override_without_sql_for_non_admin()
    {
        await using var app = await StartApplicationAsync();
        var id = await SeedRowAsync(app, JsonSerializer.Serialize(CustomPageQueryRulesIntegrationTests.QueryDefinition()), published: true, standardVersion: 1, revision: 2);
        await SeedAccessAsync(app, CustomPageAccessModes.AllUsers);
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published");
        Assert.Equal(id, page.GetProperty("id").GetGuid());
        Assert.Equal(SystemCode, page.GetProperty("code").GetString());
        Assert.Equal(2, page.GetProperty("revision").GetInt32());
        Assert.Equal("override", page.GetProperty("source").GetString());
        Assert.Equal(1, page.GetProperty("standardVersion").GetInt32());
        Assert.Equal(ScreenKey, page.GetProperty("screenKey").GetString());
        Assert.DoesNotContain("\"sql\"", page.GetProperty("definitionJson").GetString());
        // A page with SQL keeps the access row's write flags (AllUsers without write rights).
        AssertRights(page, true, false, false, false);

        // Without the access row the SQL page is admin-only.
        await RemoveAccessAsync(app);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
    }

    [Fact]
    public async Task Standard_mode_gives_members_write_rights()
    {
        // A test-injected envelope: the v2 warehouse standard, still without SQL.
        await using var app = await StartApplicationAsync(enabled: [ScreenKey], standards: new VersionTwoStandardSet());
        using var client = app.GetTestClient();

        foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Ayse, "TenantUser"), (Admin, "TenantAdmin") })
        {
            SetIdentity(client, user, role);
            var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published");
            Assert.Equal("standard", page.GetProperty("source").GetString());
            Assert.Equal(2, page.GetProperty("standardVersion").GetInt32());
            AssertRights(page, true, true, true, true);
        }
    }

    [Fact]
    public async Task Non_member_is_forbidden_in_standard_mode()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        using var client = app.GetTestClient();

        foreach (var role in new[] { "TenantUser", "TenantAdmin" })
        {
            SetIdentity(client, Outsider, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
        }
        // Not in override mode either, even with an all-users access row.
        await SeedRowAsync(app, StandardV1Json(), published: true, standardVersion: 1);
        await SeedAccessAsync(app, CustomPageAccessModes.AllUsers);
        SetIdentity(client, Outsider, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
    }

    [Fact]
    public async Task Operation_only_override_gives_tenant_user_write_rights()
    {
        await using var app = await StartApplicationAsync();
        Assert.False(TenantCustomPageQueries.HasSqlQueries(StandardV1Json()));
        Assert.True(TenantCustomPageQueries.HasQueries(StandardV1Json()));
        await SeedRowAsync(app, StandardV1Json(), published: true, standardVersion: 1);
        using var client = app.GetTestClient();

        foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Admin, "TenantAdmin") })
        {
            SetIdentity(client, user, role);
            var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published");
            Assert.Equal("override", page.GetProperty("source").GetString());
            AssertRights(page, true, true, true, true);
        }

        // An access row that grants view without write flags: writes still follow view, because Studio cannot configure
        // write flags for an operation-only page and the ERP endpoints authorize every operation.
        await SeedAccessAsync(app, CustomPageAccessModes.SelectedUsers, (Mehmet, true, false, false, false));
        SetIdentity(client, Mehmet, "TenantUser");
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published"), true, true, true, true);
    }

    [Fact]
    public async Task Override_with_sql_keeps_access_rules()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        await SeedRowAsync(app, JsonSerializer.Serialize(CustomPageQueryRulesIntegrationTests.QueryDefinition()), published: true, standardVersion: 1);
        using var client = app.GetTestClient();

        // No access row: the SQL page is admin-only, even with the standard enabled.
        SetIdentity(client, Mehmet, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
        SetIdentity(client, Admin, "TenantAdmin");
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published"), true, true, true, true);

        // A selected-users row keeps exactly its write flags.
        await SeedAccessAsync(app, CustomPageAccessModes.SelectedUsers, (Mehmet, true, true, false, false));
        SetIdentity(client, Mehmet, "TenantUser");
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published"), true, true, false, false);
    }

    [Fact]
    public async Task Override_with_access_row_without_view_is_forbidden()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        await SeedRowAsync(app, StandardV1Json(), published: true, standardVersion: 1);
        using var client = app.GetTestClient();

        // The row lists Ayşe only, so Mehmet is excluded.
        await SeedAccessAsync(app, CustomPageAccessModes.SelectedUsers, (Ayse, true, false, false, false));
        SetIdentity(client, Mehmet, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
        SetIdentity(client, Ayse, "TenantUser");
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published"), true, true, true, true);

        // A listed user without view gets nothing, whatever the write flags say.
        await RemoveAccessAsync(app);
        await SeedAccessAsync(app, CustomPageAccessModes.SelectedUsers, (Mehmet, false, true, true, true));
        SetIdentity(client, Mehmet, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);

        await RemoveAccessAsync(app);
        await SeedAccessAsync(app, CustomPageAccessModes.AdminsOnly);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
    }

    [Fact]
    public async Task Custom_page_with_operations_keeps_access_rules()
    {
        // The operation-only rule is for system pages: a custom page with the same definition keeps the custom-page rules.
        await using var app = await StartApplicationAsync();
        const string code = "depo-ozel";
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.TenantCustomPages.Add(new TenantCustomPage
            {
                TenantId = TenantA, Code = code, Name = "Depo özel", Description = "", DefinitionJson = StandardV1Json(), Revision = 1,
                IsPublished = true, CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        // Without an access row a custom page with queries is admin-only; with one, its write flags apply.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/custom-pages/{code}/published")).StatusCode);
        await SeedAccessAsync(app, CustomPageAccessModes.AllUsers, pageCode: code);
        AssertRights(await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{code}/published"), true, false, false, false);
    }

    [Fact]
    public void Runtime_rights_widen_only_operation_only_definitions()
    {
        var viewOnly = new CustomPageRights(true, false, false, false);
        var definition = JsonNode.Parse(StandardV1Json())!.AsObject();
        Assert.Equal(new CustomPageRightsView(true, true, true, true), SystemPageEndpoints.RuntimeRights(viewOnly, definition.ToJsonString()));
        // No view: nothing is widened.
        Assert.Equal(new CustomPageRightsView(false, false, false, false),
            SystemPageEndpoints.RuntimeRights(CustomPageRights.None, definition.ToJsonString()));

        // Operation queries plus one SQL query: the access rules apply unchanged.
        var mixed = definition.DeepClone().AsObject();
        mixed["queries"]!.AsArray().Add(JsonNode.Parse(
            """{ "id": "sqlSorgu", "name": "sqlSorgu", "kind": "read", "sql": "SELECT 1 AS x", "parameters": [], "runOn": "load" }"""));
        Assert.Equal(new CustomPageRightsView(true, false, false, false), SystemPageEndpoints.RuntimeRights(viewOnly, mixed.ToJsonString()));
        Assert.Equal(new CustomPageRightsView(true, true, false, false),
            SystemPageEndpoints.RuntimeRights(new CustomPageRights(true, true, false, false), mixed.ToJsonString()));

        // A malformed query entry (neither sql nor operation, or not an object) counts as SQL.
        foreach (var entry in new[] { """{ "id": "bozuk", "name": "bozuk", "kind": "read" }""", "\"metin\"" })
        {
            var malformed = definition.DeepClone().AsObject();
            malformed["queries"]!.AsArray().Add(JsonNode.Parse(entry));
            Assert.Equal(new CustomPageRightsView(true, false, false, false), SystemPageEndpoints.RuntimeRights(viewOnly, malformed.ToJsonString()));
        }

        // Fails closed: an unparseable definition (bad syntax, or deeper than the parser allows) is never widened.
        var tooDeep = new string('[', 40) + new string(']', 40);
        foreach (var unparseable in new[] { "{ bozuk", "", tooDeep })
            Assert.Equal(new CustomPageRightsView(true, false, false, false), SystemPageEndpoints.RuntimeRights(viewOnly, unparseable));
    }

    [Fact]
    public async Task Unparseable_stored_definition_never_returns_widened_rights()
    {
        // A stored definition that does not parse: RuntimeRights keeps the access-rule rights (view only here, see
        // Runtime_rights_widen_only_operation_only_definitions), and the route itself still fails before any rights are
        // sent (embedded form lookup parses the definition), so the client never receives page rights for it.
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        const string unparseable = "{ \"schemaVersion\": 2, \"queries\": [";
        await SeedRowAsync(app, unparseable, published: true, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        await Assert.ThrowsAnyAsync<JsonException>(() => client.GetAsync($"/api/system-pages/{ScreenKey}/published"));
        Assert.Equal(new CustomPageRightsView(true, false, false, false),
            SystemPageEndpoints.RuntimeRights(new CustomPageRights(true, false, false, false), unparseable));
    }

    [Fact]
    public async Task Published_404_when_neither()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, StandardV1Json(), published: false, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        await AssertErrorAsync(client.GetAsync($"/api/system-pages/{ScreenKey}/published"), HttpStatusCode.NotFound, NotFoundText);
    }

    [Fact]
    public async Task Open_draft_creates_from_standard_and_imports_visibility()
    {
        await using var app = await StartApplicationAsync();
        await SeedScreenViewAsync(app);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var draft = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(SystemCode, draft.GetProperty("code").GetString());
        Assert.Equal("Depo Yönetimi", draft.GetProperty("name").GetString());
        Assert.Equal("Depo tanımlarının listesi.", draft.GetProperty("description").GetString());
        Assert.Equal(ScreenKey, draft.GetProperty("screenKey").GetString());
        Assert.Equal(1, draft.GetProperty("standardVersion").GetInt32());
        Assert.Equal(1, draft.GetProperty("revision").GetInt32());
        Assert.False(draft.GetProperty("isPublished").GetBoolean());
        Assert.Equal(["code", "isActive"], TableColumns(draft.GetProperty("definitionJson").GetString()!));
        Assert.Equal([SystemPageMerge.UnmappedFieldNote("Açıklama"), SystemPageMerge.LayoutNotImportedNote],
            draft.GetProperty("importNotes").EnumerateArray().Select(x => x.GetString()));

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var revision = Assert.Single(await db.TenantCustomPageRevisions.ToListAsync());
        Assert.Equal(("CreatedFromStandard", 1), (revision.ChangeKind, revision.StandardVersion));
        Assert.Contains(await db.AuditEvents.ToListAsync(), x => x.Action == "system-page.draft-created" && x.Resource == $"custom-page:{SystemCode}");
    }

    [Fact]
    public async Task Open_draft_with_default_layout_reports_only_unmapped_fields()
    {
        await using var app = await StartApplicationAsync();
        await SeedScreenViewAsync(app, codeLabel: "Depo kodu");
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var draft = await (await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(["code", "isActive"], TableColumns(draft.GetProperty("definitionJson").GetString()!));
        // Visibility alone is not a layout change; the hidden unmapped field is still reported.
        Assert.Equal([SystemPageMerge.UnmappedFieldNote("Açıklama")], draft.GetProperty("importNotes").EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task Open_draft_does_not_report_unmapped_field_left_at_catalog_default()
    {
        await using var app = await StartApplicationAsync();
        await SeedScreenViewAsync(app, codeLabel: "Depo kodu", availabilityVisible: true);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var draft = await (await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(["code", "isActive"], TableColumns(draft.GetProperty("definitionJson").GetString()!));
        Assert.Empty(draft.GetProperty("importNotes").EnumerateArray());
    }

    [Fact]
    public async Task Open_draft_is_idempotent()
    {
        await using var app = await StartApplicationAsync();
        await SeedScreenViewAsync(app);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var first = await (await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null)).Content.ReadFromJsonAsync<JsonElement>();
        var again = await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var second = await again.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(first.GetProperty("id").GetGuid(), second.GetProperty("id").GetGuid());
        Assert.Empty(second.GetProperty("importNotes").EnumerateArray());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Single(await db.TenantCustomPages.ToListAsync());
        Assert.Contains(await db.AuditEvents.ToListAsync(), x => x.Action == "system-page.draft-opened" && x.Resource == $"custom-page:{SystemCode}");
    }

    [Fact]
    public async Task Open_draft_from_published_copies_it()
    {
        await using var app = await StartApplicationAsync();
        var publishedId = await SeedRowAsync(app, StaticJson(), published: true, standardVersion: 1, name: "Depolarımız");
        await SeedScreenViewAsync(app);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var draft = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEqual(publishedId, draft.GetProperty("id").GetGuid());
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(StaticJson()), JsonNode.Parse(draft.GetProperty("definitionJson").GetString()!)));
        Assert.Equal(1, draft.GetProperty("standardVersion").GetInt32());
        Assert.Equal("Depo Yönetimi", draft.GetProperty("name").GetString());
        Assert.Empty(draft.GetProperty("importNotes").EnumerateArray());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var id = draft.GetProperty("id").GetGuid();
        Assert.Equal("DraftCreated", (await db.TenantCustomPageRevisions.SingleAsync(x => x.CustomPageId == id)).ChangeKind);
        Assert.True((await db.TenantCustomPages.SingleAsync(x => x.Id == publishedId)).IsPublished);
    }

    [Fact]
    public async Task Draft_after_archive_does_not_reimport_screen_view()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, StaticJson(), published: false, standardVersion: 1, archived: true);
        await SeedScreenViewAsync(app);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var draft = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(["code", "name", "isActive"], TableColumns(draft.GetProperty("definitionJson").GetString()!));
        Assert.Empty(draft.GetProperty("importNotes").EnumerateArray());

        await using var scope = app.Services.CreateAsyncScope();
        var id = draft.GetProperty("id").GetGuid();
        Assert.Equal("CreatedFromStandard", (await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPageRevisions.SingleAsync(x => x.CustomPageId == id)).ChangeKind);
    }

    [Fact]
    public async Task Reset_replaces_open_draft_and_sets_current_version()
    {
        var standards = new VersionTwoStandardSet();
        await using var app = await StartApplicationAsync(standards: standards);
        var draftId = await SeedRowAsync(app, StaticJson(), published: false, standardVersion: 1, revision: 2);
        await SeedScreenViewAsync(app);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsJsonAsync($"/api/system-pages/{ScreenKey}/reset", new { expectedRevision = 2 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reset = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(draftId, reset.GetProperty("id").GetGuid());
        Assert.Equal(3, reset.GetProperty("revision").GetInt32());
        Assert.Equal(2, reset.GetProperty("standardVersion").GetInt32());
        // The standard replaces the definition unchanged: no screen-view import.
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(standards.Standard.DefinitionJson), JsonNode.Parse(reset.GetProperty("definitionJson").GetString()!)));

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var revision = await db.TenantCustomPageRevisions.SingleAsync(x => x.CustomPageId == draftId && x.Revision == 3);
        Assert.Equal(("ResetToStandard", 2), (revision.ChangeKind, revision.StandardVersion));
        Assert.Contains(await db.AuditEvents.ToListAsync(), x => x.Action == "system-page.reset" && x.Resource == $"custom-page:{SystemCode}");
    }

    [Fact]
    public async Task Reset_with_stale_revision_conflicts()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, StaticJson(), published: false, standardVersion: 1, revision: 2);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        await AssertErrorAsync(client.PostAsJsonAsync($"/api/system-pages/{ScreenKey}/reset", new { expectedRevision = 1 }), HttpStatusCode.Conflict, StaleDraftText);
        await AssertErrorAsync(client.PostAsJsonAsync($"/api/system-pages/{ScreenKey}/reset", new { expectedRevision = (int?)null }), HttpStatusCode.Conflict, StaleDraftText);
    }

    [Fact]
    public async Task Reset_without_draft_creates_one()
    {
        await using var app = await StartApplicationAsync();
        var publishedId = await SeedRowAsync(app, StaticJson(), published: true, standardVersion: 1);
        await SeedScreenViewAsync(app);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsJsonAsync($"/api/system-pages/{ScreenKey}/reset", new { expectedRevision = (int?)null });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reset = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = reset.GetProperty("id").GetGuid();
        Assert.NotEqual(publishedId, id);
        Assert.False(reset.GetProperty("isPublished").GetBoolean());
        Assert.Equal(1, reset.GetProperty("revision").GetInt32());
        Assert.Equal(1, reset.GetProperty("standardVersion").GetInt32());
        Assert.Equal(ScreenKey, reset.GetProperty("screenKey").GetString());
        Assert.Equal(["code", "name", "isActive"], TableColumns(reset.GetProperty("definitionJson").GetString()!));

        await using var scope = app.Services.CreateAsyncScope();
        Assert.Equal("ResetToStandard", (await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPageRevisions.SingleAsync(x => x.CustomPageId == id)).ChangeKind);
    }

    [Fact]
    public async Task New_items_against_draft()
    {
        await using var app = await StartApplicationAsync(standards: new VersionTwoStandardSet());
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var none = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/new-items");
        Assert.Equal((2, 2), (none.GetProperty("standardVersion").GetInt32(), none.GetProperty("baseVersion").GetInt32()));
        Assert.Empty(none.GetProperty("items").EnumerateArray());

        // The published row still has the v1 table and query; the open draft deleted both, so the draft is compared.
        await SeedRowAsync(app, StandardV1Json(), published: true, standardVersion: 1);
        await SeedRowAsync(app, StaticJson(), published: false, standardVersion: 1);
        var result = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/new-items");
        Assert.Equal((2, 1), (result.GetProperty("standardVersion").GetInt32(), result.GetProperty("baseVersion").GetInt32()));
        var items = result.GetProperty("items").EnumerateArray().ToArray();
        // component:depoListesi (since 1, deleted) is never re-offered; query:depolar comes only as the requirement
        // of an offered item, so Studio's "Ekle" can add it.
        Assert.Equal(["component:depoNotu", "component:ikinciTablo", "query:depolar"], items.Select(x => x.GetProperty("key").GetString()));
        var note = items[0];
        Assert.Equal(("component", "Depo notu", 2), (note.GetProperty("kind").GetString(), note.GetProperty("label").GetString(), note.GetProperty("since").GetInt32()));
        Assert.Equal("depoNotu", note.GetProperty("definition").GetProperty("id").GetString());
        Assert.Empty(note.GetProperty("requires").EnumerateArray());
        Assert.Equal(["query:depolar"], items[1].GetProperty("requires").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(("query", 1), (items[2].GetProperty("kind").GetString(), items[2].GetProperty("since").GetInt32()));
        Assert.Equal("depo.listele", items[2].GetProperty("definition").GetProperty("operation").GetString());
        // The catalog counts only the offered items, not the requirement brought along.
        Assert.Equal(2, Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages") ?? []).GetProperty("newItemCount").GetInt32());
    }

    [Fact]
    public async Task Put_standard_version_is_bounded_by_the_registered_standard_set()
    {
        await using var app = await StartApplicationAsync(standards: new VersionTwoStandardSet());
        var draftId = await SeedRowAsync(app, StaticJson(), published: false, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        object Update(int expectedRevision, int? standardVersion) =>
            new { expectedRevision, name = "Depo Yönetimi", definition = JsonDocument.Parse(StaticJson()).RootElement, standardVersion };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{draftId}", Update(1, 3))).StatusCode);
        var bumped = await client.PutAsJsonAsync($"/api/custom-pages/{draftId}", Update(1, 2));
        Assert.Equal(HttpStatusCode.OK, bumped.StatusCode);
        Assert.Equal(2, (await bumped.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("standardVersion").GetInt32());
        // null means "unchanged".
        var unchanged = await client.PutAsJsonAsync($"/api/custom-pages/{draftId}", Update(2, null));
        Assert.Equal(HttpStatusCode.OK, unchanged.StatusCode);
        Assert.Equal(2, (await unchanged.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("standardVersion").GetInt32());
    }

    [Fact]
    public async Task History_spans_rows_after_publish_and_reset()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var first = await (await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null)).Content.ReadFromJsonAsync<JsonElement>();
        var firstId = first.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{firstId}/publish", new { expectedRevision = 1 })).StatusCode);
        var reset = await (await client.PostAsJsonAsync($"/api/system-pages/{ScreenKey}/reset", new { expectedRevision = (int?)null })).Content.ReadFromJsonAsync<JsonElement>();
        var secondId = reset.GetProperty("id").GetGuid();

        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/system-pages/{ScreenKey}/history") ?? [];
        Assert.Equal([(secondId, 1, "ResetToStandard"), (firstId, 2, "Published"), (firstId, 1, "CreatedFromStandard")],
            history.Select(x => (x.GetProperty("customPageId").GetGuid(), x.GetProperty("revision").GetInt32(), x.GetProperty("changeKind").GetString())));
        Assert.All(history, x => Assert.Equal(SystemCode, x.GetProperty("code").GetString()));
    }

    [Fact]
    public async Task History_hides_query_sql_from_non_admin()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, JsonSerializer.Serialize(CustomPageQueryRulesIntegrationTests.QueryDefinition()), published: false, standardVersion: 1);
        using var client = app.GetTestClient();

        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Contains("\"sql\"", Assert.Single(await client.GetFromJsonAsync<JsonElement[]>($"/api/system-pages/{ScreenKey}/history") ?? []).GetProperty("definitionJson").GetString());
        SetIdentity(client, Mehmet, "TenantUser");
        Assert.DoesNotContain("\"sql\"", Assert.Single(await client.GetFromJsonAsync<JsonElement[]>($"/api/system-pages/{ScreenKey}/history") ?? []).GetProperty("definitionJson").GetString());
    }

    [Fact]
    public async Task TenantUser_cannot_open_reset()
    {
        // Every permission is granted, so only the verified-admin rule can refuse.
        await using var app = await StartApplicationAsync(allowAllActions: true);
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        await AssertErrorAsync(client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null), HttpStatusCode.Forbidden, AdminOnlyText);
        await AssertErrorAsync(client.PostAsJsonAsync($"/api/system-pages/{ScreenKey}/reset", new { expectedRevision = (int?)null }), HttpStatusCode.Forbidden, AdminOnlyText);
        // A TenantAdmin claim without the admin membership row is not a verified admin.
        SetIdentity(client, Mehmet, "TenantAdmin");
        await AssertErrorAsync(client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null), HttpStatusCode.Forbidden, AdminOnlyText);

        await using var scope = app.Services.CreateAsyncScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.AnyAsync());
    }

    [Fact]
    public async Task Unknown_screen_key_is_404()
    {
        await using var app = await StartApplicationAsync(enabled: ["customer-accounts"]);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        foreach (var key in new[] { "customer-accounts", "Inventory-Warehouses", "no-such-screen" })
        {
            await AssertErrorAsync(client.GetAsync($"/api/system-pages/{key}/published"), HttpStatusCode.NotFound, NotFoundText);
            await AssertErrorAsync(client.PostAsync($"/api/system-pages/{key}/draft", null), HttpStatusCode.NotFound, NotFoundText);
            await AssertErrorAsync(client.PostAsJsonAsync($"/api/system-pages/{key}/reset", new { expectedRevision = (int?)null }), HttpStatusCode.NotFound, NotFoundText);
            await AssertErrorAsync(client.GetAsync($"/api/system-pages/{key}/new-items"), HttpStatusCode.NotFound, NotFoundText);
            await AssertErrorAsync(client.GetAsync($"/api/system-pages/{key}/history"), HttpStatusCode.NotFound, NotFoundText);
        }
        // An enabled key without a standard never reaches the runtime map.
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens").EnumerateObject());
    }

    private static string StandardV1Json() => WarehouseStandardV1.Standard.DefinitionJson;

    private static string StaticJson() => JsonSerializer.Serialize(new
    {
        schemaVersion = 2, queries = Array.Empty<object>(),
        components = new[] { new { id = "baslik", type = "heading", name = "baslik", props = new { text = "Depolarımız" } } }
    });

    private static string[] TableColumns(string definitionJson) =>
        JsonNode.Parse(definitionJson)!["components"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == "depoListesi")!["props"]!["columns"]!
            .AsArray().Select(x => x!.GetValue<string>()).ToArray();

    private static async Task AssertErrorAsync(Task<HttpResponseMessage> request, HttpStatusCode status, string error)
    {
        var response = await request;
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(error, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    private static async Task<Guid> SeedRowAsync(WebApplication app, string definitionJson, bool published, int standardVersion,
        int revision = 1, bool archived = false, string name = "Depo Yönetimi")
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var now = DateTimeOffset.UtcNow;
        var page = new TenantCustomPage
        {
            TenantId = TenantA, Code = SystemCode, ScreenKey = ScreenKey, StandardVersion = standardVersion, Name = name,
            Description = "Depo tanımlarının listesi.", DefinitionJson = definitionJson, Revision = revision,
            IsPublished = published, IsArchived = archived, CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = now, UpdatedAt = now
        };
        db.TenantCustomPages.Add(page);
        db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision
        {
            TenantId = TenantA, CustomPageId = page.Id, Revision = revision, Code = page.Code, Name = page.Name, Description = page.Description,
            DefinitionJson = page.DefinitionJson, ChangeKind = "CreatedFromStandard", ChangedByUserId = Admin, StandardVersion = standardVersion
        });
        await db.SaveChangesAsync();
        return page.Id;
    }

    /// <summary>A published "Görünümü düzenle" view of the warehouse list: "Depo adı" hidden and "Depo kodu" relabelled.</summary>
    private static async Task SeedScreenViewAsync(WebApplication app, string codeLabel = "Kod", bool availabilityVisible = false)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var layout = new object[]
        {
            new { key = "code", label = codeLabel, visible = true, position = 0 },
            new { key = "name", label = "Depo adı", visible = false, position = 1 },
            new { key = "status", label = "Durum", visible = true, position = 2 },
            new { key = "availability", label = "Açıklama", visible = availabilityVisible, position = 3 }
        };
        db.TenantScreenViews.Add(new TenantScreenView
        {
            TenantId = TenantA, ScreenKey = ScreenKey, Name = "Firma görünümü", LayoutJson = JsonSerializer.Serialize(layout),
            IsPublished = true, CreatedByUserId = Admin, UpdatedByUserId = Admin
        });
        await db.SaveChangesAsync();
    }

    private static Task SeedAccessAsync(WebApplication app, string mode, params (Guid User, bool View, bool Insert, bool Update, bool Delete)[] users) =>
        SeedAccessAsync(app, mode, SystemCode, users);

    private static async Task SeedAccessAsync(WebApplication app, string mode, string pageCode,
        params (Guid User, bool View, bool Insert, bool Update, bool Delete)[] users)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var access = new TenantCustomPageAccess { TenantId = TenantA, PageCode = pageCode, Mode = mode, Revision = 1, UpdatedByUserId = Admin };
        foreach (var (user, view, insert, update, delete) in users)
            access.Users.Add(new TenantCustomPageAccessUser { AccessId = access.Id, UserId = user, CanView = view, CanInsert = insert, CanUpdate = update, CanDelete = delete });
        platform.TenantCustomPageAccesses.Add(access);
        await platform.SaveChangesAsync();
    }

    private static void AssertRights(JsonElement page, bool view, bool insert, bool update, bool delete)
    {
        var rights = page.GetProperty("rights");
        Assert.Equal((view, insert, update, delete), (rights.GetProperty("view").GetBoolean(), rights.GetProperty("insert").GetBoolean(),
            rights.GetProperty("update").GetBoolean(), rights.GetProperty("delete").GetBoolean()));
    }

    private static async Task RemoveAccessAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        platform.TenantCustomPageAccesses.RemoveRange(await platform.TenantCustomPageAccesses.ToListAsync());
        await platform.SaveChangesAsync();
    }

    private static async Task<WebApplication> StartApplicationAsync(string[]? enabled = null, ISystemPageStandardSet? standards = null,
        bool allowAllActions = false)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection((enabled ?? []).Select((key, i) =>
            new KeyValuePair<string, string?>($"SystemPages:StandardEnabled:{i}", key)));
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"system-page-endpoints-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"system-page-endpoints-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        if (allowAllActions) builder.Services.AddSingleton<IPlatformPermissionAuthorizer, AllowAllAuthorizer>();
        else builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        // The same registration as Program.cs; a test standard set registered afterwards replaces the embedded one.
        builder.Services.AddSystemPages();
        // Default: the embedded standards with Depo Yönetimi frozen at version 1 (the fixture these tests assert against).
        builder.Services.AddSingleton(standards ?? WarehouseStandardV1.Set);
        builder.Services.AddSingleton<ITenantQueryConnectionFactory, UnusedQueryConnectionFactory>();
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
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

    private static void SetIdentity(HttpClient client, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    /// <summary>
    /// The embedded warehouse standard at version 2: a note component and a second table bound to the v1 query. The second
    /// table requires the query, which a firm design may have deleted.
    /// </summary>
    private sealed class VersionTwoStandardSet : ISystemPageStandardSet
    {
        public VersionTwoStandardSet()
        {
            var v1 = WarehouseStandardV1.Standard;
            var definition = JsonNode.Parse(v1.DefinitionJson)!.AsObject();
            definition["components"]!.AsArray().Add(JsonNode.Parse("""{"id":"depoNotu","type":"text","name":"depoNotu","props":{"text":"Depo notu"}}"""));
            definition["components"]!.AsArray().Add(JsonNode.Parse("""{"id":"ikinciTablo","type":"dataTable","name":"ikinciTablo","props":{"title":"Aktif depolar","query":"depolar","columns":["code"]}}"""));
            Standard = v1 with
            {
                Version = 2,
                Items = [.. v1.Items,
                    new SystemPageItem("component:depoNotu", "component", "depoNotu", 2, "Depo notu", []),
                    new SystemPageItem("component:ikinciTablo", "component", "ikinciTablo", 2, "Aktif depolar", ["query:depolar"])],
                DefinitionJson = definition.ToJsonString()
            };
        }

        public SystemPageStandard Standard { get; }
        public IReadOnlyCollection<SystemPageStandard> All => [Standard];
        public bool TryGet(string screenKey, out SystemPageStandard standard)
        {
            standard = Standard;
            return screenKey == ScreenKey;
        }
    }

    private sealed class AllowAllAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class UnusedQueryConnectionFactory : ITenantQueryConnectionFactory
    {
        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SQL is not reached in these tests.");
    }
}
