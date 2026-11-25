using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;

namespace AIERP.AIService;

public static class StudioDeveloperGuard
{
    private static readonly PathString[] DeveloperPrefixes = ["/studio/projects", "/studio/workspace-requests"];
    private static readonly PathString[] MemberPrefixes = ["/studio/requests", "/studio/capabilities"];

    /// <summary>
    /// Enforces the Studio work role server-side (resolved from the database, never the token).
    /// Code and workspace endpoints need the Developer role (or a tenant admin); request and capability endpoints
    /// only need any Studio access. Tokens without a <c>role</c> claim (service tokens) are not user tokens and pass through.
    /// </summary>
    public static IApplicationBuilder UseStudioDeveloperGuard(this IApplicationBuilder app) => app.Use(async (context, next) =>
    {
        var developerOnly = DeveloperPrefixes.Any(x => context.Request.Path.StartsWithSegments(x, StringComparison.OrdinalIgnoreCase));
        var memberOnly = !developerOnly && MemberPrefixes.Any(x => context.Request.Path.StartsWithSegments(x, StringComparison.OrdinalIgnoreCase));
        var user = context.User;
        if ((!developerOnly && !memberOnly) || user.Identity?.IsAuthenticated != true || user.FindFirst("role") is null)
        {
            await next();
            return;
        }
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId) || !Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
        {
            await next();
            return;
        }
        var access = await StudioAccessLookup.ForUserAsync(context.RequestServices.GetRequiredService<PlatformDbContext>(),
            context.RequestServices.GetRequiredService<AIStudioDbContext>(), tenantId, userId, context.RequestAborted);
        if (developerOnly && (access is null || !access.CanWriteCode))
        {
            await Deny(context, "studio.role.developer_required", "Bu işlem için Yazılımcı rolü gerekir.");
            return;
        }
        if (memberOnly && (access is null || (!access.IsAdmin && access.WorkRole == StudioRoles.None)))
        {
            await Deny(context, "studio.role.none", "Studio'ya erişiminiz yok.");
            return;
        }
        await next();
    });

    private static Task Deny(HttpContext context, string code, string error)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return context.Response.WriteAsJsonAsync(new { code, error });
    }
}
