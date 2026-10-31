using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

public static class FinanceCreditFacilityEndpoints
{
    public static void MapFinanceCreditFacilityEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/finance/credit-facilities").WithTags("Finans · kredi ve finansman").RequireAuthorization();
        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
            var rows = await db.CreditFacilities.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Status).ThenBy(x => x.MaturityDate).ThenBy(x => x.Code)
                .Select(x => new CreditFacilityView(x.Id, x.Code, x.LenderName, x.FacilityType, x.CurrencyCode,
                    x.ApprovedLimit, x.StartDate, x.MaturityDate, x.AnnualInterestRatePercent, x.Status.ToString(), x.Notes,
                    x.Movements.Where(m => m.Type == CreditFacilityMovementType.Drawdown && !m.Reversals.Any()).Sum(m => (decimal?)m.PrincipalAmount) ?? 0m,
                    x.Movements.Where(m => m.Type == CreditFacilityMovementType.Repayment && !m.Reversals.Any()).Sum(m => (decimal?)m.PrincipalAmount) ?? 0m,
                    (x.Movements.Where(m => m.Type == CreditFacilityMovementType.Drawdown && !m.Reversals.Any()).Sum(m => (decimal?)m.PrincipalAmount) ?? 0m) -
                    (x.Movements.Where(m => m.Type == CreditFacilityMovementType.Repayment && !m.Reversals.Any()).Sum(m => (decimal?)m.PrincipalAmount) ?? 0m),
                    x.Schedule.Count(s => s.Status == CreditFacilityScheduleStatus.Planned),
                    x.Schedule.Where(s => s.Status == CreditFacilityScheduleStatus.Planned).Sum(s => (decimal?)(s.PrincipalAmount + s.InterestAmount + s.FeeAmount)) ?? 0m,
                    x.Schedule.OrderBy(s => s.DueDate)
                        .Select(s => new CreditFacilityScheduleView(s.Id, s.DueDate, s.PrincipalAmount, s.InterestAmount, s.FeeAmount, s.Status.ToString(), s.PaidDate, s.Notes)).ToList(),
                    Array.Empty<CreditFacilityMovementView>()))
                .ToListAsync(ct);
            var facilityIds = rows.Select(x => x.Id).ToArray();
            var movements = await db.CreditFacilityMovements.AsNoTracking().Where(x => x.TenantId == tenantId && facilityIds.Contains(x.CreditFacilityId))
                .OrderByDescending(x => x.TransactionDate).ThenByDescending(x => x.CreatedAt)
                .Select(x => new { x.CreditFacilityId, Movement = new CreditFacilityMovementView(x.Id, x.Type.ToString(), x.TransactionDate,
                    x.PrincipalAmount, x.InterestAmount, x.FeeAmount, x.FinancialAccountTransaction.FinancialAccount.Code,
                    x.FinancialAccountTransactionId, x.CreditFacilityScheduleId, x.Notes, x.ReversesMovementId, x.Reversals.Any(),
                    db.JournalEntries.Where(j => j.TenantId == tenantId && j.SourceType == (x.Type == CreditFacilityMovementType.Reversal
                        ? "CreditFacilityMovementReversal" : "CreditFacilityMovement") && j.SourceId == x.Id).Select(j => (Guid?)j.Id).FirstOrDefault()) }).ToListAsync(ct);
            var byFacility = movements.ToLookup(x => x.CreditFacilityId, x => x.Movement);
            return Results.Ok(rows.Select(x => x with { Movements = byFacility[x.Id].ToList() }));
        });

        group.MapGet("/assistant-summary", async (string? term, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
            var search = term?.Trim() ?? string.Empty;
            if (search.Length is < 2 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["term"] = ["Arama terimi 2–100 karakter olmalıdır."] });

            var query = db.CreditFacilities.AsNoTracking().Where(x => x.TenantId == tenantId && x.Code.Contains(search));
            var total = await query.CountAsync(ct);
            var rows = await query.OrderBy(x => x.MaturityDate).ThenBy(x => x.Code).Take(10)
                .Select(x => new
                {
                    x.Code,
                    x.FacilityType,
                    x.CurrencyCode,
                    status = x.Status.ToString(),
                    x.MaturityDate,
                    drawnPrincipal = x.Movements.Where(m => m.Type == CreditFacilityMovementType.Drawdown && !m.Reversals.Any())
                        .Sum(m => (decimal?)m.PrincipalAmount) ?? 0m,
                    repaidPrincipal = x.Movements.Where(m => m.Type == CreditFacilityMovementType.Repayment && !m.Reversals.Any())
                        .Sum(m => (decimal?)m.PrincipalAmount) ?? 0m,
                    plannedInstallmentCount = x.Schedule.Count(s => s.Status == CreditFacilityScheduleStatus.Planned),
                    plannedInstallmentTotal = x.Schedule.Where(s => s.Status == CreditFacilityScheduleStatus.Planned)
                        .Sum(s => (decimal?)(s.PrincipalAmount + s.InterestAmount + s.FeeAmount)) ?? 0m
                }).ToListAsync(ct);

            return Results.Ok(new
            {
                totalCount = total,
                items = rows.Select(x => new
                {
                    x.Code, x.FacilityType, x.CurrencyCode, x.status,
                    maturityDate = x.MaturityDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
                    x.drawnPrincipal, x.repaidPrincipal,
                    outstandingPrincipal = x.drawnPrincipal - x.repaidPrincipal,
                    x.plannedInstallmentCount, x.plannedInstallmentTotal
                })
            });
        });

        group.MapGet("/securities", async (int? expiryWithinDays, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
            var days = expiryWithinDays ?? 30;
            if (days is < 0 or > 365) return Results.ValidationProblem(new Dictionary<string, string[]> { ["expiryWithinDays"] = ["Süre 0–365 gün arasında olmalıdır."] });
            var today = IstanbulToday();
            var rows = await db.CreditFacilitySecurities.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.ExpiryDate).ThenBy(x => x.Code)
                .Select(x => new CreditFacilitySecurityView(x.Id, x.CreditFacilityId, x.CreditFacility.Code, x.Type.ToString(), x.Code,
                    x.Issuer, x.Beneficiary, x.Amount, x.CurrencyCode, x.CommissionAmount, x.IssueDate, x.ExpiryDate, x.Status.ToString(), x.Notes))
                .ToListAsync(ct);
            var soon = today.AddDays(days);
            return Results.Ok(new
            {
                items = rows.Select(x => new { x.Id, x.CreditFacilityId, x.FacilityCode, x.Type, x.Code, x.Issuer, x.Beneficiary,
                    x.Amount, x.CurrencyCode, x.CommissionAmount, x.IssueDate, x.ExpiryDate, x.Status, x.Notes,
                    alert = x.Status == nameof(CreditSecurityStatus.Active) && x.ExpiryDate < today ? "Expired" :
                        x.Status == nameof(CreditSecurityStatus.Active) && x.ExpiryDate <= soon ? "Expiring" : "None" }),
                expiringCount = rows.Count(x => x.Status == nameof(CreditSecurityStatus.Active) && x.ExpiryDate >= today && x.ExpiryDate <= soon),
                expiredCount = rows.Count(x => x.Status == nameof(CreditSecurityStatus.Active) && x.ExpiryDate < today)
            });
        });

        group.MapGet("/securities/alerts", async (int? expiryWithinDays, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
            var days = expiryWithinDays ?? 30;
            if (days is < 0 or > 365)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["expiryWithinDays"] = ["Süre 0–365 gün arasında olmalıdır."] });

            var today = IstanbulToday();
            var through = today.AddDays(days);
            var active = db.CreditFacilitySecurities.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Status == CreditSecurityStatus.Active);
            var expiredCount = await active.CountAsync(x => x.ExpiryDate < today, ct);
            var expiringCount = await active.CountAsync(x => x.ExpiryDate >= today && x.ExpiryDate <= through, ct);
            var items = await active.Where(x => x.ExpiryDate <= through)
                .OrderBy(x => x.ExpiryDate).ThenBy(x => x.Code).Take(10)
                .Select(x => new
                {
                    x.Id,
                    facilityCode = x.CreditFacility.Code,
                    type = x.Type.ToString(),
                    x.Code,
                    x.Issuer,
                    x.Beneficiary,
                    x.Amount,
                    x.CurrencyCode,
                    x.ExpiryDate,
                    alert = x.ExpiryDate < today ? "Expired" : "Expiring"
                }).ToListAsync(ct);

            return Results.Ok(new { asOf = today, expiryWithinDays = days, expiredCount, expiringCount, items });
        });

        group.MapGet("/exposure-summary", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
            var facilities = await db.CreditFacilities.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.CurrencyCode).ThenBy(x => x.Code)
                .Select(x => new
                {
                    x.Id, x.Code, x.LenderName, x.FacilityType, x.CurrencyCode, x.ApprovedLimit, status = x.Status.ToString(),
                    outstandingPrincipal = (x.Movements.Where(m => m.Type == CreditFacilityMovementType.Drawdown && !m.Reversals.Any())
                        .Sum(m => (decimal?)m.PrincipalAmount) ?? 0m) -
                        (x.Movements.Where(m => m.Type == CreditFacilityMovementType.Repayment && !m.Reversals.Any())
                        .Sum(m => (decimal?)m.PrincipalAmount) ?? 0m)
                }).ToListAsync(ct);
            var securities = await db.CreditFacilitySecurities.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Status != CreditSecurityStatus.Released)
                .Select(x => new { x.CreditFacilityId, x.Type, x.Status, x.Amount, x.CurrencyCode }).ToListAsync(ct);
            var byFacility = securities.GroupBy(x => x.CreditFacilityId).ToDictionary(x => x.Key, x => new
            {
                activeGuarantees = x.Where(s => s.Status == CreditSecurityStatus.Active && s.Type == CreditSecurityType.Guarantee).Sum(s => s.Amount),
                activeCollateral = x.Where(s => s.Status == CreditSecurityStatus.Active && s.Type == CreditSecurityType.Collateral).Sum(s => s.Amount),
                calledAmount = x.Where(s => s.Status == CreditSecurityStatus.Called).Sum(s => s.Amount)
            });
            var items = facilities.Select(f =>
            {
                var security = byFacility.GetValueOrDefault(f.Id);
                return new { f.Id, f.Code, f.LenderName, f.FacilityType, f.CurrencyCode, f.ApprovedLimit, f.status,
                    f.outstandingPrincipal, activeGuarantees = security?.activeGuarantees ?? 0m,
                    activeCollateral = security?.activeCollateral ?? 0m, calledAmount = security?.calledAmount ?? 0m,
                    limitUtilizationPercent = f.ApprovedLimit <= 0 ? 0m : decimal.Round((f.outstandingPrincipal / f.ApprovedLimit) * 100m, 2) };
            }).ToList();
            var currencies = items.GroupBy(x => x.CurrencyCode).OrderBy(x => x.Key).Select(x => new
            {
                currencyCode = x.Key,
                facilityCount = x.Count(f => f.status == nameof(CreditFacilityStatus.Active)),
                outstandingPrincipal = x.Where(f => f.status == nameof(CreditFacilityStatus.Active)).Sum(f => f.outstandingPrincipal),
                approvedLimit = x.Where(f => f.status == nameof(CreditFacilityStatus.Active)).Sum(f => f.ApprovedLimit),
                activeGuarantees = x.Sum(f => f.activeGuarantees), activeCollateral = x.Sum(f => f.activeCollateral),
                calledAmount = x.Sum(f => f.calledAmount)
            }).ToList();
            return Results.Ok(new { currencies, facilities = items });
        });

        group.MapPost("/{id:guid}/securities", async (Guid id, CreditFacilitySecurityCreateRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            var code = request.Code?.Trim() ?? "";
            var issuer = request.Issuer?.Trim() ?? "";
            var beneficiary = request.Beneficiary?.Trim() ?? "";
            var currency = request.CurrencyCode?.Trim().ToUpperInvariant() ?? "";
            if (code.Length is < 1 or > 40 || issuer.Length is < 1 or > 160 || beneficiary.Length is < 1 or > 160 ||
                request.Type is not (CreditSecurityType.Guarantee or CreditSecurityType.Collateral) ||
                !ValidMoney(request.Amount) || !ValidNonNegativeMoney(request.CommissionAmount) || currency.Length != 3 ||
                request.IssueDate < new DateOnly(2000, 1, 1) || request.ExpiryDate < request.IssueDate ||
                request.ExpiryDate > new DateOnly(2100, 12, 31) || (request.Notes?.Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["security"] = ["Teminat/garanti kodu, taraflar, tutar, para birimi ve tarihler geçerli olmalıdır."] });
            var facility = await db.CreditFacilities.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (facility is null) return Results.NotFound();
            if (currency != facility.CurrencyCode) return Results.Conflict(new { error = "Teminat/garanti para birimi bağlı krediyle aynı olmalıdır." });
            if (await db.CreditFacilitySecurities.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu firma içinde teminat/garanti kodu zaten kullanılıyor." });
            var item = new CreditFacilitySecurity { TenantId = tenantId, CreditFacilityId = id, Type = request.Type, Code = code,
                Issuer = issuer, Beneficiary = beneficiary, Amount = request.Amount, CurrencyCode = currency,
                CommissionAmount = request.CommissionAmount, IssueDate = request.IssueDate, ExpiryDate = request.ExpiryDate,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim() };
            db.CreditFacilitySecurities.Add(item);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.security-created",
                Resource = $"{facility.Code};{item.Type};{item.Code};{item.Amount:0.00} {item.CurrencyCode};{item.ExpiryDate:yyyy-MM-dd}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/finance/credit-facilities/{id}/securities/{item.Id}",
                new CreditFacilitySecurityView(item.Id, item.CreditFacilityId, facility.Code, item.Type.ToString(), item.Code,
                    item.Issuer, item.Beneficiary, item.Amount, item.CurrencyCode, item.CommissionAmount, item.IssueDate,
                    item.ExpiryDate, item.Status.ToString(), item.Notes));
        });

        group.MapPut("/{id:guid}/securities/{securityId:guid}/status", async (Guid id, Guid securityId,
            CreditFacilitySecurityStatusRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.Status is not ("Released" or "Called"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["Durum Released veya Called olmalıdır."] });
            var item = await db.CreditFacilitySecurities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CreditFacilityId == id && x.Id == securityId, ct);
            if (item is null) return Results.NotFound();
            if (item.Status != CreditSecurityStatus.Active) return Results.Conflict(new { error = "Yalnız etkin teminat/garanti kaydı kapatılabilir." });
            item.Status = request.Status == "Released" ? CreditSecurityStatus.Released : CreditSecurityStatus.Called;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.security-status-changed",
                Resource = $"{item.Code};{item.Status}" });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapGet("/{id:guid}/interest-accrual-preview", async (Guid id, DateOnly from, DateOnly to,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
            if (from < new DateOnly(2000, 1, 1) || to < from || to > IstanbulToday() ||
                to.DayNumber - from.DayNumber > 365)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                { ["period"] = ["Dönem geçerli olmalı ve en fazla 366 takvim günü kapsamalıdır."] });

            var facility = await db.CreditFacilities.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (facility is null) return Results.NotFound();
            if (facility.AnnualInterestRatePercent is not { } annualRate)
                return Results.Conflict(new { error = "Faiz oranı tanımlanmamış; tahakkuk önizlemesi oluşturulamadı." });
            if (from < facility.StartDate || facility.MaturityDate is { } maturity && to > maturity)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                { ["period"] = ["Dönem kredi sözleşmesinin başlangıç ve vade tarihleri içinde olmalıdır."] });

            var calculated = await CalculateInterestAccrualAsync(db, tenantId, facility, from, to, ct);
            if (calculated is null)
                return Results.Conflict(new { error = "Kredi hareketleri negatif anapara oluşturuyor; önce kredi defterini mutabık hale getirin." });
            var months = calculated.Select(x => new { month = x.Month, accruedInterest = x.Amount }).ToArray();
            return Results.Ok(new
            {
                facilityId = facility.Id, facility.Code, facility.CurrencyCode, from, to,
                annualInterestRatePercent = annualRate, dayCountConvention = "Actual/365",
                dailyBalanceConvention = "TransactionDate included; closing principal balance accrues for the day",
                months, totalAccruedInterest = months.Sum(x => x.accruedInterest),
                accountingPosted = false,
                note = "Bu tutarlar tahakkuk önizlemesidir; yevmiye kaydı oluşturmaz."
            });
        });

        group.MapPost("/{id:guid}/interest-accruals/{year:int}/{month:int}", async (Guid id, int year, int month,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            return await PostInterestAccrualAsync(id, year, month, tenantId, GetUserId(user), db, ct);
        });

        group.MapPost("/", async (CreditFacilityCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            var code = request.Code?.Trim() ?? "";
            var lender = request.LenderName?.Trim() ?? "";
            var type = request.FacilityType?.Trim() ?? "";
            var currency = request.CurrencyCode?.Trim().ToUpperInvariant() ?? "";
            if (code.Length is < 1 or > 40 || lender.Length is < 1 or > 160 || type is not ("Loan" or "Revolving" or "Leasing" or "Other") ||
                currency.Length != 3 || currency.Any(c => c is < 'A' or > 'Z') || request.ApprovedLimit <= 0 ||
                request.StartDate < new DateOnly(2000, 1, 1) || request.StartDate > new DateOnly(2100, 12, 31) ||
                request.MaturityDate is { } maturity && (maturity < request.StartDate || maturity > new DateOnly(2100, 12, 31)) ||
                request.AnnualInterestRatePercent is < 0 or > 1000 || request.ApprovedLimit > 9999999999999999.99m ||
                decimal.Round(request.ApprovedLimit, 2) != request.ApprovedLimit ||
                request.AnnualInterestRatePercent is { } rate && decimal.Round(rate, 4) != rate || (request.Notes?.Length ?? 0) > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["facility"] = ["Kredi kodu, veren kurum, tür, para birimi, limit ve tarihler geçerli olmalıdır."] });
            if (await db.CreditFacilities.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu kredi kodu zaten kullanılıyor." });
            var facility = new CreditFacility { TenantId = tenantId, Code = code, LenderName = lender, FacilityType = type,
                CurrencyCode = currency, ApprovedLimit = request.ApprovedLimit, StartDate = request.StartDate,
                MaturityDate = request.MaturityDate, AnnualInterestRatePercent = request.AnnualInterestRatePercent,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim() };
            db.CreditFacilities.Add(facility);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.created", Resource = code });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/finance/credit-facilities/{facility.Id}", new { facility.Id, facility.Code });
        });

        group.MapPost("/{id:guid}/schedule", async (Guid id, CreditFacilityScheduleCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            var facility = await db.CreditFacilities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (facility is null) return Results.NotFound();
            if (facility.Status != CreditFacilityStatus.Active) return Results.Conflict(new { error = "Kapalı krediye yeni ödeme planı eklenemez." });
            const decimal maxMoney = 9999999999999999.99m;
            if (request.DueDate < new DateOnly(2000, 1, 1) || request.DueDate > new DateOnly(2100, 12, 31) || request.DueDate < facility.StartDate ||
                facility.MaturityDate is { } maturity && request.DueDate > maturity || request.PrincipalAmount < 0 || request.InterestAmount < 0 || request.FeeAmount < 0 ||
                request.PrincipalAmount > maxMoney || request.InterestAmount > maxMoney || request.FeeAmount > maxMoney ||
                decimal.Round(request.PrincipalAmount, 2) != request.PrincipalAmount || decimal.Round(request.InterestAmount, 2) != request.InterestAmount ||
                decimal.Round(request.FeeAmount, 2) != request.FeeAmount ||
                (request.Notes?.Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["schedule"] = ["Vade, kredi dönemi içinde ve ödeme tutarları sıfırdan büyük toplam oluşturmalıdır."] });
            var total = request.PrincipalAmount + request.InterestAmount + request.FeeAmount;
            if (total <= 0 || total > maxMoney)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["schedule"] = ["Taksit toplamı geçerli finansal tutar aralığında olmalıdır."] });
            var item = new CreditFacilitySchedule { TenantId = tenantId, CreditFacilityId = id, DueDate = request.DueDate,
                PrincipalAmount = request.PrincipalAmount, InterestAmount = request.InterestAmount, FeeAmount = request.FeeAmount,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim() };
            db.CreditFacilitySchedules.Add(item);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.schedule-created", Resource = facility.Code });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/finance/credit-facilities/{id}/schedule/{item.Id}", new CreditFacilityScheduleView(item.Id, item.DueDate,
                item.PrincipalAmount, item.InterestAmount, item.FeeAmount, item.Status.ToString(), item.PaidDate, item.Notes));
        });

        group.MapPost("/{id:guid}/drawdowns", async (Guid id, CreditFacilityDrawdownRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.RequestId == Guid.Empty || !ValidMoney(request.PrincipalAmount) || request.TransactionDate < new DateOnly(2000, 1, 1) ||
                request.TransactionDate > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(10) || (request.Notes?.Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["drawdown"] = ["Tekrar gönderim anahtarı, kullandırım tarihi ve tutar geçerli olmalıdır."] });
            var note = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            var existing = await db.CreditFacilityMovements.Include(x => x.FinancialAccountTransaction)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (existing is not null)
                return Same(existing, CreditFacilityMovementType.Drawdown, id, request.FinancialAccountId, request.TransactionDate,
                    request.PrincipalAmount, 0m, 0m, null, note) ? Results.Ok(new { existing.Id, existing.FinancialAccountTransactionId,
                        JournalEntryId = await FindJournalId(db, tenantId, "CreditFacilityMovement", existing.Id, ct) })
                    : Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir kredi hareketinde kullanıldı." });
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var facility = await LoadFacilityForUpdate(db, tenantId, id, ct);
            if (facility is null) return Results.NotFound();
            var racedExisting = await db.CreditFacilityMovements.Include(x => x.FinancialAccountTransaction)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (racedExisting is not null)
            {
                if (transaction is not null) await transaction.CommitAsync(ct);
                return Same(racedExisting, CreditFacilityMovementType.Drawdown, id, request.FinancialAccountId, request.TransactionDate,
                    request.PrincipalAmount, 0m, 0m, null, note)
                    ? Results.Ok(new { racedExisting.Id, racedExisting.FinancialAccountTransactionId,
                        JournalEntryId = await FindJournalId(db, tenantId, "CreditFacilityMovement", racedExisting.Id, ct) })
                    : Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir kredi hareketinde kullanıldı." });
            }
            if (facility.Status != CreditFacilityStatus.Active || request.TransactionDate < facility.StartDate ||
                facility.MaturityDate is { } maturity && request.TransactionDate > maturity)
                return Results.Conflict(new { error = "Yalnızca aktif kredi dönemine kullandırım kaydedilebilir." });
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.TransactionDate, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var account = await LoadAccountForUpdate(db, tenantId, request.FinancialAccountId, ct);
            if (account is null) return Results.NotFound();
            if (!account.IsActive || account.CurrencyCode != facility.CurrencyCode)
                return Results.Conflict(new { error = "Aktif ve krediyle aynı para birimindeki kasa/banka hesabını seçin." });
            var mappedAccounts = await ResolvePostingAccounts(db, tenantId, account.Id, 0m, 0m, ct);
            if (!mappedAccounts.IsSuccess) return LedgerMappingConflict(mappedAccounts.Error!);
            if (mappedAccounts.CashAccountId == mappedAccounts.PrincipalAccountId)
                return Results.Conflict(new { error = "Kredi anapara borç hesabı ile banka/kasa hesabı aynı hesaba eşlenemez." });
            var currentPrincipal = await OutstandingPrincipal(db, tenantId, id, ct);
            if (currentPrincipal + request.PrincipalAmount > facility.ApprovedLimit)
                return Results.Conflict(new { error = "Kullandırım onaylı kredi limitini aşamaz." });
            var accountMovement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
                CurrencyCode = account.CurrencyCode, TransactionDate = request.TransactionDate, Direction = FinancialDirection.Inflow,
                CashFlowCategory = CashFlowCategory.Financing, Amount = request.PrincipalAmount,
                Description = $"Kredi kullandırım {facility.Code}", Reference = note };
            db.FinancialAccountTransactions.Add(accountMovement);
            var movement = new CreditFacilityMovement { TenantId = tenantId, CreditFacilityId = id, Type = CreditFacilityMovementType.Drawdown,
                TransactionDate = request.TransactionDate, PrincipalAmount = request.PrincipalAmount, RequestId = request.RequestId,
                Notes = note, FinancialAccountTransaction = accountMovement };
            db.CreditFacilityMovements.Add(movement);
            var journal = CreateMovementJournal(tenantId, facility.Code, movement, "CreditFacilityMovement", mappedAccounts.CashAccountId,
                mappedAccounts.PrincipalAccountId, request.PrincipalAmount, debitCash: true, GetUserId(user));
            db.JournalEntries.Add(journal);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.drawdown-posted", Resource = facility.Code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return Results.Conflict(new { error = "Bu kullandırım isteği eşzamanlı olarak kaydedildi; kayıtları yenileyip tekrar deneyin." }); }
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Created($"/api/finance/credit-facilities/{id}/movements/{movement.Id}", new { movement.Id, movement.FinancialAccountTransactionId, JournalEntryId = journal.Id });
        });

        group.MapPost("/{id:guid}/repayments", async (Guid id, CreditFacilityRepaymentRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.RequestId == Guid.Empty || !ValidMoney(request.PrincipalAmount) || !ValidNonNegativeMoney(request.InterestAmount) ||
                !ValidNonNegativeMoney(request.FeeAmount) || request.TransactionDate < new DateOnly(2000, 1, 1) ||
                request.TransactionDate > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(10) || (request.Notes?.Length ?? 0) > 500 ||
                request.PrincipalAmount + request.InterestAmount + request.FeeAmount > 9999999999999999.99m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["repayment"] = ["Tekrar gönderim anahtarı, ödeme tarihi ve tutarlar geçerli olmalıdır."] });
            var note = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            var existing = await db.CreditFacilityMovements.Include(x => x.FinancialAccountTransaction)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (existing is not null)
                return Same(existing, CreditFacilityMovementType.Repayment, id, request.FinancialAccountId, request.TransactionDate,
                    request.PrincipalAmount, request.InterestAmount, request.FeeAmount, request.CreditFacilityScheduleId, note)
                    ? Results.Ok(new { existing.Id, existing.FinancialAccountTransactionId,
                        JournalEntryId = await FindJournalId(db, tenantId, "CreditFacilityMovement", existing.Id, ct) })
                    : Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir kredi hareketinde kullanıldı." });
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var facility = await LoadFacilityForUpdate(db, tenantId, id, ct);
            if (facility is null) return Results.NotFound();
            var racedExisting = await db.CreditFacilityMovements.Include(x => x.FinancialAccountTransaction)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (racedExisting is not null)
            {
                if (transaction is not null) await transaction.CommitAsync(ct);
                return Same(racedExisting, CreditFacilityMovementType.Repayment, id, request.FinancialAccountId, request.TransactionDate,
                    request.PrincipalAmount, request.InterestAmount, request.FeeAmount, request.CreditFacilityScheduleId, note)
                    ? Results.Ok(new { racedExisting.Id, racedExisting.FinancialAccountTransactionId,
                        JournalEntryId = await FindJournalId(db, tenantId, "CreditFacilityMovement", racedExisting.Id, ct) })
                    : Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir kredi hareketinde kullanıldı." });
            }
            if (facility.Status != CreditFacilityStatus.Active || request.TransactionDate < facility.StartDate)
                return Results.Conflict(new { error = "Yalnızca aktif kredi için, başlangıç tarihinden sonra ödeme kaydedilebilir." });
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.TransactionDate, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var account = await LoadAccountForUpdate(db, tenantId, request.FinancialAccountId, ct);
            if (account is null) return Results.NotFound();
            if (!account.IsActive || account.CurrencyCode != facility.CurrencyCode)
                return Results.Conflict(new { error = "Aktif ve krediyle aynı para birimindeki kasa/banka hesabını seçin." });
            var mappedAccounts = await ResolvePostingAccounts(db, tenantId, account.Id, request.InterestAmount, request.FeeAmount, ct);
            if (!mappedAccounts.IsSuccess) return LedgerMappingConflict(mappedAccounts.Error!);
            if (mappedAccounts.CashAccountId == mappedAccounts.PrincipalAccountId)
                return Results.Conflict(new { error = "Kredi anapara borç hesabı ile banka/kasa hesabı aynı hesaba eşlenemez." });
            var outstanding = await OutstandingPrincipal(db, tenantId, id, ct);
            if (request.PrincipalAmount > outstanding)
                return Results.Conflict(new { error = "Ödenen anapara kalan kredi bakiyesini aşamaz." });
            CreditFacilitySchedule? schedule = null;
            if (request.CreditFacilityScheduleId is { } scheduleId)
            {
                schedule = await db.CreditFacilitySchedules.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CreditFacilityId == id && x.Id == scheduleId, ct);
                if (schedule is null) return Results.NotFound();
                if (schedule.Status != CreditFacilityScheduleStatus.Planned || schedule.PrincipalAmount != request.PrincipalAmount ||
                    schedule.InterestAmount != request.InterestAmount || schedule.FeeAmount != request.FeeAmount)
                    return Results.Conflict(new { error = "Taksit ödemesi tutarları açık plan satırıyla aynı olmalıdır." });
                if (await db.CreditFacilityMovements.AnyAsync(x => x.TenantId == tenantId && x.CreditFacilityScheduleId == schedule.Id &&
                    x.Type == CreditFacilityMovementType.Repayment && !x.Reversals.Any(), ct))
                    return Results.Conflict(new { error = "Bu taksitin etkin bir geri ödeme kaydı zaten var." });
            }
            var total = request.PrincipalAmount + request.InterestAmount + request.FeeAmount;
            if (account.Type == FinancialAccountType.Cash)
            {
                var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == account.Id)
                    .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount), ct) ?? 0m;
                if (balance < total) return Results.Conflict(new { error = "Kasa bakiyesi kredi ödemesi için yetersiz." });
            }
            var accountMovement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
                CurrencyCode = account.CurrencyCode, TransactionDate = request.TransactionDate, Direction = FinancialDirection.Outflow,
                CashFlowCategory = CashFlowCategory.Financing, Amount = total,
                Description = $"Kredi geri ödemesi {facility.Code}", Reference = note };
            db.FinancialAccountTransactions.Add(accountMovement);
            var movement = new CreditFacilityMovement { TenantId = tenantId, CreditFacilityId = id, Type = CreditFacilityMovementType.Repayment,
                TransactionDate = request.TransactionDate, PrincipalAmount = request.PrincipalAmount, InterestAmount = request.InterestAmount,
                FeeAmount = request.FeeAmount, RequestId = request.RequestId, CreditFacilityScheduleId = schedule?.Id,
                Notes = note, FinancialAccountTransaction = accountMovement };
            db.CreditFacilityMovements.Add(movement);
            var journal = CreateMovementJournal(tenantId, facility.Code, movement, "CreditFacilityMovement", mappedAccounts.CashAccountId,
                mappedAccounts.PrincipalAccountId, request.PrincipalAmount, debitCash: false, GetUserId(user),
                mappedAccounts.InterestExpenseAccountId, request.InterestAmount, mappedAccounts.FeeExpenseAccountId, request.FeeAmount);
            db.JournalEntries.Add(journal);
            if (schedule is not null) { schedule.Status = CreditFacilityScheduleStatus.Paid; schedule.PaidDate = request.TransactionDate; }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.repayment-posted", Resource = facility.Code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return Results.Conflict(new { error = "Bu geri ödeme isteği eşzamanlı olarak kaydedildi; kayıtları yenileyip tekrar deneyin." }); }
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Created($"/api/finance/credit-facilities/{id}/movements/{movement.Id}", new { movement.Id, movement.FinancialAccountTransactionId, JournalEntryId = journal.Id });
        });

        group.MapPost("/{id:guid}/movements/{movementId:guid}/reversals", async (Guid id, Guid movementId,
            CreditFacilityMovementReversalRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.RequestId == Guid.Empty || request.TransactionDate < new DateOnly(2000, 1, 1) ||
                request.TransactionDate > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(10) || (request.Notes?.Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["reversal"] = ["Tekrar gönderim anahtarı, ters kayıt tarihi ve açıklama geçerli olmalıdır."] });
            var note = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            var priorRequest = await db.CreditFacilityMovements.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (priorRequest is not null)
                return priorRequest.Type == CreditFacilityMovementType.Reversal && priorRequest.CreditFacilityId == id &&
                    priorRequest.ReversesMovementId == movementId && priorRequest.TransactionDate == request.TransactionDate && priorRequest.Notes == note
                    ? Results.Ok(new { priorRequest.Id, priorRequest.FinancialAccountTransactionId,
                        JournalEntryId = await FindJournalId(db, tenantId, "CreditFacilityMovementReversal", priorRequest.Id, ct) })
                    : Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir kredi hareketinde kullanıldı." });

            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var facility = await LoadFacilityForUpdate(db, tenantId, id, ct);
            if (facility is null) return Results.NotFound();
            priorRequest = await db.CreditFacilityMovements.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (priorRequest is not null)
            {
                if (transaction is not null) await transaction.CommitAsync(ct);
                return priorRequest.Type == CreditFacilityMovementType.Reversal && priorRequest.CreditFacilityId == id &&
                    priorRequest.ReversesMovementId == movementId && priorRequest.TransactionDate == request.TransactionDate && priorRequest.Notes == note
                    ? Results.Ok(new { priorRequest.Id, priorRequest.FinancialAccountTransactionId,
                        JournalEntryId = await FindJournalId(db, tenantId, "CreditFacilityMovementReversal", priorRequest.Id, ct) })
                    : Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir kredi hareketinde kullanıldı." });
            }
            if (facility.Status != CreditFacilityStatus.Active)
                return Results.Conflict(new { error = "Ters kayıt için önce krediyi yeniden etkinleştirin." });
            var original = await db.CreditFacilityMovements.Include(x => x.FinancialAccountTransaction).Include(x => x.CreditFacilitySchedule)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CreditFacilityId == id && x.Id == movementId, ct);
            if (original is null) return Results.NotFound();
            if (original.Type == CreditFacilityMovementType.Reversal)
                return Results.Conflict(new { error = "Bir ters kayıt yeniden ters çevrilemez." });
            if (request.TransactionDate < original.TransactionDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["transactionDate"] = ["Ters kayıt tarihi özgün hareket tarihinden önce olamaz."] });
            if (await db.CreditFacilityMovements.AnyAsync(x => x.TenantId == tenantId && x.ReversesMovementId == original.Id, ct))
                return Results.Conflict(new { error = "Bu kredi hareketi daha önce ters kayıtla kapatılmış." });
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.TransactionDate, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var originalJournal = await db.JournalEntries.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                x.SourceType == "CreditFacilityMovement" && x.SourceId == original.Id, ct);
            if (originalJournal is null || originalJournal.Lines.Count < 2 || originalJournal.Lines.Any(x => x.TenantId != tenantId) ||
                originalJournal.Lines.Sum(x => x.Debit) <= 0 || originalJournal.Lines.Sum(x => x.Debit) != originalJournal.Lines.Sum(x => x.Credit) ||
                await db.LedgerAccounts.CountAsync(x => x.TenantId == tenantId && originalJournal.Lines.Select(l => l.AccountId).Distinct().Contains(x.Id), ct) != originalJournal.Lines.Select(l => l.AccountId).Distinct().Count())
                return Results.Conflict(new { error = "Özgün kredi hareketinin dengeli ve tenant kapsamlı muhasebe fişi yok. Önce eski hareketi mutabakatla muhasebeleştirin." });

            var account = await LoadAccountForUpdate(db, tenantId, original.FinancialAccountTransaction.FinancialAccountId, ct);
            if (account is null) return Results.Conflict(new { error = "Özgün banka/kasa hesabı bulunamadı." });
            var principalBefore = await OutstandingPrincipal(db, tenantId, id, ct);
            var principalAfter = original.Type == CreditFacilityMovementType.Drawdown
                ? principalBefore - original.PrincipalAmount
                : principalBefore + original.PrincipalAmount;
            if (principalAfter < 0m)
                return Results.Conflict(new { error = "Önce bu kullandırımı kullanan geri ödeme hareketlerini ters kayıtla kapatın." });
            if (principalAfter > facility.ApprovedLimit)
                return Results.Conflict(new { error = "Ters ödeme kaydı açık anaparayı onaylı kredi limitinin üzerine çıkarır." });
            if (original.Type == CreditFacilityMovementType.Repayment && original.CreditFacilityScheduleId is { } scheduleId)
            {
                var schedule = original.CreditFacilitySchedule;
                if (schedule is null || schedule.Status != CreditFacilityScheduleStatus.Paid ||
                    await db.CreditFacilityMovements.AnyAsync(x => x.TenantId == tenantId && x.CreditFacilityScheduleId == scheduleId &&
                        x.Type == CreditFacilityMovementType.Repayment && x.Id != original.Id && !x.Reversals.Any(), ct))
                    return Results.Conflict(new { error = "Taksit durumu başka bir etkin ödeme tarafından değiştirildi; önce ödeme planını yenileyin." });
                schedule.Status = CreditFacilityScheduleStatus.Planned;
                schedule.PaidDate = null;
            }

            var originalTransaction = original.FinancialAccountTransaction;
            var reverseDirection = originalTransaction.Direction == FinancialDirection.Inflow ? FinancialDirection.Outflow : FinancialDirection.Inflow;
            if (reverseDirection == FinancialDirection.Outflow && account.Type == FinancialAccountType.Cash)
            {
                var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == account.Id)
                    .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount), ct) ?? 0m;
                if (balance < originalTransaction.Amount)
                    return Results.Conflict(new { error = "Kasa bakiyesi ters kaydı gerçekleştirmek için yetersiz." });
            }
            var reversalTransaction = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
                CurrencyCode = originalTransaction.CurrencyCode, TransactionDate = request.TransactionDate, Direction = reverseDirection,
                CashFlowCategory = originalTransaction.CashFlowCategory, Amount = originalTransaction.Amount,
                Description = $"Kredi hareketi ters kaydı {original.Id:N}", Reference = note ?? originalTransaction.Reference,
                ReversalOfId = originalTransaction.Id };
            db.FinancialAccountTransactions.Add(reversalTransaction);
            var reversal = new CreditFacilityMovement { TenantId = tenantId, CreditFacilityId = id,
                Type = CreditFacilityMovementType.Reversal, TransactionDate = request.TransactionDate,
                PrincipalAmount = original.PrincipalAmount, InterestAmount = original.InterestAmount, FeeAmount = original.FeeAmount,
                RequestId = request.RequestId, ReversesMovementId = original.Id, Notes = note, FinancialAccountTransaction = reversalTransaction };
            db.CreditFacilityMovements.Add(reversal);
            var reversalJournal = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = request.TransactionDate,
                Description = $"Kredi hareketi ters kaydı · {facility.Code} · {original.Id:N}", SourceType = "CreditFacilityMovementReversal",
                SourceId = reversal.Id, CreatedByUserId = GetUserId(user) };
            foreach (var line in originalJournal.Lines.OrderBy(x => x.LineNumber))
                reversalJournal.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = reversalJournal.Id,
                    AccountId = line.AccountId, LineNumber = line.LineNumber, Description = $"Ters kayıt · {line.Description}",
                    Debit = line.Credit, Credit = line.Debit });
            db.JournalEntries.Add(reversalJournal);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.movement-reversed",
                Resource = $"{facility.Code};{original.Id};{reversal.Id}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return Results.Conflict(new { error = "Bu kredi hareketi veya tekrar gönderim anahtarı eşzamanlı olarak ters kaydedildi; kayıtları yenileyin." }); }
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Created($"/api/finance/credit-facilities/{id}/movements/{reversal.Id}", new { reversal.Id, reversal.FinancialAccountTransactionId, JournalEntryId = reversalJournal.Id });
        });

        group.MapPut("/{id:guid}/status", async (Guid id, CreditFacilityStatusRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var facility = await LoadFacilityForUpdate(db, tenantId, id, ct);
            if (facility is null) return Results.NotFound();
            if (request.Status is not ("Active" or "Closed")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["Durum Active veya Closed olmalıdır."] });
            var status = request.Status == "Active" ? CreditFacilityStatus.Active : CreditFacilityStatus.Closed;
            var hasPlannedSchedule = status == CreditFacilityStatus.Closed && await db.CreditFacilitySchedules.AnyAsync(x =>
                x.TenantId == tenantId && x.CreditFacilityId == id && x.Status == CreditFacilityScheduleStatus.Planned, ct);
            if (hasPlannedSchedule)
                return Results.Conflict(new { error = "Planlanmış ödemeler tamamlanmadan veya iptal edilmeden kredi kapatılamaz." });
            if (status == CreditFacilityStatus.Closed && await OutstandingPrincipal(db, tenantId, id, ct) > 0m)
                return Results.Conflict(new { error = "Açık anapara bakiyesi sıfırlanmadan kredi kapatılamaz." });
            facility.Status = status;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.status-changed", Resource = $"{facility.Code};{status}" });
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.NoContent();
        });

        group.MapPut("/schedule/{scheduleId:guid}/status", async (Guid scheduleId, CreditFacilityScheduleStatusRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(user, out var tenantId) || !IsTenantAdmin(user)) return Results.Forbid();
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var scheduleTenant = await db.CreditFacilitySchedules.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == scheduleId)
                .Select(x => x.CreditFacilityId).SingleOrDefaultAsync(ct);
            if (scheduleTenant == Guid.Empty) return Results.NotFound();
            var facility = await LoadFacilityForUpdate(db, tenantId, scheduleTenant, ct);
            if (facility is null) return Results.NotFound();
            var item = await db.CreditFacilitySchedules.Include(x => x.CreditFacility)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == scheduleId, ct);
            if (item is null) return Results.NotFound();
            if (item.Status == CreditFacilityScheduleStatus.Paid) return Results.Conflict(new { error = "Ödenmiş plan satırı değiştirilemez." });
            if (request.Status is "Paid") return Results.Conflict(new { error = "Ödeme, banka/kasa hesabı seçilerek kredi geri ödeme kaydıyla yapılmalıdır." });
            else if (request.Status is "Cancelled")
            {
                item.Status = CreditFacilityScheduleStatus.Cancelled;
                item.PaidDate = null;
            }
            else return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["Durum Paid veya Cancelled olmalıdır."] });
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(user), Action = "finance.credit-facility.schedule-status-changed", Resource = $"{item.CreditFacility.Code};{item.Status}" });
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.NoContent();
        });
    }

    internal static async Task<IResult> PostInterestAccrualAsync(Guid id, int year, int month, Guid tenantId,
        Guid? userId, TenantDbContext db, CancellationToken ct)
    {
        if (year is < 2000 or > 2100 || month is < 1 or > 12)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["period"] = ["Yıl ve ay geçerli olmalıdır."] });
        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);
        if (monthEnd > IstanbulToday())
            return Results.Conflict(new { error = "Aylık faiz tahakkuku yalnızca ay kapandıktan sonra muhasebeleştirilebilir." });

        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
        var facility = await LoadFacilityForUpdate(db, tenantId, id, ct);
        if (facility is null) return Results.NotFound();
        if (facility.AnnualInterestRatePercent is not { } annualRate)
            return Results.Conflict(new { error = "Faiz oranı tanımlanmamış; tahakkuk muhasebeleştirilemedi." });

        var sourceId = InterestAccrualSourceId(tenantId, facility.Id, year, month);
        var existing = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId &&
                x.SourceType == "CreditFacilityInterestAccrual" && x.SourceId == sourceId)
            .Select(x => new { x.Id, x.EntryDate, Amount = x.Lines.Where(l => l.Debit > 0).Sum(l => (decimal?)l.Debit) ?? 0m })
            .SingleOrDefaultAsync(ct);
        if (existing is not null)
        {
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(new { existing.Id, existing.EntryDate, accruedInterest = existing.Amount, replayed = true });
        }

        var from = facility.StartDate > monthStart ? facility.StartDate : monthStart;
        var to = facility.MaturityDate is { } maturity && maturity < monthEnd ? maturity : monthEnd;
        var calculated = from > to ? [] : await CalculateInterestAccrualAsync(db, tenantId, facility, from, to, ct);
        if (calculated is null)
            return Results.Conflict(new { error = "Kredi hareketleri negatif anapara oluşturuyor; önce kredi defterini mutabık hale getirin." });
        var amount = calculated.SingleOrDefault(x => x.Month == $"{year:D4}-{month:D2}")?.Amount ?? 0m;
        if (amount < 0m || amount > 9999999999999999.99m)
            return Results.Conflict(new { error = "Aylık tahakkuk tutarı geçerli finansal sınırlar dışında." });
        if (amount == 0m)
        {
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(new { facilityId = facility.Id, facility.Code, period = $"{year:D4}-{month:D2}",
                currencyCode = facility.CurrencyCode, accruedInterest = 0m, posted = false, reason = "Dönemde tahakkuk edecek faiz yok." });
        }

        var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, monthEnd, ct);
        if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
        var mappingKeys = new[] { LedgerMappingKeys.CreditFacilityInterestExpense, LedgerMappingKeys.CreditFacilityAccruedInterest };
        var mappings = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId && mappingKeys.Contains(x.MappingKey))
            .Join(db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive),
                mapping => new { mapping.TenantId, Id = mapping.AccountId }, account => new { account.TenantId, account.Id },
                (mapping, account) => new { mapping.MappingKey, Account = account }).ToDictionaryAsync(x => x.MappingKey, x => x.Account, ct);
        if (!mappings.TryGetValue(LedgerMappingKeys.CreditFacilityInterestExpense, out var expense) || expense.StatementSection != LedgerAccountStatementSection.Expense ||
            !mappings.TryGetValue(LedgerMappingKeys.CreditFacilityAccruedInterest, out var accrued) || accrued.StatementSection != LedgerAccountStatementSection.Liability ||
            expense.Id == accrued.Id)
            return Results.Conflict(new { error = "Firma ayarlarında farklı ve etkin faiz gideri ile tahakkuk etmiş faiz borcu hesaplarını eşleyin." });

        var journal = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = monthEnd,
            Description = $"Kredi aylık faiz tahakkuku · {facility.Code} · {year:D4}-{month:D2}",
            SourceType = "CreditFacilityInterestAccrual", SourceId = sourceId, CreatedByUserId = userId };
        journal.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = journal.Id, AccountId = expense.Id,
            LineNumber = 1, Description = journal.Description, Debit = amount, Credit = 0m });
        journal.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = journal.Id, AccountId = accrued.Id,
            LineNumber = 2, Description = journal.Description, Debit = 0m, Credit = amount });
        db.JournalEntries.Add(journal);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "finance.credit-facility.interest-accrual-posted",
            Resource = $"{facility.Code};{year:D4}-{month:D2};{amount:0.00};{journal.Id}" });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            var replayJournalId = await FindJournalId(db, tenantId, "CreditFacilityInterestAccrual", sourceId, ct);
            if (replayJournalId is null) throw;
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(new { Id = replayJournalId.Value, EntryDate = monthEnd, accruedInterest = amount, replayed = true });
        }
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Results.Created($"/api/finance/credit-facilities/{id}/interest-accruals/{year}/{month}",
            new { journal.Id, journal.EntryDate, accruedInterest = amount, currencyCode = facility.CurrencyCode, replayed = false });
    }

    private static bool TryGetTenantId(ClaimsPrincipal user, out Guid tenantId) => Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
    private static bool IsTenantAdmin(ClaimsPrincipal user) => user.FindFirstValue("role") == "TenantAdmin";
    private static Guid? GetUserId(ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var id) ? id : null;
    private static bool ValidMoney(decimal value) => value > 0 && value <= 9999999999999999.99m && decimal.Round(value, 2) == value;
    private static bool ValidNonNegativeMoney(decimal value) => value >= 0 && value <= 9999999999999999.99m && decimal.Round(value, 2) == value;
    private static bool IsUniqueViolation(DbUpdateException exception) => exception.GetBaseException() is SqlException { Number: 2601 or 2627 };
    private static async Task<Guid?> FindJournalId(TenantDbContext db, Guid tenantId, string sourceType, Guid sourceId, CancellationToken ct) =>
        await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == sourceId)
            .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
    private static async Task<PostingAccounts> ResolvePostingAccounts(TenantDbContext db, Guid tenantId, Guid financialAccountId,
        decimal interestAmount, decimal feeAmount, CancellationToken ct)
    {
        var cashKey = LedgerMappingKeys.FinancialAccountPrefix + financialAccountId.ToString("D");
        var requiredKeys = new List<string> { cashKey, LedgerMappingKeys.CreditFacilityPrincipal };
        if (interestAmount > 0) requiredKeys.Add(LedgerMappingKeys.CreditFacilityInterestExpense);
        if (feeAmount > 0) requiredKeys.Add(LedgerMappingKeys.CreditFacilityFeeExpense);
        var mappings = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId &&
            requiredKeys.Contains(x.MappingKey))
            .Select(x => new { x.MappingKey, x.AccountId }).ToListAsync(ct);
        var cashId = mappings.FirstOrDefault(x => x.MappingKey == cashKey)?.AccountId;
        var principalId = mappings.FirstOrDefault(x => x.MappingKey == LedgerMappingKeys.CreditFacilityPrincipal)?.AccountId;
        var interestId = mappings.FirstOrDefault(x => x.MappingKey == LedgerMappingKeys.CreditFacilityInterestExpense)?.AccountId;
        var feeId = mappings.FirstOrDefault(x => x.MappingKey == LedgerMappingKeys.CreditFacilityFeeExpense)?.AccountId;
        if (cashId is null || principalId is null || (interestAmount > 0 && interestId is null) || (feeAmount > 0 && feeId is null))
            return new PostingAccounts(false, Guid.Empty, Guid.Empty, null, null,
                "Kredi hareketi için seçilen banka/kasa hesabını, anapara borç hesabını ve varsa faiz/ücret gider hesaplarını eşleyin.");
        var ids = new List<Guid> { cashId.Value, principalId.Value };
        if (interestId is { } interest) ids.Add(interest);
        if (feeId is { } fee) ids.Add(fee);
        var distinctIds = ids.Distinct().ToArray();
        var activeIds = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && distinctIds.Contains(x.Id))
            .Select(x => x.Id).ToListAsync(ct);
        if (activeIds.Count != distinctIds.Length)
            return new PostingAccounts(false, Guid.Empty, Guid.Empty, null, null,
                "Kredi hareketi hesap eşlemelerinden biri bu firmada yok veya pasif. Aktif tenant hesaplarını eşleyin.");
        return new PostingAccounts(true, cashId.Value, principalId.Value, interestId, feeId, null);
    }
    private static IResult LedgerMappingConflict(string error) => Results.Conflict(new { error });
    private static IResult ClosedPeriodConflict(DateOnly fromDate, DateOnly toDate) =>
        Results.Conflict(new { error = $"{fromDate:yyyy-MM-dd}–{toDate:yyyy-MM-dd} dönemi kapalı; kredi hareketi bu tarihe kaydedilemez." });
    private static async Task<IReadOnlyList<CreditFacilityMonthlyAccrual>?> CalculateInterestAccrualAsync(
        TenantDbContext db, Guid tenantId, CreditFacility facility, DateOnly from, DateOnly to, CancellationToken ct)
    {
        if (from > to) return Array.Empty<CreditFacilityMonthlyAccrual>();
        var movements = await db.CreditFacilityMovements.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.CreditFacilityId == facility.Id && x.TransactionDate <= to)
            .OrderBy(x => x.TransactionDate).ThenBy(x => x.CreatedAt)
            .Select(x => new CreditFacilityAccrualMovement(x.TransactionDate, x.Type, x.PrincipalAmount,
                x.ReversesMovement == null ? null : x.ReversesMovement.Type))
            .ToListAsync(ct);
        var byDate = movements.GroupBy(x => x.TransactionDate).ToDictionary(x => x.Key, x => x.ToArray());
        var principal = 0m;
        foreach (var movement in movements.Where(x => x.TransactionDate < from))
            principal += SignedPrincipal(movement);
        if (principal < 0) return null;

        var dailyRate = (facility.AnnualInterestRatePercent ?? 0m) / 100m / 365m;
        var monthly = new Dictionary<string, (decimal Amount, decimal ClosingPrincipal)>(StringComparer.Ordinal);
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            if (byDate.TryGetValue(date, out var todayMovements))
                foreach (var movement in todayMovements)
                {
                    principal += SignedPrincipal(movement);
                    if (principal < 0) return null;
                }
            var key = date.ToString("yyyy-MM", System.Globalization.CultureInfo.InvariantCulture);
            var dailyInterest = principal * dailyRate;
            var current = monthly.GetValueOrDefault(key);
            monthly[key] = (current.Amount + dailyInterest, principal);
        }
        return monthly.OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => new CreditFacilityMonthlyAccrual(x.Key,
                decimal.Round(x.Value.Amount, 2, MidpointRounding.AwayFromZero), x.Value.ClosingPrincipal)).ToArray();
    }
    private static decimal SignedPrincipal(CreditFacilityAccrualMovement movement) => movement.Type switch
    {
        CreditFacilityMovementType.Drawdown => movement.PrincipalAmount,
        CreditFacilityMovementType.Repayment => -movement.PrincipalAmount,
        CreditFacilityMovementType.Reversal when movement.ReversedType == CreditFacilityMovementType.Drawdown => -movement.PrincipalAmount,
        CreditFacilityMovementType.Reversal when movement.ReversedType == CreditFacilityMovementType.Repayment => movement.PrincipalAmount,
        _ => 0m
    };
    private static Guid InterestAccrualSourceId(Guid tenantId, Guid facilityId, int year, int month)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"credit-facility-interest-accrual|{tenantId:D}|{facilityId:D}|{year:D4}-{month:D2}"));
        return new Guid(bytes.AsSpan(0, 16));
    }
    private static JournalEntry CreateMovementJournal(Guid tenantId, string facilityCode, CreditFacilityMovement movement, string sourceType,
        Guid cashAccountId, Guid principalAccountId, decimal principalAmount, bool debitCash, Guid? userId,
        Guid? interestExpenseAccountId = null, decimal interestAmount = 0, Guid? feeExpenseAccountId = null, decimal feeAmount = 0)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = movement.TransactionDate,
            Description = $"Kredi {(debitCash ? "kullandırım" : "anapara geri ödemesi")} · {facilityCode}", SourceType = sourceType,
            SourceId = movement.Id, CreatedByUserId = userId };
        var number = 1;
        entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = debitCash ? cashAccountId : principalAccountId,
            LineNumber = number++, Description = entry.Description, Debit = principalAmount, Credit = 0m });
        if (!debitCash && interestAmount > 0) entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id,
            AccountId = interestExpenseAccountId!.Value, LineNumber = number++, Description = $"Kredi faizi · {facilityCode}", Debit = interestAmount, Credit = 0m });
        if (!debitCash && feeAmount > 0) entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id,
            AccountId = feeExpenseAccountId!.Value, LineNumber = number++, Description = $"Kredi ücreti/komisyonu · {facilityCode}", Debit = feeAmount, Credit = 0m });
        entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = debitCash ? principalAccountId : cashAccountId,
            LineNumber = number, Description = entry.Description, Debit = 0m, Credit = debitCash ? principalAmount : principalAmount + interestAmount + feeAmount });
        return entry;
    }
    private sealed record PostingAccounts(bool IsSuccess, Guid CashAccountId, Guid PrincipalAccountId, Guid? InterestExpenseAccountId, Guid? FeeExpenseAccountId, string? Error);
    private static Task<CreditFacility?> LoadFacilityForUpdate(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.CreditFacilities.FromSqlInterpolated($"SELECT * FROM [dbo].[CreditFacilities] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(ct)
            : db.CreditFacilities.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
    private static Task<FinancialAccount?> LoadAccountForUpdate(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(ct)
            : db.FinancialAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
    private static async Task<decimal> OutstandingPrincipal(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) =>
        (await db.CreditFacilityMovements.Where(x => x.TenantId == tenantId && x.CreditFacilityId == id && x.Type == CreditFacilityMovementType.Drawdown && !x.Reversals.Any()).SumAsync(x => (decimal?)x.PrincipalAmount, ct) ?? 0m) -
        (await db.CreditFacilityMovements.Where(x => x.TenantId == tenantId && x.CreditFacilityId == id && x.Type == CreditFacilityMovementType.Repayment && !x.Reversals.Any()).SumAsync(x => (decimal?)x.PrincipalAmount, ct) ?? 0m);
    private static bool Same(CreditFacilityMovement movement, CreditFacilityMovementType type, Guid facilityId, Guid accountId,
        DateOnly date, decimal principal, decimal interest, decimal fee, Guid? scheduleId, string? notes) =>
        movement.Type == type && movement.CreditFacilityId == facilityId && movement.FinancialAccountTransaction.FinancialAccountId == accountId &&
        movement.TransactionDate == date && movement.PrincipalAmount == principal && movement.InterestAmount == interest &&
        movement.FeeAmount == fee && movement.CreditFacilityScheduleId == scheduleId && movement.Notes == notes;
    private static DateOnly IstanbulToday()
    {
        TimeZoneInfo timeZone;
        try { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch (TimeZoneNotFoundException) { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, timeZone).DateTime);
    }
}

public sealed record CreditFacilityCreateRequest(string Code, string LenderName, string FacilityType, string CurrencyCode,
    decimal ApprovedLimit, DateOnly StartDate, DateOnly? MaturityDate, decimal? AnnualInterestRatePercent, string? Notes);
public sealed record CreditFacilityScheduleCreateRequest(DateOnly DueDate, decimal PrincipalAmount, decimal InterestAmount, decimal FeeAmount, string? Notes);
public sealed record CreditFacilityStatusRequest(string Status);
public sealed record CreditFacilityScheduleStatusRequest(string Status, DateOnly? PaidDate);
public sealed record CreditFacilityDrawdownRequest(Guid RequestId, Guid FinancialAccountId, DateOnly TransactionDate, decimal PrincipalAmount, string? Notes);
public sealed record CreditFacilityRepaymentRequest(Guid RequestId, Guid FinancialAccountId, Guid? CreditFacilityScheduleId, DateOnly TransactionDate,
    decimal PrincipalAmount, decimal InterestAmount, decimal FeeAmount, string? Notes);
public sealed record CreditFacilityMovementReversalRequest(Guid RequestId, DateOnly TransactionDate, string? Notes);
public sealed record CreditFacilitySecurityCreateRequest(CreditSecurityType Type, string Code, string Issuer, string Beneficiary,
    decimal Amount, string CurrencyCode, decimal CommissionAmount, DateOnly IssueDate, DateOnly ExpiryDate, string? Notes);
public sealed record CreditFacilitySecurityStatusRequest(string Status);
public sealed record CreditFacilityAccrualMovement(DateOnly TransactionDate, CreditFacilityMovementType Type, decimal PrincipalAmount,
    CreditFacilityMovementType? ReversedType);
public sealed record CreditFacilityMonthlyAccrual(string Month, decimal Amount, decimal ClosingPrincipal);
public sealed record CreditFacilityView(Guid Id, string Code, string LenderName, string FacilityType, string CurrencyCode,
    decimal ApprovedLimit, DateOnly StartDate, DateOnly? MaturityDate, decimal? AnnualInterestRatePercent, string Status,
    string? Notes, decimal TotalDrawdown, decimal PrincipalRepaid, decimal OutstandingPrincipal, int OpenScheduleCount, decimal OpenScheduleTotal,
    IReadOnlyList<CreditFacilityScheduleView> Schedule, IReadOnlyList<CreditFacilityMovementView> Movements);
public sealed record CreditFacilityScheduleView(Guid Id, DateOnly DueDate, decimal PrincipalAmount, decimal InterestAmount,
    decimal FeeAmount, string Status, DateOnly? PaidDate, string? Notes);
public sealed record CreditFacilityMovementView(Guid Id, string Type, DateOnly TransactionDate, decimal PrincipalAmount, decimal InterestAmount,
    decimal FeeAmount, string AccountCode, Guid FinancialAccountTransactionId, Guid? CreditFacilityScheduleId, string? Notes,
    Guid? ReversesMovementId, bool IsReversed, Guid? JournalEntryId);
public sealed record CreditFacilitySecurityView(Guid Id, Guid CreditFacilityId, string FacilityCode, string Type, string Code,
    string Issuer, string Beneficiary, decimal Amount, string CurrencyCode, decimal CommissionAmount, DateOnly IssueDate,
    DateOnly ExpiryDate, string Status, string? Notes);
