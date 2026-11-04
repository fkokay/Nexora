using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>Tenant-owned declarative pages. Existing ERP screens continue to use /api/screen-views overlays.</summary>
internal static class TenantCustomPageEndpoints
{
    private const int MaxDefinitionBytes = 64 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapTenantCustomPageEndpoints(this WebApplication app)
    {
        var pages = app.MapGroup("/api/custom-pages").WithTags("Tenant Custom Pages").RequireAuthorization();

        pages.MapGet("", async (ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var items = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && !x.IsArchived)
                .OrderBy(x => x.Code).ThenByDescending(x => x.IsPublished).ThenByDescending(x => x.UpdatedAt)
                .Select(x => new PageSummary(x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.UpdatedAt)).ToListAsync(ct);
            return Results.Ok(items);
        });

        pages.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Id == id)
                .Select(x => new PageDetail(x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.DefinitionJson, x.UpdatedAt))
                .SingleOrDefaultAsync(ct);
            return page is null ? Results.NotFound() : Results.Ok(page);
        });

        // Runtime consumers receive only the currently published declarative definition.
        pages.MapGet("/{code}/published", async (string code, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct, "erp.custom-menus")) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code && x.IsPublished)
                .Select(x => new PageDefinition(x.Id, x.Code, x.Name, x.Description, x.Revision, x.DefinitionJson)).SingleOrDefaultAsync(ct);
            return page is null ? Results.NotFound() : Results.Ok(page);
        });

        pages.MapPost("/drafts", async (DraftRequest? request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "create", ct)) return Results.Forbid();
            if (!ValidMetadata(request?.Code, request?.Name, request?.Description, request?.Definition, out var json, out var error)) return Results.BadRequest(new { error });
            var code = request!.Code.Trim();
            if (await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Code == code && !x.IsPublished && !x.IsArchived, ct))
                return Results.Conflict(new { error = "Bu sayfa kodu için açık taslak zaten var." });
            var now = DateTimeOffset.UtcNow;
            var page = new TenantCustomPage { TenantId = tenant, Code = code, Name = request.Name.Trim(), Description = CleanDescription(request.Description), DefinitionJson = json!, Revision = 1, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            db.TenantCustomPages.Add(page);
            db.TenantCustomPageRevisions.Add(RevisionOf(page, userId, "DraftCreated"));
            AddAudit(db, tenant, userId, "custom-page.draft-created", page.Code);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-pages/{page.Id}", ToDetail(page));
        });

        pages.MapPut("/{id:guid}", async (Guid id, UpdateRequest? request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "update", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (page is null) return Results.NotFound();
            if (page.IsPublished || page.IsArchived) return Results.Conflict(new { error = "Yayımlanmış/geçmiş sayfa doğrudan düzenlenemez; aynı code ile yeni taslak açın." });
            if (request?.ExpectedRevision != page.Revision) return Results.Conflict(new { error = "Taslak güncel değil. Son sürümü yeniden yükleyin.", currentRevision = page.Revision });
            if (!ValidMetadata(page.Code, request?.Name, request?.Description, request?.Definition, out var json, out var error)) return Results.BadRequest(new { error });
            page.Name = request!.Name.Trim(); page.Description = CleanDescription(request.Description); page.DefinitionJson = json!;
            page.Revision++; page.UpdatedByUserId = userId; page.UpdatedAt = DateTimeOffset.UtcNow;
            db.TenantCustomPageRevisions.Add(RevisionOf(page, userId, "Updated"));
            AddAudit(db, tenant, userId, "custom-page.updated", page.Code);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetail(page));
        });

        pages.MapPost("/{id:guid}/publish", async (Guid id, RevisionRequest? request, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "execute", ct)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var draft = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (draft is null) return Results.NotFound();
            if (draft.IsPublished || request?.ExpectedRevision != draft.Revision) return Results.Conflict(new { error = "Taslak değişti veya zaten yayımlandı.", currentRevision = draft.Revision });
            if (!TenantCustomPageSchema.Validate(draft.DefinitionJson, out var error)) return Results.BadRequest(new { error });
            var previous = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Code == draft.Code && x.IsPublished, ct);
            if (previous is not null)
            {
                previous.IsPublished = false; previous.IsArchived = true; previous.Revision++; previous.UpdatedByUserId = userId; previous.UpdatedAt = DateTimeOffset.UtcNow;
                db.TenantCustomPageRevisions.Add(RevisionOf(previous, userId, "Superseded"));
            }
            draft.IsPublished = true; draft.Revision++; draft.UpdatedByUserId = userId; draft.UpdatedAt = DateTimeOffset.UtcNow;
            db.TenantCustomPageRevisions.Add(RevisionOf(draft, userId, "Published"));
            AddAudit(db, tenant, userId, "custom-page.published", draft.Code);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(ToDetail(draft));
        });

        pages.MapGet("/{id:guid}/history", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            if (!await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Id == id, ct)) return Results.NotFound();
            var revisions = await db.TenantCustomPageRevisions.AsNoTracking().Where(x => x.TenantId == tenant && x.CustomPageId == id)
                .OrderByDescending(x => x.Revision).Select(x => new RevisionDetail(x.Id, x.Revision, x.Code, x.Name, x.Description, x.ChangeKind, x.ChangedByUserId, x.CreatedAt, x.DefinitionJson)).ToListAsync(ct);
            return Results.Ok(revisions);
        });

        pages.MapPost("/{id:guid}/restore/{revisionId:guid}", async (Guid id, Guid revisionId, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "create", ct)) return Results.Forbid();
            var original = await db.TenantCustomPages.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            var revision = await db.TenantCustomPageRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.CustomPageId == id && x.Id == revisionId, ct);
            if (original is null || revision is null) return Results.NotFound();
            if (await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Code == original.Code && !x.IsPublished && !x.IsArchived, ct)) return Results.Conflict(new { error = "Bu sayfa için açık taslak zaten var." });
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantCustomPage { TenantId = tenant, Code = revision.Code, Name = revision.Name, Description = revision.Description, DefinitionJson = revision.DefinitionJson, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            db.TenantCustomPages.Add(draft); db.TenantCustomPageRevisions.Add(RevisionOf(draft, userId, "Restored"));
            AddAudit(db, tenant, userId, "custom-page.restored", draft.Code);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-pages/{draft.Id}", ToDetail(draft));
        });
    }

    private static bool ValidMetadata(string? code, string? name, string? description, JsonElement definition, out string? json, out string? error)
    {
        json = null; error = null;
        if (!ValidCode(code) || string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120 || (description?.Length ?? 0) > 500)
        { error = "Kod, ad veya açıklama biçimi geçersiz."; return false; }
        if (definition.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) { error = "Sayfa tanımı gerekli."; return false; }
        json = definition.GetRawText();
        if (System.Text.Encoding.UTF8.GetByteCount(json) > MaxDefinitionBytes) { error = "Sayfa tanımı 64 KiB sınırını aşıyor."; return false; }
        if (!TenantCustomPageSchema.Validate(json, out error)) { json = null; return false; }
        return true;
    }
    private static bool ValidCode(string? code) => !string.IsNullOrWhiteSpace(code) && code.Length <= 40 && code.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
    private static string? CleanDescription(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static bool TryContext(ClaimsPrincipal user, out Guid tenant, out Guid userId, out string role)
    { tenant = default; userId = default; role = user.FindFirstValue("role") ?? ""; return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenant) && Guid.TryParse(user.FindFirstValue("sub"), out userId) && role.Length > 0; }
    private static async Task<bool> Allowed(IPlatformPermissionAuthorizer auth, Guid tenant, Guid userId, string role, string action, CancellationToken ct, string resourceType = "erp.tenant-customizations")
    {
        var definition = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.ResourceType == resourceType && x.Action == action);
        if (definition is null) return false;
        var attributes = new Dictionary<string, string> { ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role, ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenant.ToString("D"), ["request.action"] = action };
        return await auth.IsAllowedAsync(tenant, userId, role, new ResolvedPlatformPermission(definition, attributes), ct);
    }
    private static TenantCustomPageRevision RevisionOf(TenantCustomPage x, Guid userId, string kind) => new() { TenantId = x.TenantId, CustomPageId = x.Id, Revision = x.Revision, Code = x.Code, Name = x.Name, Description = x.Description, DefinitionJson = x.DefinitionJson, ChangeKind = kind, ChangedByUserId = userId, CreatedAt = DateTimeOffset.UtcNow };
    private static void AddAudit(TenantDbContext db, Guid tenant, Guid userId, string action, string code) => db.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = action, Resource = $"custom-page:{code}" });
    private static PageDetail ToDetail(TenantCustomPage x) => new(x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.DefinitionJson, x.UpdatedAt);

    private sealed record DraftRequest(string Code, string Name, string? Description, JsonElement Definition);
    private sealed record UpdateRequest(int ExpectedRevision, string Name, string? Description, JsonElement Definition);
    private sealed record RevisionRequest(int ExpectedRevision);
    private sealed record PageSummary(Guid Id, string Code, string Name, string? Description, int Revision, bool IsPublished, bool IsArchived, DateTimeOffset UpdatedAt);
    private sealed record PageDefinition(Guid Id, string Code, string Name, string? Description, int Revision, string DefinitionJson);
    private sealed record PageDetail(Guid Id, string Code, string Name, string? Description, int Revision, bool IsPublished, bool IsArchived, string DefinitionJson, DateTimeOffset UpdatedAt);
    private sealed record RevisionDetail(Guid Id, int Revision, string Code, string Name, string? Description, string ChangeKind, Guid ChangedByUserId, DateTimeOffset CreatedAt, string DefinitionJson);
}
