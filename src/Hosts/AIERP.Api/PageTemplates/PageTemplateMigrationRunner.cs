using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal delegate MigrationResult PageMigrationClassifier(string definitionJson, bool hasOpenDraft, CatalogBundle? catalog);
internal delegate string? PageEquivalenceCheck(string before, string after);

internal enum PageTemplateMigrationCommand { Report, Run, Rollback, Verify }

internal sealed record PageTemplateMigrationTenant(Guid TenantId, string Name);

/// <summary>Where the runner reads tenants and opens their ERP databases. The CLI uses <see cref="PageTemplateMigrationSqlDatabases"/>.</summary>
internal interface IPageTemplateMigrationDatabases
{
    Task<IReadOnlyList<PageTemplateMigrationTenant>> ActiveTenantsAsync(CancellationToken ct);
    /// <summary>Opens <paramref name="databaseName"/>: the routed <c>AIERPTenant_&lt;guid&gt;</c> or its <c>_TplRehearsal</c> copy.</summary>
    Task<TenantDbContext> OpenAsync(Guid tenantId, string databaseName, CancellationToken ct);
}

/// <summary>Parsed command line of the template migration (sub-project 5b-1). <see cref="Validate"/> runs before any connection.</summary>
internal sealed partial record PageTemplateMigrationOptions(
    PageTemplateMigrationCommand Command, string? Batch, IReadOnlyList<Guid>? TenantIds, string? Confirmation, string? OutDir, string? PageCode,
    IReadOnlyDictionary<Guid, string> RehearsalDatabases, IReadOnlyList<string>? ExpectDatabases = null)
{
    /// <summary>Every argument of the migration mode starts with this; any such argument enters migration mode (typos fail there).</summary>
    internal const string ModePrefix = "--page-template-migration";
    internal const string ReportFlag = "--page-template-migration-report";
    internal const string RunFlag = "--page-template-migration-run=";
    internal const string RollbackFlag = "--page-template-migration-rollback=";
    internal const string VerifyFlag = "--page-template-migration-verify=";
    internal const string ConfirmFlag = "--confirm-page-template-migration=";
    internal const string ConfirmationValue = "I_HAVE_A_VERIFIED_BACKUP";
    internal const string RehearsalFlag = "--rehearsal-database=";
    internal const string ExpectFlag = "--expect-databases=";
    internal const string TenantsFlag = "--tenants=";
    internal const string OutFlag = "--out=";
    internal const string PageFlag = "--page=";
    internal const string RehearsalSuffix = "_TplRehearsal";
    private static readonly string[] ValuedFlags = [RunFlag, RollbackFlag, VerifyFlag, ConfirmFlag, RehearsalFlag, ExpectFlag, TenantsFlag, OutFlag, PageFlag];

    [GeneratedRegex(@"\A[a-z0-9-]{4,64}\z")] private static partial Regex BatchPattern();
    [GeneratedRegex(@"\A[A-Za-z0-9_]{1,128}\z")] private static partial Regex DatabaseNamePattern();

    internal static bool IsRequested(string[] args) => args.Any(x => x.StartsWith(ModePrefix, StringComparison.Ordinal));

    /// <summary>The only database name a rehearsal of <paramref name="tenantId"/> may use: <c>AIERPTenant_&lt;guid:N&gt;_TplRehearsal</c>.</summary>
    internal static string RehearsalDatabaseName(Guid tenantId) => PageTemplateMigrationRunner.CanonicalDatabaseName(tenantId) + RehearsalSuffix;

    /// <summary>Parses the arguments; throws <see cref="ArgumentException"/> on any unknown, malformed or missing value.</summary>
    internal static PageTemplateMigrationOptions Parse(string[] args)
    {
        if (args.FirstOrDefault(x => x != ReportFlag && !ValuedFlags.Any(flag => x.StartsWith(flag, StringComparison.Ordinal))) is { } unknown)
            throw new ArgumentException($"Unknown argument for the template migration: '{unknown}'. Values are given as --flag=value (no spaces).");
        var commands = new List<(PageTemplateMigrationCommand Command, string? Batch)>();
        if (args.Contains(ReportFlag, StringComparer.Ordinal)) commands.Add((PageTemplateMigrationCommand.Report, null));
        foreach (var arg in args.Where(x => x.StartsWith(RunFlag, StringComparison.Ordinal))) commands.Add((PageTemplateMigrationCommand.Run, arg[RunFlag.Length..]));
        foreach (var arg in args.Where(x => x.StartsWith(RollbackFlag, StringComparison.Ordinal))) commands.Add((PageTemplateMigrationCommand.Rollback, arg[RollbackFlag.Length..]));
        foreach (var arg in args.Where(x => x.StartsWith(VerifyFlag, StringComparison.Ordinal))) commands.Add((PageTemplateMigrationCommand.Verify, arg[VerifyFlag.Length..]));
        if (commands.Count != 1)
            throw new ArgumentException("Use exactly one of --page-template-migration-report, --page-template-migration-run=<batch>, --page-template-migration-rollback=<batch>, --page-template-migration-verify=<batch>.");

        IReadOnlyList<Guid>? tenants = null;
        if (Single(args, TenantsFlag) is { } tenantList)
        {
            var parsed = new List<Guid>();
            foreach (var part in tenantList.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                parsed.Add(Guid.TryParse(part, out var id) && id != Guid.Empty ? id : throw new ArgumentException($"--tenants contains an invalid tenant id: '{part}'."));
            tenants = parsed.Distinct().ToList();
        }
        var rehearsal = new Dictionary<Guid, string>();
        foreach (var arg in args.Where(x => x.StartsWith(RehearsalFlag, StringComparison.Ordinal)))
        {
            var value = arg[RehearsalFlag.Length..];
            var separator = value.IndexOf('=');
            if (separator <= 0 || !Guid.TryParse(value[..separator], out var tenant) || tenant == Guid.Empty)
                throw new ArgumentException("Use --rehearsal-database=<tenant-guid>=<databaseName>.");
            if (!rehearsal.TryAdd(tenant, value[(separator + 1)..])) throw new ArgumentException($"--rehearsal-database is given twice for tenant {tenant:D}.");
        }
        IReadOnlyList<string>? expect = Single(args, ExpectFlag) is { } expectList
            ? expectList.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList()
            : null;
        var (command, batch) = commands[0];
        var options = new PageTemplateMigrationOptions(command, batch, tenants, Single(args, ConfirmFlag), Single(args, OutFlag), Single(args, PageFlag), rehearsal, expect);
        options.Validate();
        return options;
    }

    private static string? Single(string[] args, string prefix)
    {
        var values = args.Where(x => x.StartsWith(prefix, StringComparison.Ordinal)).Select(x => x[prefix.Length..]).ToList();
        return values.Count switch
        {
            0 => null,
            1 => values[0],
            _ => throw new ArgumentException($"{prefix.TrimEnd('=')} may be given only once.")
        };
    }

    /// <summary>
    /// Throws <see cref="ArgumentException"/> unless the options are complete. Writing commands need the batch, an explicit
    /// <c>--tenants</c> list (no default target) and the backup confirmation. A rehearsal needs <c>--tenants</c>, a
    /// <c>--rehearsal-database</c> for every listed tenant named exactly <see cref="RehearsalDatabaseName"/>, and
    /// <c>--expect-databases</c>, so that no listed tenant silently falls back to its live database.
    /// </summary>
    internal void Validate()
    {
        if (ExpectDatabases is not null && (ExpectDatabases.Count == 0 || ExpectDatabases.Any(x => !DatabaseNamePattern().IsMatch(x))))
            throw new ArgumentException("--expect-databases must list database names (letters, digits, underscore), separated by commas.");
        if (RehearsalDatabases.Count > 0)
        {
            if (TenantIds is null || TenantIds.Count == 0)
                throw new ArgumentException("--rehearsal-database requires --tenants=<id,…>; every listed tenant needs its own rehearsal database.");
            foreach (var (tenant, name) in RehearsalDatabases)
            {
                if (!TenantIds.Contains(tenant))
                    throw new ArgumentException($"--rehearsal-database names tenant {tenant:D}, which is not in --tenants.");
                var expected = RehearsalDatabaseName(tenant);
                if (!string.Equals(name, expected, StringComparison.Ordinal))
                    throw new ArgumentException($"Rehearsal database '{name}' is refused for tenant {tenant:D}: the only allowed name is {expected}.");
            }
            var missing = TenantIds.Where(x => !RehearsalDatabases.ContainsKey(x)).ToList();
            if (missing.Count > 0)
                throw new ArgumentException($"In a rehearsal every listed tenant needs its own --rehearsal-database (it would otherwise hit the live database); missing: {string.Join(", ", missing.Select(x => x.ToString("D")))}.");
            if (ExpectDatabases is null)
                throw new ArgumentException("A rehearsal requires --expect-databases=<name,…> listing every target database.");
        }
        if (Command == PageTemplateMigrationCommand.Report)
        {
            if (string.IsNullOrWhiteSpace(OutDir)) throw new ArgumentException("--page-template-migration-report requires --out=<folder>.");
            if (PageCode is not null) throw new ArgumentException("--page is accepted only by --page-template-migration-rollback.");
            return;
        }
        if (Batch is null || !BatchPattern().IsMatch(Batch)) throw new ArgumentException("The batch name must match ^[a-z0-9-]{4,64}$.");
        if (Command == PageTemplateMigrationCommand.Verify)
        {
            if (PageCode is not null) throw new ArgumentException("--page is accepted only by --page-template-migration-rollback.");
            return;
        }
        if (TenantIds is null || TenantIds.Count == 0) throw new ArgumentException("--tenants=<id,…> is required for migration and rollback; there is no default target.");
        if (!string.Equals(Confirmation, ConfirmationValue, StringComparison.Ordinal))
            throw new ArgumentException($"Template migration and rollback require {ConfirmFlag}{ConfirmationValue}.");
        if (PageCode is not null && (Command != PageTemplateMigrationCommand.Rollback || !TenantCustomPageEndpoints.ValidCode(PageCode)))
            throw new ArgumentException("--page=<code> is accepted only by rollback and must be a valid page code.");
    }
}

/// <summary>
/// The CLI entry: parses, runs and maps the outcome to an exit code. 0 = done; 1 = a page failed with a write error (or a
/// verification failed); 2 = an argument or target error (message only, no stack trace; nothing was written).
/// </summary>
internal static class PageTemplateMigrationCli
{
    internal static async Task<int> RunAsync(string[] args, Func<PageTemplateMigrationRunner> runner, TextWriter error, CancellationToken ct)
    {
        PageTemplateMigrationOptions options;
        try { options = PageTemplateMigrationOptions.Parse(args); }
        catch (ArgumentException exception)
        {
            await error.WriteLineAsync($"Kalıp geçişi başlatılmadı: {exception.Message}");
            return 2;
        }
        try { return await runner().ExecuteAsync(options, ct); }
        catch (ArgumentException exception)
        {
            await error.WriteLineAsync($"Kalıp geçişi durduruldu: {exception.Message}");
            return 2;
        }
    }
}

internal sealed record MigrationReport(DateTimeOffset GeneratedAt, IReadOnlyList<MigrationReportTenant> Tenants, IReadOnlyList<MigrationReportStandard> Standards, MigrationReportSummary Summary);
internal sealed record MigrationReportTenant(Guid TenantId, string Name, string DatabaseName, IReadOnlyList<MigrationReportPage> Pages);
internal sealed record MigrationReportPage(string Code, string Name, bool Published, string? Target, IReadOnlyList<string> Reasons, string? Equivalence, int LayoutChanges);
internal sealed record MigrationReportStandard(string ScreenKey, int Version, string? Target, IReadOnlyList<string> Reasons);
internal sealed record MigrationReportSummary(IReadOnlyDictionary<string, int> ByTarget, IReadOnlyDictionary<string, int> StandardsByTarget,
    IReadOnlyList<MigrationReportTenantCount> ByTenant, IReadOnlyList<MigrationReportReason> TopReasons);
internal sealed record MigrationReportTenantCount(Guid TenantId, string Name, int List, int Free, int None);
internal sealed record MigrationReportReason(string Reason, int Count);

/// <summary>
/// Batch migration of legacy custom pages to the list / free templates (sub-project 5b-1):
/// <list type="bullet">
/// <item><c>report</c>: read-only dry run over tenant pages and the embedded standards; never contains SQL text, query results or user data.</item>
/// <item><c>run</c>: per page (own Serializable transaction) a <c>BeforeTemplateMigration</c> revision of the old definition, the
/// converted definition validated by the schema and template rules, a <c>TemplateMigrated</c> revision and an audit event.</item>
/// <item><c>rollback</c>: republishes the <c>BeforeTemplateMigration</c> definition unless the page changed after the migration.</item>
/// </list>
/// Writes run only with an explicit tenant list and the backup confirmation; every target database is printed before anything is opened.
/// </summary>
internal sealed partial class PageTemplateMigrationRunner(
    IPageTemplateMigrationDatabases databases, PageMigrationClassifier classify, PageEquivalenceCheck equivalence, TextWriter log)
{
    internal const string BeforeKind = "BeforeTemplateMigration";
    internal const string MigratedKind = "TemplateMigrated";
    internal const string RolledBackKind = "TemplateMigrationRolledBack";
    internal const string MigratedAudit = "custom-page.template-migrated";
    internal const string RolledBackAudit = "custom-page.template-migration-rolled-back";
    /// <summary>The CLI acts as no user: revisions carry <see cref="Guid.Empty"/> and audit rows a null user.</summary>
    internal static readonly Guid SystemUserId = Guid.Empty;

    private const string OpenDraftReason = PageTemplateMigration.OpenDraftReason;
    internal const string SystemPageReason = "Sistem sayfası; standartlar ayrı geçirilir.";
    internal const string DraftRowReason = "Taslak; toplu geçiş yalnız yayındaki tanımı taşır.";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    internal static PageTemplateMigrationRunner CreateDefault(IPageTemplateMigrationDatabases databases, TextWriter log) =>
        new(databases, (json, hasOpenDraft, catalog) => PageTemplateMigration.Classify(json, hasOpenDraft, catalog), BehaviorEquivalence.Check, log);

    internal static string CanonicalDatabaseName(Guid tenantId) => TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.Erp);

    // ---------------------------------------------------------------- report

    internal async Task<MigrationReport> ReportAsync(PageTemplateMigrationOptions options, CancellationToken ct)
    {
        if (options.Command != PageTemplateMigrationCommand.Report) throw new ArgumentException("Report options expected.");
        options.Validate();
        var targets = await ResolveTargetsAsync(options, ct);
        var tenants = new List<MigrationReportTenant>();
        foreach (var (tenant, databaseName) in targets)
        {
            await using var db = await databases.OpenAsync(tenant.TenantId, databaseName, ct);
            var catalog = await TenantCatalogStore.ActiveAsync(db, tenant.TenantId, ErpOperationCatalog.TryGet, ct);
            var rows = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant.TenantId && !x.IsArchived)
                .OrderBy(x => x.Code).ThenByDescending(x => x.IsPublished)
                .Select(x => new { x.Code, x.Name, x.IsPublished, x.ScreenKey, x.DefinitionJson }).ToListAsync(ct);
            var draftCodes = rows.Where(x => !x.IsPublished).Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
            // Same rules as run: only published, non-system pages without an open draft can get a target.
            var pages = rows.Select(x =>
            {
                if (x.ScreenKey is not null) return new MigrationReportPage(x.Code, x.Name, x.IsPublished, null, [SystemPageReason], null, 0);
                if (!x.IsPublished) return new MigrationReportPage(x.Code, x.Name, false, null, [DraftRowReason], null, 0);
                var result = SafeClassify(x.DefinitionJson, draftCodes.Contains(x.Code), catalog);
                return new MigrationReportPage(x.Code, x.Name, true, result.Target, result.Reasons, EquivalenceText(result), result.LayoutChanges);
            }).ToList();
            tenants.Add(new MigrationReportTenant(tenant.TenantId, tenant.Name, databaseName, pages));
        }
        var standards = SystemPageStandards.All.Values.OrderBy(x => x.ScreenKey, StringComparer.Ordinal).Select(x =>
        {
            var result = SafeClassify(x.DefinitionJson, false, null);
            return new MigrationReportStandard(x.ScreenKey, x.Version, result.Target, result.Reasons);
        }).ToList();
        var report = new MigrationReport(DateTimeOffset.UtcNow, tenants, standards, Summarize(tenants, standards));
        Directory.CreateDirectory(options.OutDir!);
        await File.WriteAllTextAsync(Path.Combine(options.OutDir!, "rapor.json"), JsonSerializer.Serialize(report, JsonOptions), ct);
        await File.WriteAllTextAsync(Path.Combine(options.OutDir!, "rapor.md"), Markdown(report), ct);
        await log.WriteLineAsync($"Kalıp geçişi raporu yazıldı: {Path.Combine(options.OutDir!, "rapor.json")} ve rapor.md " +
            $"(firma={tenants.Count}; sayfa={tenants.Sum(x => x.Pages.Count)}; standart={standards.Count}).");
        return report;
    }

    private MigrationResult SafeClassify(string definitionJson, bool hasOpenDraft, CatalogBundle? catalog)
    {
        try { return classify(definitionJson, hasOpenDraft, catalog); }
        // Only the exception type is reported; its message could quote definition content.
        catch (Exception exception) { return new MigrationResult(null, [$"Sınıflandırma hatası: {exception.GetType().Name}."], null, null, 0); }
    }

    private static string? EquivalenceText(MigrationResult result) =>
        result.EquivalenceFailure is { } failure ? $"eşdeğerlik denetimi başarısız: {failure}" : result.ConvertedJson is not null ? "geçti" : null;

    private static string TargetKey(string? target) => target is "list" or "free" ? target : "none";

    private static MigrationReportSummary Summarize(IReadOnlyList<MigrationReportTenant> tenants, IReadOnlyList<MigrationReportStandard> standards)
    {
        static Dictionary<string, int> Count(IEnumerable<string?> targets)
        {
            var counts = new Dictionary<string, int>(StringComparer.Ordinal) { ["list"] = 0, ["free"] = 0, ["none"] = 0 };
            foreach (var target in targets) counts[TargetKey(target)]++;
            return counts;
        }
        var byTenant = tenants.Select(t =>
        {
            var counts = Count(t.Pages.Select(x => x.Target));
            return new MigrationReportTenantCount(t.TenantId, t.Name, counts["list"], counts["free"], counts["none"]);
        }).ToList();
        var topReasons = tenants.SelectMany(x => x.Pages).SelectMany(x => x.Reasons).Concat(standards.SelectMany(x => x.Reasons))
            .GroupBy(x => x, StringComparer.Ordinal).Select(x => new MigrationReportReason(x.Key, x.Count()))
            .OrderByDescending(x => x.Count).ThenBy(x => x.Reason, StringComparer.Ordinal).Take(10).ToList();
        return new MigrationReportSummary(Count(tenants.SelectMany(x => x.Pages).Select(x => x.Target)), Count(standards.Select(x => x.Target)), byTenant, topReasons);
    }

    private static string TargetLabel(string? target) => target switch { "list" => "Liste", "record" => "Kayıt kartı", "free" => "Serbest", _ => "—" };
    private static string Cell(string? value) => string.IsNullOrEmpty(value) ? "—" : value.Replace("\r", " ").Replace("\n", " ").Replace("|", "\\|");

    private static string Markdown(MigrationReport report)
    {
        var md = new StringBuilder();
        md.AppendLine("# Kalıp geçişi kuru çalıştırma raporu").AppendLine();
        md.AppendLine($"Oluşturulma: {report.GeneratedAt:yyyy-MM-dd HH:mm:ss} UTC. Rapor yalnız sayfa kodu, adı ve yapı bilgisini içerir; SQL metni, sorgu sonucu ya da kullanıcı verisi içermez.").AppendLine();
        md.AppendLine("## Özet").AppendLine();
        md.AppendLine("| Firma | Liste | Serbest | — |").AppendLine("|---|---:|---:|---:|");
        foreach (var t in report.Summary.ByTenant) md.AppendLine($"| {Cell(t.Name)} ({t.TenantId.ToString("N")[..8]}) | {t.List} | {t.Free} | {t.None} |");
        md.AppendLine($"| **Toplam** | {report.Summary.ByTarget["list"]} | {report.Summary.ByTarget["free"]} | {report.Summary.ByTarget["none"]} |");
        md.AppendLine($"| Standartlar | {report.Summary.StandardsByTarget["list"]} | {report.Summary.StandardsByTarget["free"]} | {report.Summary.StandardsByTarget["none"]} |").AppendLine();
        md.AppendLine("### En sık 10 neden").AppendLine();
        md.AppendLine("| Neden | Sayı |").AppendLine("|---|---:|");
        foreach (var r in report.Summary.TopReasons) md.AppendLine($"| {Cell(r.Reason)} | {r.Count} |");
        md.AppendLine();
        foreach (var t in report.Tenants)
        {
            md.AppendLine($"## {Cell(t.Name)} ({t.TenantId.ToString("N")[..8]}) — {t.DatabaseName}").AppendLine();
            md.AppendLine("| Kod | Ad | Durum | Hedef | Nedenler | Eşdeğerlik | Yerleşim değişikliği |").AppendLine("|---|---|---|---|---|---|---:|");
            foreach (var p in t.Pages)
                md.AppendLine($"| {Cell(p.Code)} | {Cell(p.Name)} | {(p.Published ? "Yayın" : "Taslak")} | {TargetLabel(p.Target)} | {Cell(string.Join(" ", p.Reasons))} | {Cell(p.Equivalence)} | {p.LayoutChanges} |");
            md.AppendLine();
        }
        md.AppendLine("## Sistem standartları").AppendLine();
        md.AppendLine("| Ekran | Sürüm | Hedef | Nedenler |").AppendLine("|---|---:|---|---|");
        foreach (var s in report.Standards) md.AppendLine($"| {Cell(s.ScreenKey)} | {s.Version} | {TargetLabel(s.Target)} | {Cell(string.Join(" ", s.Reasons))} |");
        return md.ToString();
    }

    // ---------------------------------------------------------------- targets

    /// <summary>
    /// Resolves (and prints) every target database before any is opened. Unknown or inactive tenants, a rehearsal that does not
    /// cover every target, or targets that differ from <c>--expect-databases</c> fail the whole command before anything is opened.
    /// </summary>
    private async Task<IReadOnlyList<(PageTemplateMigrationTenant Tenant, string DatabaseName)>> ResolveTargetsAsync(PageTemplateMigrationOptions options, CancellationToken ct)
    {
        var active = await databases.ActiveTenantsAsync(ct);
        IReadOnlyList<PageTemplateMigrationTenant> selected;
        if (options.TenantIds is null) selected = active.OrderBy(x => x.Name, StringComparer.Ordinal).ToList();
        else
        {
            var missing = options.TenantIds.Where(id => active.All(x => x.TenantId != id)).ToList();
            if (missing.Count > 0) throw new ArgumentException($"Unknown or inactive tenant(s): {string.Join(", ", missing.Select(x => x.ToString("D")))}.");
            selected = options.TenantIds.Select(id => active.First(x => x.TenantId == id)).ToList();
        }
        var unknownRehearsal = options.RehearsalDatabases.Keys.Where(id => selected.All(x => x.TenantId != id)).ToList();
        if (unknownRehearsal.Count > 0) throw new ArgumentException($"--rehearsal-database names tenant(s) that are not targeted: {string.Join(", ", unknownRehearsal.Select(x => x.ToString("D")))}.");
        var rehearsalMode = options.RehearsalDatabases.Count > 0;
        if (rehearsalMode && selected.FirstOrDefault(x => !options.RehearsalDatabases.ContainsKey(x.TenantId)) is { } uncovered)
            throw new ArgumentException($"Tenant {uncovered.TenantId:D} has no --rehearsal-database; a rehearsal never falls back to a live database.");
        var targets = selected.Select(t => (Tenant: t, DatabaseName: rehearsalMode ? PageTemplateMigrationOptions.RehearsalDatabaseName(t.TenantId) : CanonicalDatabaseName(t.TenantId))).ToList();
        if (rehearsalMode && targets.Any(x => !string.Equals(x.DatabaseName, options.RehearsalDatabases[x.Tenant.TenantId], StringComparison.Ordinal)))
            throw new ArgumentException("A rehearsal database name does not match AIERPTenant_<guid:N>_TplRehearsal.");
        log.WriteLine("Hedef veritabanları:");
        foreach (var (tenant, databaseName) in targets)
            log.WriteLine($"  {databaseName}  ({tenant.Name}, {tenant.TenantId:D}){(rehearsalMode ? "  [PROVA KOPYASI]" : "  [CANLI]")}");
        if (options.ExpectDatabases is { } expected)
        {
            var actual = targets.Select(x => x.DatabaseName).Order(StringComparer.Ordinal).ToList();
            if (!actual.SequenceEqual(expected.Order(StringComparer.Ordinal), StringComparer.Ordinal))
                throw new ArgumentException($"Target databases ({string.Join(", ", actual)}) differ from --expect-databases ({string.Join(", ", expected)}); nothing was opened.");
            log.WriteLine("Hedefler --expect-databases ile aynı.");
        }
        return targets;
    }

}

