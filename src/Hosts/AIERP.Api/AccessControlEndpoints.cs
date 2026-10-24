using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

internal static class AccessControlEndpoints
{
    public static void MapAccessControlEndpoints(this WebApplication app)
    {
        var access = app.MapGroup("/api/access-control").RequireAuthorization();
        access.MapGet("/permissions", async (ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)
                || !await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
            var moduleDefinitions = await ModulePermissionPolicy.ForTenantAsync(db, tenantId, ct);
            return Results.Ok(PlatformPermissionCatalog.Definitions.Concat(moduleDefinitions.Select(x => x.Policy))
                .DistinctBy(x => x.Code, StringComparer.Ordinal).OrderBy(x => x.Code));
        });
        access.MapGet("/members", async (ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)
                || !await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
            var members = await db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId)
                .Join(db.Users.AsNoTracking(), membership => membership.UserId, account => account.Id,
                    (membership, account) => new { account.Id, account.Email, account.DisplayName, membership.Role })
                .OrderBy(x => x.DisplayName)
                .Select(x => new TenantPermissionMemberView(x.Id, x.Email, x.DisplayName, x.Role))
                .ToListAsync();
            return Results.Ok(members);
        });
        access.MapGet("/members/candidate", async (string? email, ClaimsPrincipal user,
            PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)
                || !await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
            var normalizedEmail = email?.Trim().ToLowerInvariant();
            if (!IsExactEmail(normalizedEmail)) return Validation("email", "Enter one valid email address (maximum 254 characters).");
            var candidate = await db.Users.AsNoTracking()
                .Where(x => x.Email == normalizedEmail && x.IsActive
                    && !db.TenantMemberships.Any(m => m.TenantId == tenantId && m.UserId == x.Id))
                .Select(x => new { x.Id, x.Email, x.DisplayName })
                .FirstOrDefaultAsync(ct);
            // Unknown addresses and users already attached to this tenant produce the same response.
            return candidate is null ? Results.NotFound() : Results.Ok(candidate);
        }).RequireRateLimiting("login");
        access.MapPost("/members", async (TenantMembershipCreateRequest request, ClaimsPrincipal user,
            PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)) return Results.Forbid();
            if (!await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
            if (request.UserId == Guid.Empty || !IsTenantRole(request.Role))
                return Validation("membership", "Choose an existing active platform user and the TenantUser or TenantAdmin role.");

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var licenseError = await CheckWritableLicenseAsync(db, tenantId, ct);
            if (licenseError is not null) return licenseError;
            if (!await db.Users.AnyAsync(x => x.Id == request.UserId && x.IsActive, ct))
                return Results.NotFound(new { error = "Active platform user was not found." });
            if (await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.UserId == request.UserId, ct))
                return Results.Conflict(new { error = "This user is already a member of the tenant.", code = "membership.exists" });

            var count = await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId, ct);
            var license = await db.TenantLicenses.AsNoTracking().SingleAsync(x => x.TenantId == tenantId, ct);
            var policy = LicenseTierCatalog.All[license.Tier];
            if (count >= policy.MaxUsers)
                return Results.Conflict(new { error = $"The {policy.Code} license supports at most {policy.MaxUsers} users.", code = "license.user_limit", limit = policy.MaxUsers, activeCount = count, tier = policy.Code });

            var membership = new TenantMembership { TenantId = tenantId, UserId = request.UserId, Role = request.Role.Trim() };
            db.TenantMemberships.Add(membership);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorId,
                Action = "access-control.member.added", Resource = $"{request.UserId:D}:{membership.Role}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "The membership changed concurrently.", code = "membership.conflict" }); }
            await transaction.CommitAsync(ct);
            var account = await db.Users.AsNoTracking().Where(x => x.Id == request.UserId)
                .Select(x => new { x.Id, x.Email, x.DisplayName }).SingleAsync(ct);
            return Results.Created($"/api/access-control/members/{request.UserId:D}",
                new TenantPermissionMemberView(account.Id, account.Email, account.DisplayName, membership.Role));
        });
        access.MapPut("/members/{userId:guid}", async (Guid userId, TenantMembershipUpdateRequest request,
            ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)) return Results.Forbid();
            if (!await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
            if (!IsTenantRole(request.Role)) return Validation("role", "Choose TenantUser or TenantAdmin.");
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var licenseError = await CheckWritableLicenseAsync(db, tenantId, ct);
            if (licenseError is not null) return licenseError;
            var membership = await db.TenantMemberships.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId, ct);
            if (membership is null) return Results.NotFound();
            if (membership.Role == "TenantAdmin" && request.Role != "TenantAdmin"
                && await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId && x.Role == "TenantAdmin", ct) <= 1)
                return Results.Conflict(new { error = "A tenant must retain at least one TenantAdmin.", code = "membership.last_admin" });
            if (membership.Role == request.Role) return Results.Ok(await MemberViewAsync(db, membership, ct));
            membership.Role = request.Role.Trim();
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorId,
                Action = "access-control.member.role-updated", Resource = $"{userId:D}:{membership.Role}" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(await MemberViewAsync(db, membership, ct));
        });
        access.MapDelete("/members/{userId:guid}", async (Guid userId, ClaimsPrincipal user,
            PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)) return Results.Forbid();
            if (!await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var membership = await db.TenantMemberships.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId, ct);
            if (membership is null) return Results.NotFound();
            if (membership.Role == "TenantAdmin"
                && await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId && x.Role == "TenantAdmin", ct) <= 1)
                return Results.Conflict(new { error = "A tenant must retain at least one TenantAdmin.", code = "membership.last_admin" });
            db.TenantMemberships.Remove(membership);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorId,
                Action = "access-control.member.deactivated", Resource = $"{userId:D}:{membership.Role}" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.NoContent();
        });
        access.MapGet("/rules", async (ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)
                || !await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
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
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)
                || !await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
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
                // Built-in permissions are exposed from the current catalog even when an existing
                // platform database has not yet received the catalog's HasData seed. Materialize
                // the exact catalog definition so TenantAdmins can grant explicit company access.
                permissionEntity = moduleDefinition?.Entity ?? new PermissionDefinition
                {
                    Code = permission.Code,
                    ResourceType = permission.ResourceType,
                    Action = permission.Action,
                    Description = permission.Description
                };
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
        access.MapDelete("/rules/{id:guid}", async (Guid id, ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantAdmin(user, out var tenantId) || !TryGetUserId(user, out var actorId)
                || !await IsCurrentTenantAdminAsync(db, tenantId, actorId, ct)) return Results.Forbid();
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

    private static bool IsTenantRole(string? role) => role?.Trim() is "TenantUser" or "TenantAdmin";

    private static bool IsExactEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 254 || value.Any(char.IsWhiteSpace)) return false;
        try
        {
            var parsed = new System.Net.Mail.MailAddress(value);
            return string.Equals(parsed.Address, value, StringComparison.Ordinal)
                && value.Contains('@') && value.LastIndexOf('.') > value.IndexOf('@') + 1;
        }
        catch (FormatException) { return false; }
    }

    private static async Task<IResult?> CheckWritableLicenseAsync(PlatformDbContext db, Guid tenantId, CancellationToken ct)
    {
        var license = await db.TenantLicenses.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
        if (license is null)
            return Results.Conflict(new { error = "An active signed company license is required to change tenant memberships.", code = "license.required" });
        if (license.ExpiresAt <= DateTimeOffset.UtcNow)
            return Results.Conflict(new { error = "The company license has expired.", code = "license.expired" });
        if (!LicenseTierCatalog.IsValidStoredLicense(license))
            return Results.Conflict(new { error = "The stored company license is invalid. Activate a valid signed license before changing memberships.", code = "license.invalid" });
        return null;
    }

    private static Task<bool> IsCurrentTenantAdminAsync(PlatformDbContext db, Guid tenantId, Guid userId, CancellationToken ct) =>
        db.TenantMemberships.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.UserId == userId
            && x.Role == "TenantAdmin" && x.User.IsActive && x.Tenant.IsActive, ct);

    private static async Task<TenantPermissionMemberView> MemberViewAsync(PlatformDbContext db, TenantMembership membership, CancellationToken ct)
    {
        var account = await db.Users.AsNoTracking().Where(x => x.Id == membership.UserId)
            .Select(x => new { x.Id, x.Email, x.DisplayName }).SingleAsync(ct);
        return new TenantPermissionMemberView(account.Id, account.Email, account.DisplayName, membership.Role);
    }
}

public sealed record TenantMembershipCreateRequest(Guid UserId, string Role);
public sealed record TenantMembershipUpdateRequest(string Role);
