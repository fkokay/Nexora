using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class BusinessRuleEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapBusinessRuleEndpoints(this WebApplication app)
    {
        var rules = app.MapGroup("/api/business-rules").WithTags("Tenant Business Rules").RequireAuthorization();

        rules.MapGet("/catalog", () => Results.Ok(TenantBusinessRuleEngine.SupportedTriggers));

        rules.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out _, out var role)) return Results.Forbid();
            var query = db.TenantBusinessRuleDefinitions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && (x.Status == "Draft" || x.Status == "Published" || x.Status == "Archived"));
            if (role != "TenantAdmin") query = query.Where(x => x.Status == "Published");
            var definitions = await query.OrderBy(x => x.Code).ThenByDescending(x => x.Version).Take(200).ToListAsync(ct);
            return Results.Ok(definitions.Select(ToView));
        });

        rules.MapPost("/", async (BusinessRuleWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var trigger = string.IsNullOrWhiteSpace(request.Trigger) ? TenantBusinessRuleEngine.PurchaseRequestSubmitted : request.Trigger.Trim();
            if (!Validate(request.Code, request.Name, request.Description, request.WorkflowCode, trigger, request.Conditions, out var conditions, out var errors))
                return Results.ValidationProblem(errors!);
            var code = request.Code!.Trim();
            if (await db.TenantBusinessRuleDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant içinde iş kuralı kodu zaten kullanılıyor." });
            var now = DateTimeOffset.UtcNow;
            var rule = new TenantBusinessRuleDefinition
            {
                TenantId = tenantId, Code = code, Name = request.Name!.Trim(), Description = Clean(request.Description),
                Trigger = trigger, Version = 1, Status = "Draft",
                ConditionsJson = JsonSerializer.Serialize(conditions, JsonOptions), WorkflowCode = request.WorkflowCode!.Trim(),
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantBusinessRuleDefinitions.Add(rule);
            Audit(db, tenantId, userId, "business-rule.created", $"{code}@1");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/business-rules/{rule.Id}", ToView(rule));
        });

        rules.MapPut("/{id:guid}", async (Guid id, BusinessRuleWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var rule = await db.TenantBusinessRuleDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (rule is null) return Results.NotFound();
            if (rule.Status != "Draft") return Results.Conflict(new { error = "Yalnızca taslak iş kuralı düzenlenebilir." });
            var trigger = string.IsNullOrWhiteSpace(request.Trigger) ? rule.Trigger : request.Trigger.Trim();
            if (!Validate(rule.Code, request.Name, request.Description, request.WorkflowCode, trigger, request.Conditions, out var conditions, out var errors))
                return Results.ValidationProblem(errors!);
            rule.Name = request.Name!.Trim(); rule.Description = Clean(request.Description); rule.Trigger = trigger;
            rule.WorkflowCode = request.WorkflowCode!.Trim(); rule.ConditionsJson = JsonSerializer.Serialize(conditions, JsonOptions);
            rule.Version++; rule.UpdatedByUserId = userId; rule.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "business-rule.updated", $"{rule.Code}@{rule.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(rule));
        });

        rules.MapPost("/{id:guid}/publish", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var rule = await db.TenantBusinessRuleDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (rule is null) return Results.NotFound();
            if (rule.Status != "Draft") return Results.Conflict(new { error = "Yalnızca taslak iş kuralı yayımlanabilir." });
            var validation = TenantBusinessRuleEngine.Validate(ReadConditions(rule.ConditionsJson), rule.Trigger);
            if (!validation.IsValid) return Results.Conflict(new { error = "Kural koşulları geçersiz.", details = validation.Errors });
            var workflowExists = await db.TenantWorkflowDefinitions.AnyAsync(x => x.TenantId == tenantId
                && x.Code == rule.WorkflowCode && x.Status == "Published", ct);
            if (!workflowExists) return Results.Conflict(new { error = "İş kuralı yayımlanırken seçilen yayımlanmış iş akışı bulunamadı." });
            var existing = await db.TenantBusinessRuleDefinitions.Where(x => x.TenantId == tenantId
                && x.Trigger == rule.Trigger && x.Status == "Published").ToListAsync(ct);
            foreach (var previous in existing)
            { previous.Status = "Archived"; previous.UpdatedByUserId = userId; previous.UpdatedAt = DateTimeOffset.UtcNow; }
            await db.SaveChangesAsync(ct);
            rule.Status = "Published"; rule.UpdatedByUserId = userId; rule.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "business-rule.published", $"{rule.Code}@{rule.Version}:{rule.Trigger}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return Results.Conflict(new { error = "Bu tetikleyici için yayımlanmış başka bir iş kuralı var. Sayfayı yenileyip tekrar deneyin." }); }
            await transaction.CommitAsync(ct);
            return Results.Ok(ToView(rule));
        });

        rules.MapPost("/{id:guid}/draft", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var source = await db.TenantBusinessRuleDefinitions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && (x.Status == "Published" || x.Status == "Archived"), ct);
            if (source is null) return Results.NotFound();
            var version = (await db.TenantBusinessRuleDefinitions.Where(x => x.TenantId == tenantId && x.Code == source.Code)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? source.Version) + 1;
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantBusinessRuleDefinition
            {
                TenantId = tenantId, Code = source.Code, Name = source.Name, Description = source.Description, Trigger = source.Trigger,
                Version = version, Status = "Draft", ConditionsJson = source.ConditionsJson, WorkflowCode = source.WorkflowCode,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantBusinessRuleDefinitions.Add(draft);
            Audit(db, tenantId, userId, "business-rule.draft-created", $"{draft.Code}@{version}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/business-rules/{draft.Id}", ToView(draft));
        });

        rules.MapGet("/evaluations", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out _)) return Results.Forbid();
            var evaluations = await db.TenantBusinessRuleEvaluations.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.CreatedAt).Take(200).ToListAsync(ct);
            return Results.Ok(evaluations.Select(x => new BusinessRuleEvaluationView(x.Id, x.RuleId, x.EventId,
                x.Matched, x.WorkflowInstanceId, x.Details, x.CreatedAt)));
        });
    }

    internal static async Task ApplyPurchaseRequestRulesAsync(TenantDbContext db, PurchaseRequest request, CancellationToken ct)
    {
        var facts = new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["code"] = request.Code,
            ["description"] = request.Description,
            ["requesterUserId"] = request.RequestedByUserId.ToString("D"),
            ["lineCount"] = request.Lines.Count.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["requestDate"] = request.RequestDate.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            ["neededByDate"] = request.NeededByDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) ?? ""
        };
        await EvaluateAndRouteAsync(db, request.TenantId, request.Id, TenantBusinessRuleEngine.PurchaseRequestSubmitted,
            "PurchaseRequest", $"{request.Code} · {request.Description}", request.RequestedByUserId, facts, ct);
    }

    internal static async Task ApplySalesQuoteAcceptedRulesAsync(TenantDbContext db, SalesQuote quote, Guid actorUserId, CancellationToken ct)
    {
        if (!await db.TenantBusinessRuleDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == quote.TenantId
                && x.Trigger == TenantBusinessRuleEngine.SalesQuoteAccepted && x.Status == "Published", ct)) return;
        var lineCount = await db.SalesQuoteLines.CountAsync(x => x.TenantId == quote.TenantId && x.QuoteId == quote.Id, ct);
        var facts = new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["code"] = quote.Code,
            ["customerId"] = quote.CustomerId.ToString("D"),
            ["currencyCode"] = quote.CurrencyCode,
            ["lineCount"] = lineCount.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["grandTotal"] = quote.GrandTotal.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["quoteDate"] = quote.QuoteDate.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            ["validUntil"] = quote.ValidUntil.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)
        };
        await EvaluateAndRouteAsync(db, quote.TenantId, quote.Id, TenantBusinessRuleEngine.SalesQuoteAccepted,
            "SalesQuote", quote.Code, actorUserId, facts, ct);
    }

    internal static Task<bool> IsSalesQuoteAwaitingApprovalAsync(TenantDbContext db, Guid tenantId, Guid quoteId, CancellationToken ct) =>
        db.TenantWorkflowInstances.AnyAsync(x => x.TenantId == tenantId && x.SubjectType == "SalesQuote"
            && x.SubjectId == quoteId && x.Status == "Pending", ct);

    private static async Task EvaluateAndRouteAsync(TenantDbContext db, Guid tenantId, Guid eventId, string trigger,
        string subjectType, string subjectTitle, Guid actorUserId, IReadOnlyDictionary<string, string?> facts, CancellationToken ct)
    {
        var rule = await db.TenantBusinessRuleDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId
            && x.Trigger == trigger && x.Status == "Published", ct);
        if (rule is null) return;
        var conditions = ReadConditions(rule.ConditionsJson);
        var matched = TenantBusinessRuleEngine.Matches(conditions, facts);
        TenantWorkflowInstance? instance = null;
        var details = "Conditions did not match.";
        if (matched)
        {
            var workflow = await db.TenantWorkflowDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId
                && x.Code == rule.WorkflowCode && x.Status == "Published", ct);
            if (workflow is null) { matched = false; details = "The referenced workflow is no longer published."; }
            else
            {
                instance = new TenantWorkflowInstance
                {
                    TenantId = tenantId, DefinitionId = workflow.Id, DefinitionCode = workflow.Code,
                    DefinitionName = workflow.Name, DefinitionVersion = workflow.Version, StepsJsonSnapshot = workflow.StepsJson,
                    SubjectType = subjectType, SubjectTitle = subjectTitle, SubjectId = eventId,
                    ContextJson = JsonSerializer.Serialize(facts, JsonOptions), Status = "Pending", CurrentStepIndex = 0,
                    StartedByUserId = actorUserId, StartedAt = DateTimeOffset.UtcNow
                };
                db.TenantWorkflowInstances.Add(instance);
                details = $"Matched; started workflow {workflow.Code}@{workflow.Version}.";
            }
        }
        db.TenantBusinessRuleEvaluations.Add(new TenantBusinessRuleEvaluation
        {
            TenantId = tenantId, RuleId = rule.Id, EventId = eventId, Matched = matched,
            WorkflowInstance = instance, Details = details
        });
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorUserId,
            Action = matched ? "business-rule.matched" : "business-rule.not-matched", Resource = $"{rule.Code}:{subjectTitle}" });
        if (instance is not null)
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorUserId,
                Action = "workflow.started-by-rule", Resource = $"{workflowCode(rule)}:{instance.Id}" });

        static string workflowCode(TenantBusinessRuleDefinition definition) => definition.WorkflowCode;
    }

    private static bool Validate(string? code, string? name, string? description, string? workflowCode, string trigger,
        IReadOnlyList<TenantBusinessRuleCondition>? requested, out IReadOnlyList<TenantBusinessRuleCondition> conditions,
        out Dictionary<string, string[]>? errors)
    {
        var issues = new Dictionary<string, string[]>();
        if (!TenantBusinessRuleEngine.IsValidCode(code)) issues["code"] = ["Kod küçük harfle başlamalı; en fazla 40 küçük harf, rakam, tire veya alt çizgi içermelidir."];
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120) issues["name"] = ["Ad 1 ile 120 karakter arasında olmalıdır."];
        if (description?.Trim().Length > 500) issues["description"] = ["Açıklama en fazla 500 karakter olabilir."];
        if (!TenantWorkflowSchema.IsValidCode(workflowCode)) issues["workflowCode"] = ["Yayımlanmış iş akışı kodu geçersiz."];
        if (!TenantBusinessRuleEngine.IsSupportedTrigger(trigger)) issues["trigger"] = ["Desteklenmeyen iş kuralı olayı."];
        var result = TenantBusinessRuleEngine.Validate(requested, trigger);
        if (result.Errors.Count > 0 && TenantBusinessRuleEngine.IsSupportedTrigger(trigger)) issues["conditions"] = result.Errors.ToArray();
        conditions = result.Conditions; errors = issues.Count == 0 ? null : issues;
        return issues.Count == 0;
    }

    private static bool Context(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = Guid.Empty; userId = Guid.Empty; role = "";
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) || !Guid.TryParse(user.FindFirstValue("sub"), out userId)) return false;
        role = user.FindFirstValue("role") ?? ""; return role is "TenantAdmin" or "TenantDeveloper" or "TenantUser";
    }
    private static bool AdminContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId) =>
        Context(user, out tenantId, out userId, out var role) && role == "TenantAdmin";
    private static IReadOnlyList<TenantBusinessRuleCondition> ReadConditions(string json) =>
        JsonSerializer.Deserialize<List<TenantBusinessRuleCondition>>(json, JsonOptions) ?? [];
    private static BusinessRuleDefinitionView ToView(TenantBusinessRuleDefinition item) => new(item.Id, item.Code, item.Name,
        item.Description, item.Trigger, item.Version, item.Status, ReadConditions(item.ConditionsJson), item.WorkflowCode, item.CreatedAt, item.UpdatedAt);
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static void Audit(TenantDbContext db, Guid tenantId, Guid userId, string action, string resource) =>
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = action, Resource = resource });
    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
}

public sealed record BusinessRuleWriteRequest(string? Code, string? Name, string? Description, string? WorkflowCode,
    IReadOnlyList<TenantBusinessRuleCondition>? Conditions, string? Trigger = null);
public sealed record BusinessRuleDefinitionView(Guid Id, string Code, string Name, string? Description, string Trigger,
    int Version, string Status, IReadOnlyList<TenantBusinessRuleCondition> Conditions, string WorkflowCode,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record BusinessRuleEvaluationView(Guid Id, Guid RuleId, Guid EventId, bool Matched, Guid? WorkflowInstanceId,
    string Details, DateTimeOffset CreatedAt);
