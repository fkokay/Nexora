using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentRules;

public sealed record DocumentRuleSetView(int Version, string Status, JsonElement Rules, DateTimeOffset UpdatedAt, DateTimeOffset? PublishedAt);
public sealed record DocumentRuleHistoryRow(int Version, string Status, int RuleCount, DateTimeOffset CreatedAt, DateTimeOffset? PublishedAt);
public sealed record DocumentRulesView(string Document, string Transition, IReadOnlyList<DocumentRuleField> Fields,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Operators, DocumentRuleSetView? Published, DocumentRuleSetView? Draft,
    IReadOnlyList<DocumentRuleHistoryRow> History);
/// <summary>
/// <c>ExpectDraft</c>: what the writer's view showed — false: no draft (a draft created meanwhile is not overwritten), true: the draft
/// last changed at <c>ExpectedUpdatedAt</c>. Null skips the check (API clients that own the set).
/// </summary>
public sealed record DocumentRuleDraftRequest(JsonElement Rules, DateTimeOffset? ExpectedUpdatedAt = null, bool? ExpectDraft = null);
/// <summary>Publishes only the draft the publisher saw (<c>ExpectedUpdatedAt</c>), when given.</summary>
public sealed record DocumentRulePublishRequest(DateTimeOffset? ExpectedUpdatedAt = null);
/// <summary>A tenant member a rule may name: only the id and the display name (the people list is open to rule readers).</summary>
public sealed record DocumentRulePerson(Guid Id, string DisplayName);
/// <summary>Dene: an existing order, or sample facts (field code → value as text); <c>ActorUserId</c> is who presses Onayla.</summary>
public sealed record DocumentRuleTryRequest(Guid? OrderId = null, Dictionary<string, string?>? Facts = null, Guid? ActorUserId = null);
public sealed record DocumentRuleTryStep(string Step, string Source, string Outcome, string? Message);
public sealed record DocumentRuleTryResult(string Result, IReadOnlyList<DocumentRuleTryStep> Steps, IReadOnlyList<DocumentRulePerson> Approvers,
    bool ActorExcluded, bool UsedDraft);

/// <summary>
/// Consultant rules of satış siparişi Onayla (belge kuralları PR 3): read, write the draft, publish (archives the previous published
/// set), Dene (runs the core checks and the draft rules without writing) and the people a rule may name. Resource erp.document-rules:
/// GET read, PUT update, publish and try execute.
/// </summary>
internal static class DocumentRuleEndpoints
{
    internal const string Document = "satis.siparis";
    internal const string Transition = "onayla";
    private const string Route = "/api/document-rules/" + Document + "/" + Transition;

