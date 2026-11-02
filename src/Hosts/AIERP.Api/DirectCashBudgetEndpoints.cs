using System.Security.Claims;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static partial class DirectCashBudgetEndpoints
{
    private static readonly HashSet<string> Categories = new(StringComparer.OrdinalIgnoreCase)
    { "Sales", "Collections", "Payroll", "Suppliers", "Taxes", "Investment", "Financing", "Operating", "Other" };

    public static void MapDirectCashBudgetEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/finance/cash-budgets").WithTags("Finans · Doğrudan nakit bütçesi").RequireAuthorization();
        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out _)) return Results.Forbid();
            var plans = await db.DirectCashBudgetPlans.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.FiscalYear).ThenBy(x => x.Name)
                .Select(x => new { x.Id, x.Name, x.FiscalYear, x.CurrencyCode, x.Status, x.CreatedAt, x.CreatedByUserId,
                    x.ApprovedByUserId, x.ApprovedAt, x.Revision, LineCount = x.Lines.Count() })
                .ToListAsync(ct);
            return Results.Ok(plans);
        });
        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out _)) return Results.Forbid();
            var plan = await db.DirectCashBudgetPlans.AsNoTracking().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            return plan is null ? Results.NotFound() : Results.Ok(ToView(plan));
        });
        group.MapPost("/", async (DirectCashBudgetWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var invalid = Validate(request);
            if (invalid is not null) return Results.BadRequest(new { error = invalid });
            var plan = new DirectCashBudgetPlan { TenantId = tenantId, Name = request.Name.Trim(), FiscalYear = request.FiscalYear,
                CurrencyCode = request.CurrencyCode.ToUpperInvariant(), CreatedByUserId = userId };
            plan.Lines = MakeLines(tenantId, plan.Id, request.Lines);
            db.DirectCashBudgetPlans.Add(plan);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.cash-budget.created", Resource = $"{plan.Id}:{plan.FiscalYear}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/finance/cash-budgets/{plan.Id}", ToView(plan));
        });
        group.MapPut("/{id:guid}", async (Guid id, DirectCashBudgetWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var invalid = Validate(request);
            if (invalid is not null) return Results.BadRequest(new { error = invalid });
            var plan = await db.DirectCashBudgetPlans.Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (plan is null) return Results.NotFound();
            if (plan.Status != DirectCashBudgetPlanStatus.Draft) return Results.Conflict(new { error = "Onaylanmış doğrudan nakit bütçesi değiştirilemez; yeni bir taslak oluşturun." });
            if (request.Revision != plan.Revision) return Results.Conflict(new { error = "Bütçe başka bir kullanıcı tarafından değiştirildi. Güncel sürümü yükleyin.", revision = plan.Revision });
            plan.Name = request.Name.Trim(); plan.FiscalYear = request.FiscalYear; plan.CurrencyCode = request.CurrencyCode.ToUpperInvariant();
            plan.Revision++;
            var pending = request.Lines.ToDictionary(x => (x.PeriodStart, Direction: Enum.Parse<DirectCashBudgetDirection>(x.Direction, true), Category: x.Category.Trim().ToUpperInvariant()));
            foreach (var existing in plan.Lines.ToList())
            {
                if (!pending.Remove((existing.PeriodStart, existing.Direction, existing.Category.ToUpperInvariant()), out var replacement))
                    db.DirectCashBudgetLines.Remove(existing);
                else
                {
                    existing.Description = replacement.Description.Trim();
                    existing.Amount = decimal.Round(replacement.Amount, 2);
                }
            }
            foreach (var line in pending.Values)
                db.DirectCashBudgetLines.Add(MakeLine(tenantId, plan.Id, line));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.cash-budget.updated", Resource = $"{plan.Id}:revision-{plan.Revision}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Bütçe eşzamanlı olarak değiştirildi. Güncel sürümü yükleyin." }); }
            return Results.Ok(ToView(plan));
        });
        group.MapPost("/{id:guid}/approve", async (Guid id, DirectCashBudgetApprovalRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var plan = await db.DirectCashBudgetPlans.Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (plan is null) return Results.NotFound();
            if (plan.Status != DirectCashBudgetPlanStatus.Draft) return Results.Conflict(new { error = "Bütçe zaten onaylanmış." });
            if (plan.Lines.Count == 0) return Results.BadRequest(new { error = "Boş bütçe onaylanamaz." });
            if (plan.CreatedByUserId == userId) return Results.Conflict(new { error = "Görevler ayrılığı için bütçeyi oluşturan kişi onaylayamaz." });
            if (request.Revision != plan.Revision) return Results.Conflict(new { error = "Bütçe başka bir kullanıcı tarafından değiştirildi. Güncel sürümü yükleyin.", revision = plan.Revision });
            if (await db.DirectCashBudgetPlans.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.FiscalYear == plan.FiscalYear &&
                x.CurrencyCode == plan.CurrencyCode && x.Status == DirectCashBudgetPlanStatus.Approved, ct))
                return Results.Conflict(new { error = "Bu mali yıl ve para birimi için onaylanmış bir doğrudan nakit bütçesi zaten var. Yeni taslağı onaylamadan önce mevcut planı kullanın." });
            plan.Status = DirectCashBudgetPlanStatus.Approved; plan.ApprovedByUserId = userId;
            plan.ApprovedAt = DateTimeOffset.UtcNow; plan.Revision++;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.cash-budget.approved", Resource = $"{plan.Id}:{plan.FiscalYear}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Bütçe eşzamanlı olarak değiştirildi. Güncel sürümü yükleyin." }); }
            catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException sql && sql.Number is 2601 or 2627)
            { return Results.Conflict(new { error = "Bu mali yıl ve para birimi için başka bir doğrudan nakit bütçesi eşzamanlı olarak onaylandı." }); }
            return Results.Ok(ToView(plan));
        });
    }

    private static DirectCashBudgetPlanView ToView(DirectCashBudgetPlan plan) => new(plan.Id, plan.Name, plan.FiscalYear,
        plan.CurrencyCode, plan.Status.ToString(), plan.CreatedAt, plan.CreatedByUserId, plan.ApprovedByUserId, plan.ApprovedAt,
        plan.Revision, plan.Lines.OrderBy(x => x.PeriodStart).ThenBy(x => x.Category).ThenBy(x => x.Description)
            .Select(x => new DirectCashBudgetLineView(x.Id, x.PeriodStart, x.Direction.ToString(), x.Category, x.Description, x.Amount)).ToList());

    private static ICollection<DirectCashBudgetLine> MakeLines(Guid tenantId, Guid planId, IReadOnlyList<DirectCashBudgetLineWriteRequest> lines) =>
        lines.Select(x => MakeLine(tenantId, planId, x)).ToList();

    private static DirectCashBudgetLine MakeLine(Guid tenantId, Guid planId, DirectCashBudgetLineWriteRequest x) =>
        new() { TenantId = tenantId, PlanId = planId, PeriodStart = x.PeriodStart,
            Direction = Enum.Parse<DirectCashBudgetDirection>(x.Direction, true), Category = x.Category.Trim(),
            Description = x.Description.Trim(), Amount = decimal.Round(x.Amount, 2) };

    private static string? Validate(DirectCashBudgetWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120) return "Bütçe adı 1–120 karakter olmalıdır.";
        if (request.FiscalYear is < 2000 or > 2100) return "Mali yıl 2000–2100 arasında olmalıdır.";
        if (!CurrencyRegex().IsMatch(request.CurrencyCode ?? "")) return "Para birimi üç harfli ISO kodu olmalıdır.";
        if (request.Lines is null || request.Lines.Count is < 1 or > 1200) return "Bütçe 1–1200 satır içermelidir.";
        if (request.Lines.GroupBy(x => (x.PeriodStart, x.Direction.ToUpperInvariant(), x.Category.Trim().ToUpperInvariant())).Any(x => x.Count() > 1))
            return "Aynı ay, yön ve kategori için yinelenen doğrudan nakit bütçesi satırı var.";
        if (request.Lines.Any(x => x.PeriodStart.Year != request.FiscalYear || x.PeriodStart.Day != 1 ||
            x.Amount < 0 || x.Amount > 9999999999999999m || string.IsNullOrWhiteSpace(x.Description) || x.Description.Trim().Length > 240 ||
            string.IsNullOrWhiteSpace(x.Category) || x.Category.Trim().Length > 40 || !Categories.Contains(x.Category) ||
            !Enum.TryParse<DirectCashBudgetDirection>(x.Direction, true, out _) ||
            !string.Equals(x.Direction, "Inflow", StringComparison.OrdinalIgnoreCase) && !string.Equals(x.Direction, "Outflow", StringComparison.OrdinalIgnoreCase)))
            return "Satırlar mali yıla ait ayın ilk günü, geçerli giriş/çıkış türü ve kategori içermeli; tutar negatif olamaz, açıklama en çok 240 karakter olmalıdır.";
        return null;
    }

    private static bool TryContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }
    private static bool TryAdminContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId) =>
        TryContext(user, out tenantId, out userId) && user.FindFirstValue("role") == "TenantAdmin";

    [GeneratedRegex("^[A-Z]{3}$", RegexOptions.CultureInvariant)]
    private static partial Regex CurrencyRegex();
}

public sealed record DirectCashBudgetWriteRequest(string Name, int FiscalYear, string CurrencyCode,
    IReadOnlyList<DirectCashBudgetLineWriteRequest> Lines, int Revision = 0);
public sealed record DirectCashBudgetLineWriteRequest(DateOnly PeriodStart, string Direction, string Category, string Description, decimal Amount);
public sealed record DirectCashBudgetApprovalRequest(int Revision);
public sealed record DirectCashBudgetPlanView(Guid Id, string Name, int FiscalYear, string CurrencyCode, string Status,
    DateTimeOffset CreatedAt, Guid CreatedByUserId, Guid? ApprovedByUserId, DateTimeOffset? ApprovedAt, int Revision,
    IReadOnlyList<DirectCashBudgetLineView> Lines);
public sealed record DirectCashBudgetLineView(Guid Id, DateOnly PeriodStart, string Direction, string Category, string Description, decimal Amount);