/// <summary>
/// CLI database source: active tenants from PlatformDB; each ERP database through the routed tenant runtime credential
/// (catalog entry Ready and canonical, Vault ERP credential), exactly as request routing does. A rehearsal override keeps
/// that credential and server and changes only the database name (exactly <c>AIERPTenant_&lt;guid:N&gt;_TplRehearsal</c>).
/// </summary>
internal sealed class PageTemplateMigrationSqlDatabases(IServiceProvider services, string tenantConnectionTemplate) : IPageTemplateMigrationDatabases
{
    public async Task<IReadOnlyList<PageTemplateMigrationTenant>> ActiveTenantsAsync(CancellationToken ct)
    {
        await using var scope = services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        return await platform.Tenants.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Name)
            .Select(x => new PageTemplateMigrationTenant(x.Id, x.Name)).ToListAsync(ct);
    }

    public async Task<TenantDbContext> OpenAsync(Guid tenantId, string databaseName, CancellationToken ct)
    {
        await using var scope = services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        EnsureAllowedDatabaseName(tenantId, databaseName);
        var canonical = PageTemplateMigrationRunner.CanonicalDatabaseName(tenantId);
        var entry = await platform.TenantDatabaseCatalog.AsNoTracking().Where(x => x.TenantId == tenantId).SingleOrDefaultAsync(ct);
        if (entry is null || entry.State != TenantDatabaseProvisioningState.Ready || !string.Equals(entry.DatabaseName, canonical, StringComparison.Ordinal))
            throw new InvalidOperationException($"Tenant {tenantId:D} has no Ready canonical ERP database.");
        var reader = scope.ServiceProvider.GetRequiredService<ITenantSqlCredentialReader>();
        var credential = await reader.ReadAsync(tenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.Erp), ct);
        var connection = new SqlConnectionStringBuilder(TenantDatabaseRouting.BuildTenantConnectionString(tenantConnectionTemplate, tenantId, credential))
        { InitialCatalog = databaseName, ApplicationName = "Nexora.PageTemplateMigration" }.ConnectionString;
        return new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options,
            new AuditExecutionContext(tenantId, null, "page-template-migration"));
    }

    /// <summary>
    /// Last guard before a connection: the tenant's own routed database <c>AIERPTenant_&lt;guid:N&gt;</c> or exactly its rehearsal
    /// copy <c>AIERPTenant_&lt;guid:N&gt;_TplRehearsal</c>; any other name (another tenant's copy, <c>AIERPTenant_R9Rehearsal</c>…) throws.
    /// </summary>
    internal static void EnsureAllowedDatabaseName(Guid tenantId, string databaseName)
    {
        var canonical = PageTemplateMigrationRunner.CanonicalDatabaseName(tenantId);
        if (!string.Equals(databaseName, canonical, StringComparison.Ordinal)
            && !string.Equals(databaseName, PageTemplateMigrationOptions.RehearsalDatabaseName(tenantId), StringComparison.Ordinal))
            throw new InvalidOperationException($"Database '{databaseName}' is neither the routed database of tenant {tenantId:D} nor its rehearsal copy.");
    }
}
