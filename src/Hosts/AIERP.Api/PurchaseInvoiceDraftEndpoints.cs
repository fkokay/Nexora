using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using StandaloneSupplierInvoiceDraft = AIERP.Platform.Domain.PurchaseInvoiceDraft;
using StandaloneSupplierInvoiceDraftLine = AIERP.Platform.Domain.PurchaseInvoiceDraftLine;

public static class PurchaseInvoiceDraftEndpoints
{
    public static void MapPurchaseInvoiceDraftEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/purchasing/standalone-invoices").WithTags("Bağımsız alış faturası taslakları").RequireAuthorization();

        group.MapGet("/suppliers", async (string? q, int page, int pageSize, ClaimsPrincipal user,
            TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (q?.Trim().Length > 120) return Results.BadRequest(new { error = "Arama metni en fazla 120 karakter olabilir." });
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive
                && (x.Type == CounterpartyType.Supplier || x.Type == CounterpartyType.Both));
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
                "erp.purchase-invoices.create", "erp.purchase-invoices", query, x => x.Type, null, x => x.Id,
                cancellationToken: ct) ?? query;
            var term = q?.Trim();
            if (!string.IsNullOrEmpty(term))
                query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term));
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Code).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new StandaloneSupplierInvoiceDraftSupplierOption(x.Id, x.Code, x.Name, x.CurrencyCode))
                .ToListAsync(ct);
            return Results.Ok(new StandaloneSupplierInvoiceDraftSupplierPage(items, page, pageSize, total));
        });

        group.MapGet("/", async (string? q, int page, int pageSize, ClaimsPrincipal user,
            TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (q?.Trim().Length > 100) return Results.BadRequest(new { error = "Arama metni en fazla 100 karakter olabilir." });
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            var query = db.PurchaseInvoiceDrafts.AsNoTracking().Where(x => x.TenantId == tenantId);
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
                "erp.purchase-invoices.read", "erp.purchase-invoices", query, x => x.Status, null, x => x.SupplierId,
                cancellationToken: ct) ?? query;
            var term = q?.Trim();
            if (!string.IsNullOrEmpty(term))
                query = query.Where(x => x.InvoiceNumber.Contains(term) || x.Supplier.Name.Contains(term));

            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.InvoiceDate).ThenByDescending(x => x.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new StandaloneSupplierInvoiceDraftSummary(x.Id, x.SupplierId, x.Supplier.Name,
                    x.InvoiceNumber, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.GrandTotal, x.Lines.Count, x.Status.ToString(), x.CreatedAt))
                .ToListAsync(ct);
            return Results.Ok(new StandaloneSupplierInvoiceDraftPage(items, page, pageSize, total));
        });

        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var query = db.PurchaseInvoiceDrafts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id);
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
                "erp.purchase-invoices.read", "erp.purchase-invoices", query, x => x.Status, null, x => x.SupplierId,
                cancellationToken: ct) ?? query;
            var item = await query.Include(x => x.Supplier).Include(x => x.Lines).SingleOrDefaultAsync(ct);
            return item is null ? Results.NotFound() : Results.Ok(ToDetail(item));
        });

        group.MapPut("/{id:guid}", async (Guid id, StandaloneSupplierInvoiceDraftUpdateRequest request,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!TryReadRowVersion(request.ExpectedRowVersion, out var expectedRowVersion))
                return Results.BadRequest(new { error = "Geçerli taslak sürümü gereklidir." });

            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var query = db.PurchaseInvoiceDrafts.AsQueryable();
            if (db.Database.IsSqlServer())
                query = db.PurchaseInvoiceDrafts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoiceDrafts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}");
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
                "erp.purchase-invoices.update", "erp.purchase-invoices", query, x => x.Status, null, x => x.SupplierId,
                cancellationToken: ct) ?? query;
            var draft = await query.Include(x => x.Supplier).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (draft is null) return Results.NotFound();
            if (draft.Status != PurchaseInvoiceDraftStatus.Draft)
                return Results.Conflict(new { error = "Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir." });
            if (!draft.RowVersion.AsSpan().SequenceEqual(expectedRowVersion))
                return Results.Conflict(new { error = "Taslağın gönderilen sürümü güncel değil. Yenileyip tekrar deneyin." });

            var validation = Validate(new StandaloneSupplierInvoiceDraftCreateRequest(draft.RequestId, request.SupplierId,
                request.InvoiceNumber, request.InvoiceDate, request.DueDate, request.CurrencyCode, request.Notes,
                request.Subtotal, request.DiscountTotal, request.TaxTotal, request.GrandTotal, request.Lines));
            if (validation is not null) return Results.ValidationProblem(validation);
            var accountErrors = await ValidateExpenseAccountsAsync(db, tenantId, request.Lines, ct);
            if (accountErrors is not null) return Results.ValidationProblem(accountErrors);

            var supplierQuery = db.CustomerAccounts.AsQueryable();
            if (db.Database.IsSqlServer())
                supplierQuery = db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.SupplierId}");
            var supplier = await supplierQuery.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SupplierId, ct);
            if (supplier is null || !supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["supplierId"] = ["Aynı firmaya ait etkin tedarikçi hesabı seçilmelidir."] });

            db.PurchaseInvoiceDraftLines.RemoveRange(draft.Lines);
            draft.Lines.Clear();
            draft.SupplierId = supplier.Id;
            draft.Supplier = supplier;
            draft.InvoiceNumber = request.InvoiceNumber.Trim();
            draft.NormalizedInvoiceNumber = NormalizeInvoiceNumber(draft.InvoiceNumber);
            draft.InvoiceDate = request.InvoiceDate;
            draft.DueDate = request.DueDate;
            draft.CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant();
            draft.Notes = Clean(request.Notes);
            draft.Subtotal = request.Subtotal;
            draft.DiscountTotal = request.DiscountTotal;
            draft.TaxTotal = request.TaxTotal;
            draft.GrandTotal = request.GrandTotal;
            draft.UpdatedAt = DateTimeOffset.UtcNow;
            foreach (var line in request.Lines.OrderBy(x => x.LineNumber))
                db.PurchaseInvoiceDraftLines.Add(new StandaloneSupplierInvoiceDraftLine
                {
                    TenantId = tenantId,
                    PurchaseInvoiceDraftId = draft.Id,
                    LineNumber = line.LineNumber,
                    Description = line.Description.Trim(),
                    Quantity = line.Quantity,
                    UnitCode = Clean(line.UnitCode),
                    UnitPrice = line.UnitPrice,
                    Subtotal = line.Subtotal,
                    DiscountAmount = line.DiscountAmount,
                    TaxAmount = line.TaxAmount,
                    Total = line.Total,
                    ExpenseAccountId = line.ExpenseAccountId,
                    VatRate = line.VatRate,
                });
            db.Entry(draft).Property(x => x.RowVersion).OriginalValue = expectedRowVersion;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "standalone-supplier-invoice.draft-updated", Resource = draft.InvoiceNumber });
            try
            {
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                await transaction.RollbackAsync(ct);
                return Results.Conflict(new { error = "Taslak kaydedilirken başka bir güncelleme yapıldı. Yenileyip tekrar deneyin." });
            }
            return Results.Ok(ToDetail(draft));
        });

        group.MapPost("/{id:guid}/post", PostAsync);

        group.MapPost("/", async (StandaloneSupplierInvoiceDraftCreateRequest request, ClaimsPrincipal user,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var errors = Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            var accountErrors = await ValidateExpenseAccountsAsync(db, tenantId, request.Lines, ct);
            if (accountErrors is not null) return Results.ValidationProblem(accountErrors);

            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var supplierQuery = db.CustomerAccounts.AsQueryable();
            if (db.Database.IsSqlServer())
                supplierQuery = db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.SupplierId}");
            var supplier = await supplierQuery.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SupplierId, ct);
            if (supplier is null || !supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["supplierId"] = ["Aynı firmaya ait etkin tedarikçi hesabı seçilmelidir."] });

            var draftsQuery = db.PurchaseInvoiceDrafts.AsQueryable();
            if (db.Database.IsSqlServer())
                draftsQuery = db.PurchaseInvoiceDrafts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoiceDrafts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [RequestId] = {request.RequestId}");
            var existing = await draftsQuery.Where(x => x.TenantId == tenantId && x.RequestId == request.RequestId)
                .Include(x => x.Supplier).Include(x => x.Lines).SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                if (!Matches(existing, request))
                    return Results.Conflict(new { error = "Bu istek kimliği farklı taslak bilgileriyle daha önce kullanılmış.", draftId = existing.Id });
                await transaction.CommitAsync(ct);
                return Results.Ok(ToDetail(existing));
            }

            var draft = new StandaloneSupplierInvoiceDraft
            {
                TenantId = tenantId,
                SupplierId = supplier.Id,
                Supplier = supplier,
                RequestId = request.RequestId,
                InvoiceNumber = request.InvoiceNumber.Trim(),
                NormalizedInvoiceNumber = NormalizeInvoiceNumber(request.InvoiceNumber),
                InvoiceDate = request.InvoiceDate,
                DueDate = request.DueDate,
                CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant(),
                Notes = Clean(request.Notes),
                Subtotal = request.Subtotal,
                DiscountTotal = request.DiscountTotal,
                TaxTotal = request.TaxTotal,
                GrandTotal = request.GrandTotal,
                CreatedByUserId = userId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            foreach (var line in request.Lines.OrderBy(x => x.LineNumber))
                draft.Lines.Add(new StandaloneSupplierInvoiceDraftLine
                {
                    TenantId = tenantId,
                    PurchaseInvoiceDraft = draft,
                    LineNumber = line.LineNumber,
                    Description = line.Description.Trim(),
                    Quantity = line.Quantity,
                    UnitCode = Clean(line.UnitCode),
                    UnitPrice = line.UnitPrice,
                    Subtotal = line.Subtotal,
                    DiscountAmount = line.DiscountAmount,
                    TaxAmount = line.TaxAmount,
                    Total = line.Total,
                    ExpenseAccountId = line.ExpenseAccountId,
                    VatRate = line.VatRate,
                });
            db.PurchaseInvoiceDrafts.Add(draft);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "standalone-supplier-invoice.draft-created", Resource = draft.InvoiceNumber });
            try
            {
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                await transaction.RollbackAsync(ct);
                var replay = await db.PurchaseInvoiceDrafts.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
                if (replay is null) return Results.Conflict(new { error = "Taslak kaydı başka bir işlemle çakıştı; isteği yeniden deneyin." });
                if (!Matches(replay, request)) return Results.Conflict(new { error = "Bu istek kimliği farklı taslak bilgileriyle daha önce kullanılmış.", draftId = replay.Id });
                return Results.Ok(ToDetail(replay));
            }
            return Results.Created($"/api/purchasing/standalone-invoices/{draft.Id}", ToDetail(draft));
        });
    }

    private static async Task<IResult> PostAsync(Guid id, ClaimsPrincipal user, TenantDbContext db,
        PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();

        var query = db.PurchaseInvoiceDrafts.AsQueryable();
        if (db.Database.IsSqlServer())
            query = db.PurchaseInvoiceDrafts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoiceDrafts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}");
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.purchase-invoices.create", "erp.purchase-invoices", query, x => x.Status, null, x => x.SupplierId,
            cancellationToken: ct) ?? query;
        var draft = await query.Include(x => x.Supplier).Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (draft is null) return Results.NotFound();

        var existingJournal = await db.JournalEntries.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == PostingSource && x.SourceId == draft.Id, ct);
        var existingLedger = await db.CustomerLedgerEntries.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceDraftId == draft.Id, ct);
        if (draft.Status == PurchaseInvoiceDraftStatus.Posted)
        {
            if (existingJournal is null || existingLedger is null)
                return Results.Conflict(new { error = "Muhasebeleştirilmiş taslağın yevmiye veya cari bağlantısı eksik; kayıt güvenli biçimde tekrar oluşturulmadı." });
            await transaction.CommitAsync(ct);
            return Results.Ok(new StandaloneSupplierInvoiceDraftPostingResult(draft.Id, "Posted", existingJournal.Id, existingLedger.Id));
        }
        if (draft.Status != PurchaseInvoiceDraftStatus.Draft || existingJournal is not null || existingLedger is not null)
            return Results.Conflict(new { error = "Taslak durumu ile mevcut muhasebe kayıtları tutarsız; tekrar kayıt oluşturulmadı." });
        var duplicatePosted = await db.PurchaseInvoiceDrafts.AsNoTracking().AnyAsync(x => x.TenantId == tenantId
            && x.SupplierId == draft.SupplierId && x.NormalizedInvoiceNumber == NormalizeInvoiceNumber(draft.InvoiceNumber)
            && x.Status == PurchaseInvoiceDraftStatus.Posted && x.Id != draft.Id, ct);
        if (duplicatePosted)
            return Results.Conflict(new { error = "Bu tedarikçi ve fatura numarasıyla daha önce muhasebeleştirilmiş fatura var." });
        if (draft.GrandTotal <= 0 || draft.Lines.Count is < 1 or > 100)
            return Results.Conflict(new { error = "Muhasebeleştirme için fatura toplamı pozitif ve 1–100 arası satır bulunmalıdır." });

        var orderedLines = draft.Lines.OrderBy(x => x.LineNumber).ToArray();
        if (orderedLines.Any(x => x.ExpenseAccountId is null || x.Subtotal < x.DiscountAmount
                || x.Total != x.Subtotal - x.DiscountAmount + x.TaxAmount)
            || orderedLines.Sum(x => x.Subtotal) != draft.Subtotal
            || orderedLines.Sum(x => x.DiscountAmount) != draft.DiscountTotal
            || orderedLines.Sum(x => x.TaxAmount) != draft.TaxTotal
            || orderedLines.Sum(x => x.Total) != draft.GrandTotal
            || draft.Subtotal - draft.DiscountTotal + draft.TaxTotal != draft.GrandTotal)
            return Results.Conflict(new { error = "Fatura başlık toplamları satırlarla uyuşmuyor veya satırlarda gider hesabı eksik." });

        var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, draft.InvoiceDate, ct);
        if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closedPeriod, "tedarikçi faturası") is { } closedConflict)
            return closedConflict;

        var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId
            && x.Id == draft.SupplierId && x.IsActive
            && (x.Type == CounterpartyType.Supplier || x.Type == CounterpartyType.Both), ct);
        if (supplier is null) return Results.Conflict(new { error = "Faturanın etkin ve aynı firmaya ait tedarikçi hesabı bulunamadı." });

        var expenseIds = orderedLines.Select(x => x.ExpenseAccountId!.Value).Distinct().ToArray();
        var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive
                && expenseIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        if (expenseIds.Any(x => !accounts.TryGetValue(x, out var account) || account.StatementSection != LedgerAccountStatementSection.Expense))
            return Results.Conflict(new { error = "Her fatura satırı aynı firmaya ait etkin bir gider hesabına bağlı olmalıdır." });

        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null || string.IsNullOrWhiteSpace(tenant.BaseCurrencyCode)) return Results.Conflict(new { error = "Firmanın ana para birimi tanımlı değil." });
        var mappings = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId
                && (x.MappingKey == LedgerMappingKeys.PurchasePayable || x.MappingKey == LedgerMappingKeys.PurchaseTaxRecoverable))
            .Join(db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive),
                mapping => new { mapping.TenantId, Id = mapping.AccountId }, account => new { account.TenantId, account.Id },
                (mapping, account) => new { mapping.MappingKey, Account = account })
            .ToDictionaryAsync(x => x.MappingKey, x => x.Account, ct);
        if (!mappings.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payable)
            || payable.StatementSection != LedgerAccountStatementSection.Liability)
            return Results.Conflict(new { error = "Aynı firmaya ait etkin bir borç hesabı eşleştirmesi gereklidir." });
        LedgerAccount? vatAccount = null;
        if (draft.TaxTotal > 0 && (!mappings.TryGetValue(LedgerMappingKeys.PurchaseTaxRecoverable, out vatAccount)
                || vatAccount.StatementSection != LedgerAccountStatementSection.Asset))
            return Results.Conflict(new { error = "KDV tutarı için aynı firmaya ait etkin indirilecek KDV hesabı eşleştirmesi gereklidir." });
        if (expenseIds.Contains(payable.Id) || (vatAccount is not null && (expenseIds.Contains(vatAccount.Id) || vatAccount.Id == payable.Id)))
            return Results.Conflict(new { error = "Gider, indirilecek KDV ve tedarikçi borç hesapları birbirinden farklı olmalıdır." });

        var exchangeRate = draft.CurrencyCode == tenant.BaseCurrencyCode ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId
                    && x.CurrencyCode == draft.CurrencyCode && x.RateDate <= draft.InvoiceDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
                .Select(x => (decimal?)x.Rate).FirstOrDefaultAsync(ct) ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{draft.InvoiceDate:yyyy-MM-dd} tarihli {draft.CurrencyCode} kuru bulunamadı; fatura aktarılmadı." });

        var journalLines = new List<(Guid AccountId, string Description, decimal Debit, decimal Credit)>();
        try
        {
            foreach (var groupLines in orderedLines.GroupBy(x => x.ExpenseAccountId!.Value).OrderBy(x => x.Key))
            {
                var net = groupLines.Sum(x => x.Subtotal - x.DiscountAmount);
                var debit = decimal.Round(net * exchangeRate, 2, MidpointRounding.AwayFromZero);
                if (debit > 0) journalLines.Add((groupLines.Key, $"{draft.InvoiceNumber} · Gider", debit, 0m));
            }
            if (draft.TaxTotal > 0)
            {
                var vatDebit = decimal.Round(draft.TaxTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
                if (vatDebit > 0) journalLines.Add((vatAccount!.Id, $"{draft.InvoiceNumber} · İndirilecek KDV", vatDebit, 0m));
            }
        }
        catch (OverflowException) { return Results.Conflict(new { error = "Fatura baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        var payableAmount = journalLines.Sum(x => x.Debit);
        if (payableAmount <= 0 || payableAmount > 9999999999999999.99m)
            return Results.Conflict(new { error = "Baz para birimindeki toplam yevmiye tutarı sınırlar dışında." });

        var journal = new JournalEntry
        {
            TenantId = tenantId,
            Code = $"YV-{Guid.NewGuid():N}",
            EntryDate = draft.InvoiceDate,
            Description = $"Bağımsız alış faturası · {draft.InvoiceNumber}" + (draft.CurrencyCode == tenant.BaseCurrencyCode ? "" : $" · {draft.CurrencyCode}/{tenant.BaseCurrencyCode} {exchangeRate}"),
            SourceType = PostingSource,
            SourceId = draft.Id,
            CreatedByUserId = userId,
        };
        var lineNumber = 1;
        foreach (var line in journalLines)
            journal.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = journal.Id, AccountId = line.AccountId,
                LineNumber = lineNumber++, Description = line.Description, Debit = line.Debit, Credit = 0m });
        journal.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = journal.Id, AccountId = payable.Id,
            LineNumber = lineNumber, Description = $"{draft.InvoiceNumber} · {supplier.Name}", Debit = 0m, Credit = payableAmount });

        var ledger = new CustomerLedgerEntry
        {
            TenantId = tenantId,
            CustomerId = supplier.Id,
            PurchaseInvoiceDraftId = draft.Id,
            EntryDate = draft.InvoiceDate,
            Direction = CustomerLedgerDirection.Credit,
            Amount = draft.GrandTotal,
            CurrencyCode = draft.CurrencyCode,
            Description = $"Bağımsız alış faturası {draft.InvoiceNumber}",
        };
        draft.Status = PurchaseInvoiceDraftStatus.Posted;
        draft.NormalizedInvoiceNumber = NormalizeInvoiceNumber(draft.InvoiceNumber);
        draft.PostedAt = DateTimeOffset.UtcNow;
        draft.PostedByUserId = userId;
        draft.UpdatedAt = draft.PostedAt.Value;
        db.JournalEntries.Add(journal);
        db.CustomerLedgerEntries.Add(ledger);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
            Action = "standalone-supplier-invoice.posted", Resource = draft.InvoiceNumber });
        try
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await transaction.RollbackAsync(ct);
            return Results.Conflict(new { error = "Bu tedarikçi ve fatura numarası daha önce muhasebeleştirilmiş veya fatura aynı anda başka bir işlemle aktarılmış." });
        }
        return Results.Ok(new StandaloneSupplierInvoiceDraftPostingResult(draft.Id, "Posted", journal.Id, ledger.Id));
    }

    private const string PostingSource = "StandaloneInvoiceDraft";

    private static StandaloneSupplierInvoiceDraftDetail ToDetail(StandaloneSupplierInvoiceDraft x) => new(x.Id,
        x.SupplierId, x.Supplier.Name, x.InvoiceNumber, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.Notes,
        x.Subtotal, x.DiscountTotal, x.TaxTotal, x.GrandTotal, x.Status.ToString(), x.CreatedAt, x.UpdatedAt,
        Convert.ToBase64String(x.RowVersion), x.Lines.OrderBy(l => l.LineNumber).Select(l => new StandaloneSupplierInvoiceDraftLineView(
            l.Id, l.LineNumber, l.Description, l.Quantity, l.UnitCode, l.UnitPrice, l.Subtotal, l.DiscountAmount, l.TaxAmount, l.Total,
            l.ExpenseAccountId, l.VatRate)).ToArray());

    private static async Task<Dictionary<string, string[]>?> ValidateExpenseAccountsAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyList<StandaloneSupplierInvoiceDraftLineCreateRequest> lines, CancellationToken ct)
    {
        var requested = lines.Where(x => x.ExpenseAccountId.HasValue).ToArray();
        if (requested.Length == 0) return null;
        var ids = requested.Select(x => x.ExpenseAccountId!.Value).Distinct().ToArray();
        var valid = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive
            && x.StatementSection == LedgerAccountStatementSection.Expense && ids.Contains(x.Id))
            .Select(x => x.Id).ToListAsync(ct);
        if (valid.Count == ids.Length) return null;
        var errors = new Dictionary<string, string[]>();
        foreach (var line in requested.Where(x => !valid.Contains(x.ExpenseAccountId!.Value)))
            errors[$"lines[{line.LineNumber}].expenseAccountId"] = ["Gider hesabı bu firmaya ait etkin bir gider hesabı olmalıdır."];
        return errors;
    }

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        tenantId = Guid.Empty;
        userId = Guid.Empty;
        return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId)
            && Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out userId)
            && !string.IsNullOrWhiteSpace(user.FindFirstValue("role"));
    }

    private static bool TryReadRowVersion(string? value, out byte[] rowVersion)
    {
        rowVersion = [];
        if (value is null || value.Length > 24) return false;
        try
        {
            rowVersion = Convert.FromBase64String(value);
            return rowVersion.Length == 8 || rowVersion.Length == 0;
        }
        catch (FormatException) { return false; }
    }

    private static Dictionary<string, string[]>? Validate(StandaloneSupplierInvoiceDraftCreateRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string field, string message) => errors[field] = [message];
        if (request.RequestId == Guid.Empty) Add("requestId", "Tekrar güvenliği için istek kimliği zorunludur.");
        if (request.SupplierId == Guid.Empty) Add("supplierId", "Tedarikçi seçilmelidir.");
        if (string.IsNullOrWhiteSpace(request.InvoiceNumber) || request.InvoiceNumber.Trim().Length > 100) Add("invoiceNumber", "Tedarikçi fatura numarası 1-100 karakter olmalıdır.");
        if (request.InvoiceDate == default) Add("invoiceDate", "Fatura tarihi gereklidir.");
        if (request.DueDate is { } due && request.InvoiceDate != default && due < request.InvoiceDate) Add("dueDate", "Vade tarihi fatura tarihinden önce olamaz.");
        if (request.CurrencyCode is null || request.CurrencyCode.Trim().Length != 3 || request.CurrencyCode.Trim().Any(c => !char.IsAsciiLetter(c))) Add("currencyCode", "Para birimi 3 harfli kod olmalıdır.");
        if (request.Notes?.Length > 1000) Add("notes", "Not en fazla 1000 karakter olabilir.");
        ValidateAmount("subtotal", request.Subtotal, errors);
        ValidateAmount("discountTotal", request.DiscountTotal, errors);
        ValidateAmount("taxTotal", request.TaxTotal, errors);
        ValidateAmount("grandTotal", request.GrandTotal, errors);
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) Add("lines", "Taslakta 1-100 arası satır bulunmalıdır.");
        else
        {
            var numbers = new HashSet<int>();
            foreach (var line in request.Lines)
            {
                var prefix = $"lines[{line.LineNumber}]";
                if (line.LineNumber < 1 || !numbers.Add(line.LineNumber)) Add("lines", "Satır numaraları benzersiz ve pozitif olmalıdır.");
                if (string.IsNullOrWhiteSpace(line.Description) || line.Description.Trim().Length > 240) Add(prefix + ".description", "Satır açıklaması 1-240 karakter olmalıdır.");
                if (line.UnitCode?.Length > 12) Add(prefix + ".unitCode", "Birim en fazla 12 karakter olabilir.");
                ValidateOptionalAmount(prefix + ".quantity", line.Quantity, 4, errors);
                ValidateOptionalAmount(prefix + ".unitPrice", line.UnitPrice, 4, errors);
                ValidateAmount(prefix + ".subtotal", line.Subtotal, errors);
                ValidateAmount(prefix + ".discountAmount", line.DiscountAmount, errors);
                ValidateAmount(prefix + ".taxAmount", line.TaxAmount, errors);
                ValidateAmount(prefix + ".total", line.Total, errors);
                if (line.VatRate is { } vatRate && (vatRate < 0 || vatRate > 100 || decimal.Round(vatRate, 2, MidpointRounding.AwayFromZero) != vatRate))
                    Add(prefix + ".vatRate", "Belgede yazan KDV oranı 0–100 arasında ve en fazla iki ondalık basamaklı olmalıdır.");
            }
        }
        return errors.Count == 0 ? null : errors;
    }

    private static void ValidateAmount(string key, decimal value, Dictionary<string, string[]> errors)
    {
        if (value < 0 || value > 9999999999999999.99m || decimal.Round(value, 2, MidpointRounding.AwayFromZero) != value)
            errors[key] = ["Tutar sıfır veya pozitif, en fazla 16 tam ve 2 ondalık basamaklı olmalıdır."];
    }

    private static void ValidateOptionalAmount(string key, decimal? value, int scale, Dictionary<string, string[]> errors)
    {
        if (value is null) return;
        var limit = scale == 4 ? 99999999999999.9999m : 9999999999999999.99m;
        if (value < 0 || value > limit || decimal.Round(value.Value, scale, MidpointRounding.AwayFromZero) != value)
            errors[key] = ["Değer sıfır veya pozitif ve desteklenen basamak sayısında olmalıdır."];
    }

    private static bool Matches(StandaloneSupplierInvoiceDraft saved, StandaloneSupplierInvoiceDraftCreateRequest request)
    {
        if (saved.SupplierId != request.SupplierId || saved.InvoiceNumber != request.InvoiceNumber.Trim()
            || saved.InvoiceDate != request.InvoiceDate || saved.DueDate != request.DueDate
            || saved.CurrencyCode != request.CurrencyCode.Trim().ToUpperInvariant() || saved.Notes != Clean(request.Notes)
            || saved.Subtotal != request.Subtotal || saved.DiscountTotal != request.DiscountTotal
            || saved.TaxTotal != request.TaxTotal || saved.GrandTotal != request.GrandTotal
            || request.Lines is null || saved.Lines.Count != request.Lines.Count) return false;
        var lines = saved.Lines.OrderBy(x => x.LineNumber).ToArray();
        var requested = request.Lines.OrderBy(x => x.LineNumber).ToArray();
        return lines.Zip(requested).All(pair => pair.First.LineNumber == pair.Second.LineNumber
            && pair.First.Description == pair.Second.Description.Trim() && pair.First.Quantity == pair.Second.Quantity
            && pair.First.UnitCode == Clean(pair.Second.UnitCode) && pair.First.UnitPrice == pair.Second.UnitPrice
            && pair.First.Subtotal == pair.Second.Subtotal && pair.First.DiscountAmount == pair.Second.DiscountAmount
            && pair.First.TaxAmount == pair.Second.TaxAmount && pair.First.Total == pair.Second.Total
            && pair.First.ExpenseAccountId == pair.Second.ExpenseAccountId && pair.First.VatRate == pair.Second.VatRate);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string NormalizeInvoiceNumber(string value) => value.Trim().ToUpperInvariant();
    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
}

