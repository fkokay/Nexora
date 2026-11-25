using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.AIService;

/// <summary>
/// Endpoint metadata marking a route as self-authorized: the permission catalog / tenant Allow-Deny policy check is skipped
/// by design (tenant Deny rules do not apply to these routes) because the endpoint authorizes from the DB membership itself.
/// </summary>
public sealed class StudioSelfAuthorizedEndpoint
{
    public static readonly StudioSelfAuthorizedEndpoint Instance = new();
    private StudioSelfAuthorizedEndpoint() { }
}

public sealed record UpdateStudioRoleRequest(string? StudioRole);

public sealed record StudioPersonRow(Guid UserId, string DisplayName, string Email, string MembershipRole,
    string? StudioRole, string EffectiveRole);

public static class StudioAccessEndpoints
{
    public static WebApplication MapStudioAccessEndpoints(this WebApplication app)
    {
        app.MapGet("/studio/me", async (ClaimsPrincipal user, PlatformDbContext platformDb, AIStudioDbContext studioDb, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
            var access = await StudioAccessLookup.ForUserAsync(platformDb, studioDb, tenantId, userId, ct);
            if (access is null) return Results.Forbid();
            return Results.Ok(new { isAdmin = access.IsAdmin, workRole = access.WorkRole, menuRoles = access.MenuRoles });
        }).RequireAuthorization().WithMetadata(StudioSelfAuthorizedEndpoint.Instance);

        app.MapGet("/studio/people", async (ClaimsPrincipal user, PlatformDbContext platformDb, AIStudioDbContext studioDb, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
            var access = await StudioAccessLookup.ForUserAsync(platformDb, studioDb, tenantId, userId, ct);
            if (access is null || !access.IsAdmin) return Results.Forbid();
            var members = await platformDb.TenantMemberships.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.User.IsActive)
                .Select(x => new { x.UserId, x.User.DisplayName, x.User.Email, x.Role, x.StudioRole })
                .ToListAsync(ct);
            var granted = (await studioDb.DevelopmentProjectAccesses.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Project.IsActive && x.Project.TenantId == tenantId)
                .Select(x => x.UserId).Distinct().ToListAsync(ct)).ToHashSet();
            var rows = members.OrderBy(x => x.DisplayName).ThenBy(x => x.Email)
                .Select(x => ToRow(x.UserId, x.DisplayName, x.Email, x.Role, x.StudioRole, granted.Contains(x.UserId)));
            return Results.Ok(rows);
        }).RequireAuthorization().WithMetadata(StudioSelfAuthorizedEndpoint.Instance);

        app.MapPut("/studio/people/{userId:guid}/studio-role", async (Guid userId, UpdateStudioRoleRequest body, ClaimsPrincipal user,
            PlatformDbContext platformDb, AIStudioDbContext studioDb, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out var callerId)) return Results.Forbid();
            var access = await StudioAccessLookup.ForUserAsync(platformDb, studioDb, tenantId, callerId, ct);
            if (access is null || !access.IsAdmin) return Results.Forbid();
            if (!StudioRoles.IsValid(body.StudioRole))
                return Results.BadRequest(new { error = "Geçersiz Studio rolü. Danışman, Geliştirici, Yok veya varsayılan olmalıdır." });
            var membership = await platformDb.TenantMemberships.Include(x => x.User)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId, ct);
            if (membership is null) return Results.NotFound(new { error = "Kişi bu firmada bulunamadı." });
            membership.StudioRole = body.StudioRole;
            platformDb.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId, UserId = callerId, Action = "studio.member.role-updated",
                Resource = $"{userId:D}:{body.StudioRole ?? "default"}"
            });
            await platformDb.SaveChangesAsync(ct);
            var hasGrant = await studioDb.DevelopmentProjectAccesses.AsNoTracking()
                .AnyAsync(x => x.TenantId == tenantId && x.UserId == userId && x.Project.IsActive && x.Project.TenantId == tenantId, ct);
            return Results.Ok(ToRow(userId, membership.User.DisplayName, membership.User.Email, membership.Role, membership.StudioRole, hasGrant));
        }).RequireAuthorization().WithMetadata(StudioSelfAuthorizedEndpoint.Instance);
        return app;
    }

    private static StudioPersonRow ToRow(Guid userId, string displayName, string email, string role, string? studioRole, bool hasGrant)
    {
        var access = StudioAccessResolver.Resolve(role, studioRole, hasGrant);
        return new StudioPersonRow(userId, displayName, email, role, studioRole, access.IsAdmin ? "Admin" : access.WorkRole);
    }

    private static bool TryScope(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out userId);
        return hasTenant && hasUser;
    }
}
