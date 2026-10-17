using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class AccessControlEndpoints
{
    public static void MapAccessControlEndpoints(this WebApplication app)
    {
        var access = app.MapGroup("/api/access-control").RequireAuthorization();
        access.MapGet("/permissions", async (ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId)) return Results.Forbid();
            var moduleDefinitions = await ModulePermissionPolicy.ForTenantAsync(db, tenantId, ct);
            return Results.Ok(PlatformPermissionCatalog.Definitions.Concat(moduleDefinitions.Select(x => x.Policy))
                .DistinctBy(x => x.Code, StringComparer.Ordinal).OrderBy(x => x.Code));
        });
        access.MapGet("/members", async (ClaimsPrincipal user, PlatformDbContext db) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId)) return Results.Forbid();
            var members = await db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId)
                .Join(db.Users.AsNoTracking(), membership => membership.UserId, account => account.Id,
                    (membership, account) => new TenantPermissionMemberView(account.Id, account.Email, account.DisplayName, membership.Role))
                .OrderBy(x => x.DisplayName).ToListAsync();
            return Results.Ok(members);
        });
        access.MapGet("/rules", async (ClaimsPrincipal user, PlatformDbContext db) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId)) return Results.Forbid();
            var rules = await db.TenantPermissionRules.AsNoTracking().Include(x => x.Permission)
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.SubjectType).ThenBy(x => x.SubjectRole).ThenBy(x => x.PermissionCode).ThenBy(x => x.Effect)
                .ToListAsync();
            var subjectIds = rules.Where(x => x.SubjectUserId.HasValue).Select(x => x.SubjectUserId!.Value).Distinct().ToArray();
            var displayNames = subjectIds.Length == 0
                ? new Dictionary<Guid, string>()
                : await db.Users.AsNoTracking().Where(x => subjectIds.Contains(x.Id))
                    .ToDictionaryAsync(x => x.Id, x => x.DisplayName);
            var views = rules.Select(x => new TenantPermissionRuleView(x.Id, x.SubjectType, x.SubjectRole, x.SubjectUserId,
                x.SubjectUserId is { } subjectId && displayNames.TryGetValue(subjectId, out var displayName) ? displayName : null,
                x.PermissionCode, x.Permission.ResourceType, x.Permission.Action, x.Effect, x.ResourceType, x.AttributeName,
                x.AttributeOperator, x.AttributeValue, x.IsActive, x.CreatedByUserId, x.CreatedAt)).ToList();
            return Results.Ok(views);
        });
        access.MapPost("/rules", async (TenantPermissionRuleCreateRequest request, ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)) return Results.Forbid();
            var permissionCode = request.PermissionCode?.Trim();
            var moduleDefinitions = await ModulePermissionPolicy.ForTenantAsync(db, tenantId, ct);
            var moduleDefinition = moduleDefinitions.FirstOrDefault(x => x.Policy.Code == permissionCode);
            var permission = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.Code == permissionCode)
                ?? moduleDefinition?.Policy;
            if (permission is null) return Validation("permissionCode", "Permission code is not in the platform catalog.");
            if (request.Effect is not (TenantPermissionEffect.Allow or TenantPermissionEffect.Deny))
                return Validation("effect", "Choose Allow or Deny.");
            if (!string.IsNullOrWhiteSpace(request.ResourceType) && !string.Equals(request.ResourceType, permission.ResourceType, StringComparison.Ordinal))
                return Validation("resourceType", "The resource condition must match the permission resource.");

            string? role = null;
            Guid? userId = null;
            if (request.SubjectType == TenantPermissionSubjectType.Role)
            {
                role = request.SubjectRole?.Trim();
                if (string.IsNullOrWhiteSpace(role) || role.Length > 64 || role == "TenantAdmin" || request.SubjectUserId is not null)
                    return Validation("subjectRole", "Choose a tenant role other than the protected TenantAdmin role.");
                if (!await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.Role == role))
                    return Validation("subjectRole", "The role is not assigned to a member of this tenant.");
            }
            else if (request.SubjectType == TenantPermissionSubjectType.User)
            {
                userId = request.SubjectUserId;
                if (userId is null || request.SubjectRole is not null)
                    return Validation("subjectUserId", "Choose an active member of this tenant.");
                var memberRole = await db.TenantMemberships.Where(x => x.TenantId == tenantId && x.UserId == userId)
                    .Select(x => x.Role).SingleOrDefaultAsync();
                if (memberRole is null || memberRole == "TenantAdmin")
                    return Validation("subjectUserId", "Choose a non-administrator member of this tenant.");
            }
            else return Validation("subjectType", "Choose Role or User.");

            var attributeName = string.IsNullOrWhiteSpace(request.AttributeName) ? null : request.AttributeName.Trim();
            var attributeValue = request.AttributeValue?.Trim();
            if (attributeName is null)
            {
                if (request.AttributeOperator is not null || !string.IsNullOrWhiteSpace(attributeValue))
                    return Validation("attributeName", "An attribute name is required when a condition is supplied.");
            }
            else if (!PlatformPermissionCatalog.AttributeKeys.Contains(attributeName, StringComparer.OrdinalIgnoreCase)
                || request.AttributeOperator is not (TenantPermissionConditionOperator.Equals or TenantPermissionConditionOperator.NotEquals or TenantPermissionConditionOperator.In)
                || string.IsNullOrWhiteSpace(attributeValue) || attributeValue.Length > 500)
                return Validation("attributeName", "Use a supported attribute with Equals, NotEquals, or In and a value of at most 500 characters.");
            if (request.Effect == TenantPermissionEffect.Deny && role == "TenantAdmin")
                return Validation("effect", "TenantAdmin access cannot be denied by a tenant policy.");

            var permissionEntity = await db.PermissionDefinitions.SingleOrDefaultAsync(x => x.Code == permission.Code, ct);
            if (permissionEntity is null)
            {
                if (moduleDefinition is null) return Results.Problem("Platform permission definition is missing.", statusCode: StatusCodes.Status500InternalServerError);
                permissionEntity = moduleDefinition.Entity;
                db.PermissionDefinitions.Add(permissionEntity);
            }

            var rule = new TenantPermissionRule { TenantId = tenantId, SubjectType = request.SubjectType,
                SubjectRole = role, SubjectUserId = userId, PermissionCode = permission.Code, Permission = permissionEntity,
                Effect = request.Effect, ResourceType = permission.ResourceType, AttributeName = attributeName,
                AttributeOperator = attributeName is null ? null : request.AttributeOperator,
                AttributeValue = attributeName is null ? null : attributeValue, CreatedByUserId = actorId };
            db.TenantPermissionRules.Add(rule);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorId,
                Action = "access-control.rule.created", Resource = $"{rule.SubjectType}:{role ?? userId?.ToString("D")}:{permission.Code}:{rule.Effect}" });
            await db.SaveChangesAsync();
            return Results.Created($"/api/access-control/rules/{rule.Id}", new TenantPermissionRuleView(rule.Id,
                rule.SubjectType, rule.SubjectRole, rule.SubjectUserId,
                userId is null ? null : await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync(),
                permission.Code, permission.ResourceType, permission.Action, rule.Effect, rule.ResourceType,
                rule.AttributeName, rule.AttributeOperator, rule.AttributeValue, rule.IsActive, rule.CreatedByUserId, rule.CreatedAt));
        });
        access.MapDelete("/rules/{id:guid}", async (Guid id, ClaimsPrincipal user, PlatformDbContext db) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)) return Results.Forbid();
            var rule = await db.TenantPermissionRules.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
            if (rule is null) return Results.NotFound();
            db.TenantPermissionRules.Remove(rule);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorId, Action = "access-control.rule.deleted",
                Resource = $"{rule.SubjectType}:{rule.SubjectRole ?? rule.SubjectUserId?.ToString("D")}:{rule.PermissionCode}:{rule.Effect}" });
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static bool TryGetTenantAdmin(ClaimsPrincipal user, out Guid tenantId) =>
        Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) && user.FindFirstValue("role") == "TenantAdmin";

    private static bool TryGetUserId(ClaimsPrincipal user, out Guid userId) =>
        Guid.TryParse(user.FindFirstValue("sub"), out userId);

    private static IResult Validation(string key, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
