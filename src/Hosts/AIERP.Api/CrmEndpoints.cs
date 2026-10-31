using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class CrmEndpoints
{
    private const int MaximumPageSize = 100;

    public static void MapCrmEndpoints(this WebApplication app)
    {
        var opportunities = app.MapGroup("/api/crm/opportunities").WithTags("CRM Fırsatları").RequireAuthorization();

        opportunities.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, string? q, string? stage,
            DateOnly? closeFrom, DateOnly? closeTo, decimal? valueFrom, decimal? valueTo,
            int page = 1, int pageSize = 25, CancellationToken ct = default) =>
        {
            if (!TryTenant(user, out var tenantId, out _)) return Results.Forbid();
            if (!ValidatePaging(page, pageSize) || (stage is not null && !TryStage(stage, out _)) ||
                (closeFrom is not null && closeTo is not null && closeFrom > closeTo) ||
                valueFrom < 0 || valueTo < 0 || (valueFrom is not null && valueTo is not null && valueFrom > valueTo))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["query"] = ["Sayfalama, tarih veya tahmini değer filtresi geçersiz."] });

            var query = db.CrmOpportunities.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) ||
                    (x.Customer != null && x.Customer.Name.Contains(term)));
            }
            if (stage is not null && TryStage(stage, out var parsedStage)) query = query.Where(x => x.Stage == parsedStage);
            if (closeFrom is not null) query = query.Where(x => x.ExpectedCloseDate != null && x.ExpectedCloseDate >= closeFrom);
            if (closeTo is not null) query = query.Where(x => x.ExpectedCloseDate != null && x.ExpectedCloseDate <= closeTo);
            if (valueFrom is not null) query = query.Where(x => x.EstimatedValue != null && x.EstimatedValue >= valueFrom);
            if (valueTo is not null) query = query.Where(x => x.EstimatedValue != null && x.EstimatedValue <= valueTo);
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.ExpectedCloseDate == null).ThenBy(x => x.ExpectedCloseDate)
                .ThenByDescending(x => x.UpdatedAt).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new CrmOpportunityView(x.Id, x.Code, x.Name, x.CustomerId,
                    x.Customer == null ? null : x.Customer.Name, x.Stage.ToString(), x.EstimatedValue, x.CurrencyCode,
                    x.ProbabilityPercent, x.ExpectedCloseDate, x.NextActivityAt, x.Notes, x.CreatedAt, x.UpdatedAt,
                    Convert.ToBase64String(x.RowVersion)))
                .ToListAsync(ct);
            return Results.Ok(new CrmOpportunityPage(items, page, pageSize, total));
        });

        opportunities.MapPost("/", async (CrmOpportunityWriteRequest body, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!ValidateWrite(body, out var code, out var name, out var currency, out var errors)) return Results.ValidationProblem(errors!);
            if (await db.CrmOpportunities.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant için fırsat kodu zaten kullanılıyor." });
            if (!await IsCustomerInTenantAsync(db, tenantId, body.CustomerId, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Seçilen cari bu tenant için aktif bir müşteri değil."] });

            var now = DateTimeOffset.UtcNow;
            var opportunity = new CrmOpportunity
            {
                TenantId = tenantId, Code = code!, Name = name!, CustomerId = body.CustomerId,
                EstimatedValue = body.EstimatedValue, CurrencyCode = currency!, ProbabilityPercent = body.ProbabilityPercent,
                ExpectedCloseDate = body.ExpectedCloseDate, NextActivityAt = body.NextActivityAt?.ToUniversalTime(),
                Notes = body.Notes?.Trim(), CreatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.CrmOpportunities.Add(opportunity);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.crm-opportunity.created", Resource = opportunity.Code });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/crm/opportunities/{opportunity.Id}", await ToViewAsync(db, tenantId, opportunity.Id, ct));
        });

        opportunities.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out _)) return Results.Forbid();
            var view = await ToViewAsync(db, tenantId, id, ct);
            return view is null ? Results.NotFound() : Results.Ok(view);
        });

        opportunities.MapPut("/{id:guid}", async (Guid id, CrmOpportunityWriteRequest body, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!ValidateWrite(body, out var code, out var name, out var currency, out var errors)) return Results.ValidationProblem(errors!);
            var opportunity = await db.CrmOpportunities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (opportunity is null) return Results.NotFound();
            if (opportunity.Stage is CrmOpportunityStage.Won or CrmOpportunityStage.Lost)
                return Results.Conflict(new { error = "Kapanmış fırsatlar güncellenemez." });
            if (await db.CrmOpportunities.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant için fırsat kodu zaten kullanılıyor." });
            if (!await IsCustomerInTenantAsync(db, tenantId, body.CustomerId, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Seçilen cari bu tenant için aktif bir müşteri değil."] });

            opportunity.Code = code!; opportunity.Name = name!; opportunity.CustomerId = body.CustomerId;
            opportunity.EstimatedValue = body.EstimatedValue; opportunity.CurrencyCode = currency!;
            opportunity.ProbabilityPercent = body.ProbabilityPercent; opportunity.ExpectedCloseDate = body.ExpectedCloseDate;
            opportunity.NextActivityAt = body.NextActivityAt?.ToUniversalTime(); opportunity.Notes = body.Notes?.Trim();
            opportunity.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.crm-opportunity.updated", Resource = opportunity.Code });
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ToViewAsync(db, tenantId, opportunity.Id, ct));
        });

        opportunities.MapPost("/{id:guid}/stage", async (Guid id, CrmOpportunityStageRequest body,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!TryStage(body.Stage, out var nextStage))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["stage"] = ["Fırsat aşaması geçersiz."] });
            var opportunity = await db.CrmOpportunities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (opportunity is null) return Results.NotFound();
            if (!CanTransition(opportunity.Stage, nextStage))
                return Results.Conflict(new { error = "Fırsat bu aşamaya geçirilemez." });
            if (nextStage == CrmOpportunityStage.Won && opportunity.CustomerId is null)
                return Results.Conflict(new { error = "Kazanılan fırsat için önce bir müşteri carisi bağlayın." });

            opportunity.Stage = nextStage;
            opportunity.ProbabilityPercent = nextStage switch
            {
                CrmOpportunityStage.Won => 100,
                CrmOpportunityStage.Lost => 0,
                _ => Math.Clamp(opportunity.ProbabilityPercent, 1, 99)
            };
            opportunity.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.crm-opportunity.stage-changed", Resource = $"{opportunity.Code}:{nextStage}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ToViewAsync(db, tenantId, opportunity.Id, ct));
        });
    }

    private static async Task<CrmOpportunityView?> ToViewAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) =>
        await db.CrmOpportunities.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
            .Select(x => new CrmOpportunityView(x.Id, x.Code, x.Name, x.CustomerId,
                x.Customer == null ? null : x.Customer.Name, x.Stage.ToString(), x.EstimatedValue, x.CurrencyCode,
                x.ProbabilityPercent, x.ExpectedCloseDate, x.NextActivityAt, x.Notes, x.CreatedAt, x.UpdatedAt,
                Convert.ToBase64String(x.RowVersion))).SingleOrDefaultAsync(ct);

    private static async Task<bool> IsCustomerInTenantAsync(TenantDbContext db, Guid tenantId, Guid? customerId, CancellationToken ct) =>
        customerId is null || await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == customerId && x.IsActive &&
            (x.Type == CounterpartyType.Customer || x.Type == CounterpartyType.Both), ct);

    private static bool ValidateWrite(CrmOpportunityWriteRequest request, out string? code, out string? name,
        out string? currency, out Dictionary<string, string[]>? errors)
    {
        code = request.Code?.Trim().ToUpperInvariant(); name = request.Name?.Trim();
        currency = request.CurrencyCode?.Trim().ToUpperInvariant(); errors = [];
        if (string.IsNullOrEmpty(code) || code.Length > 40 || code[0] is < 'A' or > 'Z' ||
            code.Any(ch => !(ch is >= 'A' and <= 'Z' or >= '0' and <= '9' or '-' or '_')))
            errors["code"] = ["Kod büyük harfle başlamalı; en fazla 40 karakterli harf, rakam, tire veya alt çizgi içermelidir."];
        if (string.IsNullOrWhiteSpace(name) || name.Length > 160) errors["name"] = ["Fırsat adı 1–160 karakter olmalıdır."];
        if (currency?.Length != 3 || currency.Any(ch => ch is < 'A' or > 'Z')) errors["currencyCode"] = ["Para birimi üç büyük harfli ISO kodu olmalıdır."];
        if (request.EstimatedValue is < 0 or > 9999999999999999.99m) errors["estimatedValue"] = ["Tahmini değer negatif olamaz ve 18,2 hassasiyetini aşamaz."];
        if (request.ProbabilityPercent is < 0 or > 99) errors["probabilityPercent"] = ["Açık fırsat olasılığı 0–99 arasında olmalıdır."];
        if (request.Notes?.Length > 2000) errors["notes"] = ["Notlar en fazla 2000 karakter olabilir."];
        if (errors.Count == 0) { errors = null; return true; }
        return false;
    }

    private static bool TryStage(string? stage, out CrmOpportunityStage parsed) =>
        Enum.TryParse(stage, true, out parsed) && Enum.IsDefined(parsed);

    private static bool CanTransition(CrmOpportunityStage current, CrmOpportunityStage next) => current switch
    {
        CrmOpportunityStage.Prospecting => next is CrmOpportunityStage.Qualified or CrmOpportunityStage.Lost,
        CrmOpportunityStage.Qualified => next is CrmOpportunityStage.Proposal or CrmOpportunityStage.Lost,
        CrmOpportunityStage.Proposal => next is CrmOpportunityStage.Negotiation or CrmOpportunityStage.Lost,
        CrmOpportunityStage.Negotiation => next is CrmOpportunityStage.Won or CrmOpportunityStage.Lost,
        _ => false
    };

    private static bool ValidatePaging(int page, int pageSize) => page is >= 1 and <= 100000 && pageSize is >= 1 and <= MaximumPageSize;

    private static bool TryTenant(ClaimsPrincipal principal, out Guid tenantId, out Guid userId)
    {
        var tenantOk = Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
        var userOk = Guid.TryParse(principal.FindFirstValue("sub"), out userId);
        return tenantOk && userOk;
    }
}

public sealed record CrmOpportunityWriteRequest(string? Code, string? Name, Guid? CustomerId, decimal? EstimatedValue,
    string? CurrencyCode, int ProbabilityPercent, DateOnly? ExpectedCloseDate, DateTimeOffset? NextActivityAt, string? Notes);
public sealed record CrmOpportunityStageRequest(string? Stage);
public sealed record CrmOpportunityView(Guid Id, string Code, string Name, Guid? CustomerId, string? CustomerName,
    string Stage, decimal? EstimatedValue, string CurrencyCode, int ProbabilityPercent, DateOnly? ExpectedCloseDate,
    DateTimeOffset? NextActivityAt, string? Notes, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string RowVersion);
public sealed record CrmOpportunityPage(IReadOnlyList<CrmOpportunityView> Items, int Page, int PageSize, int Total);
