using System.Data;
using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

public static class FixedAssetEndpoints
{
    private const string DepreciationExpenseAccount = LedgerMappingKeys.FixedAssetDepreciationExpense;
    private const string AccumulatedDepreciationAccount = LedgerMappingKeys.FixedAssetAccumulatedDepreciation;
    private const string AssetCostAccount = LedgerMappingKeys.FixedAssetCost;
    private const string DisposalProceedsAccount = LedgerMappingKeys.FixedAssetDisposalProceeds;
    private const string DisposalGainAccount = LedgerMappingKeys.FixedAssetDisposalGain;
    private const string DisposalLossAccount = LedgerMappingKeys.FixedAssetDisposalLoss;

    public static void MapFixedAssetEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/fixed-assets").WithTags("Sabit Kıymetler").RequireAuthorization();

        group.MapGet("/", async (string? q, int? page, int? pageSize, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var currentPage = Math.Max(1, page ?? 1); var size = Math.Clamp(pageSize ?? 50, 1, 200);
            var query = db.FixedAssets.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                if (term.Length is < 2 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["Arama en az 2, en fazla 100 karakter olmalıdır."] });
                query = query.Where(x => x.AssetCode.Contains(term) || x.Name.Contains(term) || (x.Category != null && x.Category.Contains(term)));
            }
            var total = await query.CountAsync(ct);
            var rows = await query.OrderBy(x => x.AssetCode).Skip((currentPage - 1) * size).Take(size)
                .Select(x => new FixedAssetView(x.Id, x.AssetCode, x.Name, x.Category, x.AcquisitionDate, x.InServiceDate,
                    x.AcquisitionCostBase, x.ResidualValueBase, x.UsefulLifeMonths, x.AccumulatedDepreciationBase,
                    x.Status.ToString(), x.SupplierAccountId, x.SourceReference, x.PurchaseInvoiceId, Convert.ToBase64String(x.RowVersion)))
                .ToListAsync(ct);
            return Results.Ok(new { items = rows, page = currentPage, pageSize = size, totalCount = total });
        });

        group.MapGet("/purchase-invoices", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var invoices = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
                .OrderByDescending(x => x.InvoiceDate).ThenBy(x => x.Code)
                .Select(x => new { x.Id, x.Code, x.SupplierId, x.InvoiceDate, x.GrandTotal })
                .ToListAsync(ct);
            var journals = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "PurchaseInvoice")
                .ToDictionaryAsync(x => x.SourceId, x => x.Id, ct);
            return Results.Ok(invoices.Select(x => new FixedAssetPurchaseInvoiceOption(x.Id, x.Code, x.SupplierId, x.InvoiceDate,
                x.GrandTotal, journals.GetValueOrDefault(x.Id))));
        });

        group.MapPost("/", async (FixedAssetCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var code = request.AssetCode?.Trim().ToUpperInvariant(); var name = request.Name?.Trim();
            if (!ValidCode(code) || string.IsNullOrWhiteSpace(name) || name.Length > 160 || (request.Category?.Length ?? 0) > 80 ||
                request.AcquisitionDate == default || request.InServiceDate < request.AcquisitionDate ||
                request.AcquisitionCostBase <= 0 || request.AcquisitionCostBase > 9999999999999999.99m ||
                request.ResidualValueBase < 0 || request.ResidualValueBase >= request.AcquisitionCostBase ||
                request.UsefulLifeMonths is < 1 or > 1200 || (request.SourceReference?.Length ?? 0) > 120)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["asset"] = ["Kod, ad, geçerli edinim ve kullanım tarihleri, maliyet, kalıntı değer ve 1–1200 ay faydalı ömür zorunludur."] });
            if (await db.FixedAssets.AnyAsync(x => x.TenantId == tenantId && x.AssetCode == code, ct))
                return Results.Conflict(new { error = "Bu firmada sabit kıymet kodu zaten kullanılıyor." });
            Guid? linkedSupplierId = null;
            if (request.PurchaseInvoiceId is { } invoiceId)
            {
                linkedSupplierId = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == invoiceId && x.Status == PurchaseInvoiceStatus.Posted)
                    .Select(x => (Guid?)x.SupplierId).SingleOrDefaultAsync(ct);
                if (linkedSupplierId is null || request.SupplierAccountId is { } requestedSupplier && requestedSupplier != linkedSupplierId)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["purchaseInvoiceId"] = ["Aynı tenantta, seçili tedarikçiye ait etkin alış faturası bulunamadı."] });
            }
            var supplierAccountId = request.SupplierAccountId ?? linkedSupplierId;
            if (supplierAccountId is { } supplierId && !await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == supplierId && x.IsActive && (x.Type == CounterpartyType.Supplier || x.Type == CounterpartyType.Both), ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["supplierAccountId"] = ["Etkin tedarikçi hesabı bulunamadı."] });
            var asset = new FixedAsset { TenantId = tenantId, AssetCode = code!, Name = name!, Category = Clean(request.Category),
                AcquisitionDate = request.AcquisitionDate, InServiceDate = request.InServiceDate,
                AcquisitionCostBase = decimal.Round(request.AcquisitionCostBase, 2, MidpointRounding.AwayFromZero),
                ResidualValueBase = decimal.Round(request.ResidualValueBase, 2, MidpointRounding.AwayFromZero),
                UsefulLifeMonths = request.UsefulLifeMonths, SupplierAccountId = supplierAccountId, PurchaseInvoiceId = request.PurchaseInvoiceId,
                SourceReference = Clean(request.SourceReference) };
            db.FixedAssets.Add(asset);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.acquired", Resource = asset.AssetCode });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/fixed-assets/{asset.Id}", ToView(asset));
        });

        group.MapGet("/{id:guid}/acquisition-posting", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var asset = await db.FixedAssets.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (asset is null) return Results.NotFound();
            var entry = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition" && x.SourceId == id, ct);
            var invoiceCode = asset.PurchaseInvoiceId is { } invoiceId
                ? await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == invoiceId).Select(x => x.Code).SingleOrDefaultAsync(ct)
                : null;
            if (entry is null) return Results.Ok(new FixedAssetAcquisitionPostingView(id, invoiceCode, null, null, []));
            var accountIds = entry.Lines.Select(x => x.AccountId).Distinct().ToArray();
            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && accountIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => new { x.Code, x.Name }, ct);
            return Results.Ok(new FixedAssetAcquisitionPostingView(id, invoiceCode, entry.Id, entry.EntryDate,
                entry.Lines.OrderBy(x => x.LineNumber).Select(x => new FixedAssetAcquisitionJournalLineView(x.AccountId,
                    accounts.GetValueOrDefault(x.AccountId)?.Code ?? "", accounts.GetValueOrDefault(x.AccountId)?.Name ?? "",
                    x.Debit, x.Credit)).ToArray()));
        });

        group.MapPost("/{id:guid}/acquisition-posting", async (Guid id, FixedAssetAcquisitionPostingRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await BeginTenantMutationAsync(db, tenantId, ct);
            if (!await TenantExistsUnderLockAsync(db, tenantId, ct)) return Results.NotFound();
            var prior = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition" && x.SourceId == id, ct);
            if (prior is not null) return Results.Ok(ToAcquisitionPostingView(prior));
            var asset = await db.FixedAssets.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (asset is null) return Results.NotFound();
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, asset.AcquisitionDate, ct);
            if (closedPeriod is { } closedAcquisitionPeriod)
                return Results.Conflict(new { error = "Edinim tarihi kapalı mali dönem içinde; yevmiye oluşturulmadı.", fromDate = closedAcquisitionPeriod.FromDate, toDate = closedAcquisitionPeriod.ToDate });
            if (asset.PurchaseInvoiceId is { } purchaseInvoiceId)
            {
                var invoiceJournalId = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "PurchaseInvoice" && x.SourceId == purchaseInvoiceId)
                    .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                return Results.Conflict(new { error = "Alış faturasıyla ilişkili sabit kıymet için edinim fişi oluşturulmadı. Fatura satırlarının maliyete dağıtımı ve KDV'nin indirilebilirlik politikası doğrulanmadan güvenli muhasebe kaydı yapılamaz.",
                    purchaseInvoiceId, invoiceJournalEntryId = invoiceJournalId, requiresAccountingPolicyDecision = true });
            }
            var assetCostAccountId = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId && x.MappingKey == AssetCostAccount)
                .Join(db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive), m => new { m.TenantId, AccountId = m.AccountId }, a => new { a.TenantId, AccountId = a.Id }, (_, a) => (Guid?)a.Id)
                .SingleOrDefaultAsync(ct);
            if (assetCostAccountId is null)
                return Results.Conflict(new { error = "Sabit kıymet maliyet eşlemesi eksik veya pasif.", requiredMapping = AssetCostAccount });
            if (request.OffsetAccountId == Guid.Empty || request.OffsetAccountId == assetCostAccountId.Value)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["offsetAccountId"] = ["Edinim karşı hesabı, etkin sabit kıymet maliyet hesabından farklı olmalıdır."] });
            var offsetAccountExists = await db.LedgerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.OffsetAccountId && x.IsActive, ct);
            if (!offsetAccountExists)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["offsetAccountId"] = ["Etkin tenant defter hesabı bulunamadı."] });
            var entry = new JournalEntry
            {
                TenantId = tenantId, Code = $"FAACQ-{id.ToString("N")[..12]}", EntryDate = asset.AcquisitionDate,
                Description = $"Sabit kıymet edinimi · {asset.AssetCode}", SourceType = "FixedAssetAcquisition", SourceId = asset.Id,
                CreatedByUserId = userId,
                Lines = [new JournalEntryLine { TenantId = tenantId, AccountId = assetCostAccountId.Value, LineNumber = 1,
                        Description = $"Sabit kıymet maliyeti · {asset.AssetCode}", Debit = asset.AcquisitionCostBase },
                    new JournalEntryLine { TenantId = tenantId, AccountId = request.OffsetAccountId, LineNumber = 2,
                        Description = $"Edinim karşı hesabı · {asset.AssetCode}", Credit = asset.AcquisitionCostBase }]
            };
            db.JournalEntries.Add(entry);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.acquisition-posted", Resource = asset.AssetCode });
            try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateException)
            {
                var raced = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition" && x.SourceId == id, ct);
                if (raced is not null) return Results.Ok(ToAcquisitionPostingView(raced));
                throw;
            }
            return Results.Created($"/api/fixed-assets/{id}/acquisition-posting", ToAcquisitionPostingView(entry));
        });

        group.MapGet("/{id:guid}/depreciation-schedule", async (Guid id, DateOnly? through, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var asset = await db.FixedAssets.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (asset is null) return Results.NotFound();
            var endMonth = through ?? DateOnly.FromDateTime(DateTime.UtcNow);
            if (endMonth > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(20))
                return Results.BadRequest(new { error = "Bitiş tarihi 20 yıldan fazla ileride olamaz." });
            var firstMonth = new DateOnly(asset.InServiceDate.Year, asset.InServiceDate.Month, 1).AddMonths(1);
            var finalMonth = firstMonth.AddMonths(asset.UsefulLifeMonths - 1);
            var lastMonth = new DateOnly(endMonth.Year, endMonth.Month, 1);
            var postings = await db.FixedAssetDepreciationPostings.AsNoTracking().Where(x => x.TenantId == tenantId && x.AssetId == id)
                .ToDictionaryAsync(x => x.PeriodStart, ct);
            var depreciable = asset.AcquisitionCostBase - asset.ResidualValueBase;
            var plannedPerMonth = decimal.Max(0.01m, decimal.Round(depreciable / asset.UsefulLifeMonths, 2, MidpointRounding.AwayFromZero));
            var remaining = depreciable - asset.AccumulatedDepreciationBase;
            var rows = new List<DepreciationScheduleLine>();
            for (var month = firstMonth; month <= lastMonth && remaining > 0; month = month.AddMonths(1))
            {
                if (postings.TryGetValue(month, out var posted))
                {
                    rows.Add(new(month, posted.AmountBase, true, posted.JournalEntryId));
                    continue;
                }
                // Keep the rounded monthly amount stable, then absorb any cent remainder
                // in the final useful-life period so the schedule reaches residual value.
                var amount = month == finalMonth ? remaining : decimal.Min(plannedPerMonth, remaining);
                if (amount > 0) rows.Add(new(month, amount, false, null));
                remaining -= amount;
            }
            return Results.Ok(new { assetId = id, method = "StraightLineMonthlyAfterInServiceMonth", currencyBasis = "Tenant base currency",
                acquisitionCostBase = asset.AcquisitionCostBase, residualValueBase = asset.ResidualValueBase,
                accumulatedDepreciationBase = asset.AccumulatedDepreciationBase, rows });
        });

        group.MapPost("/{id:guid}/depreciation-postings", async (Guid id, FixedAssetDepreciationRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (request.PeriodStart.Day != 1 || request.PeriodStart != new DateOnly(request.PeriodStart.Year, request.PeriodStart.Month, 1))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["periodStart"] = ["Dönem başlangıcı ayın ilk günü olmalıdır."] });
            await using var transaction = await BeginTenantMutationAsync(db, tenantId, ct);
            if (!await TenantExistsUnderLockAsync(db, tenantId, ct)) return Results.NotFound();
            var asset = await db.FixedAssets.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.Status == FixedAssetStatus.Active, ct);
            if (asset is null) return Results.NotFound();
            var month = request.PeriodStart;
            var firstMonth = new DateOnly(asset.InServiceDate.Year, asset.InServiceDate.Month, 1).AddMonths(1);
            var finalMonth = firstMonth.AddMonths(asset.UsefulLifeMonths - 1);
            if (month < firstMonth || month > new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["periodStart"] = ["Yalnız kullanım tarihini izleyen ve geçerli döneme kadar olan aylar kaydedilebilir."] });
            if (await db.FixedAssetDepreciationPostings.AnyAsync(x => x.TenantId == tenantId && x.AssetId == id && x.PeriodStart == month, ct))
                return Results.Conflict(new { error = "Bu kıymet için dönem amortismanı zaten kaydedilmiş." });
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.PeriodStart.AddMonths(1).AddDays(-1), ct);
            if (closedPeriod is { } closedDepreciationPeriod)
                return Results.Conflict(new { error = "Amortisman dönemi kapalı mali dönem içinde; yevmiye oluşturulmadı.", fromDate = closedDepreciationPeriod.FromDate, toDate = closedDepreciationPeriod.ToDate });
            var lastPosting = await db.FixedAssetDepreciationPostings.Where(x => x.TenantId == tenantId && x.AssetId == id)
                .OrderByDescending(x => x.PeriodStart).Select(x => (DateOnly?)x.PeriodStart).FirstOrDefaultAsync(ct);
            if (month != (lastPosting?.AddMonths(1) ?? firstMonth))
                return Results.Conflict(new { error = "Amortisman dönemleri sırayla kaydedilmelidir." });
            var depreciable = asset.AcquisitionCostBase - asset.ResidualValueBase;
            var remaining = depreciable - asset.AccumulatedDepreciationBase;
            var amount = month == finalMonth
                ? remaining
                : decimal.Min(decimal.Max(0.01m, decimal.Round(depreciable / asset.UsefulLifeMonths, 2, MidpointRounding.AwayFromZero)), remaining);
            if (amount <= 0) return Results.Conflict(new { error = "Kıymetin amortismana tabi tutarı tamamen ayrılmış." });
            var mappings = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    (x.MappingKey == DepreciationExpenseAccount || x.MappingKey == AccumulatedDepreciationAccount))
                .Join(db.LedgerAccounts.Where(x => x.TenantId == tenantId && x.IsActive), m => new { m.TenantId, m.AccountId }, a => new { a.TenantId, AccountId = a.Id }, (m, a) => new { m.MappingKey, m.AccountId })
                .ToDictionaryAsync(x => x.MappingKey, x => x.AccountId, ct);
            if (!mappings.TryGetValue(DepreciationExpenseAccount, out var expenseId) || !mappings.TryGetValue(AccumulatedDepreciationAccount, out var accumulatedId) || expenseId == accumulatedId)
                return Results.Conflict(new { error = "Amortisman gideri ve birikmiş amortisman için farklı, etkin defter hesapları eşlenmelidir." });
            var posting = new FixedAssetDepreciationPosting { TenantId = tenantId, AssetId = id, PeriodStart = month,
                PeriodEnd = month.AddMonths(1).AddDays(-1), AmountBase = amount, PostedByUserId = userId };
            var entry = new JournalEntry { TenantId = tenantId, Code = $"FADEP-{month:yyyyMM}-{id.ToString("N")[..8]}", EntryDate = posting.PeriodEnd,
                Description = $"Amortisman {asset.AssetCode} · {month:yyyy-MM}", SourceType = "FixedAssetDepreciation", SourceId = posting.Id, CreatedByUserId = userId,
                Lines = [new JournalEntryLine { TenantId = tenantId, AccountId = expenseId, LineNumber = 1, Description = $"Amortisman gideri · {asset.AssetCode}", Debit = amount },
                    new JournalEntryLine { TenantId = tenantId, AccountId = accumulatedId, LineNumber = 2, Description = $"Birikmiş amortisman · {asset.AssetCode}", Credit = amount }] };
            posting.JournalEntryId = entry.Id;
            asset.AccumulatedDepreciationBase += amount;
            db.FixedAssetDepreciationPostings.Add(posting); db.JournalEntries.Add(entry);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.depreciation-posted", Resource = $"{asset.AssetCode}/{month:yyyy-MM}" });
            try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kıymet aynı anda güncellendi; dönemi yenileyip tekrar deneyin." }); }
            return Results.Created($"/api/fixed-assets/{id}/depreciation-postings/{posting.Id}", new { posting.Id, assetId = id, posting.PeriodStart, posting.PeriodEnd, posting.AmountBase, journalEntryId = entry.Id });
        });

        group.MapGet("/{id:guid}/disposal", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var disposal = await db.FixedAssetDisposals.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.AssetId == id, ct);
            if (disposal is null) return Results.NotFound();
            var journalEntryId = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "FixedAssetDisposal" && x.SourceId == disposal.Id)
                .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
            return Results.Ok(ToDisposalView(disposal, journalEntryId));
        });

        group.MapPost("/{id:guid}/disposals", async (Guid id, FixedAssetDisposalRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var reason = request.Reason?.Trim();
            var proceeds = decimal.Round(request.ProceedsBase, 2, MidpointRounding.AwayFromZero);
            if (request.IdempotencyKey == Guid.Empty || request.DisposalDate == default ||
                request.DisposalDate > DateOnly.FromDateTime(DateTime.UtcNow) || string.IsNullOrWhiteSpace(reason) || reason.Length > 500 ||
                request.ProceedsBase < 0 || request.ProceedsBase > 9999999999999999.99m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["disposal"] = ["İşlem anahtarı, bugünü aşmayan geçerli tarih, açıklama ve sıfır veya daha yüksek tahsilat tutarı zorunludur."] });

            await using var transaction = await BeginTenantMutationAsync(db, tenantId, ct);
            if (!await TenantExistsUnderLockAsync(db, tenantId, ct)) return Results.NotFound();

            var priorRequest = await db.FixedAssetDisposals.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.IdempotencyKey == request.IdempotencyKey, ct);
            if (priorRequest is not null)
            {
                if (!SameDisposalRequest(priorRequest, id, request.DisposalDate, reason!, proceeds))
                    return Results.Conflict(new { error = "Bu işlem anahtarı farklı bir elden çıkarma talebinde kullanılmış." });
                var priorJournalId = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "FixedAssetDisposal" && x.SourceId == priorRequest.Id)
                    .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                return Results.Ok(ToDisposalView(priorRequest, priorJournalId));
            }

            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.DisposalDate, ct);
            if (closedPeriod is { } closedDisposalPeriod)
                return Results.Conflict(new { error = "Elden çıkarma tarihi kapalı mali dönem içinde; yevmiye oluşturulmadı.", fromDate = closedDisposalPeriod.FromDate, toDate = closedDisposalPeriod.ToDate });

            var asset = await db.FixedAssets.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.Status == FixedAssetStatus.Active, ct);
            if (asset is null) return Results.NotFound();
            if (request.DisposalDate < asset.InServiceDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["disposalDate"] = ["Elden çıkarma tarihi kullanıma giriş tarihinden önce olamaz."] });
            if (await db.FixedAssetDisposals.AnyAsync(x => x.TenantId == tenantId && x.AssetId == id, ct))
                return Results.Conflict(new { error = "Bu kıymet daha önce elden çıkarılmış." });

            var disposalMonth = new DateOnly(request.DisposalDate.Year, request.DisposalDate.Month, 1);
            if (await db.FixedAssetDepreciationPostings.AnyAsync(x => x.TenantId == tenantId && x.AssetId == id && x.PeriodStart >= disposalMonth, ct))
                return Results.Conflict(new { error = "Elden çıkarma ayı veya sonrasına kaydedilmiş amortisman var. Önce tarih sıralamasını düzeltin." });

            var firstMonth = new DateOnly(asset.InServiceDate.Year, asset.InServiceDate.Month, 1).AddMonths(1);
            var finalMonth = firstMonth.AddMonths(asset.UsefulLifeMonths - 1);
            var scheduleThrough = disposalMonth.AddMonths(-1);
            var depreciable = asset.AcquisitionCostBase - asset.ResidualValueBase;
            var plannedPerMonth = decimal.Max(0.01m, decimal.Round(depreciable / asset.UsefulLifeMonths, 2, MidpointRounding.AwayFromZero));
            var postings = await db.FixedAssetDepreciationPostings.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AssetId == id && x.PeriodStart < disposalMonth)
                .ToDictionaryAsync(x => x.PeriodStart, ct);
            var scheduleAccumulated = 0m;
            var scheduleRemaining = depreciable;
            for (var month = firstMonth; month <= scheduleThrough && scheduleRemaining > 0; month = month.AddMonths(1))
            {
                var amount = postings.TryGetValue(month, out var posting)
                    ? posting.AmountBase
                    : month == finalMonth ? scheduleRemaining : decimal.Min(plannedPerMonth, scheduleRemaining);
                amount = decimal.Min(amount, scheduleRemaining);
                scheduleAccumulated += amount;
                scheduleRemaining -= amount;
            }
            scheduleAccumulated = decimal.Round(scheduleAccumulated, 2, MidpointRounding.AwayFromZero);
            if (scheduleAccumulated < asset.AccumulatedDepreciationBase)
                return Results.Conflict(new { error = "Kaydedilmiş amortisman, elden çıkarma tarihindeki amortisman planını aşıyor. Defter kaydı oluşturulmadı; önce dönemleri ve kıymet bakiyesini inceleyin." });
            var bookValue = decimal.Round(asset.AcquisitionCostBase - scheduleAccumulated, 2, MidpointRounding.AwayFromZero);
            var mappingKeys = new[] { DepreciationExpenseAccount, AccumulatedDepreciationAccount, AssetCostAccount,
                DisposalProceedsAccount, DisposalGainAccount, DisposalLossAccount };
            var mappings = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId && mappingKeys.Contains(x.MappingKey))
                .Join(db.LedgerAccounts.Where(x => x.TenantId == tenantId && x.IsActive), m => new { m.TenantId, m.AccountId }, a => new { a.TenantId, AccountId = a.Id }, (m, a) => new { m.MappingKey, m.AccountId })
                .ToDictionaryAsync(x => x.MappingKey, x => x.AccountId, ct);
            var missingMappings = mappingKeys.Where(x => !mappings.ContainsKey(x)).ToArray();
            if (missingMappings.Length > 0)
                return Results.Conflict(new { error = "Elden çıkarma yevmiye fişi için eksik veya pasif tenant hesap eşleştirmeleri var.", requiredMappings = missingMappings });
            var mappedAccountIds = mappingKeys.Select(x => mappings[x]).ToArray();
            if (mappedAccountIds.Distinct().Count() != mappedAccountIds.Length)
                return Results.Conflict(new { error = "Sabit kıymet elden çıkarma hesapları (maliyet, birikmiş amortisman, amortisman gideri, tahsilat, kâr ve zarar) birbirinden farklı etkin hesaplara eşlenmelidir.", requiredMappings = mappingKeys });
            var disposal = new FixedAssetDisposal
            {
                TenantId = tenantId, AssetId = asset.Id, DisposalDate = request.DisposalDate, Reason = reason!,
                ProceedsBase = proceeds, PostedAccumulatedDepreciationBase = asset.AccumulatedDepreciationBase,
                ScheduleAccumulatedDepreciationBase = scheduleAccumulated, BookValueBase = bookValue,
                GainLossBase = decimal.Round(proceeds - bookValue, 2, MidpointRounding.AwayFromZero),
                ScheduleThroughPeriod = scheduleThrough >= firstMonth ? scheduleThrough : null,
                IdempotencyKey = request.IdempotencyKey, DisposedByUserId = userId
            };
            var catchUpDepreciation = scheduleAccumulated - asset.AccumulatedDepreciationBase;
            var gain = disposal.GainLossBase > 0 ? disposal.GainLossBase : 0m;
            var loss = disposal.GainLossBase < 0 ? -disposal.GainLossBase : 0m;
            var journalLines = new List<JournalEntryLine>();
            void AddLine(Guid accountId, string description, decimal debit = 0, decimal credit = 0)
            {
                if (debit == 0 && credit == 0) return;
                journalLines.Add(new JournalEntryLine { TenantId = tenantId, AccountId = accountId, LineNumber = journalLines.Count + 1,
                    Description = description, Debit = debit, Credit = credit });
            }
            if (catchUpDepreciation > 0)
            {
                AddLine(mappings[DepreciationExpenseAccount], $"Elden çıkarma öncesi amortisman · {asset.AssetCode}", debit: catchUpDepreciation);
                AddLine(mappings[AccumulatedDepreciationAccount], $"Birikmiş amortisman tahakkuku · {asset.AssetCode}", credit: catchUpDepreciation);
            }
            AddLine(mappings[DisposalProceedsAccount], $"Elden çıkarma tahsilatı · {asset.AssetCode}", debit: proceeds);
            AddLine(mappings[AccumulatedDepreciationAccount], $"Birikmiş amortisman kapama · {asset.AssetCode}", debit: scheduleAccumulated);
            AddLine(mappings[AssetCostAccount], $"Sabit kıymet maliyet kapama · {asset.AssetCode}", credit: asset.AcquisitionCostBase);
            AddLine(mappings[DisposalGainAccount], $"Elden çıkarma kârı · {asset.AssetCode}", credit: gain);
            AddLine(mappings[DisposalLossAccount], $"Elden çıkarma zararı · {asset.AssetCode}", debit: loss);
            if (decimal.Round(journalLines.Sum(x => x.Debit), 2) != decimal.Round(journalLines.Sum(x => x.Credit), 2))
                return Results.Conflict(new { error = "Elden çıkarma yevmiye fişi dengelenemedi; kıymet kaydı değiştirilmedi." });
            var entry = new JournalEntry { TenantId = tenantId, Code = $"FADIS-{request.DisposalDate:yyyyMMdd}-{asset.Id.ToString("N")[..8]}",
                EntryDate = request.DisposalDate, Description = $"Sabit kıymet elden çıkarma · {asset.AssetCode}", SourceType = "FixedAssetDisposal",
                SourceId = disposal.Id, CreatedByUserId = userId, Lines = journalLines };
            asset.Status = FixedAssetStatus.Disposed;
            var openAssignment = await db.FixedAssetAssignments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.AssetId == id && x.ReturnedDate == null, ct);
            if (openAssignment is not null)
            {
                if (openAssignment.AssignedDate > request.DisposalDate)
                    return Results.Conflict(new { error = "Açık zimmet teslim tarihi elden çıkarma tarihinden sonra. Önce zimmet tarihini düzeltin." });
                openAssignment.ReturnedDate = request.DisposalDate;
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.assignment-closed-by-disposal", Resource = $"{asset.AssetCode}/{openAssignment.Id:D}" });
            }
            db.FixedAssetDisposals.Add(disposal);
            db.JournalEntries.Add(entry);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.disposed", Resource = $"{asset.AssetCode}/{disposal.Id:D}" });
            try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kıymet başka bir kullanıcı tarafından değiştirildi. Kaydı yenileyip tekrar deneyin." }); }
            catch (DbUpdateException)
            {
                db.Entry(disposal).State = EntityState.Detached;
                var winner = await db.FixedAssetDisposals.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.IdempotencyKey == request.IdempotencyKey, ct);
                if (winner is not null && SameDisposalRequest(winner, id, request.DisposalDate, reason!, proceeds))
                {
                    var winnerJournalId = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "FixedAssetDisposal" && x.SourceId == winner.Id)
                        .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                    return Results.Ok(ToDisposalView(winner, winnerJournalId));
                }
                return Results.Conflict(new { error = "Kıymet elden çıkarma sırasında değişti veya başka bir işlem aynı kıymeti kaydetti." });
            }
            return Results.Created($"/api/fixed-assets/{id}/disposal", ToDisposalView(disposal, entry.Id));
        });

        group.MapGet("/{id:guid}/assignments", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            if (!await db.FixedAssets.AnyAsync(x => x.TenantId == tenantId && x.Id == id, ct)) return Results.NotFound();
            var rows = await db.FixedAssetAssignments.AsNoTracking().Where(x => x.TenantId == tenantId && x.AssetId == id)
                .OrderByDescending(x => x.AssignedDate).Select(x => new AssetAssignmentView(x.Id, x.EmployeeId,
                    db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId).Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                    x.AssignedDate, x.ReturnedDate, x.Location, x.Notes, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPost("/{id:guid}/assignments", async (Guid id, AssetAssignmentCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var assetExists = await db.FixedAssets.AnyAsync(x => x.TenantId == tenantId && x.Id == id && x.Status == FixedAssetStatus.Active, ct);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var employeeExists = await db.EmployeeRecords.AnyAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId &&
                (x.TerminationDate == null || x.TerminationDate >= today), ct);
            if (!assetExists || !employeeExists) return Results.ValidationProblem(new Dictionary<string, string[]> { ["assignment"] = ["Etkin kıymet ve etkin tenant personeli seçilmelidir."] });
            if (request.AssignedDate == default || (request.Location?.Length ?? 0) > 160 || (request.Notes?.Length ?? 0) > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["assignment"] = ["Geçerli teslim tarihi ve sınırlar içindeki yer/not bilgisi girin."] });
            if (await db.FixedAssetAssignments.AnyAsync(x => x.TenantId == tenantId && x.AssetId == id && x.ReturnedDate == null, ct))
                return Results.Conflict(new { error = "Kıymetin açık bir zimmet kaydı var; önce iade alın." });
            var assignment = new FixedAssetAssignment { TenantId = tenantId, AssetId = id, EmployeeId = request.EmployeeId,
                AssignedDate = request.AssignedDate, Location = Clean(request.Location), Notes = Clean(request.Notes), AssignedByUserId = userId };
            db.FixedAssetAssignments.Add(assignment);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.assigned", Resource = id.ToString("D") });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/fixed-assets/{id}/assignments/{assignment.Id}", new { assignment.Id, assignment.EmployeeId, assignment.AssignedDate });
        });

        group.MapPost("/{id:guid}/assignments/{assignmentId:guid}/return", async (Guid id, Guid assignmentId, AssetAssignmentReturnRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (request.ReturnedDate == default || !TryRowVersion(request.RowVersion, out var version))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["return"] = ["Geçerli iade tarihi ve kayıt sürümü zorunludur."] });
            var assignment = await db.FixedAssetAssignments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.AssetId == id && x.Id == assignmentId, ct);
            if (assignment is null) return Results.NotFound();
            if (assignment.ReturnedDate is not null) return Results.Conflict(new { error = "Bu zimmet daha önce kapatılmış." });
            if (request.ReturnedDate < assignment.AssignedDate) return Results.BadRequest(new { error = "İade tarihi teslim tarihinden önce olamaz." });
            db.Entry(assignment).Property(x => x.RowVersion).OriginalValue = version;
            assignment.ReturnedDate = request.ReturnedDate;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "fixed-asset.returned", Resource = id.ToString("D") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Zimmet kaydı başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { assignment.Id, assignment.ReturnedDate, rowVersion = Convert.ToBase64String(assignment.RowVersion) });
        });
    }

    private static FixedAssetView ToView(FixedAsset x) => new(x.Id, x.AssetCode, x.Name, x.Category, x.AcquisitionDate, x.InServiceDate,
        x.AcquisitionCostBase, x.ResidualValueBase, x.UsefulLifeMonths, x.AccumulatedDepreciationBase, x.Status.ToString(),
        x.SupplierAccountId, x.SourceReference, x.PurchaseInvoiceId, Convert.ToBase64String(x.RowVersion));
    private static FixedAssetAcquisitionPostingView ToAcquisitionPostingView(JournalEntry entry) =>
        new(entry.SourceId, null, entry.Id, entry.EntryDate, entry.Lines.OrderBy(x => x.LineNumber)
            .Select(x => new FixedAssetAcquisitionJournalLineView(x.AccountId, null, null, x.Debit, x.Credit)).ToArray());
    private static FixedAssetDisposalView ToDisposalView(FixedAssetDisposal x, Guid? journalEntryId = null) => new(x.Id, x.AssetId, x.DisposalDate, x.Reason,
        x.ProceedsBase, x.PostedAccumulatedDepreciationBase, x.ScheduleAccumulatedDepreciationBase, x.BookValueBase,
        x.GainLossBase, x.ScheduleThroughPeriod, x.DisposedAt, x.DisposedByUserId, journalEntryId is null ? "NotPosted" : "GeneralLedgerPosted", journalEntryId);
    private static bool SameDisposalRequest(FixedAssetDisposal existing, Guid assetId, DateOnly date, string reason, decimal proceeds) =>
        existing.AssetId == assetId && existing.DisposalDate == date && existing.Reason == reason && existing.ProceedsBase == proceeds;
    private static async Task<IDbContextTransaction?> BeginTenantMutationAsync(TenantDbContext db, Guid tenantId, CancellationToken ct) =>
        db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
    private static Task<bool> TenantExistsUnderLockAsync(TenantDbContext db, Guid tenantId, CancellationToken ct) => db.Database.IsRelational()
        ? db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").AnyAsync(ct)
        : db.Tenants.AnyAsync(x => x.Id == tenantId, ct);
    private static bool ValidCode(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 40 && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.');
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }
    private static bool TryRowVersion(string? value, out byte[] bytes)
    {
        try { bytes = string.IsNullOrWhiteSpace(value) ? [] : Convert.FromBase64String(value); return bytes.Length == 8; }
        catch (FormatException) { bytes = []; return false; }
    }
}

