using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Task 3: the read-only dry-run report of the template migration (two tenants, InMemory).</summary>
public sealed class PageTemplateMigrationReportTests
{
    [Fact]
    public async Task Report_lists_every_page_with_target_and_reasons()
    {
        using var kit = new PageTemplateMigrationTestKit();
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi", "Müşteri listesi", PageTemplateMigrationTestKit.ListPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "islem-sayfasi", "İşlem sayfası", PageTemplateMigrationTestKit.ActionBarPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantB, "stok-listesi", "Stok listesi", PageTemplateMigrationTestKit.ListPage);
        await kit.SeedDraftAsync(PageTemplateMigrationTestKit.TenantB, "stok-listesi", "Stok listesi taslak", PageTemplateMigrationTestKit.ListPage);

        var report = await kit.Runner().ReportAsync(kit.ReportOptions(), CancellationToken.None);

        var a = Assert.Single(report.Tenants, x => x.TenantId == PageTemplateMigrationTestKit.TenantA);
        Assert.Equal("Firma A", a.Name);
        var list = Assert.Single(a.Pages, x => x.Code == "musteri-listesi");
        Assert.True(list.Published);
        Assert.Equal("list", list.Target);
        Assert.Equal("geçti", list.Equivalence);
        Assert.Equal(1, list.LayoutChanges);
        var action = Assert.Single(a.Pages, x => x.Code == "islem-sayfasi");
        Assert.Null(action.Target);
        Assert.Contains("İşlem çubuğu kalıplarda yok.", action.Reasons);

        var b = Assert.Single(report.Tenants, x => x.TenantId == PageTemplateMigrationTestKit.TenantB);
        var published = Assert.Single(b.Pages, x => x.Code == "stok-listesi" && x.Published);
        Assert.Null(published.Target);
        Assert.Contains("Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.", published.Reasons);
        Assert.Single(b.Pages, x => x.Code == "stok-listesi" && !x.Published);

        var markdown = await File.ReadAllTextAsync(Path.Combine(kit.OutDir, "rapor.md"));
        Assert.Contains("musteri-listesi", markdown);
        Assert.Contains("Liste", markdown);
        Assert.Contains("İşlem çubuğu kalıplarda yok.", markdown);
        Assert.Contains(PageTemplateMigrationTestKit.TenantA.ToString("N")[..8], markdown);
        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(kit.OutDir, "rapor.json")));
        var tenants = json.RootElement.GetProperty("tenants");
        Assert.Equal(2, tenants.GetArrayLength());
        var page = tenants.EnumerateArray().SelectMany(x => x.GetProperty("pages").EnumerateArray())
            .Single(x => x.GetProperty("code").GetString() == "musteri-listesi");
        foreach (var key in new[] { "code", "name", "published", "target", "reasons", "equivalence", "layoutChanges" })
            Assert.True(page.TryGetProperty(key, out _), key);
    }

    [Fact]
    public async Task Report_contains_no_sql_query_results_or_user_names()
    {
        using var kit = new PageTemplateMigrationTestKit();
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi", "Müşteri listesi", PageTemplateMigrationTestKit.ListPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "islem-sayfasi", "İşlem sayfası", PageTemplateMigrationTestKit.ActionBarPage);
        // User-related text lives next to the page (description) and its user ids; none of it may reach the report.
        await using (var db = kit.Open(PageTemplateMigrationTestKit.TenantA))
        {
            var page = await db.TenantCustomPages.SingleAsync(x => x.Code == "musteri-listesi");
            page.Description = "Gizli Kişi Adı gizli.kisi@example.test";
            await db.SaveChangesAsync();
        }

        await kit.Runner().ReportAsync(kit.ReportOptions(), CancellationToken.None);

        foreach (var file in new[] { "rapor.json", "rapor.md" })
        {
            var text = await File.ReadAllTextAsync(Path.Combine(kit.OutDir, file));
            Assert.DoesNotContain(PageTemplateMigrationTestKit.SecretSql, text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("SELECT", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Gizli Kişi Adı", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("gizli.kisi@example.test", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(PageTemplateMigrationTestKit.UserId.ToString(), text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("definitionJson", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("\"queries\"", text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Report_includes_standards_and_summary()
    {
        using var kit = new PageTemplateMigrationTestKit();
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi", "Müşteri listesi", PageTemplateMigrationTestKit.ListPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "islem-sayfasi", "İşlem sayfası", PageTemplateMigrationTestKit.ActionBarPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantB, "stok-listesi", "Stok listesi", PageTemplateMigrationTestKit.ListPage);

        var report = await kit.Runner().ReportAsync(kit.ReportOptions(), CancellationToken.None);

        Assert.Equal(SystemPageStandards.All.Count, report.Standards.Count);
        Assert.All(report.Standards, x => Assert.True(x.Version >= 1));
        Assert.Equal(2, report.Summary.ByTarget["list"]);
        Assert.Equal(1, report.Summary.ByTarget["none"]);
        Assert.Equal(0, report.Summary.ByTarget["free"]);
        var tenantA = Assert.Single(report.Summary.ByTenant, x => x.TenantId == PageTemplateMigrationTestKit.TenantA);
        Assert.Equal(1, tenantA.List);
        Assert.Equal(1, tenantA.None);
        Assert.True(report.Summary.TopReasons.Count <= 10);
        Assert.Contains(report.Summary.TopReasons, x => x.Reason == "İşlem çubuğu kalıplarda yok." && x.Count >= 1);

        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(kit.OutDir, "rapor.json")));
        Assert.True(json.RootElement.TryGetProperty("generatedAt", out _));
        Assert.Equal(SystemPageStandards.All.Count, json.RootElement.GetProperty("standards").GetArrayLength());
        var standard = json.RootElement.GetProperty("standards")[0];
        foreach (var key in new[] { "screenKey", "version", "target", "reasons" })
            Assert.True(standard.TryGetProperty(key, out _), key);
        var summary = json.RootElement.GetProperty("summary");
        Assert.True(summary.TryGetProperty("byTarget", out _));
        Assert.True(summary.TryGetProperty("topReasons", out _));
    }

    [Fact]
    public async Task Report_never_writes()
    {
        using var kit = new PageTemplateMigrationTestKit();
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi", "Müşteri listesi", PageTemplateMigrationTestKit.ListPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantB, "stok-listesi", "Stok listesi", PageTemplateMigrationTestKit.ListPage);
        var before = await kit.CountsAsync();
        var definitionBefore = await kit.PublishedDefinitionAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi");

        await kit.Runner().ReportAsync(kit.ReportOptions(), CancellationToken.None);

        Assert.Equal(before, await kit.CountsAsync());
        Assert.Equal(definitionBefore, await kit.PublishedDefinitionAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi"));
    }

    [Fact]
    public async Task Report_limits_to_given_tenants()
    {
        using var kit = new PageTemplateMigrationTestKit();
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantA, "musteri-listesi", "Müşteri listesi", PageTemplateMigrationTestKit.ListPage);
        await kit.SeedPublishedAsync(PageTemplateMigrationTestKit.TenantB, "stok-listesi", "Stok listesi", PageTemplateMigrationTestKit.ListPage);

        var report = await kit.Runner().ReportAsync(kit.ReportOptions() with { TenantIds = [PageTemplateMigrationTestKit.TenantB] }, CancellationToken.None);

        Assert.Equal(PageTemplateMigrationTestKit.TenantB, Assert.Single(report.Tenants).TenantId);
        Assert.Equal([PageTemplateMigrationTestKit.CanonicalName(PageTemplateMigrationTestKit.TenantB)], kit.Databases.Opened);
    }
}

/// <summary>
/// Two InMemory tenant databases keyed by database name (so a rehearsal override is a separate store), plus a test
/// classifier: a page whose components are all <c>dataTable</c> becomes a list template; any other page is not converted.
/// </summary>
internal sealed class PageTemplateMigrationTestKit : IDisposable
{
    internal static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    internal static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    internal static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    internal const string SecretSql = "SELECT gizli_kolon FROM dbo.GizliTablo";

    internal static readonly string ListPage = JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new[] { new { id = "q1", name = "veri", kind = "read", sql = SecretSql, parameters = Array.Empty<object>(), runOn = "load" } },
        components = new[] { new { id = "t1", type = "dataTable", name = "t1", props = new { query = "q1", width = 12 } } }
    });

    internal static readonly string ActionBarPage = JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new[] { new { id = "q1", name = "veri", kind = "read", sql = SecretSql, parameters = Array.Empty<object>(), runOn = "load" } },
        components = new object[]
        {
            new { id = "a1", type = "actionBar", name = "a1", props = new { } },
            new { id = "t1", type = "dataTable", name = "t1", props = new { query = "q1" } }
        }
    });

    private readonly string prefix = $"tpl-mig-{Guid.NewGuid():N}";
    internal readonly InMemoryDatabaseRoot Root = new();
    internal string OutDir { get; } = Path.Combine(Path.GetTempPath(), $"nexora-tpl-mig-{Guid.NewGuid():N}");
    internal TestDatabases Databases { get; }
    internal StringWriter Log { get; } = new();

    internal PageTemplateMigrationTestKit(Func<string, string>? storeFor = null) =>
        Databases = new TestDatabases(this, storeFor ?? (name => $"{prefix}-{name}"));

    internal static string CanonicalName(Guid tenant) => $"AIERPTenant_{tenant:N}";

    internal PageTemplateMigrationRunner Runner() => new(Databases, Classify, BehaviorEquivalence.Check, Log);

    internal PageTemplateMigrationOptions ReportOptions() => new(PageTemplateMigrationCommand.Report, null, null, null, OutDir, null,
        new Dictionary<Guid, string>());

    internal PageTemplateMigrationOptions RunOptions(string batch = "deneme-1", params Guid[] tenants) => new(PageTemplateMigrationCommand.Run, batch,
        tenants.Length == 0 ? [TenantA] : tenants, PageTemplateMigrationOptions.ConfirmationValue, null, null, new Dictionary<Guid, string>());

    internal PageTemplateMigrationOptions RollbackOptions(string batch = "deneme-1", string? page = null, params Guid[] tenants) => new(PageTemplateMigrationCommand.Rollback, batch,
        tenants.Length == 0 ? [TenantA] : tenants, PageTemplateMigrationOptions.ConfirmationValue, null, page, new Dictionary<Guid, string>());

    internal TenantDbContext OpenStore(string store) => new(new DbContextOptionsBuilder<TenantDbContext>()
        .UseInMemoryDatabase(store, Root)
        .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options);

    internal TenantDbContext Open(Guid tenant) => OpenDatabase(CanonicalName(tenant));
    internal TenantDbContext OpenDatabase(string databaseName) => OpenStore(Databases.StoreFor(databaseName));

    internal Task<Guid> SeedPublishedAsync(Guid tenant, string code, string name, string definition) =>
        SeedAsync(CanonicalName(tenant), tenant, code, name, definition, published: true);
    internal Task<Guid> SeedDraftAsync(Guid tenant, string code, string name, string definition) =>
        SeedAsync(CanonicalName(tenant), tenant, code, name, definition, published: false);

    internal async Task<Guid> SeedAsync(string databaseName, Guid tenant, string code, string name, string definition, bool published)
    {
        await using var db = OpenDatabase(databaseName);
        var page = new TenantCustomPage
        {
            TenantId = tenant, Code = code, Name = name, DefinitionJson = definition, Revision = published ? 2 : 1, IsPublished = published,
            CreatedByUserId = UserId, UpdatedByUserId = UserId
        };
        db.TenantCustomPages.Add(page);
        db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision
        { TenantId = tenant, CustomPageId = page.Id, Revision = 1, Code = code, Name = name, DefinitionJson = definition, ChangeKind = "DraftCreated", ChangedByUserId = UserId });
        if (published)
            db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision
            { TenantId = tenant, CustomPageId = page.Id, Revision = 2, Code = code, Name = name, DefinitionJson = definition, ChangeKind = "Published", ChangedByUserId = UserId });
        await db.SaveChangesAsync();
        return page.Id;
    }

    internal async Task<(int Pages, int Revisions, int Audits)> CountsAsync()
    {
        var pages = 0; var revisions = 0; var audits = 0;
        foreach (var tenant in new[] { TenantA, TenantB })
        {
            await using var db = Open(tenant);
            pages += await db.TenantCustomPages.CountAsync();
            revisions += await db.TenantCustomPageRevisions.CountAsync();
            audits += await db.AuditEvents.CountAsync();
        }
        return (pages, revisions, audits);
    }

    internal async Task<string> PublishedDefinitionAsync(Guid tenant, string code)
    {
        await using var db = Open(tenant);
        return await db.TenantCustomPages.Where(x => x.TenantId == tenant && x.Code == code && x.IsPublished).Select(x => x.DefinitionJson).SingleAsync();
    }

    /// <summary>All-dataTable pages become a list template (slot "list", width removed); others are not converted.</summary>
    internal static MigrationResult Classify(string definitionJson, bool hasOpenDraft)
    {
        var root = JsonNode.Parse(definitionJson)!.AsObject();
        if (root.ContainsKey("template")) return new(null, ["Sayfa zaten kalıplı."], null, null, 0);
        if (hasOpenDraft) return new(null, ["Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli."], null, null, 0);
        var components = root["components"]!.AsArray();
        if (components.Any(x => x!["type"]!.GetValue<string>() == "actionBar")) return new(null, ["İşlem çubuğu kalıplarda yok."], null, null, 0);
        if (components.Any(x => x!["type"]!.GetValue<string>() != "dataTable")) return new(null, ["Bilinmeyen bileşen."], null, null, 0);
        var changes = 0;
        foreach (var component in components)
        {
            var props = component!["props"]!.AsObject();
            if (props.Remove("width")) changes++;
            props["slot"] = "list";
        }
        root["template"] = new JsonObject { ["name"] = "list" };
        return new("list", [], root.ToJsonString(), null, changes);
    }

    public void Dispose()
    {
        if (Directory.Exists(OutDir)) Directory.Delete(OutDir, recursive: true);
    }

    internal sealed class TestDatabases(PageTemplateMigrationTestKit kit, Func<string, string> storeFor) : IPageTemplateMigrationDatabases
    {
        internal List<string> Opened { get; } = [];
        internal string StoreFor(string databaseName) => storeFor(databaseName);

        public Task<IReadOnlyList<PageTemplateMigrationTenant>> ActiveTenantsAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<PageTemplateMigrationTenant>>([new(TenantA, "Firma A"), new(TenantB, "Firma B")]);

        public Task<TenantDbContext> OpenAsync(Guid tenantId, string databaseName, CancellationToken ct)
        {
            Opened.Add(databaseName);
            return Task.FromResult(kit.OpenStore(storeFor(databaseName)));
        }
    }
}
