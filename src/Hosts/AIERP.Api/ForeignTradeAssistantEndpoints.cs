using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class ForeignTradeAssistantEndpoints
{
    public static void MapForeignTradeAssistantEndpoints(this WebApplication app)
    {
        app.MapGet("/api/foreign-trade/assistant-cases", async (string term, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            var search = term.Trim();
            if (search.Length is < 2 or > 100) return Results.BadRequest(new { error = "Arama terimi 2–100 karakter olmalıdır." });
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId) ||
                !Guid.TryParse(user.FindFirstValue("sub"), out var userId) ||
                user.FindFirstValue("role") is not { Length: > 0 } role)
                return Results.Forbid();

            const string path = "/api/foreign-trade/assistant-cases";
            if (!PlatformPermissionCatalog.TryResolve(path, "GET", path, new Dictionary<string, string?>(),
                    tenantId, userId, role, out var permission) || permission is null ||
                permission.Permission.Code != "erp.foreign-trade.read" ||
                !await authorizer.IsAllowedAsync(tenantId, userId, role, permission, ct))
                return Results.Forbid();

            var query = db.Set<ForeignTradeCase>().AsNoTracking().Where(x => x.TenantId == tenantId &&
                (x.ReferenceCode.Contains(search) || x.OriginCountryCode.Contains(search) || x.DestinationCountryCode.Contains(search) ||
                 (x.IncotermsCode != null && x.IncotermsCode.Contains(search)) || x.TransportMode.Contains(search)));
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.ReferenceCode).Take(10)
                .Select(x => new ForeignTradeAssistantCaseView(x.Direction.ToString(), x.Status.ToString(), x.ReferenceCode,
                    x.OriginCountryCode, x.DestinationCountryCode, x.IncotermsCode, x.TransportMode,
                    x.PlannedShipDate, x.ActualShipDate, x.PlannedArrivalDate, x.ActualArrivalDate))
                .ToListAsync(ct);
            return Results.Ok(new { total, items });
        }).RequireAuthorization().WithTags("Dış Ticaret");
    }
}

public sealed record ForeignTradeAssistantCaseView(string Direction, string Status, string ReferenceCode,
    string OriginCountryCode, string DestinationCountryCode, string? IncotermsCode, string TransportMode,
    DateOnly? PlannedShipDate, DateOnly? ActualShipDate, DateOnly? PlannedArrivalDate, DateOnly? ActualArrivalDate);
