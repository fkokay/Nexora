using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal delegate MigrationResult PageMigrationClassifier(string definitionJson, bool hasOpenDraft);
internal delegate string? PageEquivalenceCheck(string before, string after);

internal enum PageTemplateMigrationCommand { Report, Run, Rollback }

internal sealed record PageTemplateMigrationTenant(Guid TenantId, string Name);

/// <summary>Where the runner reads tenants and opens their ERP databases. The CLI uses <see cref="PageTemplateMigrationSqlDatabases"/>.</summary>
internal interface IPageTemplateMigrationDatabases
{
    Task<IReadOnlyList<PageTemplateMigrationTenant>> ActiveTenantsAsync(CancellationToken ct);
    /// <summary>Opens <paramref name="databaseName"/>: the routed <c>AIERPTenant_&lt;guid&gt;</c> or a validated rehearsal copy.</summary>
    Task<TenantDbContext> OpenAsync(Guid tenantId, string databaseName, CancellationToken ct);
}

/// <summary>Parsed command line of the template migration (sub-project 5b-1). <see cref="Validate"/> runs before any connection.</summary>
internal sealed partial record PageTemplateMigrationOptions(
    PageTemplateMigrationCommand Command, string? Batch, IReadOnlyList<Guid>? TenantIds, string? Confirmation, string? OutDir, string? PageCode,
    IReadOnlyDictionary<Guid, string> RehearsalDatabases)
{
    internal const string ReportFlag = "--page-template-migration-report";
    internal const string RunFlag = "--page-template-migration-run=";
    internal const string RollbackFlag = "--page-template-migration-rollback=";
    internal const string ConfirmFlag = "--confirm-page-template-migration=";
    internal const string ConfirmationValue = "I_HAVE_A_VERIFIED_BACKUP";
    internal const string RehearsalFlag = "--rehearsal-database=";
    internal const string RehearsalSuffix = "_TplRehearsal";

    [GeneratedRegex("^[a-z0-9-]{4,64}$")] private static partial Regex BatchPattern();
    [GeneratedRegex("^[A-Za-z0-9_]{1,128}$")] private static partial Regex DatabaseNamePattern();

    internal static bool IsRequested(string[] args) =>
        args.Any(x => x == ReportFlag || x.StartsWith(RunFlag, StringComparison.Ordinal) || x.StartsWith(RollbackFlag, StringComparison.Ordinal));

    /// <summary>Parses the arguments; throws <see cref="ArgumentException"/> on any malformed or missing value.</summary>
    internal static PageTemplateMigrationOptions Parse(string[] args)
    {
        var commands = new List<(PageTemplateMigrationCommand Command, string? Batch)>();
        if (args.Contains(ReportFlag, StringComparer.Ordinal)) commands.Add((PageTemplateMigrationCommand.Report, null));
        foreach (var arg in args.Where(x => x.StartsWith(RunFlag, StringComparison.Ordinal))) commands.Add((PageTemplateMigrationCommand.Run, arg[RunFlag.Length..]));
        foreach (var arg in args.Where(x => x.StartsWith(RollbackFlag, StringComparison.Ordinal))) commands.Add((PageTemplateMigrationCommand.Rollback, arg[RollbackFlag.Length..]));
        if (commands.Count != 1) throw new ArgumentException("Use exactly one of --page-template-migration-report, --page-template-migration-run=<batch>, --page-template-migration-rollback=<batch>.");

        IReadOnlyList<Guid>? tenants = null;
        if (Single(args, "--tenants=") is { } tenantList)
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
        var (command, batch) = commands[0];
        var options = new PageTemplateMigrationOptions(command, batch, tenants, Single(args, ConfirmFlag), Single(args, "--out="), Single(args, "--page="), rehearsal);
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
    /// <c>--tenants</c> list (no default target) and the backup confirmation; a rehearsal database must end with
    /// <see cref="RehearsalSuffix"/> and belong to a listed tenant.
    /// </summary>
    internal void Validate()
    {
        foreach (var (tenant, name) in RehearsalDatabases)
        {
            if (!DatabaseNamePattern().IsMatch(name) || !name.EndsWith(RehearsalSuffix, StringComparison.Ordinal))
                throw new ArgumentException($"Rehearsal database '{name}' is refused: only names ending with {RehearsalSuffix} (letters, digits, underscore) are allowed.");
            if (TenantIds is not null && !TenantIds.Contains(tenant))
                throw new ArgumentException($"--rehearsal-database names tenant {tenant:D}, which is not in --tenants.");
        }
        if (Command == PageTemplateMigrationCommand.Report)
        {
            if (string.IsNullOrWhiteSpace(OutDir)) throw new ArgumentException("--page-template-migration-report requires --out=<folder>.");
            if (PageCode is not null) throw new ArgumentException("--page is accepted only by --page-template-migration-rollback.");
            return;
        }
        if (Batch is null || !BatchPattern().IsMatch(Batch)) throw new ArgumentException("The batch name must match ^[a-z0-9-]{4,64}$.");
        if (TenantIds is null || TenantIds.Count == 0) throw new ArgumentException("--tenants=<id,…> is required for migration and rollback; there is no default target.");
        if (!string.Equals(Confirmation, ConfirmationValue, StringComparison.Ordinal))
            throw new ArgumentException($"Template migration and rollback require {ConfirmFlag}{ConfirmationValue}.");
        if (PageCode is not null && (Command != PageTemplateMigrationCommand.Rollback || !TenantCustomPageEndpoints.ValidCode(PageCode)))
            throw new ArgumentException("--page=<code> is accepted only by rollback and must be a valid page code.");
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

    private const string OpenDraftReason = "Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    internal static PageTemplateMigrationRunner CreateDefault(IPageTemplateMigrationDatabases databases, TextWriter log) =>
        new(databases, PageTemplateMigration.Classify, BehaviorEquivalence.Check, log);

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
            var rows = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant.TenantId && !x.IsArchived)
                .OrderBy(x => x.Code).ThenByDescending(x => x.IsPublished)
                .Select(x => new { x.Code, x.Name, x.IsPublished, x.DefinitionJson }).ToListAsync(ct);
            var draftCodes = rows.Where(x => !x.IsPublished).Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
            var pages = rows.Select(x =>
            {
                var result = SafeClassify(x.DefinitionJson, x.IsPublished && draftCodes.Contains(x.Code));
                return new MigrationReportPage(x.Code, x.Name, x.IsPublished, result.Target, result.Reasons, EquivalenceText(result), result.LayoutChanges);
            }).ToList();
            tenants.Add(new MigrationReportTenant(tenant.TenantId, tenant.Name, databaseName, pages));
        }
        var standards = SystemPageStandards.All.Values.OrderBy(x => x.ScreenKey, StringComparer.Ordinal).Select(x =>
        {
            var result = SafeClassify(x.DefinitionJson, false);
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

    private MigrationResult SafeClassify(string definitionJson, bool hasOpenDraft)
    {
        try { return classify(definitionJson, hasOpenDraft); }
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

    private static string TargetLabel(string? target) => target switch { "list" => "Liste", "free" => "Serbest", _ => "—" };
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

    /// <summary>Resolves (and prints) every target database before any is opened. Unknown or inactive tenants fail the whole command.</summary>
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
        var targets = selected.Select(t => (t, options.RehearsalDatabases.TryGetValue(t.TenantId, out var rehearsal) ? rehearsal : CanonicalDatabaseName(t.TenantId))).ToList();
        log.WriteLine("Hedef veritabanları:");
        foreach (var (tenant, databaseName) in targets)
            log.WriteLine($"  {databaseName}  ({tenant.Name}, {tenant.TenantId:D}){(options.RehearsalDatabases.ContainsKey(tenant.TenantId) ? "  [PROVA KOPYASI]" : "")}");
        return targets;
    }

}

/// <summary>
/// CLI database source: active tenants from PlatformDB; each ERP database through the routed tenant runtime credential
/// (catalog entry Ready and canonical, Vault ERP credential), exactly as request routing does. A rehearsal override keeps
/// that credential and server and changes only the database name (already validated to end with <c>_TplRehearsal</c>).
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
        var canonical = PageTemplateMigrationRunner.CanonicalDatabaseName(tenantId);
        var entry = await platform.TenantDatabaseCatalog.AsNoTracking().Where(x => x.TenantId == tenantId).SingleOrDefaultAsync(ct);
        if (entry is null || entry.State != TenantDatabaseProvisioningState.Ready || !string.Equals(entry.DatabaseName, canonical, StringComparison.Ordinal))
            throw new InvalidOperationException($"Tenant {tenantId:D} has no Ready canonical ERP database.");
        if (!string.Equals(databaseName, canonical, StringComparison.Ordinal)
            && !databaseName.EndsWith(PageTemplateMigrationOptions.RehearsalSuffix, StringComparison.Ordinal))
            throw new InvalidOperationException($"Database '{databaseName}' is neither the routed database nor a rehearsal copy.");
        var reader = scope.ServiceProvider.GetRequiredService<ITenantSqlCredentialReader>();
        var credential = await reader.ReadAsync(tenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.Erp), ct);
        var connection = new SqlConnectionStringBuilder(TenantDatabaseRouting.BuildTenantConnectionString(tenantConnectionTemplate, tenantId, credential))
        { InitialCatalog = databaseName, ApplicationName = "Nexora.PageTemplateMigration" }.ConnectionString;
        return new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options,
            new AuditExecutionContext(tenantId, null, "page-template-migration"));
    }
}
