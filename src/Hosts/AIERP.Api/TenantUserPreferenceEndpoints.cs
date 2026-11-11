using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class TenantUserPreferenceEndpoints
{
    private const string WorkspaceRailKey = "workspace-rail";
    private static readonly string[] AllowedPages =
    [
        "dashboard", "customers", "customer-create", "inventory", "sales",
        "purchasing", "finance", "warehouse", "manufacturing", "reports", "modules"
    ];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapTenantUserPreferenceEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/user-preferences").RequireAuthorization();
        group.MapGet("/workspace-rail", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var saved = await db.TenantUserPreferences.AsNoTracking().SingleOrDefaultAsync(
                x => x.TenantId == tenantId && x.UserId == userId && x.PreferenceKey == WorkspaceRailKey, ct);
            var preference = saved is null
                ? new WorkspaceRailPreference(AllowedPages, [])
                : JsonSerializer.Deserialize<WorkspaceRailPreference>(saved.ValueJson, JsonOptions)
                    ?? new WorkspaceRailPreference(AllowedPages, []);
            return Results.Ok(new { revision = saved?.Revision ?? 0, preference.OrderedPageIds, preference.HiddenPageIds });
        });
        group.MapPut("/workspace-rail", async (WorkspaceRailUpdate request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (request.OrderedPageIds is null || request.HiddenPageIds is null ||
                request.OrderedPageIds.Concat(request.HiddenPageIds).Any(x => !AllowedPages.Contains(x, StringComparer.Ordinal)) ||
                request.OrderedPageIds.Intersect(request.HiddenPageIds, StringComparer.Ordinal).Any() ||
                request.OrderedPageIds.Concat(request.HiddenPageIds).Distinct(StringComparer.Ordinal).Count() != AllowedPages.Length ||
                request.OrderedPageIds.Count == 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["preference"] = ["Menü sırası ve gizli öğeler geçerli ve birbirinden farklı olmalıdır."]
                });

            var saved = await db.TenantUserPreferences.SingleOrDefaultAsync(
                x => x.TenantId == tenantId && x.UserId == userId && x.PreferenceKey == WorkspaceRailKey, ct);
            if ((saved?.Revision ?? 0) != request.ExpectedRevision)
                return Results.Conflict(new { error = "Menü tercihleri başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." });
            if (saved is null)
            {
                saved = new TenantUserPreference { TenantId = tenantId, UserId = userId, PreferenceKey = WorkspaceRailKey };
                db.TenantUserPreferences.Add(saved);
            }
            saved.ValueJson = JsonSerializer.Serialize(new WorkspaceRailPreference(request.OrderedPageIds, request.HiddenPageIds), JsonOptions);
            saved.Revision++;
            saved.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.workspace-rail.updated", Resource = $"revision={saved.Revision}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Menü tercihleri eşzamanlı değişti. Sayfayı yenileyip tekrar deneyin." }); }
            catch (DbUpdateException) when (request.ExpectedRevision == 0) { return Results.Conflict(new { error = "Menü tercihi eşzamanlı kaydedildi. Sayfayı yenileyip tekrar deneyin." }); }
            return Results.Ok(new { revision = saved.Revision });
        });
    }

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var tenantValid = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var userClaim = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
        var userValid = Guid.TryParse(userClaim, out userId);
        return tenantValid && userValid;
    }

    public sealed record WorkspaceRailPreference(IReadOnlyList<string> OrderedPageIds, IReadOnlyList<string> HiddenPageIds);
    public sealed record WorkspaceRailUpdate(int ExpectedRevision, IReadOnlyList<string>? OrderedPageIds, IReadOnlyList<string>? HiddenPageIds);
}
