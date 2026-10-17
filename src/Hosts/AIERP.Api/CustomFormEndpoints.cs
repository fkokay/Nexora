using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static partial class CustomFormEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapCustomFormEndpoints(this WebApplication app)
    {
        var forms = app.MapGroup("/api/custom-forms").WithTags("Tenant Custom Forms").RequireAuthorization();

        forms.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out var role)) return Results.Forbid();
            var query = db.TenantCustomFormDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId);
            query = role == "TenantAdmin" ? query.Where(x => x.Status == "Draft" || x.Status == "Published") : query.Where(x => x.Status == "Published");
            var items = await query.OrderBy(x => x.Code).ThenByDescending(x => x.Version).ToListAsync(ct);
            return Results.Ok(items.Select(ToFormView));
        });

        forms.MapGet("/submissions", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            var query = db.TenantCustomFormSubmissions.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (role != "TenantAdmin") query = query.Where(x => x.SubmittedByUserId == userId);
            var submissions = await query.OrderByDescending(x => x.SubmittedAt).Take(200).ToListAsync(ct);
            return Results.Ok(submissions.Select(ToSubmissionView));
        });

        forms.MapPost("/", async (CustomFormCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!ValidMetadata(request.Code, request.Name, request.Description, request.Fields, out var fields, out var error))
                return Results.ValidationProblem(error!);
            var code = request.Code!.Trim();
            if (await db.TenantCustomFormDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant için form kodu zaten kullanılıyor." });
            var now = DateTimeOffset.UtcNow;
            var form = new TenantCustomFormDefinition
            {
                TenantId = tenantId, Code = code, Name = request.Name!.Trim(), Description = NormalizeDescription(request.Description),
                Version = 1, Status = "Draft", FieldsJson = JsonSerializer.Serialize(fields, JsonOptions),
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantCustomFormDefinitions.Add(form);
            db.TenantCustomFormRevisions.Add(ToRevision(form, userId, "Created"));
            AddAudit(db, tenantId, userId, "custom-form.created", $"{form.Code}@{form.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-forms/{form.Id}", ToFormView(form));
        });

        forms.MapPut("/{formId:guid}", async (Guid formId, CustomFormUpdateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var form = await db.TenantCustomFormDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == formId, ct);
            if (form is null) return Results.NotFound();
            if (form.Status != "Draft") return Results.Conflict(new { error = "Yalnız taslak form düzenlenebilir. Yayımlanan sürümden yeni taslak oluşturun." });
            if (!ValidMetadata(form.Code, request.Name, request.Description, request.Fields, out var fields, out var error))
                return Results.ValidationProblem(error!);
            db.TenantCustomFormRevisions.Add(ToRevision(form, userId, "Updated"));
            form.Name = request.Name!.Trim(); form.Description = NormalizeDescription(request.Description);
            form.FieldsJson = JsonSerializer.Serialize(fields, JsonOptions); form.Version++;
            form.UpdatedByUserId = userId; form.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "custom-form.updated", $"{form.Code}@{form.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToFormView(form));
        });

        forms.MapPost("/{formId:guid}/draft", async (Guid formId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var source = await db.TenantCustomFormDefinitions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == formId && x.Status == "Published", ct);
            if (source is null) return Results.NotFound();
            var nextVersion = await db.TenantCustomFormDefinitions.Where(x => x.TenantId == tenantId && x.Code == source.Code)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? source.Version;
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantCustomFormDefinition
            {
                TenantId = tenantId, Code = source.Code, Name = source.Name, Description = source.Description,
                Version = nextVersion + 1, Status = "Draft", FieldsJson = source.FieldsJson,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantCustomFormDefinitions.Add(draft);
            db.TenantCustomFormRevisions.Add(ToRevision(draft, userId, "DraftCreatedFromPublished"));
            AddAudit(db, tenantId, userId, "custom-form.draft-created", $"{draft.Code}@{draft.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-forms/{draft.Id}", ToFormView(draft));
        });

        forms.MapPost("/{formId:guid}/publish", async (Guid formId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var form = await db.TenantCustomFormDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == formId, ct);
            if (form is null) return Results.NotFound();
            if (form.Status != "Draft") return Results.Conflict(new { error = "Yalnız taslak form yayımlanabilir." });
            var fields = ReadFields(form.FieldsJson);
            var validation = DynamicFormSchema.ValidateFields(fields);
            if (!validation.IsValid) return Results.Conflict(new { error = "Form alanları geçersiz.", details = validation.Errors });
            var previous = await db.TenantCustomFormDefinitions.Where(x => x.TenantId == tenantId && x.Code == form.Code && x.Status == "Published").ToListAsync(ct);
            foreach (var prior in previous)
            {
                db.TenantCustomFormRevisions.Add(ToRevision(prior, userId, "Superseded"));
                prior.Status = "Archived"; prior.UpdatedByUserId = userId; prior.UpdatedAt = DateTimeOffset.UtcNow;
            }
            db.TenantCustomFormRevisions.Add(ToRevision(form, userId, "Published"));
            form.Status = "Published"; form.UpdatedByUserId = userId; form.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "custom-form.published", $"{form.Code}@{form.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToFormView(form));
        });

        forms.MapGet("/{formId:guid}/history", async (Guid formId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!await db.TenantCustomFormDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == formId, ct)) return Results.NotFound();
            var revisions = await db.TenantCustomFormRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.FormId == formId)
                .OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct);
            return Results.Ok(revisions.Select(ToRevisionView));
        });

        forms.MapPost("/{formId:guid}/restore", async (Guid formId, CustomFormRestoreRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var form = await db.TenantCustomFormDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == formId, ct);
            if (form is null) return Results.NotFound();
            if (form.Status != "Draft") return Results.Conflict(new { error = "Önce yayımlanan sürümden yeni bir taslak oluşturun." });
            var revision = await db.TenantCustomFormRevisions.AsNoTracking().SingleOrDefaultAsync(
                x => x.TenantId == tenantId && x.FormId == formId && x.Id == request.RevisionId, ct);
            if (revision is null) return Results.NotFound();
            var validation = DynamicFormSchema.ValidateFields(ReadFields(revision.FieldsJson));
            if (!validation.IsValid) return Results.Conflict(new { error = "Geçmiş form şeması artık geçerli değil.", details = validation.Errors });
            db.TenantCustomFormRevisions.Add(ToRevision(form, userId, "Restored"));
            form.Name = revision.Name; form.Description = revision.Description; form.FieldsJson = revision.FieldsJson;
            form.Version++; form.UpdatedByUserId = userId; form.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "custom-form.restored", $"{form.Code}@{form.Version}:revision:{revision.Id}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToFormView(form));
        });

        forms.MapPost("/{formId:guid}/submissions", async (Guid formId, CustomFormSubmitRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
            var form = await db.TenantCustomFormDefinitions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == formId && x.Status == "Published", ct);
            if (form is null) return Results.NotFound();
            var fields = ReadFields(form.FieldsJson);
            var validation = DynamicFormSchema.ValidateValues(fields, request.Values);
            if (validation.Values is null) return Results.ValidationProblem(validation.Errors
                .Select((message, index) => new KeyValuePair<string, string[]>($"field{index}", [message]))
                .ToDictionary(x => x.Key, x => x.Value));
            var submission = new TenantCustomFormSubmission
            {
                TenantId = tenantId, FormId = form.Id, FormCode = form.Code, FormName = form.Name, FormVersion = form.Version,
                FieldsJsonSnapshot = form.FieldsJson, ValuesJson = JsonSerializer.Serialize(validation.Values, JsonOptions),
                Status = "Submitted", SubmittedByUserId = userId
            };
            db.TenantCustomFormSubmissions.Add(submission);
            AddAudit(db, tenantId, userId, "custom-form.submitted", $"{form.Code}@{form.Version}:{submission.Id}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-forms/submissions/{submission.Id}", ToSubmissionView(submission));
        });

        forms.MapGet("/{formId:guid}/submissions", async (Guid formId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            if (!await db.TenantCustomFormDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == formId, ct)) return Results.NotFound();
            var query = db.TenantCustomFormSubmissions.AsNoTracking().Where(x => x.TenantId == tenantId && x.FormId == formId);
            if (role != "TenantAdmin") query = query.Where(x => x.SubmittedByUserId == userId);
            var items = await query.OrderByDescending(x => x.SubmittedAt).Take(200).ToListAsync(ct);
            return Results.Ok(items.Select(ToSubmissionView));
        });

        forms.MapPost("/submissions/{submissionId:guid}/decision", async (Guid submissionId, CustomFormDecisionRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (request.Decision is not ("Approved" or "Rejected") || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["decision"] = ["Choose Approved or Rejected and provide a reason of at most 500 characters."] });
            var submission = await db.TenantCustomFormSubmissions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == submissionId, ct);
            if (submission is null) return Results.NotFound();
            if (submission.Status != "Submitted") return Results.Conflict(new { error = "Yalnız bekleyen form gönderimleri karara bağlanabilir." });
            submission.Status = request.Decision; submission.DecidedByUserId = userId;
            submission.DecidedAt = DateTimeOffset.UtcNow; submission.DecisionReason = request.Reason.Trim();
            AddAudit(db, tenantId, userId, "custom-form.decided", $"{submission.FormCode}:{submission.Id}:{submission.Status}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSubmissionView(submission));
        });
    }

    private static bool ValidMetadata(string? code, string? name, string? description, IReadOnlyList<DynamicFormField>? fields,
        out IReadOnlyList<DynamicFormField> normalized, out Dictionary<string, string[]>? errors)
    {
        var validation = DynamicFormSchema.ValidateFields(fields);
        var issues = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(code) || code.Trim().Length > 40 || !FormCodeRegex().IsMatch(code.Trim()))
            issues["code"] = ["Form code must start with a lowercase letter and contain up to 40 lowercase letters, digits, underscores, or hyphens."];
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120) issues["name"] = ["Name must contain 1 to 120 characters."];
        if (description?.Trim().Length > 500) issues["description"] = ["Description must be at most 500 characters."];
        if (validation.Errors.Count > 0) issues["fields"] = validation.Errors.ToArray();
        normalized = validation.Fields;
        errors = issues.Count == 0 ? null : issues;
        return issues.Count == 0;
    }

    private static bool TryTenantContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = Guid.Empty; userId = Guid.Empty; role = "";
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId)
            || !Guid.TryParse(user.FindFirstValue("sub"), out userId)) return false;
        role = user.FindFirstValue("role") ?? "";
        return role.Length > 0;
    }

    private static string? NormalizeDescription(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static IReadOnlyList<DynamicFormField> ReadFields(string json) =>
        JsonSerializer.Deserialize<List<DynamicFormField>>(json, JsonOptions) ?? [];

    private static TenantCustomFormRevision ToRevision(TenantCustomFormDefinition form, Guid userId, string kind) => new()
    {
        TenantId = form.TenantId, FormId = form.Id, Version = form.Version, Name = form.Name,
        Description = form.Description, Status = form.Status, FieldsJson = form.FieldsJson,
        ChangeKind = kind, ChangedByUserId = userId
    };

    private static CustomFormView ToFormView(TenantCustomFormDefinition form) => new(
        form.Id, form.Code, form.Name, form.Description, form.Version, form.Status, ReadFields(form.FieldsJson), form.CreatedAt, form.UpdatedAt);

    private static CustomFormRevisionView ToRevisionView(TenantCustomFormRevision revision) => new(
        revision.Id, revision.FormId, revision.Version, revision.Name, revision.Description, revision.Status,
        ReadFields(revision.FieldsJson), revision.ChangeKind, revision.ChangedByUserId, revision.CreatedAt);

    private static CustomFormSubmissionView ToSubmissionView(TenantCustomFormSubmission submission) => new(
        submission.Id, submission.FormId, submission.FormCode, submission.FormName, submission.FormVersion,
        ReadFields(submission.FieldsJsonSnapshot), JsonSerializer.Deserialize<Dictionary<string, string?>>(submission.ValuesJson, JsonOptions) ?? [],
        submission.Status, submission.SubmittedByUserId, submission.SubmittedAt, submission.DecidedByUserId,
        submission.DecidedAt, submission.DecisionReason);

    private static void AddAudit(TenantDbContext db, Guid tenantId, Guid userId, string action, string resource) =>
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = action, Resource = resource });

    [GeneratedRegex("^[a-z][a-z0-9_-]{0,39}$", RegexOptions.CultureInvariant)]
    private static partial Regex FormCodeRegex();
}

public sealed record CustomFormCreateRequest(string? Code, string? Name, string? Description, IReadOnlyList<DynamicFormField>? Fields);
public sealed record CustomFormUpdateRequest(string? Name, string? Description, IReadOnlyList<DynamicFormField>? Fields);
public sealed record CustomFormRestoreRequest(Guid RevisionId);
public sealed record CustomFormSubmitRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record CustomFormDecisionRequest(string? Decision, string? Reason);
public sealed record CustomFormView(Guid Id, string Code, string Name, string? Description, int Version, string Status,
    IReadOnlyList<DynamicFormField> Fields, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record CustomFormRevisionView(Guid Id, Guid FormId, int Version, string Name, string? Description, string Status,
    IReadOnlyList<DynamicFormField> Fields, string ChangeKind, Guid ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record CustomFormSubmissionView(Guid Id, Guid FormId, string FormCode, string FormName, int FormVersion,
    IReadOnlyList<DynamicFormField> Fields, IReadOnlyDictionary<string, string?> Values, string Status, Guid SubmittedByUserId,
    DateTimeOffset SubmittedAt, Guid? DecidedByUserId, DateTimeOffset? DecidedAt, string? DecisionReason);