    internal static void MapDocumentRuleEndpoints(this WebApplication app)
    {
        var rules = app.MapGroup("/api/document-rules").WithTags("Belge kuralları").RequireAuthorization();
        rules.MapGet("/" + Document + "/" + Transition, async (ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(principal, out var tenantId, out _)) return Results.Forbid();
            return Results.Ok(await ViewAsync(db, tenantId, ct));
        });
        rules.MapPut("/" + Document + "/" + Transition + "/draft", async (DocumentRuleDraftRequest request, ClaimsPrincipal principal, TenantDbContext db,
            PlatformDbContext platform, CancellationToken ct) =>
        {
            if (!TryTenant(principal, out var tenantId, out var userId)) return Results.Forbid();
            var json = request.Rules.ValueKind == JsonValueKind.Undefined ? "" : request.Rules.GetRawText();
            if (!DocumentRuleSchema.Validate(DocumentRuleSchema.SalesOrderApprove, json, out var parsed, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rules"] = [error!] });
            var people = parsed.SelectMany(x => x.ApproverUserIds).Distinct().ToArray();
            if (people.Length > 0)
            {
                var members = await platform.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId && people.Contains(x.UserId))
                    .Select(x => x.UserId).Distinct().CountAsync(ct);
                if (members != people.Length)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["rules"] = ["Onaylayacak kişiler bu firmanın kullanıcıları olmalı."] });
            }
            var sets = Sets(db, tenantId);
            var draft = await sets.SingleOrDefaultAsync(x => x.Status == "Draft", ct);
            var now = DateTimeOffset.UtcNow;
            if (request.ExpectDraft is { } expectDraft && expectDraft != (draft is not null))
                return Results.Conflict(new { error = "Kurallar başka biri tarafından değiştirildi ya da yayınlandı. Sayfayı yenileyip yeniden deneyin." });
            if (draft is null)
            {
                var version = (await sets.MaxAsync(x => (int?)x.Version, ct) ?? 0) + 1;
                draft = new TenantDocumentRuleSet { TenantId = tenantId, Document = Document, Transition = Transition, Version = version,
                    Status = "Draft", CreatedByUserId = userId, CreatedAt = now };
                db.TenantDocumentRuleSets.Add(draft);
            }
            else if (request.ExpectedUpdatedAt is { } expected && expected != draft.UpdatedAt)
                return Results.Conflict(new { error = "Kurallar başka biri tarafından değiştirildi. Sayfayı yenileyip yeniden deneyin." });
            draft.RulesJson = json;
            draft.UpdatedByUserId = userId;
            draft.UpdatedAt = now;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "document-rules.draft-saved",
                Resource = AuditResourceSanitizer.Sanitize($"{Document}/{Transition}:v{draft.Version}") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Taslak aynı anda oluşturuldu. Sayfayı yenileyip yeniden deneyin." }); }
            return Results.Ok(await ViewAsync(db, tenantId, ct));
        });
        rules.MapPost("/" + Document + "/" + Transition + "/publish", async (DocumentRulePublishRequest? request, ClaimsPrincipal principal, TenantDbContext db,
            CancellationToken ct) =>
        {
            if (!TryTenant(principal, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct) : null;
            var sets = Sets(db, tenantId);
            var draft = await sets.SingleOrDefaultAsync(x => x.Status == "Draft", ct);
            if (draft is null) return Results.Conflict(new { error = "Yayınlanacak taslak yok." });
            if (request?.ExpectedUpdatedAt is { } seen && seen != draft.UpdatedAt)
                return Results.Conflict(new { error = "Taslak siz baktıktan sonra değişti. Sayfayı yenileyip yeniden yayınlayın." });
            foreach (var published in await sets.Where(x => x.Status == "Published").ToListAsync(ct)) published.Status = "Archived";
            // The archived row must be written before the draft takes the one Published slot of the filtered unique index.
            await db.SaveChangesAsync(ct);
            draft.Status = "Published";
            draft.PublishedAt = DateTimeOffset.UtcNow;
            draft.PublishedByUserId = userId;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "document-rules.published",
                Resource = AuditResourceSanitizer.Sanitize($"{Document}/{Transition}:v{draft.Version}") });
            try
            {
                await db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);
            }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Kurallar aynı anda yayınlandı. Sayfayı yenileyin." }); }
            return Results.Ok(await ViewAsync(db, tenantId, ct));
        });
        rules.MapPost("/" + Document + "/" + Transition + "/try", async (DocumentRuleTryRequest request, ClaimsPrincipal principal, TenantDbContext db,
            PlatformDbContext platform, CancellationToken ct) =>
        {
            if (!TryTenant(principal, out var tenantId, out var userId)) return Results.Forbid();
            var sets = Sets(db, tenantId).AsNoTracking();
            var set = await sets.SingleOrDefaultAsync(x => x.Status == "Draft", ct) ?? await sets.SingleOrDefaultAsync(x => x.Status == "Published", ct);
            IReadOnlyList<DocumentRule> ruleList = [];
            if (set is not null) DocumentRuleSchema.Validate(DocumentRuleSchema.SalesOrderApprove, set.RulesJson, out ruleList, out _);
            var steps = new List<DocumentRuleTryStep>();
            IReadOnlyDictionary<string, object?> facts;
            if (request.OrderId is { } orderId)
            {
                var order = await db.SalesOrders.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == orderId, ct);
                if (order is null) return Results.NotFound();
                var warnings = new List<string>();
                var failed = await SalesOrderTransitionEndpoints.ApproveCheckErrorAsync(db, tenantId, order, warnings, ct);
                if (failed is not null)
                {
                    steps.Add(new("Kontroller", "core", "blocked", failed));
                    return Results.Ok(new DocumentRuleTryResult("blocked", steps, [], false, set?.Status == "Draft"));
                }
                steps.Add(new("Kontroller", "core", "done", "Zorunlu alanlar, satırlar ve cari risk limiti"));
                steps.AddRange(warnings.Select(w => new DocumentRuleTryStep("Stok yeterliliği", "core", "warned", w)));
                facts = await SalesOrderRuleFacts.BuildAsync(db, tenantId, order, ct);
            }
            else
            {
                steps.Add(new("Kontroller", "core", "skipped", "Örnek değerlerde modülün kontrolleri çalışmaz."));
                facts = SampleFacts(request.Facts);
            }
            var outcome = DocumentRuleEvaluator.Evaluate(ruleList, facts);
            var people = await PeopleAsync(platform, tenantId, outcome.Approvals.SelectMany(x => x.ApproverUserIds).Distinct().ToArray(), ct);
            var actor = request.ActorUserId ?? userId;
            string result;
            if (outcome.Blocks.Count > 0)
            {
                steps.AddRange(outcome.Blocks.Select(x => new DocumentRuleTryStep(x.Code, "rule", "blocked", x.Message)));
                result = "blocked";
            }
            else
            {
                steps.AddRange(outcome.Warnings.Select(x => new DocumentRuleTryStep(x.Code, "rule", "warned", x.Message)));
                steps.AddRange(outcome.Approvals.Select(x => new DocumentRuleTryStep(x.Code, "rule", "waiting",
                    string.Join(" veya ", x.ApproverUserIds.Select(id => people.FirstOrDefault(p => p.Id == id)?.DisplayName ?? id.ToString("D"))))));
                result = outcome.Approvals.Count > 0 ? "approval" : "approved";
            }
            var deciders = people.Where(p => p.Id != actor).ToList();
            return Results.Ok(new DocumentRuleTryResult(result, steps, result == "approval" ? deciders : [],
                result == "approval" && people.Any(p => p.Id == actor), set?.Status == "Draft"));
        });
        app.MapGet("/api/document-rules/people", async (ClaimsPrincipal principal, PlatformDbContext platform, CancellationToken ct) =>
        {
            if (!TryTenant(principal, out var tenantId, out _)) return Results.Forbid();
            return Results.Ok(await PeopleAsync(platform, tenantId, null, ct));
        }).WithTags("Belge kuralları").RequireAuthorization();
    }

    private static IQueryable<TenantDocumentRuleSet> Sets(TenantDbContext db, Guid tenantId) =>
        db.TenantDocumentRuleSets.Where(x => x.TenantId == tenantId && x.Document == Document && x.Transition == Transition);

    /// <summary>The published rules of satış siparişi Onayla (none when nothing is published).</summary>
    internal static async Task<IReadOnlyList<DocumentRule>> PublishedRulesAsync(TenantDbContext db, Guid tenantId, CancellationToken ct)
    {
        var json = await Sets(db, tenantId).AsNoTracking().Where(x => x.Status == "Published").Select(x => x.RulesJson).SingleOrDefaultAsync(ct);
        return json is not null && DocumentRuleSchema.Validate(DocumentRuleSchema.SalesOrderApprove, json, out var rules, out _) ? rules : [];
    }

    internal static async Task<IReadOnlyList<DocumentRulePerson>> PeopleAsync(PlatformDbContext platform, Guid tenantId, Guid[]? only, CancellationToken ct)
    {
        var memberships = platform.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId);
        if (only is not null) memberships = memberships.Where(x => only.Contains(x.UserId));
        return await memberships.Join(platform.Users.AsNoTracking(), m => m.UserId, u => u.Id, (m, u) => new { u.Id, u.DisplayName })
            .OrderBy(x => x.DisplayName).Select(x => new DocumentRulePerson(x.Id, x.DisplayName)).ToListAsync(ct);
    }

    private static async Task<DocumentRulesView> ViewAsync(TenantDbContext db, Guid tenantId, CancellationToken ct)
    {
        var all = await Sets(db, tenantId).AsNoTracking().OrderByDescending(x => x.Version).ToListAsync(ct);
        DocumentRuleSetView? View(TenantDocumentRuleSet? set) => set is null ? null
            : new(set.Version, set.Status, JsonDocument.Parse(set.RulesJson).RootElement.Clone(), set.UpdatedAt, set.PublishedAt);
        return new DocumentRulesView(Document, Transition, DocumentRuleSchema.FieldsOf(DocumentRuleSchema.SalesOrderApprove), DocumentRuleSchema.Operators,
            View(all.FirstOrDefault(x => x.Status == "Published")), View(all.FirstOrDefault(x => x.Status == "Draft")),
            all.Select(x => new DocumentRuleHistoryRow(x.Version, x.Status, JsonDocument.Parse(x.RulesJson).RootElement.GetArrayLength(), x.CreatedAt, x.PublishedAt)).ToList());
    }

    /// <summary>Sample facts typed by field kind; unparsable numbers and dates are left out (they then match only IsEmpty).</summary>
    private static IReadOnlyDictionary<string, object?> SampleFacts(Dictionary<string, string?>? raw)
    {
        var facts = new Dictionary<string, object?>();
        foreach (var field in DocumentRuleSchema.FieldsOf(DocumentRuleSchema.SalesOrderApprove))
        {
            var text = raw?.GetValueOrDefault(field.Code)?.Trim();
            if (string.IsNullOrEmpty(text)) continue;
            facts[field.Code] = field.Kind switch
            {
                "number" => decimal.TryParse(text, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : null,
                "date" => DateOnly.TryParse(text, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null,
                _ => text
            };
        }
        return facts;
    }

    private static bool TryTenant(ClaimsPrincipal principal, out Guid tenantId, out Guid? userId)
    {
        userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsed) ? parsed : null;
        return Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
    }
}
