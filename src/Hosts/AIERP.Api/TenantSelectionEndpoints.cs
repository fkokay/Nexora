using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

public static class TenantSelectionEndpoints
{
    private const string StudioRefreshCookieName = "aierp.studio.refresh";
    private const string StudioCookieTransportHeader = "X-Studio-Session";

    public static RouteGroupBuilder MapAccessibleTenantsEndpoint(this RouteGroupBuilder auth)
    {
        auth.MapGet("/tenants", async (ClaimsPrincipal principal, PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Results.Unauthorized();

            var tenants = await db.TenantMemberships.AsNoTracking()
                .Where(membership => membership.UserId == userId && membership.User.IsActive && membership.Tenant.IsActive)
                .OrderBy(membership => membership.Tenant.Name)
                .Select(membership => new TenantSummary(membership.TenantId, membership.Tenant.Name, membership.Tenant.Slug, membership.Role))
                .ToListAsync(cancellationToken);

            return Results.Ok(tenants);
        }).RequireAuthorization(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        return auth;
    }

    public static RouteGroupBuilder MapRefreshEndpoint(this RouteGroupBuilder auth)
    {
        auth.MapPost("/refresh", async (HttpContext context, RefreshRequest request, PlatformDbContext db,
            IConfiguration config, IHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var cookieTransport = UsesStudioCookieTransport(context.Request);
            if (cookieTransport && !IsAllowedStudioCookieRequest(context.Request, config))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var refreshToken = cookieTransport
                ? request.RefreshToken ?? context.Request.Cookies[StudioRefreshCookieName]
                : request.RefreshToken;
            if (string.IsNullOrWhiteSpace(refreshToken)) return Results.Unauthorized();

            var tokenHash = RefreshTokenIssuer.Hash(refreshToken);
            var session = await db.PlatformRefreshSessions.SingleOrDefaultAsync(x => x.TokenHash == tokenHash, cancellationToken);
            var now = DateTimeOffset.UtcNow;
            if (session is null || session.RevokedAt is not null || session.ExpiresAt <= now)
            {
                if (cookieTransport) ClearStudioRefreshCookie(context, config, environment);
                return Results.Unauthorized();
            }

            var membership = await db.TenantMemberships.Include(x => x.User).Include(x => x.Tenant)
                .SingleOrDefaultAsync(x => x.UserId == session.UserId && x.TenantId == session.TenantId && x.User.IsActive && x.Tenant.IsActive, cancellationToken);
            if (membership is null)
            {
                session.RevokedAt = now;
                await db.SaveChangesAsync(cancellationToken);
                if (cookieTransport) ClearStudioRefreshCookie(context, config, environment);
                return Results.Unauthorized();
            }

            if (membership.Role == "TenantUser")
                await TenantPermissionDefaults.AddMissingTenantUserBaselineAsync(db, session.TenantId, session.UserId, cancellationToken);

            var absoluteExpiry = session.CreatedAt.AddDays(30);
            if (absoluteExpiry <= now)
            {
                session.RevokedAt = now;
                await db.SaveChangesAsync(cancellationToken);
                if (cookieTransport) ClearStudioRefreshCookie(context, config, environment);
                return Results.Unauthorized();
            }

            session.RevokedAt = now;
            var (newRefreshToken, newSession) = RefreshTokenIssuer.Create(session.UserId, session.TenantId, absoluteExpiry, session.CreatedAt);
            db.PlatformRefreshSessions.Add(newSession);
            var platformRoles = await db.PlatformUserRoles.AsNoTracking().Where(x => x.UserId == session.UserId).Select(x => x.Role).ToListAsync(cancellationToken);
            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, session.UserId.ToString()),
                new Claim("name", membership.User.DisplayName), new Claim("email", membership.User.Email),
                new Claim("tenant_id", session.TenantId.ToString()), new Claim("role", membership.Role)
            }.Concat(platformRoles.Select(role => new Claim("platform_role", role)));
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateConcurrencyException) { return Results.Unauthorized(); }
            var accessToken = TokenIssuer.Issue(claims, config);
            if (cookieTransport)
            {
                context.Response.Cookies.Append(StudioRefreshCookieName, newRefreshToken,
                    CreateStudioRefreshCookieOptions(newSession.ExpiresAt, config, environment));
                context.Response.Headers.CacheControl = "no-store";
                return Results.Ok(new { accessToken });
            }
            return Results.Ok(new { accessToken, refreshToken = newRefreshToken });
        }).RequireRateLimiting("login");
        return auth;
    }

    public static RouteGroupBuilder MapLogoutEndpoint(this RouteGroupBuilder auth)
    {
        auth.MapPost("/logout", async (HttpContext context, RefreshRequest request, PlatformDbContext db,
            IConfiguration config, IHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var cookieTransport = UsesStudioCookieTransport(context.Request);
            if (cookieTransport && !IsAllowedStudioCookieRequest(context.Request, config))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var refreshToken = cookieTransport
                ? request.RefreshToken ?? context.Request.Cookies[StudioRefreshCookieName]
                : request.RefreshToken;
            if (!string.IsNullOrWhiteSpace(refreshToken))
            {
                var hash = RefreshTokenIssuer.Hash(refreshToken);
                var session = await db.PlatformRefreshSessions.SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
                if (session is not null && session.RevokedAt is null)
                {
                    session.RevokedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
            if (cookieTransport) ClearStudioRefreshCookie(context, config, environment);
            context.Response.Headers.CacheControl = "no-store";
            return Results.NoContent();
        }).RequireRateLimiting("login");
        return auth;
    }

    public static RouteGroupBuilder MapSelectTenantEndpoint(this RouteGroupBuilder auth)
    {
        auth.MapPost("/select-tenant", async (SelectTenantRequest request, ClaimsPrincipal principal, PlatformDbContext db,
            HttpContext context, IConfiguration config, IHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var cookieTransport = UsesStudioCookieTransport(context.Request);
            if (cookieTransport && !IsAllowedStudioCookieRequest(context.Request, config))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

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

            if (membership.Role == "TenantUser")
                await TenantPermissionDefaults.AddMissingTenantUserBaselineAsync(db, membership.TenantId, userId, cancellationToken);

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
            var (refreshToken, refreshSession) = RefreshTokenIssuer.Create(userId, membership.TenantId);
            db.PlatformRefreshSessions.Add(refreshSession);
            db.AuditEvents.Add(new AuditEvent
            {
                UserId = userId,
                TenantId = membership.TenantId,
                Action = "tenant.selected",
                Resource = membership.Tenant.Slug
            });
            await db.SaveChangesAsync(cancellationToken);
            if (cookieTransport)
            {
                context.Response.Cookies.Append(StudioRefreshCookieName, refreshToken,
                    CreateStudioRefreshCookieOptions(refreshSession.ExpiresAt, config, environment));
                context.Response.Headers.CacheControl = "no-store";
                return Results.Ok(new
                {
                    accessToken = token,
                    tenant = new TenantSummary(membership.TenantId, membership.Tenant.Name, membership.Tenant.Slug, membership.Role)
                });
            }
            return Results.Ok(new
            {
                accessToken = token,
                refreshToken,
                tenant = new TenantSummary(membership.TenantId, membership.Tenant.Name, membership.Tenant.Slug, membership.Role)
            });
        }).RequireAuthorization();

        return auth;
    }

    private static bool UsesStudioCookieTransport(HttpRequest request) =>
        string.Equals(request.Headers[StudioCookieTransportHeader].ToString(), "cookie", StringComparison.Ordinal);

    private static bool IsAllowedStudioCookieRequest(HttpRequest request, IConfiguration config)
    {
        if (request.Headers[StudioCookieTransportHeader].Count != 1 || request.Headers["Origin"].Count != 1)
            return false;

        var requestOrigin = NormalizeOrigin(request.Headers["Origin"].ToString());
        if (requestOrigin is null) return false;

        var allowedOrigins = config.GetSection("Studio:Origins").Get<string[]>() ??
            [config["Studio:Origin"] ?? "http://localhost:5175"];
        return allowedOrigins.Select(NormalizeOrigin).Any(origin =>
            origin is not null && string.Equals(origin, requestOrigin, StringComparison.OrdinalIgnoreCase));
    }

    private static string? NormalizeOrigin(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var origin) ||
            origin.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(origin.UserInfo) ||
            origin.AbsolutePath != "/" || !string.IsNullOrEmpty(origin.Query) || !string.IsNullOrEmpty(origin.Fragment))
            return null;

        return origin.GetLeftPart(UriPartial.Authority);
    }

    private static CookieOptions CreateStudioRefreshCookieOptions(DateTimeOffset expiresAt, IConfiguration config, IHostEnvironment environment) => new()
    {
        HttpOnly = true,
        Secure = config.GetValue<bool?>("Authentication:StudioRefreshCookieSecure") ?? !environment.IsDevelopment(),
        SameSite = SameSiteMode.Lax,
        Path = "/api/auth",
        Expires = expiresAt
    };

    private static void ClearStudioRefreshCookie(HttpContext context, IConfiguration config, IHostEnvironment environment) =>
        context.Response.Cookies.Delete(StudioRefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = config.GetValue<bool?>("Authentication:StudioRefreshCookieSecure") ?? !environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/api/auth"
        });
}
