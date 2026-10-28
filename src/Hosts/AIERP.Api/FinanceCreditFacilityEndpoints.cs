using System.Security.Claims;
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
public sealed record CreditFacilityView(Guid Id, string Code, string LenderName, string FacilityType, string CurrencyCode,
    decimal ApprovedLimit, DateOnly StartDate, DateOnly? MaturityDate, decimal? AnnualInterestRatePercent, string Status,
    string? Notes, decimal TotalDrawdown, decimal PrincipalRepaid, decimal OutstandingPrincipal, int OpenScheduleCount, decimal OpenScheduleTotal,
    IReadOnlyList<CreditFacilityScheduleView> Schedule, IReadOnlyList<CreditFacilityMovementView> Movements);
public sealed record CreditFacilityScheduleView(Guid Id, DateOnly DueDate, decimal PrincipalAmount, decimal InterestAmount,
    decimal FeeAmount, string Status, DateOnly? PaidDate, string? Notes);
public sealed record CreditFacilityMovementView(Guid Id, string Type, DateOnly TransactionDate, decimal PrincipalAmount, decimal InterestAmount,
    decimal FeeAmount, string AccountCode, Guid FinancialAccountTransactionId, Guid? CreditFacilityScheduleId, string? Notes,
    Guid? ReversesMovementId, bool IsReversed, Guid? JournalEntryId);
