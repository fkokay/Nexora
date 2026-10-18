using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

public static class TenantSelectionEndpoints
{
    public static RouteGroupBuilder MapSelectTenantEndpoint(this RouteGroupBuilder auth)
    {
        auth.MapPost("/select-tenant", async (SelectTenantRequest request, ClaimsPrincipal principal, PlatformDbContext db,
            IConfiguration config, CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Results.Unauthorized();

            var membership = await db.TenantMemberships
                .Include(m => m.Tenant)
                .SingleOrDefaultAsync(m => m.UserId == userId && m.User.IsActive && m.TenantId == request.TenantId && m.Tenant.IsActive,
                    cancellationToken);
            if (membership is null)
            {
                db.AuditEvents.Add(new AuditEvent
                {
                    UserId = userId,
                    Action = "auth.tenant-selection.failed",
                    Resource = "membership-rejected"
                });
                await db.SaveChangesAsync(cancellationToken);
                return Results.Forbid();
            }

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new Claim("name", principal.Identity?.Name ?? ""),
                new Claim("email", principal.FindFirstValue("email") ?? ""),
                new Claim("tenant_id", membership.TenantId.ToString()),
                new Claim("role", membership.Role)
            };
            var platformRoles = await db.PlatformUserRoles.AsNoTracking()
                .Where(x => x.UserId == userId)
                .Select(x => x.Role)
                .ToListAsync(cancellationToken);
            var token = TokenIssuer.Issue(claims.Concat(platformRoles.Select(role => new Claim("platform_role", role))), config);
            db.AuditEvents.Add(new AuditEvent
            {
                UserId = userId,
                TenantId = membership.TenantId,
                Action = "tenant.selected",
                Resource = membership.Tenant.Slug
            });
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(new
            {
                accessToken = token,
                tenant = new TenantSummary(membership.TenantId, membership.Tenant.Name, membership.Tenant.Slug, membership.Role)
            });
        }).RequireAuthorization();

        return auth;
    }
}
