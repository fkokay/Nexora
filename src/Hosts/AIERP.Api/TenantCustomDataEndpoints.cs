using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static partial class TenantCustomDataEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapTenantCustomDataEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/custom-data").WithTags("Tenant Custom Data").RequireAuthorization();

        group.MapGet("/entities", async (ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "read", ct)) return Results.Forbid();
            var canManage = role == "TenantAdmin" || await Allowed(auth, tenantId, userId, role, "create", ct)
                || await Allowed(auth, tenantId, userId, role, "update", ct);
            var query = db.TenantCustomDataEntities.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!canManage) query = query.Where(x => x.Status == "Published");
            else query = query.Where(x => x.Status == "Published" || x.Status == "Draft");
            var rows = await query.OrderBy(x => x.Code).ThenByDescending(x => x.Version).Take(500).ToListAsync(ct);
            return Results.Ok(rows.Select(View));
        });

        group.MapPost("/entities", async (CustomDataEntityRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "create", ct)) return Results.Forbid();
            if (!ValidateDefinition(request.Code, request.Name, request.Description, request.Fields, out var code, out var fields, out var errors)) return Results.ValidationProblem(errors!);
            if (await db.TenantCustomDataEntities.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct)) return Results.Conflict(new { error = "Bu mantıksal tablo kodu tenant içinde zaten kullanılıyor." });
            var now = DateTimeOffset.UtcNow;
            var entity = new TenantCustomDataEntity { TenantId = tenantId, Code = code, Name = request.Name!.Trim(), Description = Clean(request.Description), FieldsJson = JsonSerializer.Serialize(fields, JsonOptions), Version = 1, Status = "Draft", CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            db.TenantCustomDataEntities.Add(entity); Audit(db, tenantId, userId, "custom-data.entity.created", $"{code}@1");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-data/entities/{entity.Id}", View(entity));
        });

        group.MapGet("/entities/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "read", ct, id)) return Results.Forbid();
            var entity = await db.TenantCustomDataEntities.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (entity is null) return Results.NotFound();
            var canManage = role == "TenantAdmin" || await Allowed(auth, tenantId, userId, role, "create", ct)
                || await Allowed(auth, tenantId, userId, role, "update", ct);
            if (entity.Status != "Published" && !canManage) return Results.Forbid();
            return Results.Ok(View(entity));
        });

        group.MapPut("/entities/{id:guid}", async (Guid id, CustomDataEntityUpdateRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "update", ct, id)) return Results.Forbid();
            var entity = await db.TenantCustomDataEntities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status != "Draft") return Results.Conflict(new { error = "Yalnız taslak mantıksal tablo düzenlenebilir. Yayımlanmış sürümden taslak oluşturun." });
            if (!ValidateDefinition(entity.Code, request.Name, request.Description, request.Fields, out _, out var fields, out var errors)) return Results.ValidationProblem(errors!);
            entity.Name = request.Name!.Trim(); entity.Description = Clean(request.Description); entity.FieldsJson = JsonSerializer.Serialize(fields, JsonOptions); entity.Version++; entity.UpdatedByUserId = userId; entity.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "custom-data.entity.updated", $"{entity.Code}@{entity.Version}"); await db.SaveChangesAsync(ct);
            return Results.Ok(View(entity));
        });

        group.MapPost("/entities/{id:guid}/publish", async (Guid id, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "execute", ct, id)) return Results.Forbid();
            var entity = await db.TenantCustomDataEntities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status != "Draft") return Results.Conflict(new { error = "Yalnız taslak sürüm yayımlanabilir." });
            var validation = DynamicFormSchema.ValidateFields(ReadFields(entity.FieldsJson));
            if (!validation.IsValid) return Results.Conflict(new { error = "Şema geçerli değil.", details = validation.Errors });
            var previous = await db.TenantCustomDataEntities.Where(x => x.TenantId == tenantId && x.Code == entity.Code && x.Status == "Published").ToListAsync(ct);
            foreach (var old in previous) { old.Status = "Retired"; old.UpdatedAt = DateTimeOffset.UtcNow; old.UpdatedByUserId = userId; }
            entity.Status = "Published"; entity.UpdatedAt = DateTimeOffset.UtcNow; entity.UpdatedByUserId = userId;
            Audit(db, tenantId, userId, "custom-data.entity.published", $"{entity.Code}@{entity.Version}"); await db.SaveChangesAsync(ct);
            return Results.Ok(View(entity));
        });

        group.MapPost("/entities/{id:guid}/draft", async (Guid id, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "create", ct, id)) return Results.Forbid();
            var source = await db.TenantCustomDataEntities.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.Status == "Published", ct);
            if (source is null) return Results.NotFound();
            if (await db.TenantCustomDataEntities.AnyAsync(x => x.TenantId == tenantId && x.Code == source.Code && x.Status == "Draft", ct)) return Results.Conflict(new { error = "Bu tablo için zaten taslak var." });
            var version = await db.TenantCustomDataEntities.Where(x => x.TenantId == tenantId && x.Code == source.Code).MaxAsync(x => (int?)x.Version, ct) ?? source.Version;
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantCustomDataEntity { TenantId = tenantId, Code = source.Code, Name = source.Name, Description = source.Description, FieldsJson = source.FieldsJson, Version = version + 1, Status = "Draft", CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            db.TenantCustomDataEntities.Add(draft); Audit(db, tenantId, userId, "custom-data.entity.draft-created", $"{draft.Code}@{draft.Version}"); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-data/entities/{draft.Id}", View(draft));
        });

        group.MapDelete("/entities/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "delete", ct, id)) return Results.Forbid();
            var entity = await db.TenantCustomDataEntities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status != "Draft") return Results.Conflict(new { error = "Yalnız taslak mantıksal tablo silinebilir." });
            if (await db.TenantCustomDataRecords.AnyAsync(x => x.TenantId == tenantId && x.EntityId == id, ct)) return Results.Conflict(new { error = "Kayıt içeren mantıksal tablo silinemez." });
            db.TenantCustomDataEntities.Remove(entity); Audit(db, tenantId, userId, "custom-data.entity.deleted", $"{entity.Code}@{entity.Version}"); await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapGet("/entities/{code}/records", async (string code, int? page, int? pageSize, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "read", ct)) return Results.Forbid();
            var entity = await db.TenantCustomDataEntities.AsNoTracking().Where(x => x.TenantId == tenantId && x.Code == code && x.Status == "Published").OrderByDescending(x => x.Version).FirstOrDefaultAsync(ct);
            if (entity is null) return Results.NotFound();
            var p = Math.Clamp(page ?? 1, 1, 100000); var size = Math.Clamp(pageSize ?? 50, 1, 100);
            // Logical table records survive schema publishing: retired entity versions continue to own
            // their original rows, while new records attach to the active published version.
            var versions = await db.TenantCustomDataEntities.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Code == entity.Code && (x.Status == "Published" || x.Status == "Retired"))
                .ToListAsync(ct);
            var versionsById = versions.ToDictionary(x => x.Id);
            var entityIds = versionsById.Keys.ToArray();
            var query = db.TenantCustomDataRecords.AsNoTracking().Where(x => x.TenantId == tenantId && entityIds.Contains(x.EntityId));
            var total = await query.CountAsync(ct); var records = await query.OrderByDescending(x => x.UpdatedAt).Skip((p - 1) * size).Take(size).ToListAsync(ct);
            var items = records.Select(record => new
            {
                record.Id,
                record.EntityId,
                values = JsonSerializer.Deserialize<Dictionary<string, string?>>(record.ValuesJson, JsonOptions) ?? [],
                fields = ReadFields(versionsById[record.EntityId].FieldsJson),
                record.CreatedAt,
                record.UpdatedAt
            });
            return Results.Ok(new { entity = View(entity), page = p, pageSize = size, total, items });
        });

        group.MapPost("/entities/{code}/records", async (string code, CustomDataRecordRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "create", ct)) return Results.Forbid();
            var entity = await db.TenantCustomDataEntities.AsNoTracking().Where(x => x.TenantId == tenantId && x.Code == code && x.Status == "Published").OrderByDescending(x => x.Version).FirstOrDefaultAsync(ct);
            if (entity is null) return Results.NotFound();
            if (!ValidateValues(entity, request.Values, out var values, out var errors)) return Results.ValidationProblem(errors!);
            var record = new TenantCustomDataRecord { TenantId = tenantId, EntityId = entity.Id, ValuesJson = JsonSerializer.Serialize(values, JsonOptions), CreatedByUserId = userId, UpdatedByUserId = userId };
            db.TenantCustomDataRecords.Add(record); Audit(db, tenantId, userId, "custom-data.record.created", $"{code}:{record.Id}"); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-data/records/{record.Id}", RecordView(record));
        });

        group.MapPut("/records/{id:guid}", async (Guid id, CustomDataRecordRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "update", ct, id)) return Results.Forbid();
            var record = await db.TenantCustomDataRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            var entity = await db.TenantCustomDataEntities.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == record.EntityId && x.Status == "Published", ct);
            if (entity is null) return Results.Conflict(new { error = "Kayıt şeması yayımlanmış değil." });
            if (!ValidateValues(entity, request.Values, out var values, out var errors)) return Results.ValidationProblem(errors!);
            record.ValuesJson = JsonSerializer.Serialize(values, JsonOptions); record.UpdatedByUserId = userId; record.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "custom-data.record.updated", $"{entity.Code}:{record.Id}"); await db.SaveChangesAsync(ct); return Results.Ok(RecordView(record));
        });

        group.MapDelete("/records/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!Context(user, out var tenantId, out var userId, out var role) || !await Allowed(auth, tenantId, userId, role, "delete", ct, id)) return Results.Forbid();
            var record = await db.TenantCustomDataRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            db.TenantCustomDataRecords.Remove(record); Audit(db, tenantId, userId, "custom-data.record.deleted", id.ToString("D")); await db.SaveChangesAsync(ct); return Results.NoContent();
        });
    }

    private static bool ValidateDefinition(string? rawCode, string? name, string? description, IReadOnlyList<DynamicFormField>? fields, out string code, out IReadOnlyList<DynamicFormField> normalized, out Dictionary<string, string[]>? errors)
    {
        code = rawCode?.Trim() ?? ""; var schema = DynamicFormSchema.ValidateFields(fields); var issues = new Dictionary<string, string[]>();
        if (!CodeRegex().IsMatch(code)) issues["code"] = ["Kod küçük harfle başlamalı; küçük harf, rakam, _ veya - içermeli ve en fazla 40 karakter olmalı."];
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120) issues["name"] = ["Ad 1–120 karakter olmalı."];
        if (description?.Trim().Length > 500) issues["description"] = ["Açıklama en fazla 500 karakter olabilir."];
        if (!schema.IsValid) issues["fields"] = schema.Errors.ToArray();
        normalized = schema.Fields; errors = issues.Count == 0 ? null : issues; return issues.Count == 0;
    }

    private static bool ValidateValues(TenantCustomDataEntity entity, IReadOnlyDictionary<string, string?>? input, out IReadOnlyDictionary<string, string?> values, out Dictionary<string, string[]>? errors)
    {
        var result = DynamicFormSchema.ValidateValues(ReadFields(entity.FieldsJson), input);
        values = result.Values ?? new Dictionary<string, string?>();
        errors = result.Errors.Count == 0 ? null : result.Errors.Select((x, i) => new KeyValuePair<string, string[]>($"value{i + 1}", [x])).ToDictionary(x => x.Key, x => x.Value);
        return errors is null;
    }

    private static IReadOnlyList<DynamicFormField> ReadFields(string json) => JsonSerializer.Deserialize<List<DynamicFormField>>(json, JsonOptions) ?? [];
    private static CustomDataEntityView View(TenantCustomDataEntity x) => new(x.Id, x.Code, x.Name, x.Description, x.Version, x.Status, ReadFields(x.FieldsJson), x.CreatedAt, x.UpdatedAt);
    private static CustomDataRecordView RecordView(TenantCustomDataRecord x) => new(x.Id, x.EntityId, JsonSerializer.Deserialize<Dictionary<string, string?>>(x.ValuesJson, JsonOptions) ?? [], x.CreatedAt, x.UpdatedAt);
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static void Audit(TenantDbContext db, Guid tenantId, Guid userId, string action, string resource) => db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = action, Resource = resource });
    private static bool Context(ClaimsPrincipal user, out Guid tenant, out Guid userId, out string role)
    {
        tenant = userId = Guid.Empty; role = user.FindFirstValue("role") ?? "";
        return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenant) && Guid.TryParse(user.FindFirstValue("sub"), out userId) && role.Length > 0;
    }
    private static Task<bool> Allowed(IPlatformPermissionAuthorizer auth, Guid tenant, Guid user, string role, string action, CancellationToken ct, Guid? id = null)
    {
        var definition = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.ResourceType == "erp.custom-data" && x.Action == action);
        if (definition is null) return Task.FromResult(false);
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { ["subject.userId"] = user.ToString("D"), ["subject.role"] = role, ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenant.ToString("D"), ["request.method"] = action == "read" ? "GET" : action == "update" ? "PUT" : action == "delete" ? "DELETE" : "POST", ["request.action"] = action };
        if (id is not null) attributes["resource.route.id"] = id.Value.ToString("D");
        return auth.IsAllowedAsync(tenant, user, role, new ResolvedPlatformPermission(definition, attributes), ct);
    }
    [GeneratedRegex("^[a-z][a-z0-9_-]{0,39}$", RegexOptions.CultureInvariant)] private static partial Regex CodeRegex();
}

public sealed record CustomDataEntityRequest(string? Code, string? Name, string? Description, IReadOnlyList<DynamicFormField>? Fields);
public sealed record CustomDataEntityUpdateRequest(string? Name, string? Description, IReadOnlyList<DynamicFormField>? Fields);
public sealed record CustomDataRecordRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record CustomDataEntityView(Guid Id, string Code, string Name, string? Description, int Version, string Status, IReadOnlyList<DynamicFormField> Fields, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record CustomDataRecordView(Guid Id, Guid EntityId, IReadOnlyDictionary<string, string?> Values, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