public sealed record FixedAssetCreateRequest(string? AssetCode, string? Name, string? Category, DateOnly AcquisitionDate,
    DateOnly InServiceDate, decimal AcquisitionCostBase, decimal ResidualValueBase, int UsefulLifeMonths,
    Guid? SupplierAccountId = null, string? SourceReference = null, Guid? PurchaseInvoiceId = null);
public sealed record FixedAssetView(Guid Id, string AssetCode, string Name, string? Category, DateOnly AcquisitionDate,
    DateOnly InServiceDate, decimal AcquisitionCostBase, decimal ResidualValueBase, int UsefulLifeMonths,
    decimal AccumulatedDepreciationBase, string Status, Guid? SupplierAccountId, string? SourceReference, Guid? PurchaseInvoiceId, string RowVersion);
public sealed record FixedAssetPurchaseInvoiceOption(Guid Id, string Code, Guid SupplierId, DateOnly InvoiceDate, decimal GrandTotal, Guid? JournalEntryId);
public sealed record FixedAssetAcquisitionPostingRequest(Guid OffsetAccountId);
public sealed record FixedAssetAcquisitionPostingView(Guid AssetId, string? PurchaseInvoiceCode, Guid? JournalEntryId, DateOnly? EntryDate,
    IReadOnlyList<FixedAssetAcquisitionJournalLineView> Lines);