public sealed record StandaloneSupplierInvoiceDraftCreateRequest(Guid RequestId, Guid SupplierId, string InvoiceNumber,
    DateOnly InvoiceDate, DateOnly? DueDate, string CurrencyCode, string? Notes, decimal Subtotal,
    decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, IReadOnlyList<StandaloneSupplierInvoiceDraftLineCreateRequest> Lines);
public sealed record StandaloneSupplierInvoiceDraftUpdateRequest(string ExpectedRowVersion, Guid SupplierId, string InvoiceNumber,
    DateOnly InvoiceDate, DateOnly? DueDate, string CurrencyCode, string? Notes, decimal Subtotal,
    decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, IReadOnlyList<StandaloneSupplierInvoiceDraftLineCreateRequest> Lines);
public sealed record StandaloneSupplierInvoiceDraftLineCreateRequest(int LineNumber, string Description,
    decimal? Quantity, string? UnitCode, decimal? UnitPrice, decimal Subtotal, decimal DiscountAmount, decimal TaxAmount, decimal Total,
    Guid? ExpenseAccountId = null, decimal? VatRate = null);
public sealed record StandaloneSupplierInvoiceDraftPage(IReadOnlyList<StandaloneSupplierInvoiceDraftSummary> Items,
    int Page, int PageSize, int TotalCount);
