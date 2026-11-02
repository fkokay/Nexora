using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class CrmAssistantEndpoints
{
    public static void MapCrmAssistantEndpoints(this WebApplication app)
    {
        app.MapGet("/api/crm/assistant-opportunities", async (string term, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            var search = term.Trim();
            if (search.Length is < 2 or > 100) return Results.BadRequest(new { error = "Arama terimi 2–100 karakter olmalıdır." });
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId) ||
                !Guid.TryParse(user.FindFirstValue("sub"), out var userId) ||
                user.FindFirstValue("role") is not { Length: > 0 } role)
                return Results.Forbid();

            const string sourcePath = "/api/crm/opportunities";
            if (!PlatformPermissionCatalog.TryResolve(sourcePath, "GET", sourcePath, new Dictionary<string, string?>(),
                    tenantId, userId, role, out var permission) || permission is null ||
                permission.Permission.Code != "erp.crm-opportunities.read" ||
                !await authorizer.IsAllowedAsync(tenantId, userId, role, permission, ct))
                return Results.Forbid();

            var query = db.CrmOpportunities.AsNoTracking().Where(x => x.TenantId == tenantId &&
                (x.Code.Contains(search) || x.Name.Contains(search)));
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Code).Take(10)
                .Select(x => new CrmAssistantOpportunityView(x.Code, x.Name, x.Stage.ToString(), x.EstimatedValue,
                    x.CurrencyCode, x.ProbabilityPercent, x.ExpectedCloseDate))
                .ToListAsync(ct);
            return Results.Ok(new { total, items });
        }).RequireAuthorization().WithTags("CRM Fırsatları");
    }
}

public sealed record CrmAssistantOpportunityView(string Code, string Name, string Stage, decimal? EstimatedValue,
    string CurrencyCode, int ProbabilityPercent, DateOnly? ExpectedCloseDate);
