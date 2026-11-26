using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Kit = AIERP.Api.IntegrationTests.PageTemplateMigrationTestKit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Template migration review fixes: rehearsal targeting (exact copy name, every tenant, --expect-databases), the CLI
/// argument and exit-code rules, report/run agreement, the real classifier end to end, the catalog, rollback with a
/// later draft and the read-only verify command.
/// </summary>
public sealed class PageTemplateMigrationHardeningTests
{
    private const string Confirm = "--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP";

    // ---------------------------------------------------------------- rehearsal targeting (C1)

    [Fact]
    public async Task Rehearsal_must_cover_every_listed_tenant()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.SeedPublishedAsync(Kit.TenantB, "stok-listesi", "Stok listesi", Kit.ListPage);
        var before = await kit.CountsAsync();
        var options = kit.RunOptions(tenants: [Kit.TenantA, Kit.TenantB]) with
        {
            RehearsalDatabases = new Dictionary<Guid, string> { [Kit.TenantA] = Kit.RehearsalName(Kit.TenantA) },
            ExpectDatabases = [Kit.RehearsalName(Kit.TenantA), Kit.CanonicalName(Kit.TenantB)]
        };

        var error = await Assert.ThrowsAsync<ArgumentException>(() => kit.Runner().RunAsync(options, CancellationToken.None));