public sealed record StandaloneSupplierInvoiceDraftSupplierPage(IReadOnlyList<StandaloneSupplierInvoiceDraftSupplierOption> Items,
    int Page, int PageSize, int TotalCount);
public sealed record StandaloneSupplierInvoiceDraftSupplierOption(Guid Id, string Code, string Name, string CurrencyCode);
public sealed record StandaloneSupplierInvoiceDraftSummary(Guid Id, Guid SupplierId, string SupplierName,
    string InvoiceNumber, DateOnly InvoiceDate, DateOnly? DueDate, string CurrencyCode, decimal GrandTotal,
    int LineCount, string Status, DateTimeOffset CreatedAt);
public sealed record StandaloneSupplierInvoiceDraftDetail(Guid Id, Guid SupplierId, string SupplierName,
    string InvoiceNumber, DateOnly InvoiceDate, DateOnly? DueDate, string CurrencyCode, string? Notes,
    decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, string Status,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string RowVersion,
    IReadOnlyList<StandaloneSupplierInvoiceDraftLineView> Lines);
public sealed record StandaloneSupplierInvoiceDraftLineView(Guid Id, int LineNumber, string Description,
    decimal? Quantity, string? UnitCode, decimal? UnitPrice, decimal Subtotal, decimal DiscountAmount, decimal TaxAmount, decimal Total,
    Guid? ExpenseAccountId, decimal? VatRate);
public sealed record StandaloneSupplierInvoiceDraftPostingResult(Guid DraftId, string Status, Guid JournalEntryId, Guid LedgerEntryId);
