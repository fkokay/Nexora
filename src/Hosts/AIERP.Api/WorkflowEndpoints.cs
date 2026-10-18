using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class WorkflowEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapWorkflowEndpoints(this WebApplication app)
    {
        var workflows = app.MapGroup("/api/workflows").WithTags("Tenant Workflows").RequireAuthorization();

        workflows.MapGet("/definitions", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out _, out var role)) return Results.Forbid();
            var query = db.TenantWorkflowDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && (x.Status == "Published" || x.Status == "Draft"));
            if (role != "TenantAdmin") query = query.Where(x => x.Status == "Published");
            var definitions = await query.OrderBy(x => x.Code).ThenByDescending(x => x.Version).Take(200).ToListAsync(ct);
            return Results.Ok(definitions.Select(ToDefinitionView));
        });

        workflows.MapPost("/definitions", async (WorkflowDefinitionWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!ValidateDefinition(request.Code, request.Name, request.Description, request.Steps, out var steps, out var errors))
                return Results.ValidationProblem(errors!);
            var code = request.Code!.Trim();
            if (await db.TenantWorkflowDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu iş akışı kodu tenant içinde zaten kullanılıyor." });
            var now = DateTimeOffset.UtcNow;
            var definition = new TenantWorkflowDefinition
            {
                TenantId = tenantId, Code = code, Name = request.Name!.Trim(), Description = CleanDescription(request.Description),
                Version = 1, Status = "Draft", StepsJson = JsonSerializer.Serialize(steps, JsonOptions),
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantWorkflowDefinitions.Add(definition);
            Audit(db, tenantId, userId, "workflow.created", $"{code}@1");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/workflows/definitions/{definition.Id}", ToDefinitionView(definition));
        });

        workflows.MapPut("/definitions/{id:guid}", async (Guid id, WorkflowDefinitionWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var definition = await db.TenantWorkflowDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (definition is null) return Results.NotFound();
            if (definition.Status != "Draft") return Results.Conflict(new { error = "Yalnızca taslak iş akışı düzenlenebilir." });
            if (!ValidateDefinition(definition.Code, request.Name, request.Description, request.Steps, out var steps, out var errors))
                return Results.ValidationProblem(errors!);
            definition.Name = request.Name!.Trim(); definition.Description = CleanDescription(request.Description);
            definition.StepsJson = JsonSerializer.Serialize(steps, JsonOptions); definition.Version++;
            definition.UpdatedByUserId = userId; definition.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "workflow.updated", $"{definition.Code}@{definition.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDefinitionView(definition));
        });

        workflows.MapPost("/definitions/{id:guid}/publish", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var definition = await db.TenantWorkflowDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (definition is null) return Results.NotFound();
            if (definition.Status != "Draft") return Results.Conflict(new { error = "Yalnızca taslak iş akışı yayımlanabilir." });
            var steps = ReadSteps(definition.StepsJson);
            if (!TenantWorkflowSchema.Validate(steps).IsValid) return Results.Conflict(new { error = "İş akışı adımları geçerli değil." });
            var prior = await db.TenantWorkflowDefinitions.Where(x => x.TenantId == tenantId && x.Code == definition.Code && x.Status == "Published").ToListAsync(ct);
            foreach (var old in prior) { old.Status = "Archived"; old.UpdatedByUserId = userId; old.UpdatedAt = DateTimeOffset.UtcNow; }
            await db.SaveChangesAsync(ct);
            definition.Status = "Published"; definition.UpdatedByUserId = userId; definition.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "workflow.published", $"{definition.Code}@{definition.Version}");
            try { await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return Results.Conflict(new { error = "Bu kod için yayımlanmış başka bir sürüm var. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToDefinitionView(definition));
        });

        workflows.MapPost("/definitions/{id:guid}/draft", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!AdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var source = await db.TenantWorkflowDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.Status == "Published", ct);
            if (source is null) return Results.NotFound();
            var next = (await db.TenantWorkflowDefinitions.Where(x => x.TenantId == tenantId && x.Code == source.Code).Select(x => (int?)x.Version).MaxAsync(ct) ?? source.Version) + 1;
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantWorkflowDefinition
            {
                TenantId = tenantId, Code = source.Code, Name = source.Name, Description = source.Description,
                Version = next, Status = "Draft", StepsJson = source.StepsJson,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantWorkflowDefinitions.Add(draft);
            Audit(db, tenantId, userId, "workflow.draft-created", $"{draft.Code}@{draft.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/workflows/definitions/{draft.Id}", ToDefinitionView(draft));
        });

        workflows.MapGet("/instances", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            var query = db.TenantWorkflowInstances.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (role != "TenantAdmin") query = query.Where(x => x.StartedByUserId == userId || x.Status == "Pending");
            var instances = await query.OrderByDescending(x => x.StartedAt).Take(300).ToListAsync(ct);
            var pendingForRole = role == "TenantAdmin" ? instances.Where(x => x.Status == "Pending") :
                instances.Where(x => x.Status == "Pending" && CurrentStep(x).ApproverRole == role);
            var visible = role == "TenantAdmin" ? instances : instances.Where(x => x.StartedByUserId == userId || pendingForRole.Contains(x));
            var ids = visible.Select(x => x.Id).ToArray();
            var actions = await db.TenantWorkflowActions.AsNoTracking().Where(x => x.TenantId == tenantId && ids.Contains(x.InstanceId))
                .OrderBy(x => x.CreatedAt).ToListAsync(ct);
            var grouped = actions.GroupBy(x => x.InstanceId).ToDictionary(x => x.Key, x => x.ToArray());
            return Results.Ok(visible.Select(x => ToInstanceView(x, grouped.GetValueOrDefault(x.Id) ?? [])));
        });

        workflows.MapPost("/definitions/{id:guid}/instances", async (Guid id, WorkflowStartRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out _)) return Results.Forbid();
            var definition = await db.TenantWorkflowDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.Status == "Published", ct);
            if (definition is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.SubjectType) || request.SubjectType.Trim().Length > 80
                || string.IsNullOrWhiteSpace(request.SubjectTitle) || request.SubjectTitle.Trim().Length > 160)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["subject"] = ["Kayıt türü 1–80, başlık 1–160 karakter olmalıdır."] });
            var context = request.Context ?? new Dictionary<string, string?>();
            if (context.Count > 100 || context.Any(x => x.Key.Length is 0 or > 80 || x.Value?.Length > 2000)
                || JsonSerializer.SerializeToUtf8Bytes(context, JsonOptions).Length > 32 * 1024)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["context"] = ["İş akışı verisi en fazla 100 alan ve 32 KiB olabilir."] });
            var steps = TenantWorkflowSchema.Validate(ReadSteps(definition.StepsJson));
            if (!steps.IsValid) return Results.Conflict(new { error = "Yayımlanan iş akışı şeması geçersiz." });
            var instance = new TenantWorkflowInstance
            {
                TenantId = tenantId, DefinitionId = definition.Id, DefinitionCode = definition.Code, DefinitionName = definition.Name,
                DefinitionVersion = definition.Version, StepsJsonSnapshot = JsonSerializer.Serialize(steps.Steps, JsonOptions),
                SubjectType = request.SubjectType.Trim(), SubjectTitle = request.SubjectTitle.Trim(), SubjectId = request.SubjectId,
                ContextJson = JsonSerializer.Serialize(context, JsonOptions), StartedByUserId = userId
            };
            db.TenantWorkflowInstances.Add(instance);
            Audit(db, tenantId, userId, "workflow.started", $"{definition.Code}:{instance.Id}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/workflows/instances/{instance.Id}", ToInstanceView(instance, []));
        });

        workflows.MapPost("/instances/{id:guid}/decision", async (Guid id, WorkflowDecisionRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            if (request.Decision is not ("Approved" or "Rejected") || request.Comment?.Trim().Length > 500
                || request.Decision == "Rejected" && string.IsNullOrWhiteSpace(request.Comment))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["decision"] = ["Onay veya red seçin; red kararı için en fazla 500 karakterlik açıklama zorunludur."] });
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var instance = await db.TenantWorkflowInstances.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (instance is null) return Results.NotFound();
            var transition = TenantWorkflowSchema.Decide(instance.Status, ReadSteps(instance.StepsJsonSnapshot), instance.CurrentStepIndex,
                userId, instance.StartedByUserId, role, request.Decision!);
            if (!transition.IsAllowed) return transition.Error switch
            {
                "The requester cannot decide their own workflow." or "The user is not assigned to the current workflow step." => Results.Forbid(),
                _ => Results.Conflict(new { error = transition.Error })
            };
            var current = CurrentStep(instance);
            PurchaseRequest? purchaseRequest = null;
            SalesQuote? salesQuote = null;
            PurchaseOrder? purchaseOrder = null;
            if (transition.IsComplete && instance.SubjectType == "PurchaseRequest" && instance.SubjectId is not null)
            {
                purchaseRequest = db.Database.IsSqlServer()
                    ? await db.PurchaseRequests.FromSqlInterpolated(
                        $"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {instance.SubjectId.Value}")
                        .SingleOrDefaultAsync(ct)
                    : await db.PurchaseRequests.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == instance.SubjectId.Value, ct);
                if (purchaseRequest is null || purchaseRequest.Status != PurchaseRequestStatus.Submitted)
                    return Results.Conflict(new { error = "Bağlı satın alma talebi artık inceleme beklemiyor." });
            }
            if (transition.IsComplete && instance.SubjectType == "SalesQuote" && instance.SubjectId is not null)
            {
                salesQuote = db.Database.IsRelational()
                    ? await db.SalesQuotes.FromSqlInterpolated(
                        $"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {instance.SubjectId.Value}").SingleOrDefaultAsync(ct)
                    : await db.SalesQuotes.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == instance.SubjectId.Value, ct);
                if (salesQuote is null || salesQuote.Status != SalesQuoteStatus.Accepted)
                    return Results.Conflict(new { error = "Bağlı satış teklifi artık onay beklemiyor." });
            }
            if (transition.IsComplete && instance.SubjectType == "PurchaseOrder" && instance.SubjectId is not null)
            {
                purchaseOrder = db.Database.IsRelational()
                    ? await db.PurchaseOrders.FromSqlInterpolated(
                        $"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {instance.SubjectId.Value}").SingleOrDefaultAsync(ct)
                    : await db.PurchaseOrders.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == instance.SubjectId.Value, ct);
                if (purchaseOrder is null || purchaseOrder.Status != PurchaseOrderStatus.PendingApproval)
                    return Results.Conflict(new { error = "Bağlı satın alma siparişi artık inceleme beklemiyor." });
            }
            var action = new TenantWorkflowAction
            {
                TenantId = tenantId, InstanceId = instance.Id, StepIndex = instance.CurrentStepIndex, StepName = current.Name,
                Decision = request.Decision!, Comment = CleanDescription(request.Comment), ActorUserId = userId, ActorRole = role
            };
            db.TenantWorkflowActions.Add(action);
            instance.Status = transition.Status; instance.CurrentStepIndex = transition.CurrentStepIndex;
            if (transition.IsComplete) instance.CompletedAt = DateTimeOffset.UtcNow;
            if (purchaseRequest is not null)
            {
                purchaseRequest.Status = transition.Status == "Approved" ? PurchaseRequestStatus.Approved : PurchaseRequestStatus.Rejected;
                purchaseRequest.ReviewedByUserId = userId; purchaseRequest.ReviewedAt = DateTimeOffset.UtcNow;
                purchaseRequest.ReviewNote = CleanDescription(request.Comment);
                Audit(db, tenantId, userId, transition.Status == "Approved" ? "purchase-request.approved-by-workflow" : "purchase-request.rejected-by-workflow", purchaseRequest.Code);
            }
            if (salesQuote is not null)
            {
                if (transition.Status == "Rejected") salesQuote.Status = SalesQuoteStatus.Rejected;
                Audit(db, tenantId, userId, transition.Status == "Approved" ? "sales-quote.approved-by-workflow" : "sales-quote.rejected-by-workflow", salesQuote.Code);
            }
            if (purchaseOrder is not null)
            {
                purchaseOrder.Status = transition.Status == "Approved" ? PurchaseOrderStatus.Open : PurchaseOrderStatus.Rejected;
                Audit(db, tenantId, userId, transition.Status == "Approved" ? "purchase-order.approved-by-workflow" : "purchase-order.rejected-by-workflow", purchaseOrder.Code);
            }
            Audit(db, tenantId, userId, "workflow.decision", $"{instance.Id}:{request.Decision}:{instance.CurrentStepIndex}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Bu adım başka bir kullanıcı tarafından zaten işlendi. Listeyi yenileyin." }); }
            await transaction.CommitAsync(ct);
            var history = await db.TenantWorkflowActions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InstanceId == instance.Id)
                .OrderBy(x => x.CreatedAt).ToArrayAsync(ct);
            return Results.Ok(ToInstanceView(instance, history));
        });
    }

    private static bool ValidateDefinition(string? code, string? name, string? description, IReadOnlyList<TenantWorkflowStep>? requested,
        out IReadOnlyList<TenantWorkflowStep> steps, out Dictionary<string, string[]>? errors)
    {
        var issues = new Dictionary<string, string[]>();
        if (!TenantWorkflowSchema.IsValidCode(code)) issues["code"] = ["Kod küçük harfle başlamalı ve en fazla 40 küçük harf, rakam, tire veya alt çizgi içermelidir."];
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120) issues["name"] = ["Ad 1 ile 120 karakter arasında olmalıdır."];
        if (description?.Trim().Length > 500) issues["description"] = ["Açıklama en fazla 500 karakter olabilir."];
        var result = TenantWorkflowSchema.Validate(requested);
        if (result.Errors.Count > 0) issues["steps"] = result.Errors.ToArray();
        steps = result.Steps; errors = issues.Count == 0 ? null : issues;
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

    private static IReadOnlyList<TenantWorkflowStep> ReadSteps(string json) => JsonSerializer.Deserialize<List<TenantWorkflowStep>>(json, JsonOptions) ?? [];
    private static TenantWorkflowStep CurrentStep(TenantWorkflowInstance instance)
    {
        var steps = ReadSteps(instance.StepsJsonSnapshot);
        return steps.Count == 0 ? new("Unknown", "TenantAdmin") : steps[Math.Clamp(instance.CurrentStepIndex, 0, steps.Count - 1)];
    }
    private static WorkflowDefinitionView ToDefinitionView(TenantWorkflowDefinition item) => new(item.Id, item.Code, item.Name, item.Description,
        item.Version, item.Status, ReadSteps(item.StepsJson), item.CreatedAt, item.UpdatedAt);
    private static WorkflowInstanceView ToInstanceView(TenantWorkflowInstance item, IReadOnlyList<TenantWorkflowAction> actions) => new(
        item.Id, item.DefinitionId, item.DefinitionCode, item.DefinitionName, item.DefinitionVersion, ReadSteps(item.StepsJsonSnapshot),
        item.SubjectType, item.SubjectTitle, item.SubjectId, JsonSerializer.Deserialize<Dictionary<string, string?>>(item.ContextJson, JsonOptions) ?? [],
        item.Status, item.CurrentStepIndex, CurrentStep(item), item.StartedByUserId, item.StartedAt, item.CompletedAt,
        actions.Select(x => new WorkflowActionView(x.Id, x.StepIndex, x.StepName, x.Decision, x.Comment, x.ActorUserId, x.ActorRole, x.CreatedAt)).ToArray());
    private static string? CleanDescription(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static void Audit(TenantDbContext db, Guid tenantId, Guid userId, string action, string resource) =>
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = action, Resource = resource });
    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
}

public sealed record WorkflowDefinitionWriteRequest(string? Code, string? Name, string? Description, IReadOnlyList<TenantWorkflowStep>? Steps);
public sealed record WorkflowStartRequest(string? SubjectType, string? SubjectTitle, Guid? SubjectId, IReadOnlyDictionary<string, string?>? Context);
public sealed record WorkflowDecisionRequest(string? Decision, string? Comment);
public sealed record WorkflowDefinitionView(Guid Id, string Code, string Name, string? Description, int Version, string Status,
    IReadOnlyList<TenantWorkflowStep> Steps, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record WorkflowActionView(Guid Id, int StepIndex, string StepName, string Decision, string? Comment, Guid ActorUserId,
    string ActorRole, DateTimeOffset CreatedAt);
public sealed record WorkflowInstanceView(Guid Id, Guid DefinitionId, string DefinitionCode, string DefinitionName, int DefinitionVersion,
    IReadOnlyList<TenantWorkflowStep> Steps, string SubjectType, string SubjectTitle, Guid? SubjectId, IReadOnlyDictionary<string, string?> Context,
    string Status, int CurrentStepIndex, TenantWorkflowStep CurrentStep, Guid StartedByUserId, DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt, IReadOnlyList<WorkflowActionView> Actions);
