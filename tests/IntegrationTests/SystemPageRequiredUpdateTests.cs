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

/// <summary>
/// Required standard updates ("updates" in a standard envelope): a firm copy older than the update gets it once, as a new
/// stored revision with an audit row, when it still holds the old values of every part the update changes. A copy whose
/// parts were changed by hand is left alone. The copies are the real earlier standard definitions (Fixtures/SystemPageCopies).
/// </summary>
public sealed class SystemPageRequiredUpdateTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly string[] ChainItems = ["query:onayla", "query:onayiGeriAl", "query:iptal", "component:onaylaDugmesi",
        "component:onayiGeriAlDugmesi", "component:iptalDugmesi"];

    [Theory]
    [InlineData("sales-orders-v1.json", 1)]
    [InlineData("sales-orders-v2.json", 2)]
    public async Task Untouched_old_sales_order_list_gets_transition_commands_and_status_labels_once(string fixture, int version)
    {
        await using var app = await StartApplicationAsync();
        var pageId = await SeedRowAsync(app, TenantA, "sales-orders", Fixture(fixture), published: true, version);
        using var client = Client(app, Mehmet, "TenantUser");

        var definition = await PublishedDefinitionAsync(client, "sales-orders");

        var standard = Standard("sales-orders");
        // v1 and v2 differ in Düzenle's params, which no update touches; only its visibleWhen is compared.
        Assert.Equal(Find(standard, "duzenleDugmesi")!["props"]!["visibleWhen"]!.GetValue<string>(),
            Find(definition, "duzenleDugmesi")!["props"]!["visibleWhen"]!.GetValue<string>());
        foreach (var id in new[] { "onaylaDugmesi", "onayiGeriAlDugmesi", "iptalDugmesi", "rozetTaslak", "rozetAcik",
                     "rozetTamam", "rozetFaturalandi", "liste" })
            Assert.True(JsonNode.DeepEquals(Unplaced(Find(standard, id)), Unplaced(Find(definition, id))), id);
        foreach (var id in new[] { "onayla", "onayiGeriAl", "iptal" })
            Assert.True(JsonNode.DeepEquals(Query(standard, id), Query(definition, id)), id);
        Assert.Equal(["Draft=Taslak", "PendingApproval=Onay bekliyor", "Open=Onaylı", "Fulfilled=Sevk edildi", "Invoiced=Faturalandı", "Cancelled=İptal"],
            Strings(Find(definition, "liste")!["props"]!["valueLabels"]).Select(x => x["status:".Length..]));
        Assert.Equal(Find(standard, "teslimBolumu")!["props"]!["visibleWhen"]!.GetValue<string>(),
            Find(definition, "teslimBolumu")!["props"]!["visibleWhen"]!.GetValue<string>());
        Assert.Equal(["duzenleDugmesi", "irsaliyeOlusturDugmesi", "onaylaDugmesi", "onayiGeriAlDugmesi", "iptalDugmesi"],
            Strings(Find(definition, "komutlar")!["props"]!["moreButtons"]));
        Assert.Equal(["rozetTaslak", "rozetAcik", "rozetTamam", "rozetFaturalandi", "rozetIptal", "rozetKismi", "belgeZinciri"],
            Children(Find(definition, "siparisDurumu")!));
        // The v4 "Belgede aç" item stays an ordinary "Yeni" offer: it is not part of a required update.
        Assert.Null(Find(definition, "belgedeAcDugmesi"));

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var page = await db.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == pageId);
            Assert.Equal((4, version, true), (page.Revision, page.StandardVersion, page.IsPublished));
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(page.DefinitionJson), definition), "the served definition is the stored one");
            var revisions = await db.TenantCustomPageRevisions.AsNoTracking().Where(x => x.CustomPageId == pageId).OrderBy(x => x.Revision).ToListAsync();
            Assert.Equal(["CreatedFromStandard", "Update:zincir", "Update:rozet", "Update:etiket"], revisions.Select(x => x.ChangeKind));
            Assert.All(revisions.Skip(1), x => Assert.Equal((Guid.Empty, (int?)version), (x.ChangedByUserId, x.StandardVersion)));
            var audits = await db.AuditEvents.AsNoTracking().Where(x => x.Action == "system-page.standard-updated").ToListAsync();
            Assert.Equal(3, audits.Count);
            Assert.All(audits, x => Assert.Equal((TenantA, (Guid?)null, "custom-page:@sales-orders"), (x.TenantId!.Value, x.UserId, x.Resource)));
        }

        // Once only: a second read writes nothing.
        await PublishedDefinitionAsync(client, "sales-orders");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(4, await db.TenantCustomPageRevisions.CountAsync(x => x.CustomPageId == pageId));
        }

        // The added items are no longer offered as "Yeni"; the v4 item still is.
        using var admin = Client(app, Admin, "TenantAdmin");
        var offered = (await admin.GetFromJsonAsync<JsonElement>("/api/system-pages/sales-orders/new-items")).GetProperty("items")
            .EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray();
        Assert.Empty(offered.Intersect(ChainItems));
        Assert.Contains("component:belgedeAcDugmesi", offered);
    }

    [Fact]
    public async Task Hand_edited_part_skips_that_update_and_its_items_stay_offered()
    {
        await using var app = await StartApplicationAsync();
        var copy = JsonNode.Parse(Fixture("sales-orders-v2.json"))!;
        Find(copy, "duzenleDugmesi")!["props"]!["visibleWhen"] = "liste.seciliSatir.status == 'Open' && liste.seciliSatir.customerId != null";
        var pageId = await SeedRowAsync(app, TenantA, "sales-orders", copy.ToJsonString(), published: true, 2);
        using var client = Client(app, Admin, "TenantAdmin");

        var definition = await PublishedDefinitionAsync(client, "sales-orders");

        Assert.Null(Find(definition, "onaylaDugmesi"));
        Assert.Null(Find(definition, "iptalDugmesi"));
        Assert.Equal("liste.seciliSatir.status == 'Open' && liste.seciliSatir.customerId != null",
            Find(definition, "duzenleDugmesi")!["props"]!["visibleWhen"]!.GetValue<string>());
        // The badge and label updates touch other parts and still apply.
        Assert.True(JsonNode.DeepEquals(Unplaced(Find(Standard("sales-orders"), "liste")), Unplaced(Find(definition, "liste"))));
        Assert.True(JsonNode.DeepEquals(Unplaced(Find(Standard("sales-orders"), "rozetTaslak")), Unplaced(Find(definition, "rozetTaslak"))));
        Assert.Equal("Onaylı", Find(definition, "rozetAcik")!["props"]!["text"]!.GetValue<string>());
        var offered = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/sales-orders/new-items")).GetProperty("items")
            .EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray();
        Assert.Subset(offered.ToHashSet(), ChainItems.ToHashSet());
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(["CreatedFromStandard", "Update:rozet", "Update:etiket"], await db.TenantCustomPageRevisions.AsNoTracking()
            .Where(x => x.CustomPageId == pageId).OrderBy(x => x.Revision).Select(x => x.ChangeKind).ToListAsync());
    }

    [Fact]
    public async Task Item_deleted_after_the_update_stays_deleted_across_publish()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, TenantA, "sales-orders", Fixture("sales-orders-v2.json"), published: true, 2);
        using var client = Client(app, Admin, "TenantAdmin");
        await PublishedDefinitionAsync(client, "sales-orders");

        var draft = await (await client.PostAsync("/api/system-pages/sales-orders/draft", null)).Content.ReadFromJsonAsync<JsonElement>();
        var edited = JsonNode.Parse(draft.GetProperty("definitionJson").GetString()!)!;
        var components = edited["components"]!.AsArray();
        components.Remove(components.Single(x => x!["id"]!.GetValue<string>() == "iptalDugmesi"));
        var more = Find(edited, "komutlar")!["props"]!["moreButtons"]!.AsArray();
        more.Remove(more.Single(x => x!.GetValue<string>() == "iptalDugmesi"));
        var put = await client.PutAsJsonAsync($"/api/custom-pages/{draft.GetProperty("id").GetGuid()}", new
        {
            expectedRevision = draft.GetProperty("revision").GetInt32(), name = draft.GetProperty("name").GetString(),
            description = draft.GetProperty("description").GetString(), definition = edited
        });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var updated = await put.Content.ReadFromJsonAsync<JsonElement>();
        var publish = await client.PostAsJsonAsync($"/api/custom-pages/{updated.GetProperty("id").GetGuid()}/publish",
            new { expectedRevision = updated.GetProperty("revision").GetInt32() });
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);

        var definition = await PublishedDefinitionAsync(client, "sales-orders");

        Assert.Null(Find(definition, "iptalDugmesi"));
        Assert.NotNull(Find(definition, "onaylaDugmesi"));
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(3, await db.TenantCustomPageRevisions.CountAsync(x => x.ChangeKind.StartsWith("Update:")));
    }

    [Fact]
    public async Task Open_draft_from_before_the_update_is_updated_with_the_published_copy()
    {
        await using var app = await StartApplicationAsync();
        var publishedId = await SeedRowAsync(app, TenantA, "sales-orders", Fixture("sales-orders-v2.json"), published: true, 2);
        var draftId = await SeedRowAsync(app, TenantA, "sales-orders", Fixture("sales-orders-v2.json"), published: false, 2);
        using var client = Client(app, Admin, "TenantAdmin");

        var draft = await (await client.PostAsync("/api/system-pages/sales-orders/draft", null)).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(draftId, draft.GetProperty("id").GetGuid());
        Assert.NotNull(Find(JsonNode.Parse(draft.GetProperty("definitionJson").GetString()!)!, "onaylaDugmesi"));
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var published = await db.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == publishedId);
        Assert.NotNull(Find(JsonNode.Parse(published.DefinitionJson)!, "onaylaDugmesi"));
    }

    [Fact]
    public async Task Other_tenant_copy_is_not_touched()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, TenantA, "sales-orders", Fixture("sales-orders-v2.json"), published: true, 2);
        var otherId = await SeedRowAsync(app, TenantB, "sales-orders", Fixture("sales-orders-v2.json"), published: true, 2);
        using var client = Client(app, Mehmet, "TenantUser");
        int OtherAudits(TenantDbContext db) => db.AuditEvents.Count(x => x.TenantId == TenantB);
        int before;
        await using (var seeded = app.Services.CreateAsyncScope()) before = OtherAudits(seeded.ServiceProvider.GetRequiredService<TenantDbContext>());

        await PublishedDefinitionAsync(client, "sales-orders");

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var other = await db.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == otherId);
        Assert.Equal(1, other.Revision);
        Assert.Null(Find(JsonNode.Parse(other.DefinitionJson)!, "onaylaDugmesi"));
        Assert.Equal(before, OtherAudits(db));
    }

    [Fact]
    public async Task Copy_at_the_update_version_is_not_touched()
    {
        await using var app = await StartApplicationAsync();
        var v3 = Fixture("sales-orders-v3.json");
        var pageId = await SeedRowAsync(app, TenantA, "sales-orders", v3, published: true, 3);
        using var client = Client(app, Mehmet, "TenantUser");

        var definition = await PublishedDefinitionAsync(client, "sales-orders");

        // v3 has the transition commands; only the v5 label update applies.
        Assert.True(JsonNode.DeepEquals(Unplaced(Find(Standard("sales-orders"), "liste")), Unplaced(Find(definition, "liste"))));
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(["CreatedFromStandard", "Update:etiket"], await db.TenantCustomPageRevisions.AsNoTracking()
            .Where(x => x.CustomPageId == pageId).OrderBy(x => x.Revision).Select(x => x.ChangeKind).ToListAsync());
    }

    [Fact]
    public async Task Old_sales_order_card_lets_drafts_be_edited()
    {
        await using var app = await StartApplicationAsync();
        await SeedRowAsync(app, TenantA, "sales-order-create", Fixture("sales-order-create-v1.json"), published: true, 1);
        using var client = Client(app, Mehmet, "TenantUser");

        var definition = await PublishedDefinitionAsync(client, "sales-order-create");

        var standard = Standard("sales-order-create");
        Assert.True(JsonNode.DeepEquals(Find(standard, "komutlar")!["props"]!["commandWhen"], Find(definition, "komutlar")!["props"]!["commandWhen"]));
        foreach (var prop in new[] { "disabledWhen", "disabledReason" })
            Assert.True(JsonNode.DeepEquals(Find(standard, "kalemler")!["props"]![prop], Find(definition, "kalemler")!["props"]![prop]), prop);
        Assert.True(JsonNode.DeepEquals(Find(standard, "duzenlemeUyarisi"), Find(definition, "duzenlemeUyarisi")));
    }

    [Fact]
    public async Task Failed_write_serves_the_stored_copy()
    {
        await using var app = await StartApplicationAsync(failUpdates: true);
        var v2 = Fixture("sales-orders-v2.json");
        var pageId = await SeedRowAsync(app, TenantA, "sales-orders", v2, published: true, 2);
        using var client = Client(app, Mehmet, "TenantUser");

        var definition = await PublishedDefinitionAsync(client, "sales-orders");

        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(v2), definition));
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, (await db.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == pageId)).Revision);
    }

    [Theory]
    [InlineData("current", "standardın güncel değerini içeriyor")]
    [InlineData("old-item", "since değeri below")]
    [InlineData("unknown-key", "bilinmeyen alan 'to'")]
    [InlineData("no-set", "en az bir set gerekli")]
    [InlineData("append", "append 'komutlar.moreButtons'")]
    [InlineData("children", "children 'siparisDurumu'")]
    [InlineData("below", "below 2 ile version")]
    [InlineData("duplicate", "birden fazla kez geçiyor")]
    public void Invalid_update_entries_are_rejected(string mutation, string expected)
    {
        var (file, json) = SystemPageStandards.EmbeddedFiles().Single(x => x.FileName == "sales-orders.json");
        var envelope = JsonNode.Parse(json)!.AsObject();
        var updates = envelope["updates"]!.AsArray();
        var zincir = updates[0]!.AsObject();
        switch (mutation)
        {
            case "current": zincir["set"]![0]!["from"]!.AsArray().Add("liste.seciliSatir.status == 'Draft'"); break;
            case "old-item": zincir["add"]!.AsArray().Add("component:duzenleDugmesi"); break;
            case "unknown-key": zincir["to"] = "x"; break;
            case "no-set": zincir.Remove("set"); break;
            case "append": zincir["append"]![0]!["values"]!.AsArray().Add("yokDugmesi"); break;
            case "children": updates[1]!["children"]![0]!["ids"]!.AsArray().Add("liste"); break;
            case "below": zincir["below"] = 9; break;
            case "duplicate": updates.Add(zincir.DeepClone()); break;
        }
        var errors = SystemPageStandards.Validate([(file, envelope.ToJsonString())]);
        Assert.True(errors.Any(x => x.Contains(expected, StringComparison.Ordinal)), string.Join(" | ", errors));
    }

    private static string Fixture(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "SystemPageCopies", name));

    private static JsonNode Standard(string screenKey)
    {
        Assert.True(SystemPageStandards.TryGet(screenKey, out var standard));
        return JsonNode.Parse(standard.DefinitionJson)!;
    }

    private static async Task<JsonNode> PublishedDefinitionAsync(HttpClient client, string screenKey)
    {
        var response = await client.GetAsync($"/api/system-pages/{screenKey}/published");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("override", body.GetProperty("source").GetString());
        return JsonNode.Parse(body.GetProperty("definitionJson").GetString()!)!;
    }

    /// <summary>
    /// A component without its placement: the sales-orders standard is a List template page (5b-2 dalga 1), so its components carry
    /// <c>slot</c> and no <c>width</c>, while the firm copies are templateless (their own <c>width</c>, <c>slot</c> is inert there).
    /// The updates never set either; everything else is compared.
    /// </summary>
    private static JsonNode? Unplaced(JsonNode? component)
    {
        if (component?.DeepClone() is not JsonObject clone) return null;
        if (clone["props"] is JsonObject props) { props.Remove("slot"); props.Remove("width"); }
        return clone;
    }

    internal static JsonNode? Find(JsonNode definition, string id) => FindIn(definition["components"] as JsonArray, id);

    private static JsonNode? FindIn(JsonArray? components, string id)
    {
        foreach (var component in components?.OfType<JsonObject>() ?? [])
        {
            if (component["id"]?.GetValue<string>() == id) return component;
            if (FindIn(component["children"] as JsonArray, id) is { } child) return child;
        }
        return null;
    }

    private static JsonNode? Query(JsonNode definition, string id) =>
        (definition["queries"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(x => x["id"]?.GetValue<string>() == id);

    private static string[] Strings(JsonNode? array) => array!.AsArray().Select(x => x!.GetValue<string>()).ToArray();

    private static string[] Children(JsonNode component) => component["children"]!.AsArray().Select(x => x!["id"]!.GetValue<string>()).ToArray();

    private static async Task<Guid> SeedRowAsync(WebApplication app, Guid tenant, string screenKey, string definitionJson, bool published, int standardVersion)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var now = DateTimeOffset.UtcNow;
        var page = new TenantCustomPage
        {
            TenantId = tenant, Code = "@" + screenKey, ScreenKey = screenKey, StandardVersion = standardVersion, Name = "Satış siparişleri",
            DefinitionJson = definitionJson, Revision = 1, IsPublished = published, CreatedByUserId = Admin, UpdatedByUserId = Admin,
            CreatedAt = now, UpdatedAt = now
        };
        db.TenantCustomPages.Add(page);
        db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision
        {
            TenantId = tenant, CustomPageId = page.Id, Revision = 1, Code = page.Code, Name = page.Name, DefinitionJson = definitionJson,
            ChangeKind = "CreatedFromStandard", ChangedByUserId = Admin, StandardVersion = standardVersion, CreatedAt = now
        });
        await db.SaveChangesAsync();
        return page.Id;
    }

    private static HttpClient Client(WebApplication app, Guid user, string role)
    {
        var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        return client;
    }

    private static async Task<WebApplication> StartApplicationAsync(bool failUpdates = false)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options =>
        {
            options.UseInMemoryDatabase($"system-page-updates-tenant-{suffix}")
                .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning));
            if (failUpdates) options.AddInterceptors(new FailRequiredUpdateInterceptor());
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"system-page-updates-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSystemPages();
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
        tenantDb.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }

    /// <summary>Fails every save that writes a required-update revision, as a lost race or a database error would.</summary>
    private sealed class FailRequiredUpdateInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<TenantCustomPageRevision>().Any(x => x.State == EntityState.Added && x.Entity.ChangeKind.StartsWith("Update:")))
                throw new DbUpdateException("simulated");
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private sealed class UnusedQueryConnectionFactory : ITenantQueryConnectionFactory
    {
        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SQL is not reached in these tests.");
    }
}
