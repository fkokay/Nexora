using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>One page of a run, rollback or verify. <see cref="Failed"/>: a write error (run/rollback) or a failed check (verify).</summary>
internal sealed record MigrationPageOutcome(Guid TenantId, string Code, bool Applied, string? Target, IReadOnlyList<string> Reasons, bool Failed = false);
internal sealed record MigrationRunResult(string Command, string Batch, DateTimeOffset StartedAt, IReadOnlyList<string> TargetDatabases, IReadOnlyList<MigrationPageOutcome> Pages);

/// <summary>Template migration run and rollback (Task 4); see the class summary in PageTemplateMigrationRunner.cs.</summary>
internal sealed partial class PageTemplateMigrationRunner
{
    /// <summary>Runs the command and returns the process exit code: 1 when any page failed (write error / failed verification), else 0.</summary>
    internal async Task<int> ExecuteAsync(PageTemplateMigrationOptions options, CancellationToken ct)
    {
        switch (options.Command)
        {
            case PageTemplateMigrationCommand.Report:
                await ReportAsync(options, ct);
                return 0;
            case PageTemplateMigrationCommand.Run:
                return ExitCode(await RunAsync(options, ct));
            case PageTemplateMigrationCommand.Rollback:
                return ExitCode(await RollbackAsync(options, ct));
            case PageTemplateMigrationCommand.Verify:
                var verified = await VerifyAsync(options, ct);
                return verified.Pages.Count == 0 ? 1 : ExitCode(verified);
            default:
                throw new ArgumentException($"Unknown command {options.Command}.");
        }
    }

    private static int ExitCode(MigrationRunResult result) => result.Pages.Any(x => x.Failed) ? 1 : 0;

    // ---------------------------------------------------------------- run

