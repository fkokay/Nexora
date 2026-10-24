using System.Security.Claims;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static partial class TenantBudgetEndpoints
{
    public static void MapTenantBudgetEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/finance/budgets").WithTags("Finans · Bütçe").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out _)) return Results.Forbid();
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync(ct);
            var plans = await db.TenantBudgetPlans.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.FiscalYear).ThenBy(x => x.Name)
                .Select(x => new { x.Id, x.Name, x.FiscalYear, x.CurrencyCode, x.Status, x.CreatedAt, x.CreatedByUserId,
                    x.ApprovedByUserId, x.ApprovedAt, x.Revision, Lines = x.Lines.Count(), Planned = x.Lines.Sum(l => (decimal?)l.PlannedAmount) ?? 0 })
                .ToListAsync(ct);
            var result = new List<TenantBudgetPlanSummary>(plans.Count);
            foreach (var plan in plans)
            {
                var actual = await Actuals(db, tenantId, plan.Id, plan.FiscalYear, ct);
                result.Add(new TenantBudgetPlanSummary(plan.Id, plan.Name, plan.FiscalYear, plan.CurrencyCode, baseCurrency, plan.Status,
                    plan.Lines, plan.Planned, actual.Values.Sum(), plan.CreatedAt, plan.CreatedByUserId,
                    plan.ApprovedByUserId, plan.ApprovedAt, plan.Revision));
            }
            return Results.Ok(result);
        });

        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out _)) return Results.Forbid();
            var plan = await db.TenantBudgetPlans.AsNoTracking().Include(x => x.Lines).ThenInclude(x => x.Account)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            return plan is null ? Results.NotFound() : Results.Ok(await ToView(db, plan, ct));
        });

        group.MapPost("/", async (TenantBudgetPlanWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var invalid = Validate(request);
            if (invalid is not null) return Results.BadRequest(new { error = invalid });
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(ct);
            if (baseCurrency is null) return Results.NotFound();
            if (!string.Equals(request.CurrencyCode, baseCurrency, StringComparison.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Bütçe para birimi firmanın baz para birimi ({baseCurrency}) olmalıdır; döviz çevrimi uygulanmaz."] });
            var accounts = await ValidateAccounts(db, tenantId, request.Lines, ct);
            if (accounts is not null) return Results.BadRequest(new { error = accounts });
            var plan = new TenantBudgetPlan { TenantId = tenantId, Name = request.Name.Trim(), FiscalYear = request.FiscalYear,
                CurrencyCode = request.CurrencyCode.ToUpperInvariant(), CreatedByUserId = userId };
            plan.Lines = MakeLines(tenantId, plan.Id, request.Lines);
            db.TenantBudgetPlans.Add(plan);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.budget.created", Resource = $"{plan.Id}:{plan.FiscalYear}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/finance/budgets/{plan.Id}", await ToView(db, plan, ct));
        });

        group.MapPut("/{id:guid}", async (Guid id, TenantBudgetPlanWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var invalid = Validate(request);
            if (invalid is not null) return Results.BadRequest(new { error = invalid });
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(ct);
            if (baseCurrency is null) return Results.NotFound();
            if (!string.Equals(request.CurrencyCode, baseCurrency, StringComparison.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Bütçe para birimi firmanın baz para birimi ({baseCurrency}) olmalıdır; döviz çevrimi uygulanmaz."] });
            var plan = await db.TenantBudgetPlans.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (plan is null) return Results.NotFound();
            if (plan.Status != TenantBudgetPlanStatus.Draft) return Results.Conflict(new { error = "Onaylanmış bütçe değiştirilemez; yeni bir taslak oluşturun." });
            if (request.Revision != plan.Revision) return Results.Conflict(new { error = "Bütçe başka bir kullanıcı tarafından değiştirildi. Güncel sürümü yükleyin.", revision = plan.Revision });
            var accounts = await ValidateAccounts(db, tenantId, request.Lines, ct);
            if (accounts is not null) return Results.BadRequest(new { error = accounts });
            plan.Name = request.Name.Trim(); plan.FiscalYear = request.FiscalYear; plan.CurrencyCode = request.CurrencyCode.ToUpperInvariant();
            plan.Revision++;
            var requestedByKey = request.Lines.ToDictionary(x => (x.AccountId, x.PeriodStart));
            foreach (var existing in plan.Lines.ToList())
            {
                if (!requestedByKey.Remove((existing.AccountId, existing.PeriodStart), out var updatedLine))
                    db.TenantBudgetLines.Remove(existing);
                else
                {
                    existing.PlannedAmount = decimal.Round(updatedLine.PlannedAmount, 2);
                    existing.Notes = updatedLine.Notes?.Trim();
                }
            }
            foreach (var line in requestedByKey.Values)
                db.TenantBudgetLines.Add(new TenantBudgetLine { TenantId = tenantId, BudgetPlanId = plan.Id, AccountId = line.AccountId,
                    PeriodStart = line.PeriodStart, PlannedAmount = decimal.Round(line.PlannedAmount, 2), Notes = line.Notes?.Trim() });
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.budget.updated", Resource = $"{plan.Id}:revision-{plan.Revision}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ToView(db, plan, ct));
        });

        group.MapPost("/{id:guid}/approve", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenantId, out var userId)) return Results.Forbid();
            var plan = await db.TenantBudgetPlans.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (plan is null) return Results.NotFound();
            if (plan.Status != TenantBudgetPlanStatus.Draft) return Results.Conflict(new { error = "Bütçe zaten onaylanmış." });
            if (plan.Lines.Count == 0) return Results.BadRequest(new { error = "Boş bütçe onaylanamaz." });
            if (plan.CreatedByUserId == userId) return Results.Conflict(new { error = "Görevler ayrılığı için bütçeyi oluşturan kişi onaylayamaz." });
            plan.Status = TenantBudgetPlanStatus.Approved; plan.ApprovedByUserId = userId; plan.ApprovedAt = DateTimeOffset.UtcNow; plan.Revision++;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.budget.approved", Resource = $"{plan.Id}:{plan.FiscalYear}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ToView(db, plan, ct));
        });
    }

    private static async Task<TenantBudgetPlanView> ToView(TenantDbContext db, TenantBudgetPlan plan, CancellationToken ct)
    {
        plan = await db.TenantBudgetPlans.AsNoTracking().Include(x => x.Lines).ThenInclude(x => x.Account)
            .SingleAsync(x => x.TenantId == plan.TenantId && x.Id == plan.Id, ct);
        var actuals = await Actuals(db, plan.TenantId, plan.Id, plan.FiscalYear, ct);
        var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == plan.TenantId).Select(x => x.BaseCurrencyCode).SingleAsync(ct);
        var lines = plan.Lines.OrderBy(x => x.PeriodStart).ThenBy(x => x.Account.Code).Select(line =>
        {
            var actual = actuals.GetValueOrDefault((line.AccountId, line.PeriodStart));
            return new TenantBudgetPlanLineView(line.Id, line.AccountId, line.Account.Code, line.Account.Name,
                line.Account.StatementSection.ToString(), line.PeriodStart, line.PlannedAmount, actual,
                string.Equals(plan.CurrencyCode, baseCurrency, StringComparison.OrdinalIgnoreCase) ? actual - line.PlannedAmount : null, line.Notes);
        }).ToList();
        var summary = new TenantBudgetPlanSummary(plan.Id, plan.Name, plan.FiscalYear, plan.CurrencyCode, baseCurrency, plan.Status,
            lines.Count, lines.Sum(x => x.PlannedAmount), lines.Sum(x => x.ActualAmount), plan.CreatedAt, plan.CreatedByUserId,
            plan.ApprovedByUserId, plan.ApprovedAt, plan.Revision);
        return new TenantBudgetPlanView(summary, lines);
    }

    private static async Task<Dictionary<(Guid AccountId, DateOnly PeriodStart), decimal>> Actuals(
        TenantDbContext db, Guid tenantId, Guid planId, int fiscalYear, CancellationToken ct)
    {
        var start = new DateOnly(fiscalYear, 1, 1); var end = start.AddYears(1);
        var accountIds = await db.TenantBudgetLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.BudgetPlanId == planId)
            .Select(x => x.AccountId).Distinct().ToListAsync(ct);
        if (accountIds.Count == 0) return [];
        var rows = await (from line in db.JournalEntryLines.AsNoTracking()
                          join entry in db.JournalEntries.AsNoTracking() on new { line.TenantId, line.JournalEntryId } equals new { entry.TenantId, JournalEntryId = entry.Id }
                          join account in db.LedgerAccounts.AsNoTracking() on new { line.TenantId, line.AccountId } equals new { account.TenantId, AccountId = account.Id }
                          where line.TenantId == tenantId && accountIds.Contains(line.AccountId) && entry.EntryDate >= start && entry.EntryDate < end &&
                                (account.StatementSection == LedgerAccountStatementSection.Revenue || account.StatementSection == LedgerAccountStatementSection.Expense)
                          group new { line, entry, account } by new { line.AccountId, entry.EntryDate.Year, entry.EntryDate.Month, account.StatementSection } into g
                          select new { g.Key.AccountId, g.Key.Year, g.Key.Month, g.Key.StatementSection,
                              Amount = g.Key.StatementSection == LedgerAccountStatementSection.Revenue
                                  ? g.Sum(x => x.line.Credit - x.line.Debit) : g.Sum(x => x.line.Debit - x.line.Credit) }).ToListAsync(ct);
        return rows.ToDictionary(x => (x.AccountId, new DateOnly(x.Year, x.Month, 1)), x => x.Amount);
    }

    private static async Task<string?> ValidateAccounts(TenantDbContext db, Guid tenantId, IReadOnlyList<TenantBudgetLineWriteRequest> lines, CancellationToken ct)
    {
        if (lines.Select(x => (x.AccountId, x.PeriodStart)).Distinct().Count() != lines.Count) return "Aynı hesap ve ay için yinelenen bütçe satırı var.";
        var ids = lines.Select(x => x.AccountId).Distinct().ToArray();
        var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && ids.Contains(x.Id) && x.IsActive)
            .Select(x => new { x.Id, x.StatementSection }).ToListAsync(ct);
        if (accounts.Count != ids.Length) return "Bir veya daha fazla hesap bulunamadı, devre dışı veya bu firmaya ait değil.";
        if (accounts.Any(x => x.StatementSection is not (LedgerAccountStatementSection.Revenue or LedgerAccountStatementSection.Expense)))
            return "Bütçe yalnız gelir ve gider hesaplarına girilebilir.";
        return null;
    }

    private static string? Validate(TenantBudgetPlanWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120) return "Bütçe adı 1–120 karakter olmalıdır.";
        if (request.FiscalYear is < 2000 or > 2100) return "Mali yıl 2000–2100 arasında olmalıdır.";
        if (!CurrencyRegex().IsMatch(request.CurrencyCode ?? "")) return "Para birimi üç harfli ISO kodu olmalıdır.";
        if (request.Lines is null || request.Lines.Count is < 1 or > 1200) return "Bütçe 1–1200 satır içermelidir.";
        if (request.Lines.Any(x => x.PeriodStart.Year != request.FiscalYear || x.PeriodStart.Day != 1 || x.PlannedAmount < 0 || x.PlannedAmount > 9999999999999999m || x.Notes?.Length > 240))
            return "Her satır seçilen mali yıla ait ayın ilk günü olmalı; tutar negatif olamaz ve not 240 karakteri aşamaz.";
        return null;
    }

    private static ICollection<TenantBudgetLine> MakeLines(Guid tenantId, Guid planId, IReadOnlyList<TenantBudgetLineWriteRequest> lines) =>
        lines.Select(x => new TenantBudgetLine { TenantId = tenantId, BudgetPlanId = planId, AccountId = x.AccountId,
            PeriodStart = x.PeriodStart, PlannedAmount = decimal.Round(x.PlannedAmount, 2), Notes = x.Notes?.Trim() }).ToList();

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
