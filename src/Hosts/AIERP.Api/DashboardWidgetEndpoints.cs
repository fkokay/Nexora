using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class DashboardWidgetEndpoints
{
    private const int MaxWidgets = 12;

    public static void MapDashboardWidgetEndpoints(this WebApplication app)
    {
        var widgets = app.MapGroup("/api/dashboard/widgets").WithTags("Tenant Dashboard").RequireAuthorization();

        widgets.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out _, out _)) return Results.Forbid();
            var result = await (from widget in db.TenantDashboardWidgets.AsNoTracking().Where(x => x.TenantId == tenantId)
                                join report in db.TenantSavedReports.AsNoTracking().Where(x => x.TenantId == tenantId)
                                    on new { widget.TenantId, Id = widget.SavedReportId } equals new { report.TenantId, report.Id }
                                orderby widget.Position, widget.CreatedAt
                                select new DashboardWidgetView(widget.Id, widget.SavedReportId, report.Name, report.Source, widget.Position, widget.CreatedAt))
                .Take(MaxWidgets).ToListAsync(ct);
            return Results.Ok(result);
        });

        widgets.MapPost("/", async (AddDashboardWidgetRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (request.SavedReportId == Guid.Empty) return Results.ValidationProblem(new Dictionary<string, string[]> { ["savedReportId"] = ["Kayıtlı rapor seçilmelidir."] });
            var report = await db.TenantSavedReports.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SavedReportId, ct);
            if (report is null) return Results.NotFound();
            if (await db.TenantDashboardWidgets.AnyAsync(x => x.TenantId == tenantId && x.SavedReportId == report.Id, ct))
                return Results.Conflict(new { error = "Bu rapor dashboard'a zaten eklenmiş." });
            var current = await db.TenantDashboardWidgets.CountAsync(x => x.TenantId == tenantId, ct);
            if (current >= MaxWidgets) return Results.Problem($"Dashboard en fazla {MaxWidgets} widget destekler.", statusCode: StatusCodes.Status422UnprocessableEntity);

            var widget = new TenantDashboardWidget
            {
                TenantId = tenantId, SavedReportId = report.Id, Position = current, CreatedByUserId = userId, CreatedAt = DateTimeOffset.UtcNow
            };
            db.TenantDashboardWidgets.Add(widget);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.dashboard.widget.added", Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/dashboard/widgets/{widget.Id}", ToView(widget, report));
        });

        widgets.MapPut("/order", async (ReorderDashboardWidgetsRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (request.WidgetIds is null || request.WidgetIds.Count > MaxWidgets || request.WidgetIds.Distinct().Count() != request.WidgetIds.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["widgetIds"] = ["Sıralama benzersiz ve en fazla 12 widget içermelidir."] });
            var tenantWidgets = await db.TenantDashboardWidgets.Where(x => x.TenantId == tenantId).ToListAsync(ct);
            if (tenantWidgets.Count != request.WidgetIds.Count || tenantWidgets.Any(widget => !request.WidgetIds.Contains(widget.Id)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["widgetIds"] = ["Sıralama tenant'ın tüm dashboard widget'larını içermelidir."] });

            var byId = tenantWidgets.ToDictionary(x => x.Id);
            for (var index = 0; index < request.WidgetIds.Count; index++) byId[request.WidgetIds[index]].Position = index;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.dashboard.widgets.reordered", Resource = tenantWidgets.Count.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            await db.SaveChangesAsync(ct);
            return Results.Ok(request.WidgetIds);
        });

        widgets.MapDelete("/{widgetId:guid}", async (Guid widgetId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var widget = await db.TenantDashboardWidgets.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == widgetId, ct);
            if (widget is null) return Results.NotFound();
            var report = await db.TenantSavedReports.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == widget.SavedReportId)
                .Select(x => x.Name).SingleOrDefaultAsync(ct) ?? "saved-report";
            db.TenantDashboardWidgets.Remove(widget);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.dashboard.widget.removed", Resource = report });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    private static DashboardWidgetView ToView(TenantDashboardWidget widget, TenantSavedReport report) =>
        new(widget.Id, report.Id, report.Name, report.Source, widget.Position, widget.CreatedAt);

    private static bool TryTenant(ClaimsPrincipal principal, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = default;
        userId = default;
        role = principal.FindFirstValue("role") ?? "";
        return Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId)
            && Guid.TryParse(principal.FindFirstValue("sub"), out userId)
            && !string.IsNullOrWhiteSpace(role);
    }
}

public sealed record DashboardWidgetView(Guid Id, Guid SavedReportId, string Name, string Source, int Position, DateTimeOffset CreatedAt);
public sealed record AddDashboardWidgetRequest(Guid SavedReportId);
public sealed record ReorderDashboardWidgetsRequest(IReadOnlyList<Guid>? WidgetIds);