    internal async Task<MigrationRunResult> RunAsync(PageTemplateMigrationOptions options, CancellationToken ct)
    {
        if (options.Command != PageTemplateMigrationCommand.Run) throw new ArgumentException("Run options expected.");
        options.Validate();
        var started = DateTimeOffset.UtcNow;
        var targets = await ResolveTargetsAsync(options, ct);
        var outcomes = new List<MigrationPageOutcome>();
        foreach (var (tenant, databaseName) in targets)
        {
            await using var db = await databases.OpenAsync(tenant.TenantId, databaseName, ct);
            // The tenant's active catalog, read once: dataSource / action queries validate against it (as in the report).
            var catalog = await TenantCatalogStore.ActiveAsync(db, tenant.TenantId, ErpOperationCatalog.TryGet, ct);
            var ids = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant.TenantId && x.IsPublished && !x.IsArchived)
                .OrderBy(x => x.Code).Select(x => x.Id).ToListAsync(ct);
            foreach (var id in ids) outcomes.Add(await MigratePageAsync(db, tenant.TenantId, id, options.Batch!, catalog, ct));
        }
        return await FinishAsync(options, "run", started, targets, outcomes, ct);
    }

    private async Task<MigrationPageOutcome> MigratePageAsync(TenantDbContext db, Guid tenant, Guid id, string batch, CatalogBundle? catalog, CancellationToken ct)
    {
        db.ChangeTracker.Clear();
        string code = "?";
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var page = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (page is null) return Skip(tenant, code, "Sayfa bulunamadı.");
            code = page.Code;
            if (!page.IsPublished || page.IsArchived) return Skip(tenant, code, "Sayfa yayında değil.");
            if (page.ScreenKey is not null) return Skip(tenant, code, SystemPageReason);
            if (await db.TenantCustomPageRevisions.AnyAsync(x => x.TenantId == tenant && x.CustomPageId == id && x.MigrationBatch == batch && x.ChangeKind == MigratedKind, ct))
                return Skip(tenant, code, "Bu toplu geçişte zaten taşındı.");
            if (HasTemplate(page.DefinitionJson)) return Skip(tenant, code, "Sayfa zaten kalıplı.");
            // The open-draft rule is enforced here, inside the page transaction, whatever the classifier answers.
            var hasOpenDraft = await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Code == page.Code && !x.IsPublished && !x.IsArchived, ct);
            if (hasOpenDraft) return Skip(tenant, code, OpenDraftReason);
            var result = SafeClassify(page.DefinitionJson, false, catalog);
            // The classifier's reasons already carry the equivalence text; keep all of them.
            if (result.EquivalenceFailure is { } failure)
                return new MigrationPageOutcome(tenant, code, false, result.Target, result.Reasons.Count > 0 ? result.Reasons : [$"eşdeğerlik denetimi başarısız: {failure}"]);
            if (result.Target is not ("list" or "free") || result.ConvertedJson is null)
                return new MigrationPageOutcome(tenant, code, false, null, result.Reasons.Count > 0 ? result.Reasons : ["Sayfa bir kalıba eşlenemedi."]);
            var converted = result.ConvertedJson;
            // Defence in depth: behaviour, the declared template and the publish-time schema are re-checked before writing.
            if (equivalence(page.DefinitionJson, converted) is { } difference) return Skip(tenant, code, $"eşdeğerlik denetimi başarısız: {difference}", result.Target);
            if (!string.Equals(DeclaredTemplate(converted), result.Target, StringComparison.Ordinal))
                return Skip(tenant, code, "Dönüştürülmüş tanım beklenen kalıbı taşımıyor.", result.Target);
            if (!TenantCustomPageSchema.Validate(converted, out var error, TenantCustomPageQueries.OperationNames(page.DefinitionJson), ErpOperationCatalog.TryGet, catalog))
                return Skip(tenant, code, $"Dönüştürülmüş tanım doğrulanamadı: {error}", result.Target);

            // (1) the pre-migration definition, (3) the migrated published definition, (4) audit — one SaveChanges, one transaction.
            var now = DateTimeOffset.UtcNow;
            page.Revision++;
            var before = TenantCustomPageEndpoints.RevisionOf(page, SystemUserId, BeforeKind);
            before.MigrationBatch = batch;
            db.TenantCustomPageRevisions.Add(before);
            page.DefinitionJson = converted; page.Revision++; page.UpdatedByUserId = SystemUserId; page.UpdatedAt = now;
            var migrated = TenantCustomPageEndpoints.RevisionOf(page, SystemUserId, MigratedKind);
            migrated.MigrationBatch = batch;
            db.TenantCustomPageRevisions.Add(migrated);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = null, Action = MigratedAudit, Resource = $"custom-page:{page.Code};batch={batch};target={result.Target}" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new MigrationPageOutcome(tenant, code, true, result.Target, []);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            db.ChangeTracker.Clear();
            return WriteFailure(tenant, code, exception);
        }
    }

    // ---------------------------------------------------------------- rollback

    internal async Task<MigrationRunResult> RollbackAsync(PageTemplateMigrationOptions options, CancellationToken ct)
    {
        if (options.Command != PageTemplateMigrationCommand.Rollback) throw new ArgumentException("Rollback options expected.");
        options.Validate();
        var started = DateTimeOffset.UtcNow;
        var targets = await ResolveTargetsAsync(options, ct);
        var outcomes = new List<MigrationPageOutcome>();
        foreach (var (tenant, databaseName) in targets)
        {
            await using var db = await databases.OpenAsync(tenant.TenantId, databaseName, ct);
            var query = db.TenantCustomPageRevisions.AsNoTracking()
                .Where(x => x.TenantId == tenant.TenantId && x.MigrationBatch == options.Batch && x.ChangeKind == BeforeKind);
            if (options.PageCode is not null) query = query.Where(x => x.Code == options.PageCode);
            var pageIds = (await query.Select(x => new { x.CustomPageId, x.Code }).ToListAsync(ct))
                .DistinctBy(x => x.CustomPageId).OrderBy(x => x.Code, StringComparer.Ordinal).Select(x => x.CustomPageId).ToList();
            if (pageIds.Count == 0 && options.PageCode is not null)
                outcomes.Add(Skip(tenant.TenantId, options.PageCode, "Bu toplu geçişte bu sayfa bulunamadı."));
            foreach (var id in pageIds) outcomes.Add(await RollbackPageAsync(db, tenant.TenantId, id, options.Batch!, ct));
        }
        return await FinishAsync(options, "rollback", started, targets, outcomes, ct);
    }

    private static async Task<MigrationPageOutcome> RollbackPageAsync(TenantDbContext db, Guid tenant, Guid id, string batch, CancellationToken ct)
    {
        db.ChangeTracker.Clear();
        string code = "?";
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var page = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (page is null) return Skip(tenant, code, "Sayfa bulunamadı.");
            code = page.Code;
            var latest = await db.TenantCustomPageRevisions.Where(x => x.TenantId == tenant && x.CustomPageId == id)
                .OrderByDescending(x => x.Revision).FirstAsync(ct);
            if (latest.ChangeKind == RolledBackKind && latest.MigrationBatch == batch) return Skip(tenant, code, "Bu toplu geçiş bu sayfada zaten geri alındı.");
            // No --force: any later change (new publish → Superseded, edit, delete, another batch) keeps the page as it is.
            if (latest.ChangeKind != MigratedKind || latest.MigrationBatch != batch || latest.Revision != page.Revision || !page.IsPublished || page.IsArchived)
                return Skip(tenant, code, "Sayfa geçişten sonra değişti; geri alınmadı.");
            // Run never migrates a page with an open draft, so a draft here was opened after the migration: leave both as they are.
            if (await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Code == page.Code && !x.IsPublished && !x.IsArchived, ct))
                return Skip(tenant, code, OpenDraftReason);
            var before = await db.TenantCustomPageRevisions.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.CustomPageId == id && x.MigrationBatch == batch && x.ChangeKind == BeforeKind)
                .OrderByDescending(x => x.Revision).FirstAsync(ct);
            page.DefinitionJson = before.DefinitionJson; page.Revision++; page.UpdatedByUserId = SystemUserId; page.UpdatedAt = DateTimeOffset.UtcNow;
            var revision = TenantCustomPageEndpoints.RevisionOf(page, SystemUserId, RolledBackKind);
            revision.MigrationBatch = batch;
            db.TenantCustomPageRevisions.Add(revision);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = null, Action = RolledBackAudit, Resource = $"custom-page:{page.Code};batch={batch}" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new MigrationPageOutcome(tenant, code, true, null, []);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            db.ChangeTracker.Clear();
            return WriteFailure(tenant, code, exception);
        }
    }

    // ---------------------------------------------------------------- verify

    /// <summary>
    /// Read-only check of a batch over the stored pairs: every <c>TemplateMigrated</c> revision must follow its
    /// <c>BeforeTemplateMigration</c> revision (revision − 1), declare the list or free template and pass the behaviour
    /// equivalence check against it. Writes nothing; a failed pair sets <see cref="MigrationPageOutcome.Failed"/>.
    /// </summary>
    internal async Task<MigrationRunResult> VerifyAsync(PageTemplateMigrationOptions options, CancellationToken ct)
    {
        if (options.Command != PageTemplateMigrationCommand.Verify) throw new ArgumentException("Verify options expected.");
        options.Validate();
        var started = DateTimeOffset.UtcNow;
        var targets = await ResolveTargetsAsync(options, ct);
        var outcomes = new List<MigrationPageOutcome>();
        foreach (var (tenant, databaseName) in targets)
        {
            await using var db = await databases.OpenAsync(tenant.TenantId, databaseName, ct);
            var revisions = await db.TenantCustomPageRevisions.AsNoTracking()
                .Where(x => x.TenantId == tenant.TenantId && x.MigrationBatch == options.Batch && (x.ChangeKind == BeforeKind || x.ChangeKind == MigratedKind))
                .Select(x => new { x.CustomPageId, x.Code, x.Revision, x.ChangeKind, x.DefinitionJson }).ToListAsync(ct);
            foreach (var page in revisions.GroupBy(x => x.CustomPageId).OrderBy(x => x.First().Code, StringComparer.Ordinal))
            {
                var code = page.First().Code;
                var migrated = page.Where(x => x.ChangeKind == MigratedKind).OrderByDescending(x => x.Revision).FirstOrDefault();
                var before = migrated is null ? null : page.FirstOrDefault(x => x.ChangeKind == BeforeKind && x.Revision == migrated.Revision - 1);
                var reasons = new List<string>();
                string? target = null;
                if (migrated is null) reasons.Add("TemplateMigrated sürümü bulunamadı.");
                else if (before is null) reasons.Add("Eşleşen BeforeTemplateMigration sürümü bulunamadı.");
                else
                {
                    target = DeclaredTemplate(migrated.DefinitionJson);
                    if (target is not ("list" or "free")) reasons.Add("Taşınmış tanım Liste ya da Serbest kalıbını taşımıyor.");
                    if (equivalence(before.DefinitionJson, migrated.DefinitionJson) is { } difference) reasons.Add($"eşdeğerlik denetimi başarısız: {difference}");
                }
                outcomes.Add(new MigrationPageOutcome(tenant.TenantId, code, reasons.Count == 0, target, reasons, Failed: reasons.Count > 0));
            }
        }
        if (outcomes.Count == 0) await log.WriteLineAsync($"Bu toplu geçişte ({options.Batch}) hedeflerde kayıt bulunamadı; batch adını denetleyin.");
        return await FinishAsync(options, "verify", started, targets, outcomes, ct);
    }

    // ---------------------------------------------------------------- helpers

    private static MigrationPageOutcome Skip(Guid tenant, string code, string reason, string? target = null) => new(tenant, code, false, target, [reason]);

    // Only the exception type is reported; its message could quote definition content.
    private static MigrationPageOutcome WriteFailure(Guid tenant, string code, Exception exception) =>
        new(tenant, code, false, null, [$"Yazma hatası: {exception.GetType().Name}."], Failed: true);

    private static string? DeclaredTemplate(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return PageTemplateRules.DeclaredName(document.RootElement);
        }
        catch (JsonException) { return null; }
    }

    private static bool HasTemplate(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty("template", out _);
        }
        catch (JsonException) { return false; }
    }

    private async Task<MigrationRunResult> FinishAsync(PageTemplateMigrationOptions options, string command, DateTimeOffset started,
        IReadOnlyList<(PageTemplateMigrationTenant Tenant, string DatabaseName)> targets, List<MigrationPageOutcome> outcomes, CancellationToken ct)
    {
        var result = new MigrationRunResult(command, options.Batch!, started, targets.Select(x => x.DatabaseName).ToList(), outcomes);
        var verb = command switch { "run" => "taşındı", "rollback" => "geri alındı", _ => "doğrulandı" };
        await log.WriteLineAsync($"Kalıp geçişi {command} ({options.Batch}): {outcomes.Count(x => x.Applied)} sayfa {verb}, {outcomes.Count(x => !x.Applied && !x.Failed)} sayfa atlandı, {outcomes.Count(x => x.Failed)} sayfada hata.");
        foreach (var outcome in outcomes)
            await log.WriteLineAsync($"  {outcome.TenantId.ToString("N")[..8]} {outcome.Code}: {(outcome.Applied ? verb + (outcome.Target is null ? "" : $" ({TargetLabel(outcome.Target)})") : (outcome.Failed ? "HATA — " : "atlandı — ") + string.Join(" ", outcome.Reasons))}");
        if (!string.IsNullOrWhiteSpace(options.OutDir))
        {
            Directory.CreateDirectory(options.OutDir);
            var file = Path.Combine(options.OutDir, $"{command switch { "run" => "tasima", "rollback" => "geri-donus", _ => "dogrulama" }}-{options.Batch}.json");
            await File.WriteAllTextAsync(file, JsonSerializer.Serialize(result, JsonOptions), ct);
            await log.WriteLineAsync($"Sonuç yazıldı: {file}");
        }
        return result;
    }
}