        Assert.Contains(Kit.TenantB.ToString("D"), error.Message);
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1",
            $"--tenants={Kit.TenantA},{Kit.TenantB}", Confirm, $"--rehearsal-database={Kit.TenantA}={Kit.RehearsalName(Kit.TenantA)}",
            $"--expect-databases={Kit.RehearsalName(Kit.TenantA)},{Kit.CanonicalName(Kit.TenantB)}"]));
        // A report with a rehearsal needs --tenants too (no "all tenants" fallback to live databases).
        await Assert.ThrowsAsync<ArgumentException>(() => kit.Runner().ReportAsync(kit.ReportOptions() with
        {
            RehearsalDatabases = new Dictionary<Guid, string> { [Kit.TenantA] = Kit.RehearsalName(Kit.TenantA) }, ExpectDatabases = [Kit.RehearsalName(Kit.TenantA)]
        }, CancellationToken.None));
        Assert.Empty(kit.Databases.Opened);
        Assert.Equal(before, await kit.CountsAsync());
    }

    [Fact]
    public async Task Rehearsal_requires_expect_databases()
    {
        using var kit = new Kit();
        var options = kit.RunOptions() with { RehearsalDatabases = new Dictionary<Guid, string> { [Kit.TenantA] = Kit.RehearsalName(Kit.TenantA) } };

        await Assert.ThrowsAsync<ArgumentException>(() => kit.Runner().RunAsync(options, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => kit.Runner().RollbackAsync(kit.RollbackOptions() with { RehearsalDatabases = options.RehearsalDatabases }, CancellationToken.None));
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}", Confirm,
            $"--rehearsal-database={Kit.TenantA}={Kit.RehearsalName(Kit.TenantA)}"]));
        Assert.Empty(kit.Databases.Opened);
    }

    [Fact]
    public async Task Expect_databases_mismatch_aborts_before_opening()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        var before = await kit.CountsAsync();

        foreach (var expected in new[] { new[] { Kit.CanonicalName(Kit.TenantB) }, [Kit.RehearsalName(Kit.TenantA)], [Kit.CanonicalName(Kit.TenantA), Kit.CanonicalName(Kit.TenantB)] })
        {
            await Assert.ThrowsAsync<ArgumentException>(() => kit.Runner().RunAsync(kit.RunOptions() with { ExpectDatabases = expected }, CancellationToken.None));
            await Assert.ThrowsAsync<ArgumentException>(() => kit.Runner().RollbackAsync(kit.RollbackOptions() with { ExpectDatabases = expected }, CancellationToken.None));
        }
        Assert.Empty(kit.Databases.Opened);
        Assert.Equal(before, await kit.CountsAsync());
        // The targets are printed before the comparison, so the operator sees what would have been hit.
        Assert.Contains(Kit.CanonicalName(Kit.TenantA), kit.Log.ToString());

        var result = await kit.Runner().RunAsync(kit.RunOptions() with { ExpectDatabases = [Kit.CanonicalName(Kit.TenantA)] }, CancellationToken.None);
        Assert.True(Assert.Single(result.Pages).Applied);
        Assert.Equal([Kit.CanonicalName(Kit.TenantA)], kit.Databases.Opened);
        Assert.Contains("--expect-databases", kit.Log.ToString());
    }

    [Fact]
    public void Open_guard_accepts_only_the_tenant_database_or_its_exact_rehearsal_copy()
    {
        PageTemplateMigrationSqlDatabases.EnsureAllowedDatabaseName(Kit.TenantA, Kit.CanonicalName(Kit.TenantA));
        PageTemplateMigrationSqlDatabases.EnsureAllowedDatabaseName(Kit.TenantA, Kit.RehearsalName(Kit.TenantA));
        Assert.Equal(Kit.RehearsalName(Kit.TenantA), PageTemplateMigrationOptions.RehearsalDatabaseName(Kit.TenantA));
        foreach (var name in new[] { "AIERPTenant_R9Rehearsal", "AIERPTenant_R9_TplRehearsal", Kit.CanonicalName(Kit.TenantB), Kit.RehearsalName(Kit.TenantB),
                     $"AIERPTenant_{Kit.TenantA:D}_TplRehearsal", Kit.RehearsalName(Kit.TenantA).ToUpperInvariant(), "AIERPPlatform", "" })
            Assert.Throws<InvalidOperationException>(() => PageTemplateMigrationSqlDatabases.EnsureAllowedDatabaseName(Kit.TenantA, name));
    }

    // ---------------------------------------------------------------- arguments and exit codes (I5, M3, M4)

    [Fact]
    public void Any_page_template_migration_argument_enters_migration_mode()
    {
        Assert.True(PageTemplateMigrationOptions.IsRequested(["--page-template-migration-run", "tpl-1"]));
        Assert.True(PageTemplateMigrationOptions.IsRequested(["--page-template-migration-report=x"]));
        Assert.True(PageTemplateMigrationOptions.IsRequested(["--page-template-migration-rolback=tpl-1"]));
        Assert.False(PageTemplateMigrationOptions.IsRequested(["--urls=http://localhost:5000"]));
        Assert.False(PageTemplateMigrationOptions.IsRequested([]));
    }

    public static TheoryData<string[]> MalformedArguments => new()
    {
        new[] { "--page-template-migration-run", "tpl-1" },
        new[] { "--page-template-migration-report=x", "--out=/tmp/x" },
        new[] { "--page-template-migration-report", "--out=/tmp/x", "--pages=a" },
        new[] { "--page-template-migration-report", "--out", "/tmp/x" },
    };

    [Theory]
    [MemberData(nameof(MalformedArguments))]
    public async Task Malformed_arguments_exit_with_code_2_and_a_message(string[] args)
    {
        using var error = new StringWriter();
        var code = await PageTemplateMigrationCli.RunAsync(args, () => throw new InvalidOperationException("must not be created"), error, CancellationToken.None);

        Assert.Equal(2, code);
        Assert.StartsWith("Kalıp geçişi başlatılmadı:", error.ToString());
        Assert.DoesNotContain("   at ", error.ToString());
    }

    [Fact]
    public void Batch_name_with_trailing_newline_is_refused()
    {
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1\n", $"--tenants={Kit.TenantA}", Confirm]));
        Assert.Throws<ArgumentException>(() => PageTemplateMigrationOptions.Parse(["--page-template-migration-verify=deneme-1\n"]));
        Assert.Equal("deneme-1", PageTemplateMigrationOptions.Parse(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}", Confirm]).Batch);
    }

    [Fact]
    public async Task Target_errors_exit_with_code_2_and_write_errors_with_code_1()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        using var error = new StringWriter();

        var unknownTenant = await PageTemplateMigrationCli.RunAsync(["--page-template-migration-run=deneme-1", $"--tenants={Guid.NewGuid()}", Confirm],
            kit.Runner, error, CancellationToken.None);
        Assert.Equal(2, unknownTenant);
        Assert.Contains("Kalıp geçişi durduruldu:", error.ToString());

        // A page whose transaction throws is reported as a write error and fails the process.
        var failing = new PageTemplateMigrationRunner(kit.Databases, Kit.Classify, (_, _) => throw new InvalidOperationException("boom"), kit.Log);
        var writeError = await PageTemplateMigrationCli.RunAsync(["--page-template-migration-run=deneme-1", $"--tenants={Kit.TenantA}", Confirm],
            () => failing, error, CancellationToken.None);
        Assert.Equal(1, writeError);
        Assert.Contains("Yazma hatası: InvalidOperationException.", kit.Log.ToString());

        var ok = await PageTemplateMigrationCli.RunAsync(["--page-template-migration-run=deneme-2", $"--tenants={Kit.TenantA}", Confirm],
            kit.Runner, error, CancellationToken.None);
        Assert.Equal(0, ok);
    }

    // ---------------------------------------------------------------- report agrees with run (I3)

    [Fact]
    public async Task Report_convertible_count_matches_what_run_migrates()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.SeedPublishedAsync(Kit.TenantA, "islem-sayfasi", "İşlem sayfası", Kit.ActionBarPage);
        await kit.SeedPublishedAsync(Kit.TenantA, "taslakli", "Taslaklı", Kit.ListPage);
        await kit.SeedDraftAsync(Kit.TenantA, "taslakli", "Taslaklı (taslak)", Kit.ListPage);
        await kit.SeedDraftAsync(Kit.TenantA, "yalniz-taslak", "Yalnız taslak", Kit.ListPage);
        var systemId = await kit.SeedPublishedAsync(Kit.TenantA, "cari-liste", "Cari liste", Kit.ListPage);
        await using (var db = kit.Open(Kit.TenantA))
        {
            (await db.TenantCustomPages.SingleAsync(x => x.Id == systemId)).ScreenKey = "customers.list";
            await db.SaveChangesAsync();
        }

        var report = await kit.Runner().ReportAsync(kit.ReportOptions() with { TenantIds = [Kit.TenantA] }, CancellationToken.None);
        var pages = Assert.Single(report.Tenants).Pages;
        var system = Assert.Single(pages, x => x.Code == "cari-liste");
        Assert.Null(system.Target);
        Assert.Equal(["Sistem sayfası; standartlar ayrı geçirilir."], system.Reasons);
        Assert.All(pages.Where(x => !x.Published), x => Assert.Null(x.Target));
        Assert.Null(Assert.Single(pages, x => x.Code == "taslakli" && x.Published).Target);

        var run = await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);
        var convertible = report.Summary.ByTarget["list"] + report.Summary.ByTarget["free"];
        Assert.Equal(1, convertible);
        Assert.Equal(convertible, run.Pages.Count(x => x.Applied));
        Assert.Equal(["musteri-listesi"], pages.Where(x => x.Target is not null).Select(x => x.Code));
        Assert.Contains("Sistem sayfası; standartlar ayrı geçirilir.", Assert.Single(run.Pages, x => x.Code == "cari-liste").Reasons);
    }

    // ---------------------------------------------------------------- real classifier end to end (I4)

    private static readonly object[] RealQueries =
    [
        new { id = "liste", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "sil", name = "sil", kind = "delete", operation = "stok.kart.sil", runOn = "manual", parameters = new object[] { new { name = "id", binding = "{{bugun}}", type = "guid" } } }
    ];

    private static object C(string id, string type, object props) => new { id, type, name = id, props };

    private static string RealPage(params object[] components) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2, ["queries"] = RealQueries, ["components"] = components
    });

    internal static readonly string RealListPage = RealPage(
        C("baslik", "heading", new { text = "Kartlar", width = 12 }),
        C("toplam", "metric", new { title = "Toplam", value = "1" }),
        C("tablo", "dataTable", new { query = "liste", width = 12, rowActions = new[] { "satirSil" } }),
        C("yeni", "button", new { label = "Sil", actionType = "query", queryId = "sil", confirmText = "Emin misiniz?" }),
        C("satirSil", "button", new { label = "Satırı sil", actionType = "query", queryId = "sil" }),
        C("not", "text", new { text = "Alt not" }));

    internal static readonly string RealFreePage = RealPage(
        C("m1", "metric", new { title = "A", value = "1", width = 4 }),
        C("m2", "metric", new { title = "B", value = "2", width = 4 }),
        C("m3", "metric", new { title = "C", value = "3", width = 4 }),
        C("rozet", "badge", new { text = "Durum" }));

    [Fact]
    public async Task Real_classifier_run_and_rollback_restore_the_exact_original()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "kart-listesi", "Kart listesi", RealListPage);
        await kit.SeedPublishedAsync(Kit.TenantA, "pano", "Pano", RealFreePage);

        var run = await kit.RealRunner().RunAsync(kit.RunOptions(), CancellationToken.None);

        Assert.All(run.Pages, x => Assert.True(x.Applied, string.Join(" ", x.Reasons)));
        foreach (var (code, original, target) in new[] { ("kart-listesi", RealListPage, "list"), ("pano", RealFreePage, "free") })
        {
            var published = await kit.PublishedDefinitionAsync(Kit.TenantA, code);
            using var document = JsonDocument.Parse(published);
            Assert.Equal(target, document.RootElement.GetProperty("template").GetProperty("name").GetString());
            Assert.True(TenantCustomPageSchema.Validate(published, out var error), error);
            Assert.Null(BehaviorEquivalence.Check(original, published));
        }

        var verify = await kit.RealRunner().VerifyAsync(kit.VerifyOptions(), CancellationToken.None);
        Assert.Equal(2, verify.Pages.Count);
        Assert.All(verify.Pages, x => Assert.False(x.Failed, string.Join(" ", x.Reasons)));

        var rollback = await kit.RealRunner().RollbackAsync(kit.RollbackOptions(), CancellationToken.None);

        Assert.All(rollback.Pages, x => Assert.True(x.Applied, string.Join(" ", x.Reasons)));
        Assert.Equal(RealListPage, await kit.PublishedDefinitionAsync(Kit.TenantA, "kart-listesi"));
        Assert.Equal(RealFreePage, await kit.PublishedDefinitionAsync(Kit.TenantA, "pano"));
    }

    // ---------------------------------------------------------------- verify command (I6)

    [Fact]
    public async Task Verify_reports_a_tampered_pair_and_writes_nothing()
    {
        using var kit = new Kit();
        var pageId = await kit.SeedPublishedAsync(Kit.TenantA, "kart-listesi", "Kart listesi", RealListPage);
        await kit.RealRunner().RunAsync(kit.RunOptions(), CancellationToken.None);
        await using (var db = kit.Open(Kit.TenantA))
        {
            // Simulate a stored migrated definition whose behaviour differs (changed button action).
            var migrated = await db.TenantCustomPageRevisions.SingleAsync(x => x.CustomPageId == pageId && x.ChangeKind == "TemplateMigrated");
            var node = JsonNode.Parse(migrated.DefinitionJson)!;
            node["components"]!.AsArray().Single(x => (string?)x!["id"] == "yeni")!["props"]!["actionType"] = "page";
            migrated.DefinitionJson = node.ToJsonString();
            await db.SaveChangesAsync();
        }
        var before = await kit.CountsAsync();

        var result = await kit.RealRunner().VerifyAsync(kit.VerifyOptions(), CancellationToken.None);

        var outcome = Assert.Single(result.Pages);
        Assert.True(outcome.Failed);
        Assert.Contains(outcome.Reasons, x => x.Contains("actionType", StringComparison.Ordinal));
        Assert.Equal(before, await kit.CountsAsync());
        Assert.Equal(1, await kit.RealRunner().ExecuteAsync(kit.VerifyOptions(), CancellationToken.None));
        // An unknown batch has nothing to verify: exit code 1 so a typo is not mistaken for success.
        Assert.Equal(1, await kit.RealRunner().ExecuteAsync(kit.VerifyOptions(batch: "baska-batch"), CancellationToken.None));
        // Verify is read-only: no backup confirmation is needed.
        Assert.Null(PageTemplateMigrationOptions.Parse(["--page-template-migration-verify=deneme-1", $"--tenants={Kit.TenantA}"]).Confirmation);
    }

    // ---------------------------------------------------------------- catalog (I1)

    private const string CatalogBundleJson = """
        {"schemaVersion":1,"dataSources":[{"code":"cariListe","label":"Cariler","source":{"sql":"SELECT Code, Name FROM CustomerAccounts"},"parameters":[],
        "columns":[{"code":"Code","label":"Kod","type":"text","key":true},{"code":"Name","label":"Ad","type":"text","key":false}]}],"actions":[]}
        """;

    internal static readonly string CatalogListPage = JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new object[] { new { id = "q1", name = "cariler", kind = "read", dataSource = "cariListe", parameters = Array.Empty<object>(), runOn = "load" } },
        components = new object[] { new { id = "tablo", type = "dataTable", name = "tablo", props = new { query = "q1", width = 12 } } }
    });

    [Fact]
    public void Classifier_converts_a_catalog_page_only_with_the_catalog()
    {
        var catalog = new CatalogBundle([new CatalogItem("cariListe", "Cariler", "dataSource", "read", "SELECT Code, Name FROM CustomerAccounts", null, [],
            [new CatalogColumn("Code", "Kod", "text", true), new CatalogColumn("Name", "Ad", "text", false)], null, null, null)]);

        var without = PageTemplateMigration.Classify(CatalogListPage, hasOpenDraft: false);
        Assert.Null(without.Target);

        var with = PageTemplateMigration.Classify(CatalogListPage, hasOpenDraft: false, catalog);
        Assert.Equal("list", with.Target);
        Assert.NotNull(with.ConvertedJson);
        Assert.True(TenantCustomPageSchema.Validate(with.ConvertedJson!, out var error, null, ErpOperationCatalog.TryGet, catalog), error);
    }

    [Fact]
    public async Task Report_and_run_use_the_tenant_active_catalog()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "cariler", "Cariler", CatalogListPage);
        await using (var db = kit.Open(Kit.TenantA))
        {
            db.TenantCatalogReleases.Add(new TenantCatalogRelease
            {
                TenantId = Kit.TenantA, Version = "1.0.0", Status = "Active", BundleJson = CatalogBundleJson,
                BundleSha256 = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(CatalogBundleJson))),
                CreatedByUserId = Kit.UserId, ActivatedByUserId = Kit.UserId, ActivatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var report = await kit.RealRunner().ReportAsync(kit.ReportOptions() with { TenantIds = [Kit.TenantA] }, CancellationToken.None);
        var page = Assert.Single(Assert.Single(report.Tenants).Pages);
        Assert.True(page.Target == "list", string.Join(" ", page.Reasons));

        var run = await kit.RealRunner().RunAsync(kit.RunOptions(), CancellationToken.None);
        var outcome = Assert.Single(run.Pages);
        Assert.True(outcome.Applied, string.Join(" ", outcome.Reasons));
    }

    // ---------------------------------------------------------------- rollback with a later draft (I2), reasons kept (M5)

    [Fact]
    public async Task Rollback_skips_page_with_a_draft_opened_after_migration()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        await kit.Runner().RunAsync(kit.RunOptions(), CancellationToken.None);
        var migrated = await kit.PublishedDefinitionAsync(Kit.TenantA, "musteri-listesi");
        var draftId = await kit.SeedDraftAsync(Kit.TenantA, "musteri-listesi", "Yeni taslak", migrated);
        var before = await kit.CountsAsync();

        var result = await kit.Runner().RollbackAsync(kit.RollbackOptions(), CancellationToken.None);

        var outcome = Assert.Single(result.Pages);
        Assert.False(outcome.Applied);
        Assert.False(outcome.Failed);
        Assert.Contains("Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.", outcome.Reasons);
        Assert.Equal(before, await kit.CountsAsync());
        Assert.Equal(migrated, await kit.PublishedDefinitionAsync(Kit.TenantA, "musteri-listesi"));
        await using var db = kit.Open(Kit.TenantA);
        Assert.Equal(migrated, (await db.TenantCustomPages.SingleAsync(x => x.Id == draftId)).DefinitionJson);
    }

    [Fact]
    public async Task Run_keeps_all_classifier_reasons_when_equivalence_failed()
    {
        using var kit = new Kit();
        await kit.SeedPublishedAsync(Kit.TenantA, "musteri-listesi", "Müşteri listesi", Kit.ListPage);
        var runner = new PageTemplateMigrationRunner(kit.Databases,
            (_, _, _) => new MigrationResult(null, ["Liste kalıbı tam bir veri listesi (dataTable) ister.", "Eşdeğerlik denetimi başarısız: x"], null, "x", 0),
            BehaviorEquivalence.Check, kit.Log);

        var outcome = Assert.Single((await runner.RunAsync(kit.RunOptions(), CancellationToken.None)).Pages);

        Assert.False(outcome.Applied);
        Assert.Equal(["Liste kalıbı tam bir veri listesi (dataTable) ister.", "Eşdeğerlik denetimi başarısız: x"], outcome.Reasons);
    }
}
