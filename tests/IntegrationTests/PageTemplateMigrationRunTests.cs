using System.Net;
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
using Kit = AIERP.Api.IntegrationTests.PageTemplateMigrationTestKit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Task 4: template migration run and rollback (two tenants, InMemory).</summary>
public sealed class PageTemplateMigrationRunTests
{
    [Fact]
    public async Task Run_without_confirm_or_tenants_writes_nothing()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        var before = await kit.CountsAsync();
        var runner = kit.Runner();

        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions() with { Confirmation = null }, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions() with { Confirmation = "yes" }, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions() with { TenantIds = null }, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions() with { TenantIds = [] }, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions(batch: "AB"), CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RollbackAsync(kit.RollbackOptions() with { Confirmation = null }, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RollbackAsync(kit.RollbackOptions() with { TenantIds = null }, CancellationToken.None));
        // An unknown tenant fails before any database is opened.
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions(tenants: [Kit.TenantA, Guid.NewGuid()]), CancellationToken.None));

        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}"]));
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", "--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP"]));
        var parsed = PageTemplateMigrationOptions.Parse(["--page-template-migration-rollback=deneme-1", $"--tenants={Kit.TenantA},{Kit.TenantB}",
            "--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP", "--page=musteri-listesi"]);
        Assert.Equal(PageTemplateMigrationCommand.Rollback, parsed.Command);
        Assert.Equal([Kit.TenantA, Kit.TenantB], parsed.TenantIds);

        Assert.Empty(kit.Databases.Opened);
        Assert.Equal(before, await kit.CountsAsync());
    }

    [Fact]
    public async Task Run_migrates_published_pages_and_keeps_before_revision()
    {
        using var kit = new Kit();
        var pageId = await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.SeedPublishedAsync(Kit.TenantA, "islem-sayfasi", "İşlem sayfası", Kit.ActionBarPage);
        await kit.SeedPublishedAsync(Kit.TenantB, "stok-listesi", "Stok listesi", Kit.ListPage);

        var result = await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);

        Assert.Contains(Kit.CanonicalName(Kit.TenantA), kit.Log.ToString());
        Assert.Equal([Kit.CanonicalName(Kit.TenantA)], kit.Databases.Opened);
        var migratedOutcome = Assert.Single(result.Pages, x => x.Applied);
        Assert.Equal(("musteri-listesi", "list"), (migratedOutcome.Code, migratedOutcome.Target));
        var skipped = Assert.Single(result.Pages, x => !x.Applied);
        Assert.Contains("İşlem çubuğu kalıplarda yok.", skipped.Reasons);

        await using var db = kit.Open(Kit.TenantA);
        var page = await db.TenantCustomPages.SingleAsync(x => x.Id == pageId);
        Assert.True(page.IsPublished);
        Assert.Equal(4, page.Revision);
        using (var converted = JsonDocument.Parse(page.DefinitionJson))
        {
            Assert.Equal("list", converted.RootElement.GetProperty("template").GetProperty("name").GetString());
            using var original = JsonDocument.Parse(Kit.ListPage);
            Assert.Equal(original.RootElement.GetProperty("queries").GetRawText(), converted.RootElement.GetProperty("queries").GetRawText());
        }
        var revisions = await db.TenantCustomPageRevisions.Where(x => x.CustomPageId == pageId).OrderBy(x => x.Revision).ToListAsync();
        Assert.Equal([1, 2, 3, 4], revisions.Select(x => x.Revision));
        Assert.Equal(("BeforeTemplateMigration", "deneme-1", Kit.ListPage), (revisions[2].ChangeKind, revisions[2].MigrationBatch, revisions[2].DefinitionJson));
        Assert.Equal(("TemplateMigrated", "deneme-1", page.DefinitionJson), (revisions[3].ChangeKind, revisions[3].MigrationBatch, revisions[3].DefinitionJson));
        var audit = Assert.Single(await db.AuditEvents.Where(x => x.Action == "custom-page.template-migrated").ToListAsync());
        Assert.StartsWith("custom-page:musteri-listesi", audit.Resource);
        var untouched = await db.TenantCustomPages.SingleAsync(x => x.Code == "islem-sayfasi");
        Assert.Equal((2, Kit.ActionBarPage), (untouched.Revision, untouched.DefinitionJson));

        // Tenant B was not listed in --tenants and is untouched.
        Assert.Equal(Kit.ListPage, await kit.PublishedDefinitionAsync(Kit.TenantB, "stok-listesi"));
    }

    [Fact]
    public async Task Run_skips_page_with_open_draft_and_leaves_draft_untouched()
    {
        using var kit = new Kit();
        var publishedId = await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        var draftId = await kit.SeedDraftAsync(Kit.TenantA, "musteri-listesi", "Yarım taslak", Kit.ListPage);
        var before = await kit.CountsAsync();

        var result = await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);

        var outcome = Assert.Single(result.Pages);
        Assert.False(outcome.Applied);
        Assert.Contains("Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.", outcome.Reasons);
        Assert.Equal(before, await kit.CountsAsync());
        await using var db = kit.Open(Kit.TenantA);
        var published = await db.TenantCustomPages.SingleAsync(x => x.Id == publishedId);
        var draft = await db.TenantCustomPages.SingleAsync(x => x.Id == draftId);
        Assert.Equal((2, Kit.ListPage), (published.Revision, published.DefinitionJson));
        Assert.Equal((1, Kit.ListPage, false), (draft.Revision, draft.DefinitionJson, draft.IsPublished));
    }

    [Fact]
    public async Task Run_is_idempotent_for_same_batch()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);
        var afterFirst = await kit.CountsAsync();
        var definition = await kit.PublishedDefinitionAsync(Kit.TenantA, "musteri-listesi");

        var second = await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);

        var outcome = Assert.Single(second.Pages);
        Assert.False(outcome.Applied);
        Assert.Contains("Bu toplu geçişte zaten taşındı.", outcome.Reasons);
        Assert.Equal(afterFirst, await kit.CountsAsync());
        Assert.Equal(definition, await kit.PublishedDefinitionAsync(Kit.TenantA, "musteri-listesi"));
    }

    [Fact]
    public async Task Rollback_restores_before_definition_as_published()
    {
        using var kit = new Kit();
        var pageId = await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);

        var result = await kit.Runner().RollbackAsync(kit.RollbackOptions(), CancellationToken.None);

        Assert.True(Assert.Single(result.Pages).Applied);
        await using var db = kit.Open(Kit.TenantA);
        var page = await db.TenantCustomPages.SingleAsync(x => x.Id == pageId);
        Assert.Equal((true, false, Kit.ListPage, 5), (page.IsPublished, page.IsArchived, page.DefinitionJson, page.Revision));
        var latest = await db.TenantCustomPageRevisions.Where(x => x.CustomPageId == pageId).OrderByDescending(x => x.Revision).FirstAsync();
        Assert.Equal(("TemplateMigrationRolledBack", "deneme-1", Kit.ListPage, 5), (latest.ChangeKind, latest.MigrationBatch, latest.DefinitionJson, latest.Revision));
        Assert.Single(await db.AuditEvents.Where(x => x.Action == "custom-page.template-migration-rolled-back").ToListAsync());

        // A second rollback of the same batch changes nothing.
        var again = await kit.Runner().RollbackAsync(kit.RollbackOptions(), CancellationToken.None);
        Assert.False(Assert.Single(again.Pages).Applied);
        Assert.Equal(5, (await kit.Open(Kit.TenantA).TenantCustomPages.SingleAsync(x => x.Id == pageId)).Revision);
    }

    [Fact]
    public async Task Rollback_single_page()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.SeedPublishedAsync(Kit.TenantA, "tedarikci-listesi", "Tedarikçi listesi", Kit.ListPage);
        await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);
        var migrated = await kit.PublishedDefinitionAsync(Kit.TenantA, "tedarikci-listesi");

        var result = await kit.Runner().RollbackAsync(kit.RollbackOptions(page: "musteri-listesi"), CancellationToken.None);

        Assert.Equal("musteri-listesi", Assert.Single(result.Pages).Code);
        Assert.Equal(Kit.ListPage, await kit.PublishedDefinitionAsync(Kit.TenantA, "musteri-listesi"));
        Assert.Equal(migrated, await kit.PublishedDefinitionAsync(Kit.TenantA, "tedarikci-listesi"));
        Assert.NotEqual(Kit.ListPage, migrated);
    }

    [Fact]
    public async Task Rollback_skips_page_changed_after_migration()
    {
        using var kit = new Kit();
        var pageId = await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);
        // A consultant republishes the page after the migration: the migrated row is superseded by a new published row.
        Guid newId;
        await using (var db = kit.Open(Kit.TenantA))
        {
            var old = await db.TenantCustomPages.SingleAsync(x => x.Id == pageId);
            old.IsPublished = false; old.IsArchived = true; old.Revision++;
            db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(old, Kit.UserId, "Superseded"));
            var republished = new TenantCustomPage
            { TenantId = Kit.TenantA, Code = old.Code, Name = "Yeni sürüm", DefinitionJson = old.DefinitionJson, Revision = 2, IsPublished = true, CreatedByUserId = Kit.UserId, UpdatedByUserId = Kit.UserId };
            db.TenantCustomPages.Add(republished);
            db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(republished, Kit.UserId, "Published"));
            await db.SaveChangesAsync();
            newId = republished.Id;
        }
        var before = await kit.CountsAsync();

        var result = await kit.Runner().RollbackAsync(kit.RollbackOptions(), CancellationToken.None);

        var outcome = Assert.Single(result.Pages);
        Assert.False(outcome.Applied);
        Assert.Contains("Sayfa geçişten sonra değişti; geri alınmadı.", outcome.Reasons);
        Assert.Equal(before, await kit.CountsAsync());
        await using var check = kit.Open(Kit.TenantA);
        var current = await check.TenantCustomPages.SingleAsync(x => x.Id == newId);
        Assert.Equal(("Yeni sürüm", true, 2), (current.Name, current.IsPublished, current.Revision));
        Assert.True((await check.TenantCustomPages.SingleAsync(x => x.Id == pageId)).IsArchived);
    }

    [Fact]
    public async Task Run_against_rehearsal_database_writes_only_to_the_copy()
    {
        using var kit = new Kit();
        var rehearsal = Kit.RehearsalName(Kit.TenantA);
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.SeedAsync(rehearsal, Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage, published: true);
        var options = kit.RunOptions() with { RehearsalDatabases = new Dictionary<Guid, string> { [Kit.TenantA] = rehearsal }, ExpectDatabases = [rehearsal] };

        var result = await kit.Runner().RunAsync(options, CancellationToken.None);

        Assert.True(Assert.Single(result.Pages).Applied);
        Assert.Equal([rehearsal], kit.Databases.Opened);
        Assert.Contains(rehearsal, kit.Log.ToString());
        Assert.Contains("PROVA KOPYASI", kit.Log.ToString());
        Assert.Equal(Kit.ListPage, await kit.PublishedDefinitionAsync(Kit.TenantA, "musteri-listesi"));
        await using var copy = kit.OpenDatabase(rehearsal);
        Assert.NotEqual(Kit.ListPage, await copy.TenantCustomPages.Where(x => x.IsPublished).Select(x => x.DefinitionJson).SingleAsync());
    }

    [Fact]
    public async Task Rehearsal_database_without_suffix_is_refused()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        var before = await kit.CountsAsync();
        var runner = kit.Runner();

        // Only AIERPTenant_<guid:N>_TplRehearsal of the same tenant is accepted: not R9Rehearsal, not any other *_TplRehearsal,
        // not another tenant's copy, not a different casing.
        foreach (var name in new[] { "AIERPTenant_R9Rehearsal", "Production_TplRehearsal;DROP", "AIERPTenant_x_tplrehearsal", "AIERPTenant_R9_TplRehearsal",
                     Kit.RehearsalName(Kit.TenantB), Kit.CanonicalName(Kit.TenantA), Kit.RehearsalName(Kit.TenantA).ToLowerInvariant(), Kit.RehearsalName(Kit.TenantA) + "\n" })
        {
            var options = kit.RunOptions() with { RehearsalDatabases = new Dictionary<Guid, string> { [Kit.TenantA] = name }, ExpectDatabases = [Kit.RehearsalName(Kit.TenantA)] };
            await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(options, CancellationToken.None));
            await Assert.ThrowsAsync<ArgumentException>(() => runner.ReportAsync(kit.ReportOptions() with
            { TenantIds = [Kit.TenantA], RehearsalDatabases = options.RehearsalDatabases, ExpectDatabases = options.ExpectDatabases }, CancellationToken.None));
        }
        // A rehearsal for a tenant outside --tenants is refused too.
        await Assert.ThrowsAsync<ArgumentException>(() => runner.RunAsync(kit.RunOptions() with
        { RehearsalDatabases = new Dictionary<Guid, string> { [Kit.TenantB] = Kit.RehearsalName(Kit.TenantB) }, ExpectDatabases = [Kit.RehearsalName(Kit.TenantB)] }, CancellationToken.None));
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}",
            "--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP", $"--rehearsal-database={Kit.TenantA}=AIERPTenant_R9Rehearsal", $"--expect-databases=AIERPTenant_R9Rehearsal"]));
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}",
            "--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP", $"--rehearsal-database={Kit.TenantA}=AIERPTenant_R9_TplRehearsal", "--expect-databases=AIERPTenant_R9_TplRehearsal"]));
        var parsed = PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}",
            "--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP", $"--rehearsal-database={Kit.TenantA}={Kit.RehearsalName(Kit.TenantA)}",
            $"--expect-databases={Kit.RehearsalName(Kit.TenantA)}"]);
        Assert.Equal(Kit.RehearsalName(Kit.TenantA), parsed.RehearsalDatabases[Kit.TenantA]);
        Assert.Equal([Kit.RehearsalName(Kit.TenantA)], parsed.ExpectDatabases);

        Assert.Empty(kit.Databases.Opened);
        Assert.Equal(before, await kit.CountsAsync());
    }

    [Fact]
    public async Task Migrated_page_serves_same_queries_through_published_endpoint()
    {
        var store = $"tpl-mig-endpoint-{Guid.NewGuid():N}";
        using var kit = new Kit(_ => store);
        await using var app = await StartApplicationAsync(kit, store);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", Kit.TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", Kit.UserId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);

        var before = await PublishedDefinitionAsync(client);
        var result = await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);
        Assert.True(Assert.Single(result.Pages).Applied);
        var after = await PublishedDefinitionAsync(client);

        Assert.False(before.TryGetProperty("template", out _));
        Assert.Equal("list", after.GetProperty("template").GetProperty("name").GetString());
        Assert.Equal(before.GetProperty("queries").GetRawText(), after.GetProperty("queries").GetRawText());
        Assert.DoesNotContain("gizli_kolon", after.GetRawText());
        Assert.Equal(Ids(before), Ids(after));
    }

    private static string[] Ids(JsonElement definition) =>
        definition.GetProperty("components").EnumerateArray().Select(x => x.GetProperty("id").GetString()!).Order().ToArray();

    private static async Task<JsonElement> PublishedDefinitionAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/custom-pages/musteri-listesi/published");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var definition = body.RootElement.GetProperty("definitionJson");
        using var parsed = JsonDocument.Parse(definition.ValueKind == JsonValueKind.String ? definition.GetString()! : definition.GetRawText());
        return parsed.RootElement.Clone();
    }

    private static async Task<WebApplication> StartApplicationAsync(Kit kit, string store)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase(store, kit.Root)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{store}-platform"));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, AllowAllAuthorizer>();
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        platform.Tenants.Add(new Tenant { Id = Kit.TenantA, Name = "Firma A", Slug = "firma-a" });
        platform.Users.Add(new AppUser { Id = Kit.UserId, Email = "user-a@example.test", DisplayName = "User A" });
        platform.TenantMemberships.Add(new TenantMembership { TenantId = Kit.TenantA, UserId = Kit.UserId, Role = "TenantAdmin" });
        await platform.SaveChangesAsync();
        return app;
    }

    private sealed class AllowAllAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default) =>
            Task.FromResult(true);
    }

    // ---------------------------------------------------------------- Kayıt kartı hedefi (düzeltme dalgası A, I4)

    private const string RecordPage = """{"schemaVersion":2,"queries":[],"components":[{"id":"ozet","type":"recordHeader","name":"ozet","props":{"title":"Kart"}}]}""";
    private const string RecordRunClosed = "Kayıt kartına taşıma henüz açık değil.";

    private static string WithTemplate(string json, string name)
    {
        var root = System.Text.Json.Nodes.JsonNode.Parse(json)!.AsObject();
        root["template"] = new System.Text.Json.Nodes.JsonObject { ["name"] = name };
        return root.ToJsonString();
    }

    /// <summary>Kayıt özeti taşıyan sayfaya "record" der; ötekiler test sınıflandırıcısına gider.</summary>
    private static PageTemplateMigrationRunner RecordRunner(Kit kit) => new(kit.Databases, (json, draft, catalog) =>
        json.Contains("recordHeader", StringComparison.Ordinal) && !json.Contains("\"template\"", StringComparison.Ordinal)
            ? new MigrationResult("record", [], WithTemplate(json, "record"), null, 0)
            : Kit.Classify(json, draft, catalog), BehaviorEquivalence.Check, kit.Log);

    [Fact]
    public async Task Report_counts_record_target_in_its_own_column()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "cari-kart", "Cari kartı", RecordPage);
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);

        var report = await RecordRunner(kit).ReportAsync(kit.ReportOptions(), CancellationToken.None);

        Assert.Equal(1, report.Summary.ByTarget["record"]);
        Assert.Equal(1, report.Summary.ByTarget["list"]);
        Assert.Equal(0, report.Summary.ByTarget["none"]);
        Assert.True(report.Summary.StandardsByTarget.ContainsKey("record"));
        var tenantA = Assert.Single(report.Summary.ByTenant, x => x.TenantId == Kit.TenantA);
        Assert.Equal((1, 1, 0, 0), (tenantA.List, tenantA.Record, tenantA.Free, tenantA.None));
        var markdown = await File.ReadAllTextAsync(Path.Combine(kit.OutDir, "rapor.md"));
        Assert.Contains("| Firma | Liste | Kayıt kartı | Serbest | — |", markdown);
        Assert.Contains("| cari-kart | Cari kartı | Yayın | Kayıt kartı |", markdown);
    }

    [Fact]
    public async Task Run_skips_record_target_with_reason_and_writes_nothing()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "cari-kart", "Cari kartı", RecordPage);
        var before = await kit.CountsAsync();

        var result = await RecordRunner(kit).RunAsync(kit.RunOptions(), CancellationToken.None);

        var outcome = Assert.Single(result.Pages);
        Assert.False(outcome.Applied);
        Assert.False(outcome.Failed);
        Assert.Equal("record", outcome.Target);
        Assert.Equal([RecordRunClosed], outcome.Reasons);
        Assert.Equal(before, await kit.CountsAsync());
        Assert.Equal(RecordPage, await kit.PublishedDefinitionAsync(Kit.TenantA, "cari-kart"));
        Assert.Equal(0, await RecordRunner(kit).ExecuteAsync(kit.RunOptions(), CancellationToken.None));
    }

    [Fact]
    public async Task Verify_fails_a_record_pair_with_the_same_reason()
    {
        using var kit = new Kit();
        var pageId = await kit.SeedPublishedAsync(Kit.TenantA, "cari-kart", "Cari kartı", RecordPage);
        await using (var db = kit.Open(Kit.TenantA))
        {
            db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision { TenantId = Kit.TenantA, CustomPageId = pageId, Revision = 3, Code = "cari-kart", Name = "Cari kartı",
                DefinitionJson = RecordPage, ChangeKind = PageTemplateMigrationRunner.BeforeKind, ChangedByUserId = Guid.Empty, MigrationBatch = "deneme-1" });
            db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision { TenantId = Kit.TenantA, CustomPageId = pageId, Revision = 4, Code = "cari-kart", Name = "Cari kartı",
                DefinitionJson = WithTemplate(RecordPage, "record"), ChangeKind = PageTemplateMigrationRunner.MigratedKind, ChangedByUserId = Guid.Empty, MigrationBatch = "deneme-1" });
            await db.SaveChangesAsync();
        }

        var result = await kit.RealRunner().VerifyAsync(kit.VerifyOptions(), CancellationToken.None);

        var outcome = Assert.Single(result.Pages);
        Assert.True(outcome.Failed);
        Assert.Equal("record", outcome.Target);
        Assert.Contains(RecordRunClosed, outcome.Reasons);
    }
}
