using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class SalesPromotionEndpoints
{
    public static void MapSalesPromotionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/sales/promotions").WithTags("Satış Kampanyaları").RequireAuthorization();
        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var rows = await db.SalesPromotionCampaigns.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.EffectiveFrom).ThenBy(x => x.Code)
                .Select(x => new SalesPromotionCampaignView(x.Id, x.Code, x.Name, x.DiscountPercent,
                    x.EffectiveFrom, x.EffectiveThrough, x.IsActive,
                    db.SalesPromotionApplications.Count(a => a.TenantId == tenantId && a.CampaignId == x.Id)))
                .Take(200).ToListAsync(ct);
            return Results.Ok(rows);
        });
        group.MapPost("/", async (SalesPromotionCampaignWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            if (!IsAdmin(user)) return Results.Forbid();
            var errors = Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            var code = request.Code!.Trim().ToUpperInvariant(); var name = request.Name!.Trim();
            if (await db.SalesPromotionCampaigns.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu kampanya kodu firmada zaten kullanılıyor." });
            var campaign = new SalesPromotionCampaign
            {
                TenantId = tenantId, Code = code, Name = name, DiscountPercent = request.DiscountPercent,
                EffectiveFrom = request.EffectiveFrom, EffectiveThrough = request.EffectiveThrough,
                IsActive = request.IsActive, CreatedByUserId = UserId(user)
            };
            db.SalesPromotionCampaigns.Add(campaign);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales-promotion.created", Resource = code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Bu kampanya kodu firmada zaten kullanılıyor." }); }
            return Results.Created($"/api/sales/promotions/{campaign.Id}", View(campaign, 0));
        });
        group.MapPut("/{id:guid}", async (Guid id, SalesPromotionCampaignWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            if (!IsAdmin(user)) return Results.Forbid();
            var errors = Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            var campaign = await db.SalesPromotionCampaigns.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            var code = request.Code!.Trim().ToUpperInvariant(); var name = request.Name!.Trim();
            if (await db.SalesPromotionCampaigns.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu kampanya kodu firmada zaten kullanılıyor." });
            campaign.Code = code; campaign.Name = name; campaign.DiscountPercent = request.DiscountPercent;
            campaign.EffectiveFrom = request.EffectiveFrom; campaign.EffectiveThrough = request.EffectiveThrough; campaign.IsActive = request.IsActive;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales-promotion.updated", Resource = code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Kampanya kodu firmada zaten kullanılıyor." }); }
            return Results.Ok(View(campaign, await db.SalesPromotionApplications.CountAsync(x => x.TenantId == tenantId && x.CampaignId == id, ct)));
        });
        group.MapPost("/{id:guid}/apply", async (Guid id, SalesPromotionApplyRequest request, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            if (request.QuoteId == Guid.Empty) return Results.ValidationProblem(new Dictionary<string, string[]> { ["quoteId"] = ["Teklif seçilmelidir."] });
            var userId = UserId(user); var role = user.FindFirstValue("role");
            if (userId is null || string.IsNullOrWhiteSpace(role)) return Results.Forbid();
            var campaign = await db.SalesPromotionCampaigns.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            var quoteQuery = db.SalesQuotes.Where(x => x.TenantId == tenantId && x.Id == request.QuoteId);
            quoteQuery = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, role, "erp.sales-quotes.read", "erp.sales-quotes",
                quoteQuery, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? quoteQuery;
            quoteQuery = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, role, "erp.sales-quotes.update", "erp.sales-quotes",
                quoteQuery, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? quoteQuery;
            var quote = await quoteQuery.Include(x => x.Lines).SingleOrDefaultAsync(ct);
            if (quote is null) return Results.NotFound();
            if (quote.Status != SalesQuoteStatus.Draft) return Results.Conflict(new { error = "Kampanya yalnızca taslak teklife uygulanabilir." });
            if (!campaign.IsActive || quote.QuoteDate < campaign.EffectiveFrom || quote.QuoteDate > campaign.EffectiveThrough)
                return Results.Conflict(new { error = "Kampanya, teklif tarihindeki etkinlik aralığında değil." });
            if (await db.SalesPromotionApplications.AnyAsync(x => x.TenantId == tenantId && x.CampaignId == id && x.QuoteId == quote.Id, ct))
                return Results.Conflict(new { error = "Bu kampanya teklife daha önce uygulanmış." });
            if (quote.Lines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen teklife kampanya uygulanamaz." });

            decimal discountDelta = 0;
            try
            {
                foreach (var line in quote.Lines)
                {
                    var previousDiscount = line.DiscountAmount;
                    var combinedPercent = decimal.Round(line.DiscountPercent + (100m - line.DiscountPercent) * campaign.DiscountPercent / 100m, 2, MidpointRounding.AwayFromZero);
                    var amounts = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(line.StockItemId, line.Quantity, line.UnitPrice,
                        combinedPercent, line.VatPercent, line.UnitCode));
                    line.DiscountPercent = combinedPercent; line.LineSubtotal = amounts.LineSubtotal;
                    line.DiscountAmount = amounts.DiscountAmount; line.TaxAmount = amounts.TaxAmount; line.LineTotal = amounts.LineTotal;
                    discountDelta += amounts.DiscountAmount - previousDiscount;
                }
                if (discountDelta <= 0) return Results.Conflict(new { error = "Kampanya tutarı sıfır çıktı; teklif satırlarını kontrol edin." });
                quote.Subtotal = quote.Lines.Sum(x => x.LineSubtotal); quote.DiscountTotal = quote.Lines.Sum(x => x.DiscountAmount);
                quote.TaxTotal = quote.Lines.Sum(x => x.TaxAmount); quote.GrandTotal = quote.Lines.Sum(x => x.LineTotal);
            }
            catch (OverflowException) { return Results.Conflict(new { error = "Kampanya sonrası teklif toplamı desteklenen tutar sınırını aşıyor." }); }

            var application = new SalesPromotionApplication { TenantId = tenantId, CampaignId = id, QuoteId = quote.Id,
                DiscountPercent = campaign.DiscountPercent, DiscountAmount = discountDelta, AppliedOn = quote.QuoteDate, AppliedByUserId = UserId(user) };
            db.SalesPromotionApplications.Add(application);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales-promotion.applied", Resource = $"{campaign.Code}:{quote.Code}:{discountDelta}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Kampanya teklife daha önce uygulanmış veya teklif eşzamanlı değiştirilmiş." }); }
            return Results.Ok(new SalesPromotionApplicationView(campaign.Id, campaign.Code, quote.Id, quote.Code,
                campaign.DiscountPercent, discountDelta, quote.DiscountTotal, quote.GrandTotal));
        });
    }

    private static Dictionary<string, string[]>? Validate(SalesPromotionCampaignWriteRequest x)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(x.Code) || x.Code.Trim().Length > 40) errors["code"] = ["Kampanya kodu zorunlu, en fazla 40 karakter olmalıdır."];
        if (string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 120) errors["name"] = ["Kampanya adı zorunlu, en fazla 120 karakter olmalıdır."];
        if (x.DiscountPercent <= 0 || x.DiscountPercent > 100 || x.DiscountPercent != decimal.Round(x.DiscountPercent, 2)) errors["discountPercent"] = ["İndirim oranı 0'dan büyük, en fazla 100 ve iki ondalık basamaklı olmalıdır."];
        if (x.EffectiveThrough < x.EffectiveFrom) errors["effectiveThrough"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."];
        return errors.Count == 0 ? null : errors;
    }

    private static SalesPromotionCampaignView View(SalesPromotionCampaign x, int applications) =>
        new(x.Id, x.Code, x.Name, x.DiscountPercent, x.EffectiveFrom, x.EffectiveThrough, x.IsActive, applications);
    private static bool TryTenant(ClaimsPrincipal user, out Guid id) => Guid.TryParse(user.FindFirstValue("tenant_id"), out id);
    private static Guid? UserId(ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private static bool IsAdmin(ClaimsPrincipal user) => user.FindFirstValue("role") == "TenantAdmin";
}

public sealed record SalesPromotionCampaignWriteRequest(string? Code, string? Name, decimal DiscountPercent,
    DateOnly EffectiveFrom, DateOnly EffectiveThrough, bool IsActive = true);
public sealed record SalesPromotionApplyRequest(Guid QuoteId);
public sealed record SalesPromotionCampaignView(Guid Id, string Code, string Name, decimal DiscountPercent,
    DateOnly EffectiveFrom, DateOnly EffectiveThrough, bool IsActive, int ApplicationCount);
public sealed record SalesPromotionApplicationView(Guid CampaignId, string CampaignCode, Guid QuoteId, string QuoteCode,
    decimal AppliedPercent, decimal DiscountAmount, decimal TotalDiscountAmount, decimal GrandTotal);
