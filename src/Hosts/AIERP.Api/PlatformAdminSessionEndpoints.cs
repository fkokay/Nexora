using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

/// <summary>
/// Tenantless cookie session lifecycle for platform super administrators.
/// This deliberately uses its own cookie and refresh-session table; tenant selection,
/// tenant refresh and tenant logout continue to use TenantSelectionEndpoints.
/// </summary>
public static class PlatformAdminSessionEndpoints
{
    private const string CookieName = "aierp.platform.refresh";
    private const string TransportHeader = "X-Platform-Session";
    private const string SessionKind = "platform-admin";
    private static readonly TimeSpan RefreshLifetime = TimeSpan.FromDays(14);
    private static readonly TimeSpan AbsoluteLifetime = TimeSpan.FromDays(30);

    public static RouteGroupBuilder MapPlatformAdminSessionEndpoints(this RouteGroupBuilder auth)
    {
        var platform = auth.MapGroup("/platform").WithTags("Platform authentication");

        platform.MapPost("/select", async (HttpContext context, ClaimsPrincipal principal, PlatformDbContext db,
            IConfiguration config, IHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            if (!IsAllowedCookieRequest(context.Request, config))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            if (principal.FindFirstValue("session") != "tenant-selection" ||
                !Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Results.Unauthorized();

            var user = await db.Users.AsNoTracking()
                .Where(x => x.Id == userId && x.IsActive)
                .Select(x => new PlatformAdminSessionUser(x.Id, x.Email, x.DisplayName))
                .SingleOrDefaultAsync(cancellationToken);
            if (user is null) return Results.Unauthorized();
            var isSuperAdmin = await db.PlatformUserRoles.AsNoTracking()
                .AnyAsync(x => x.UserId == userId && x.Role == "PlatformSuperAdmin", cancellationToken);
            if (!isSuperAdmin)
            {
                db.AuditEvents.Add(new AuditEvent
                {
                    UserId = userId,
                    Action = "auth.platform-session.selection-rejected",
                    Resource = "platform-super-admin-role-required"
                });
                await db.SaveChangesAsync(cancellationToken);
                return Results.Forbid();
            }

            var (refreshToken, session) = CreateSession(userId);
            db.PlatformAdminRefreshSessions.Add(session);
            db.AuditEvents.Add(new AuditEvent
            {
                UserId = userId,
                Action = "auth.platform-session.selected",
                Resource = "platform-super-admin"
            });
            await db.SaveChangesAsync(cancellationToken);

            context.Response.Cookies.Append(CookieName, refreshToken, CookieOptions(session.ExpiresAt, config, environment));
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { accessToken = CreateAccessToken(user!, session.Id, config) });
        }).RequireAuthorization().RequireRateLimiting("login");

        platform.MapPost("/refresh", async (HttpContext context, PlatformDbContext db,
            IConfiguration config, IHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            if (!IsAllowedCookieRequest(context.Request, config))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var refreshToken = context.Request.Cookies[CookieName];
            if (string.IsNullOrWhiteSpace(refreshToken)) return Results.Unauthorized();

            var now = DateTimeOffset.UtcNow;
            var hash = RefreshTokenIssuer.Hash(refreshToken);
            var session = await db.PlatformAdminRefreshSessions.SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
            if (session is null)
            {
                ClearCookie(context, config, environment);
                return Results.Unauthorized();
            }

            if (session.RevokedAt is not null)
            {
                // A rotated token presented again is a replay signal. This model has no
                // session-family column, so revoke all active platform sessions for the
                // account rather than leave a potentially stolen parallel session alive.
                var activeSessions = await db.PlatformAdminRefreshSessions
                    .Where(x => x.UserId == session.UserId && x.RevokedAt == null)
                    .ToListAsync(cancellationToken);
                foreach (var activeSession in activeSessions) activeSession.RevokedAt = now;
                db.AuditEvents.Add(new AuditEvent
                {
                    UserId = session.UserId,
                    Action = "auth.platform-session.refresh-replay",
                    Resource = "active-platform-sessions-revoked"
                });
                try { await db.SaveChangesAsync(cancellationToken); }
                catch (DbUpdateConcurrencyException) { /* Another replay already revoked the account sessions. */ }
                ClearCookie(context, config, environment);
                return Results.Unauthorized();
            }

            var user = await db.Users.AsNoTracking()
                .Where(x => x.Id == session.UserId && x.IsActive)
                .Select(x => new PlatformAdminSessionUser(x.Id, x.Email, x.DisplayName))
                .SingleOrDefaultAsync(cancellationToken);
            var isSuperAdmin = user is not null && await db.PlatformUserRoles.AsNoTracking()
                .AnyAsync(x => x.UserId == session.UserId && x.Role == "PlatformSuperAdmin", cancellationToken);
            var absoluteExpiry = session.CreatedAt.Add(AbsoluteLifetime);
            if (session.ExpiresAt <= now || absoluteExpiry <= now || !isSuperAdmin)
            {
                session.RevokedAt = now;
                db.AuditEvents.Add(new AuditEvent
                {
                    UserId = session.UserId,
                    Action = "auth.platform-session.refresh-rejected",
                    Resource = !isSuperAdmin ? "platform-super-admin-role-required" : "session-expired"
                });
                try { await db.SaveChangesAsync(cancellationToken); }
                catch (DbUpdateConcurrencyException) { /* A concurrent refresh already consumed this token. */ }
                ClearCookie(context, config, environment);
                return Results.Unauthorized();
            }

            session.RevokedAt = now;
            var (nextRefreshToken, nextSession) = CreateSession(session.UserId, absoluteExpiry, session.CreatedAt);
            db.PlatformAdminRefreshSessions.Add(nextSession);
            db.AuditEvents.Add(new AuditEvent
            {
                UserId = session.UserId,
                Action = "auth.platform-session.refreshed",
                Resource = "platform-super-admin"
            });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                ClearCookie(context, config, environment);
                return Results.Unauthorized();
            }

            context.Response.Cookies.Append(CookieName, nextRefreshToken, CookieOptions(nextSession.ExpiresAt, config, environment));
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { accessToken = CreateAccessToken(user!, nextSession.Id, config) });
        }).RequireRateLimiting("login");

        platform.MapPost("/logout", async (HttpContext context, PlatformDbContext db,
            IConfiguration config, IHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            if (!IsAllowedCookieRequest(context.Request, config))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var refreshToken = context.Request.Cookies[CookieName];
            if (!string.IsNullOrWhiteSpace(refreshToken))
            {
                var hash = RefreshTokenIssuer.Hash(refreshToken);
                var session = await db.PlatformAdminRefreshSessions.SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
                if (session is not null && session.RevokedAt is null)
                {
                    session.RevokedAt = DateTimeOffset.UtcNow;
                    db.AuditEvents.Add(new AuditEvent
                    {
                        UserId = session.UserId,
                        Action = "auth.platform-session.logout",
                        Resource = "platform-super-admin"
                    });
                    try { await db.SaveChangesAsync(cancellationToken); }
                    catch (DbUpdateConcurrencyException) { /* Concurrent refresh/logout already revoked this token. */ }
                }
            }

            ClearCookie(context, config, environment);
            context.Response.Headers.CacheControl = "no-store";
            return Results.NoContent();
        }).RequireRateLimiting("login");

        return auth;
    }

    private static (string Token, PlatformAdminRefreshSession Session) CreateSession(
        Guid userId, DateTimeOffset? absoluteExpiry = null, DateTimeOffset? createdAt = null)
    {
        var token = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48));
        var now = DateTimeOffset.UtcNow;
        var created = createdAt ?? now;
        var expiry = now.Add(RefreshLifetime);
        if (absoluteExpiry is { } limit && limit < expiry) expiry = limit;
        return (token, new PlatformAdminRefreshSession
        {
            UserId = userId,
            TokenHash = RefreshTokenIssuer.Hash(token),
            CreatedAt = created,
            ExpiresAt = expiry
        });
    }

    private static string CreateAccessToken(PlatformAdminSessionUser user, Guid sessionId, IConfiguration config) => TokenIssuer.Issue(
    [
        new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
        new Claim("name", user.DisplayName),
        new Claim("email", user.Email),
        new Claim("session", SessionKind),
        new Claim("platform_role", "PlatformSuperAdmin"),
        new Claim("platform_session_id", sessionId.ToString())
    ], config);

    private sealed record PlatformAdminSessionUser(Guid Id, string Email, string DisplayName);

    private static bool IsAllowedCookieRequest(HttpRequest request, IConfiguration config)
    {
        if (request.Headers[TransportHeader].Count != 1 ||
            !string.Equals(request.Headers[TransportHeader].ToString(), "cookie", StringComparison.Ordinal) ||
            request.Headers["Origin"].Count != 1)
            return false;

        var requestOrigin = NormalizeOrigin(request.Headers["Origin"].ToString());
        if (requestOrigin is null) return false;
        var allowedOrigins = config.GetSection("Frontend:Origins").Get<string[]>() ??
            [config["Frontend:Origin"] ?? "http://localhost:5173"];
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

    private static CookieOptions CookieOptions(DateTimeOffset expiresAt, IConfiguration config, IHostEnvironment environment) => new()
    {
        HttpOnly = true,
        Secure = config.GetValue<bool?>("Authentication:PlatformRefreshCookieSecure") ?? !environment.IsDevelopment(),
        SameSite = SameSiteMode.Lax,
        Path = "/api/auth/platform",
        Expires = expiresAt
    };

    private static void ClearCookie(HttpContext context, IConfiguration config, IHostEnvironment environment) =>
        context.Response.Cookies.Delete(CookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = config.GetValue<bool?>("Authentication:PlatformRefreshCookieSecure") ?? !environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/api/auth/platform"
        });
}