public sealed record FixedAssetAcquisitionJournalLineView(Guid AccountId, string? AccountCode, string? AccountName, decimal Debit, decimal Credit);
public sealed record FixedAssetDepreciationRequest(DateOnly PeriodStart);
public sealed record FixedAssetDisposalRequest(DateOnly DisposalDate, string? Reason, decimal ProceedsBase, Guid IdempotencyKey);
public sealed record FixedAssetDisposalView(Guid Id, Guid AssetId, DateOnly DisposalDate, string Reason, decimal ProceedsBase,
    decimal PostedAccumulatedDepreciationBase, decimal ScheduleAccumulatedDepreciationBase, decimal BookValueBase,
    decimal GainLossBase, DateOnly? ScheduleThroughPeriod, DateTimeOffset DisposedAt, Guid DisposedByUserId, string AccountingTreatment,
    Guid? JournalEntryId = null);
public sealed record DepreciationScheduleLine(DateOnly PeriodStart, decimal AmountBase, bool IsPosted, Guid? JournalEntryId);
public sealed record AssetAssignmentCreateRequest(Guid EmployeeId, DateOnly AssignedDate, string? Location, string? Notes);
public sealed record AssetAssignmentReturnRequest(DateOnly ReturnedDate, string? RowVersion);
public sealed record AssetAssignmentView(Guid Id, Guid EmployeeId, string Employee, DateOnly AssignedDate,
    DateOnly? ReturnedDate, string? Location, string? Notes, string RowVersion);
