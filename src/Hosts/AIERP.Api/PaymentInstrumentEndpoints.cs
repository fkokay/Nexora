using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

internal static class PaymentInstrumentEndpoints
{
    public static void MapPaymentInstrumentEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/finance/payment-instruments").WithTags("Çek ve senet").RequireAuthorization();
        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, PaymentInstrumentStatus? status,
            PaymentInstrumentType? type, PaymentInstrumentDirection? direction, DateOnly? dueFrom, DateOnly? dueTo,
            string? term, int? page, int? pageSize, CancellationToken ct) =>
        {
            if (!TenantId(user, out var tenantId)) return Results.Forbid();
            var currentPage = page ?? 1; var currentPageSize = pageSize ?? 50;
            if (currentPage < 1) return Validation("page", "Sayfa numarası 1 veya daha büyük olmalıdır.");
            if (currentPageSize < 1 || currentPageSize > 250) return Validation("pageSize", "Sayfa boyutu 1–250 arasında olmalıdır.");
            var searchTerm = term?.Trim();
            if (term is not null && (searchTerm!.Length is < 2 or > 100))
                return Validation("term", "Arama terimi 2–100 karakter arasında olmalıdır.");
            var query = db.PaymentInstruments.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (searchTerm is not null)
                query = query.Where(x => x.Code.Contains(searchTerm) || x.InstrumentNumber.Contains(searchTerm) || x.CounterpartyName.Contains(searchTerm));
            if (status is { } selectedStatus) query = query.Where(x => x.Status == selectedStatus);
            if (type is { } selectedType) query = query.Where(x => x.Type == selectedType);
            if (direction is { } selectedDirection) query = query.Where(x => x.Direction == selectedDirection);
            if (dueFrom is { } from) query = query.Where(x => x.DueDate >= from);
            if (dueTo is { } to) query = query.Where(x => x.DueDate <= to);
            var totalCount = await query.CountAsync(ct);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var openByCurrency = await query.Where(x => x.Status == PaymentInstrumentStatus.Portfolio || x.Status == PaymentInstrumentStatus.Endorsed)
                .GroupBy(x => x.CurrencyCode).Select(g => new { currencyCode = g.Key, amount = g.Sum(x => x.Amount) }).ToListAsync(ct);
            var dueCount = await query.CountAsync(x => (x.Status == PaymentInstrumentStatus.Portfolio || x.Status == PaymentInstrumentStatus.Endorsed) && x.DueDate <= today, ct);
            var bouncedCount = await query.CountAsync(x => x.Status == PaymentInstrumentStatus.Bounced, ct);
            var rows = await query.OrderBy(x => x.DueDate).ThenBy(x => x.Code).Skip((currentPage - 1) * currentPageSize).Take(currentPageSize).ToListAsync(ct);
            return Results.Ok(new { items = rows.Select(View).ToList(), page = currentPage, pageSize = currentPageSize, totalCount,
                summary = new { openByCurrency, dueCount, bouncedCount } });
        });

        group.MapPost("/", async (PaymentInstrumentCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantAdmin(user, out var tenantId) || !UserId(user, out var actorId)) return Results.Forbid();
            var error = Validate(request);
            if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [error.Value.Key] = [error.Value.Message] });
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var currency = request.CurrencyCode.Trim().ToUpperInvariant();
            var counterpartyAccountId = request.CounterpartyAccountId;
            if (counterpartyAccountId is { } suppliedCounterpartyId)
            {
                var counterparty = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == suppliedCounterpartyId, ct);
                if (counterparty is null || !string.Equals(counterparty.Name.Trim(), request.CounterpartyName.Trim(), StringComparison.Ordinal))
                    return Validation("counterpartyAccountId", "Cari hesabı bulunamadı veya cari unvanı seçilen hesapla eşleşmiyor.");
            }
            var prior = await db.PaymentInstruments.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (prior is not null)
                return SameCreate(prior, request, currency) ? Results.Ok(View(prior)) : Results.Conflict(new { error = "İstek kimliği farklı bir çek/senet kaydında kullanılmış." });
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.PortfolioDate, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var offsetKey = request.Direction == PaymentInstrumentDirection.Receivable
                ? LedgerMappingKeys.InstrumentReceivableOffset : LedgerMappingKeys.InstrumentPayableOffset;
            var portfolioKey = request.Direction == PaymentInstrumentDirection.Receivable
                ? LedgerMappingKeys.InstrumentReceivablePortfolio : LedgerMappingKeys.InstrumentPayablePortfolio;
            var mapped = await LoadMappedAccountsAsync(db, tenantId, [offsetKey, portfolioKey], ct);
            if (mapped is null) return MissingMappings([offsetKey, portfolioKey]);
            var instrument = new PaymentInstrument
            {
                TenantId = tenantId, RequestId = request.RequestId, Type = request.Type, Direction = request.Direction,
                Code = $"{(request.Type == PaymentInstrumentType.Check ? "CEK" : "SNT")}-{Guid.NewGuid():N}"[..12].ToUpperInvariant(),
                InstrumentNumber = request.InstrumentNumber.Trim(), CounterpartyName = request.CounterpartyName.Trim(), CounterpartyAccountId = counterpartyAccountId,
                BankName = request.BankName.Trim(), CurrencyCode = currency, Amount = request.Amount,
                IssueDate = request.IssueDate, DueDate = request.DueDate, PortfolioDate = request.PortfolioDate,
                Notes = Clean(request.Notes), CreatedByUserId = actorId
            };
            db.PaymentInstruments.Add(instrument);
            var createdEvent = NewEvent(instrument, request.RequestId, "Created", null,
                PaymentInstrumentStatus.Portfolio, request.PortfolioDate, Clean(request.Notes), null, actorId);
            db.PaymentInstrumentEvents.Add(createdEvent);
            var creationLines = request.Direction == PaymentInstrumentDirection.Receivable
                ? new[] { (mapped[portfolioKey], request.Amount, 0m), (mapped[offsetKey], 0m, request.Amount) }
                : new[] { (mapped[offsetKey], request.Amount, 0m), (mapped[portfolioKey], 0m, request.Amount) };
            db.JournalEntries.Add(NewJournal(tenantId, actorId, createdEvent, creationLines,
                $"{InstrumentLabel(instrument.Type)} portföye alındı · {instrument.Code}"));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorId, Action = "finance.instrument.created", Resource = $"{instrument.Type}:{instrument.Code}:{instrument.Amount} {instrument.CurrencyCode}" });
            try { await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); }
            catch (DbUpdateException ex) when (UniqueViolation(ex))
            {
                var raced = await db.PaymentInstruments.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
                return raced is null ? Results.Conflict(new { error = "Bu çek/senet numarası veya istek kimliği başka bir kayıtta kullanılmış." }) : Results.Ok(View(raced));
            }
            return Results.Created($"/api/finance/payment-instruments/{instrument.Id}", View(instrument));
        });

        group.MapGet("/{id:guid}/events", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantId(user, out var tenantId)) return Results.Forbid();
            var exists = await db.PaymentInstruments.AnyAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (!exists) return Results.NotFound();
            var events = await db.PaymentInstrumentEvents.AsNoTracking().Where(x => x.TenantId == tenantId && x.PaymentInstrumentId == id)
                .OrderBy(x => x.CreatedAt).Select(x => new PaymentInstrumentEventView(x.Id, x.EventType,
                    x.PreviousStatus, x.NewStatus, x.EventDate, x.Note, x.FinancialAccountTransactionId, x.CreatedAt)).ToListAsync(ct);
            return Results.Ok(events);
        });

        // Invoice application records settlement against the existing invoice allocation/payment ledger.
        // The instrument lifecycle already owns cash movements and its balanced portfolio journals, so this
        // endpoint intentionally creates no duplicate financial-account transaction or journal entry.
        group.MapPost("/{id:guid}/apply-to-invoice", async (Guid id, PaymentInstrumentInvoiceApplicationRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantAdmin(user, out var tenantId) || !UserId(user, out var actorId)) return Results.Forbid();
            if (request.RequestId == Guid.Empty) return Validation("requestId", "Tekrar deneme güvenliği için istek kimliği zorunludur.");
            if (request.InvoiceId == Guid.Empty) return Validation("invoiceId", "Fatura seçilmelidir.");
            if (request.Amount <= 0m || request.Amount > 9999999999999999.99m || request.Amount != decimal.Round(request.Amount, 2))
                return Validation("amount", "Uygulama tutarı pozitif olmalı ve en fazla iki ondalık basamak içermelidir.");
            if (request.EventDate is null) return Validation("eventDate", "Uygulama tarihi zorunludur.");

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var tenantExists = await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct);
            if (!tenantExists) return Results.NotFound();
            var item = db.Database.IsRelational()
                ? await db.PaymentInstruments.FromSqlInterpolated($"SELECT * FROM [dbo].[PaymentInstruments] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(ct)
                : await db.PaymentInstruments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();

            var fingerprint = $"InvoiceApplication:{request.InvoiceId:D}:{request.Amount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}:{request.EventDate:yyyy-MM-dd}";
            var replay = await db.PaymentInstrumentEvents.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (replay is not null)
                return replay.PaymentInstrumentId == item.Id && replay.EventType == "AppliedToInvoice" && replay.Note == fingerprint
                    ? Results.Ok(View(item))
                    : Results.Conflict(new { error = "İstek kimliği daha önce farklı bir çek/senet olayında kullanılmış." });

            if (item.Status != PaymentInstrumentStatus.Collected)
                return Results.Conflict(new { error = "Faturaya yalnızca tahsil/ödeme hareketi tamamlanmış çek veya senet uygulanabilir." });
            if (!Version(item, request.RowVersion)) return VersionConflict(item);
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.EventDate.Value, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);

            if (item.Direction == PaymentInstrumentDirection.Receivable)
            {
                var invoice = db.Database.IsRelational()
                    ? await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.InvoiceId}").SingleOrDefaultAsync(ct)
                    : await db.SalesInvoices.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.InvoiceId, ct);
                if (invoice is null) return Results.NotFound();
                if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "Yalnızca kayıtlı satış faturalarına enstrüman uygulanabilir." });
                if (invoice.CurrencyCode != item.CurrencyCode) return Results.Conflict(new { error = "Çek/senet ve fatura para birimleri aynı olmalıdır." });
                var counterparty = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == invoice.CustomerId, ct);
                if (counterparty is null || !await CounterpartyMatchesAsync(db, item, counterparty.Id, counterparty.Name, tenantId, ct))
                    return Results.Conflict(new { error = "Çek/senet carisi fatura müşterisiyle eşleşmiyor veya eski kaydın unvanı birden fazla caride kullanılıyor." });
                var alreadyApplied = await db.CustomerCollections.Where(x => x.TenantId == tenantId && x.Reference == InstrumentReference(item.Id)
                    && x.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
                var remainingInstrument = item.Amount - alreadyApplied;
                if (request.Amount > remainingInstrument) return Results.Conflict(new { error = "Uygulama tutarı çek/senedin kalan tutarını aşamaz.", remainingInstrument });
                var paid = await db.CustomerCollectionAllocations.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id
                    && x.CustomerCollection.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
                var returned = await db.SalesReturns.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id && x.Status == SalesReturnStatus.Posted)
                    .SumAsync(x => (decimal?)x.GrandTotal, ct) ?? 0m;
                var outstanding = Math.Max(0m, invoice.GrandTotal - paid - returned);
                if (request.Amount > outstanding) return Results.Conflict(new { error = "Uygulama tutarı satış faturasının kalan bakiyesini aşamaz.", outstandingAmount = outstanding });

                var collection = new CustomerCollection { TenantId = tenantId, CustomerId = invoice.CustomerId, RequestId = request.RequestId,
                    Code = $"INST-{Guid.NewGuid():N}"[..13].ToUpperInvariant(), CollectionDate = request.EventDate.Value, CurrencyCode = item.CurrencyCode,
                    Amount = request.Amount, PaymentMethod = "Instrument application", Reference = InstrumentReference(item.Id) };
                collection.Allocations.Add(new CustomerCollectionAllocation { TenantId = tenantId, CustomerCollection = collection,
                    SalesInvoiceId = invoice.Id, Amount = request.Amount });
                db.CustomerCollections.Add(collection);
                db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = invoice.CustomerId, CustomerCollection = collection,
                    EntryDate = request.EventDate.Value, Direction = CustomerLedgerDirection.Credit, Amount = request.Amount,
                    CurrencyCode = item.CurrencyCode, Description = $"Çek/senet uygulaması {item.Code} · Fatura {invoice.Code}" });
            }
            else
            {
                var invoice = db.Database.IsRelational()
                    ? await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.InvoiceId}").SingleOrDefaultAsync(ct)
                    : await db.PurchaseInvoices.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.InvoiceId, ct);
                if (invoice is null) return Results.NotFound();
                if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "Yalnızca kayıtlı alış faturalarına enstrüman uygulanabilir." });
                if (invoice.CurrencyCode != item.CurrencyCode) return Results.Conflict(new { error = "Çek/senet ve fatura para birimleri aynı olmalıdır." });
                var counterparty = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == invoice.SupplierId, ct);
                if (counterparty is null || !await CounterpartyMatchesAsync(db, item, counterparty.Id, counterparty.Name, tenantId, ct))
                    return Results.Conflict(new { error = "Çek/senet carisi fatura tedarikçisiyle eşleşmiyor veya eski kaydın unvanı birden fazla caride kullanılıyor." });
                var alreadyApplied = await db.SupplierPayments.Where(x => x.TenantId == tenantId && x.Reference == InstrumentReference(item.Id)
                    && x.Status == SupplierPaymentStatus.Posted).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
                var remainingInstrument = item.Amount - alreadyApplied;
                if (request.Amount > remainingInstrument) return Results.Conflict(new { error = "Uygulama tutarı çek/senedin kalan tutarını aşamaz.", remainingInstrument });
                var paid = await db.SupplierPayments.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == invoice.Id && x.Status == SupplierPaymentStatus.Posted)
                    .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
                var returned = await db.SupplierReturns.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == invoice.Id && x.Status == SupplierReturnStatus.Posted)
                    .SumAsync(x => (decimal?)x.GrandTotal, ct) ?? 0m;
                var outstanding = Math.Max(0m, invoice.GrandTotal - paid - returned);
                if (request.Amount > outstanding) return Results.Conflict(new { error = "Uygulama tutarı alış faturasının kalan bakiyesini aşamaz.", outstandingAmount = outstanding });

                var payment = new SupplierPayment { TenantId = tenantId, RequestId = request.RequestId, PurchaseInvoiceId = invoice.Id,
                    SupplierId = invoice.SupplierId, Code = $"INST-{Guid.NewGuid():N}"[..13].ToUpperInvariant(), PaymentDate = request.EventDate.Value,
                    CurrencyCode = item.CurrencyCode, Amount = request.Amount, PaymentMethod = "Instrument application", Reference = InstrumentReference(item.Id) };
                db.SupplierPayments.Add(payment);
                db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = invoice.SupplierId, SupplierPayment = payment,
                    EntryDate = request.EventDate.Value, Direction = CustomerLedgerDirection.Debit, Amount = request.Amount,
                    CurrencyCode = item.CurrencyCode, Description = $"Çek/senet uygulaması {item.Code} · Fatura {invoice.Code}" });
            }

            var appliedEvent = NewEvent(item, request.RequestId, "AppliedToInvoice", item.Status, item.Status, request.EventDate.Value,
                fingerprint, item.FinancialAccountTransactionId, actorId);
            db.PaymentInstrumentEvents.Add(appliedEvent);
            db.AuditEvents.Add(Audit(tenantId, actorId, "finance.instrument.applied-to-invoice", item, fingerprint));
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kayıt eşzamanlı olarak değişti. Yenileyip tekrar deneyin." }); }
            catch (DbUpdateException ex) when (UniqueViolation(ex)) { return Results.Conflict(new { error = "İstek kimliği daha önce işlendi; olayları yenileyin." }); }
            await transaction.CommitAsync(ct);
            return Results.Ok(View(item));
        });

        group.MapPost("/{id:guid}/endorse", async (Guid id, PaymentInstrumentActionRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantAdmin(user, out var tenantId) || !UserId(user, out var actorId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var item = await db.PaymentInstruments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var replay = await ReplayIfSameAsync(item, request.RequestId, "Endorsed", db, ct);
            if (replay is not null) return replay;
            if (item.Type != PaymentInstrumentType.Check || item.Direction != PaymentInstrumentDirection.Receivable || item.Status != PaymentInstrumentStatus.Portfolio)
                return Results.Conflict(new { error = "Yalnız portföydeki alacak çekleri ciro edilebilir." });
            if (string.IsNullOrWhiteSpace(request.EndorsedTo) || request.EndorsedTo.Trim().Length > 160)
                return Validation("endorsedTo", "Ciro edilen kişi/kurum 1–160 karakter olmalıdır.");
            if (!Version(item, request.RowVersion)) return VersionConflict(item);
            var before = item.Status; var date = request.EventDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, date, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var endorsementKeys = new[] { LedgerMappingKeys.InstrumentReceivablePortfolio, LedgerMappingKeys.InstrumentEndorsementOffset };
            var mapped = await LoadMappedAccountsAsync(db, tenantId, endorsementKeys, ct);
            if (mapped is null) return MissingMappings(endorsementKeys);
            item.Status = PaymentInstrumentStatus.Endorsed; item.EndorsedTo = request.EndorsedTo.Trim(); item.EndorsedAt = DateTimeOffset.UtcNow;
            var endorsedEvent = NewEvent(item, request.RequestId, "Endorsed", before, item.Status, date, Clean(request.Note), null, actorId);
            db.PaymentInstrumentEvents.Add(endorsedEvent);
            db.JournalEntries.Add(NewJournal(tenantId, actorId, endorsedEvent,
                [(mapped[LedgerMappingKeys.InstrumentEndorsementOffset], item.Amount, 0m),
                 (mapped[LedgerMappingKeys.InstrumentReceivablePortfolio], 0m, item.Amount)],
                $"Alacak {InstrumentLabel(item.Type)} cirosu · {item.Code}"));
            db.AuditEvents.Add(Audit(tenantId, actorId, "finance.instrument.endorsed", item, request.Note));
            return await SaveAction(db, item, ct, transaction);
        });

        group.MapPost("/{id:guid}/collect", async (Guid id, PaymentInstrumentActionRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantAdmin(user, out var tenantId) || !UserId(user, out var actorId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var item = await db.PaymentInstruments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var replay = await ReplayIfSameAsync(item, request.RequestId, "Collected", db, ct);
            if (replay is not null) return replay;
            if (item.Status is not (PaymentInstrumentStatus.Portfolio or PaymentInstrumentStatus.Bounced))
                return Results.Conflict(new { error = "Yalnız portföydeki veya yeniden ibraz edilebilir karşılıksız enstrüman tahsil/ödeme işlemine alınabilir." });
            if (!Version(item, request.RowVersion)) return VersionConflict(item);
            var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.FinancialAccountId}").SingleOrDefaultAsync(ct);
            if (account is null || !account.IsActive || account.CurrencyCode != item.CurrencyCode)
                return Validation("financialAccountId", "Aynı firma ve para birimindeki etkin kasa/banka hesabını seçin.");
            var date = request.EventDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, date, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var portfolioKey = item.Direction == PaymentInstrumentDirection.Receivable
                ? LedgerMappingKeys.InstrumentReceivablePortfolio : LedgerMappingKeys.InstrumentPayablePortfolio;
            var accountKey = LedgerMappingKeys.FinancialAccountPrefix + account.Id;
            var mapped = await LoadMappedAccountsAsync(db, tenantId, [portfolioKey, accountKey], ct);
            if (mapped is null) return MissingMappings([portfolioKey, accountKey]);
            if (item.Direction == PaymentInstrumentDirection.Payable && account.Type == FinancialAccountType.Cash)
            {
                var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == account.Id)
                    .SumAsync(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount, ct);
                if (balance < item.Amount) return Results.Conflict(new { error = "Kasa bakiyesi bu ödemeyi karşılamıyor." });
            }
            var before = item.Status;
            var movement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccountId = account.Id,
                CurrencyCode = item.CurrencyCode, TransactionDate = date,
                Direction = item.Direction == PaymentInstrumentDirection.Receivable ? FinancialDirection.Inflow : FinancialDirection.Outflow,
                Amount = item.Amount, Description = $"{InstrumentLabel(item.Type)} tahsil/ödeme · {item.Code}",
                Reference = item.InstrumentNumber, RequestId = request.RequestId };
            db.FinancialAccountTransactions.Add(movement);
            item.Status = PaymentInstrumentStatus.Collected; item.CollectedAt = DateTimeOffset.UtcNow;
            item.FinancialAccountId = account.Id; item.FinancialAccountTransactionId = movement.Id;
            var collectedEvent = NewEvent(item, request.RequestId, "Collected", before, item.Status, date, Clean(request.Note), movement.Id, actorId);
            db.PaymentInstrumentEvents.Add(collectedEvent);
            var collectionLines = item.Direction == PaymentInstrumentDirection.Receivable
                ? new[] { (mapped[accountKey], item.Amount, 0m), (mapped[portfolioKey], 0m, item.Amount) }
                : new[] { (mapped[portfolioKey], item.Amount, 0m), (mapped[accountKey], 0m, item.Amount) };
            db.JournalEntries.Add(NewJournal(tenantId, actorId, collectedEvent, collectionLines,
                $"{InstrumentLabel(item.Type)} tahsil/ödeme · {item.Code}"));
            db.AuditEvents.Add(Audit(tenantId, actorId, "finance.instrument.collected", item, request.Note));
            return await SaveAction(db, item, ct, transaction);
        });

        group.MapPost("/{id:guid}/bounce", async (Guid id, PaymentInstrumentActionRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantAdmin(user, out var tenantId) || !UserId(user, out var actorId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var item = await db.PaymentInstruments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var replay = await ReplayIfSameAsync(item, request.RequestId, "Bounced", db, ct);
            if (replay is not null) return replay;
            if (item.Status is not (PaymentInstrumentStatus.Portfolio or PaymentInstrumentStatus.Endorsed or PaymentInstrumentStatus.Collected))
                return Results.Conflict(new { error = "Bu durumdaki çek/senet karşılıksız işlemine alınamaz." });
            var activeApplications = item.Direction == PaymentInstrumentDirection.Receivable
                ? await db.CustomerCollections.Where(x => x.TenantId == tenantId && x.Reference == InstrumentReference(item.Id) && x.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m
                : await db.SupplierPayments.Where(x => x.TenantId == tenantId && x.Reference == InstrumentReference(item.Id) && x.Status == SupplierPaymentStatus.Posted).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
            if (activeApplications > 0m)
                return Results.Conflict(new { error = "Enstrümanın faturalara uygulanmış tutarı var. Önce bağlı tahsilat/ödeme kayıtlarını iptal edin.", activeApplications });
            if (string.IsNullOrWhiteSpace(request.Note) || request.Note.Trim().Length > 500)
                return Validation("note", "Karşılıksız işlem nedeni zorunludur (en fazla 500 karakter).");
            if (!Version(item, request.RowVersion)) return VersionConflict(item);
            var before = item.Status; var date = request.EventDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, date, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            Guid? reversalId = null;
            JournalEntry? originalJournal = null;
            if (before == PaymentInstrumentStatus.Collected)
            {
                if (item.FinancialAccountTransactionId is not { } movementId || item.FinancialAccountId is not { } accountId)
                    return Results.Conflict(new { error = "Tahsilat hareketi bulunamadığı için karşılıksız işlemi güvenle tamamlanamıyor." });
                var original = await db.FinancialAccountTransactions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == movementId, ct);
                if (original is null || await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == movementId, ct))
                    return Results.Conflict(new { error = "Tahsilat hareketi zaten ters kayıt almış veya bulunamıyor." });
                var originalEvent = await db.PaymentInstrumentEvents.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PaymentInstrumentId == item.Id && x.EventType == "Collected" && x.FinancialAccountTransactionId == movementId, ct);
                if (originalEvent is null) return Results.Conflict(new { error = "Tahsilat denetim olayı bulunamadı; ters kayıt güvenle oluşturulamıyor." });
                originalJournal = await db.JournalEntries.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "PaymentInstrumentEvent" && x.SourceId == originalEvent.Id, ct);
                if (!IsBalancedTenantJournal(originalJournal, tenantId))
                    return Results.Conflict(new { error = "Tahsilatın dengeli defter fişi bulunamadı; önce mutabakat yapın." });
                var account = await db.FinancialAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == accountId, ct);
                if (account is null) return Results.Conflict(new { error = "Tahsilat hesabı bulunamadığı için işlem tamamlanamıyor." });
                var reversal = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccountId = accountId,
                    CurrencyCode = item.CurrencyCode, TransactionDate = date,
                    Direction = original.Direction == FinancialDirection.Inflow ? FinancialDirection.Outflow : FinancialDirection.Inflow,
                    Amount = original.Amount, Description = $"Karşılıksız çek/senet ters kaydı · {item.Code}",
                    Reference = item.InstrumentNumber, ReversalOfId = original.Id, RequestId = request.RequestId };
                db.FinancialAccountTransactions.Add(reversal); reversalId = reversal.Id;
                item.FinancialAccountTransactionId = null; item.FinancialAccountId = null; item.CollectedAt = null;
            }
            else if (before == PaymentInstrumentStatus.Endorsed)
            {
                var endorsementEvent = await db.PaymentInstrumentEvents.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PaymentInstrumentId == item.Id && x.EventType == "Endorsed", ct);
                originalJournal = endorsementEvent is null ? null : await db.JournalEntries.Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "PaymentInstrumentEvent" && x.SourceId == endorsementEvent.Id, ct);
                if (!IsBalancedTenantJournal(originalJournal, tenantId))
                    return Results.Conflict(new { error = "Ciro hareketinin dengeli defter fişi bulunamadı; ters kayıt öncesi mutabakat yapın." });
            }
            item.Status = PaymentInstrumentStatus.Bounced;
            var bouncedEvent = NewEvent(item, request.RequestId, "Bounced", before, item.Status, date, Clean(request.Note), reversalId, actorId);
            db.PaymentInstrumentEvents.Add(bouncedEvent);
            if (originalJournal is not null)
                db.JournalEntries.Add(NewReverseJournal(tenantId, actorId, bouncedEvent, originalJournal,
                    $"Karşılıksız {InstrumentLabel(item.Type)} · {item.Code}"));
            db.AuditEvents.Add(Audit(tenantId, actorId, "finance.instrument.bounced", item, request.Note));
            return await SaveAction(db, item, ct, transaction);
        });

        group.MapPost("/{id:guid}/cancel", async (Guid id, PaymentInstrumentActionRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TenantAdmin(user, out var tenantId) || !UserId(user, out var actorId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            var item = await db.PaymentInstruments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var replay = await ReplayIfSameAsync(item, request.RequestId, "Cancelled", db, ct);
            if (replay is not null) return replay;
            if (item.Status != PaymentInstrumentStatus.Portfolio) return Results.Conflict(new { error = "Yalnız ciro edilmemiş ve tahsil/ödeme görmemiş portföy kaydı iptal edilebilir." });
            if (!Version(item, request.RowVersion)) return VersionConflict(item);
            var before = item.Status; var date = request.EventDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, date, ct);
            if (closedPeriod is { } closed) return ClosedPeriodConflict(closed.FromDate, closed.ToDate);
            var createdEvent = await db.PaymentInstrumentEvents.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PaymentInstrumentId == id && x.EventType == "Created", ct);
            var originalJournal = createdEvent is null ? null : await db.JournalEntries.Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "PaymentInstrumentEvent" && x.SourceId == createdEvent.Id, ct);
            if (!IsBalancedTenantJournal(originalJournal, tenantId))
                return Results.Conflict(new { error = "Portföy kaydının dengeli defter fişi bulunamadı; iptal öncesi mutabakat yapın." });
            item.Status = PaymentInstrumentStatus.Cancelled;
            var cancelledEvent = NewEvent(item, request.RequestId, "Cancelled", before, item.Status, date, Clean(request.Note), null, actorId);
            db.PaymentInstrumentEvents.Add(cancelledEvent);
            db.JournalEntries.Add(NewReverseJournal(tenantId, actorId, cancelledEvent, originalJournal!,
                $"{InstrumentLabel(item.Type)} portföy iptali · {item.Code}"));
            db.AuditEvents.Add(Audit(tenantId, actorId, "finance.instrument.cancelled", item, request.Note));
            return await SaveAction(db, item, ct, transaction);
        });
    }

    private static async Task<Dictionary<string, Guid>?> LoadMappedAccountsAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<string> keys, CancellationToken ct)
    {
        var rows = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId && keys.Contains(x.MappingKey))
            .Join(db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive),
                mapping => new { mapping.TenantId, Id = mapping.AccountId }, account => new { account.TenantId, account.Id },
                (mapping, account) => new { mapping.MappingKey, AccountId = account.Id }).ToListAsync(ct);
        var result = rows.ToDictionary(x => x.MappingKey, x => x.AccountId, StringComparer.Ordinal);
        return keys.All(result.ContainsKey) ? result : null;
    }

    private static async Task<bool> CounterpartyMatchesAsync(TenantDbContext db, PaymentInstrument instrument,
        Guid invoiceCounterpartyId, string invoiceCounterpartyName, Guid tenantId, CancellationToken ct)
    {
        if (instrument.CounterpartyAccountId is { } knownId) return knownId == invoiceCounterpartyId;
        // Legacy instruments stored only a display name. Permit the migration path only when that exact
        // name identifies one and only one customer account in the tenant.
        var matches = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Select(x => new { x.Id, x.Name }).ToListAsync(ct);
        var exactIds = matches.Where(x => string.Equals(x.Name.Trim(), instrument.CounterpartyName.Trim(), StringComparison.Ordinal))
            .Select(x => x.Id).ToArray();
        return exactIds.Length == 1 && exactIds[0] == invoiceCounterpartyId
            && string.Equals(invoiceCounterpartyName.Trim(), instrument.CounterpartyName.Trim(), StringComparison.Ordinal);
    }

    private static string InstrumentReference(Guid instrumentId) => $"PaymentInstrument:{instrumentId:D}";

    private static IResult MissingMappings(IReadOnlyCollection<string> keys) => Results.Conflict(new
    {
        error = "Çek/senet hareketi için etkin tenant hesap eşlemesi eksik.", requiredMappings = keys
    });

    private static JournalEntry NewJournal(Guid tenantId, Guid actorId, PaymentInstrumentEvent instrumentEvent,
        IEnumerable<(Guid AccountId, decimal Debit, decimal Credit)> lines, string description)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = instrumentEvent.EventDate,
            Description = description, SourceType = "PaymentInstrumentEvent", SourceId = instrumentEvent.Id, CreatedByUserId = actorId };
        var lineNumber = 0;
        foreach (var line in lines)
            entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = line.AccountId,
                LineNumber = ++lineNumber, Description = description, Debit = line.Debit, Credit = line.Credit });
        return entry;
    }

    private static JournalEntry NewReverseJournal(Guid tenantId, Guid actorId, PaymentInstrumentEvent instrumentEvent,
        JournalEntry original, string description)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = instrumentEvent.EventDate,
            Description = description, SourceType = "PaymentInstrumentEvent", SourceId = instrumentEvent.Id, CreatedByUserId = actorId };
        foreach (var line in original.Lines.OrderBy(x => x.LineNumber))
            entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = line.AccountId,
                LineNumber = line.LineNumber, Description = $"Ters kayıt · {line.Description}", Debit = line.Credit, Credit = line.Debit });
        return entry;
    }

    private static bool IsBalancedTenantJournal(JournalEntry? journal, Guid tenantId) => journal is not null && journal.TenantId == tenantId &&
        journal.Lines.Count >= 2 && journal.Lines.All(x => x.TenantId == tenantId) && journal.Lines.Sum(x => x.Debit) > 0m &&
        journal.Lines.Sum(x => x.Debit) == journal.Lines.Sum(x => x.Credit);

    private static IResult ClosedPeriodConflict(DateOnly fromDate, DateOnly toDate) => Results.Conflict(new
    {
        error = "İşlem tarihi kapalı mali dönem içinde; çek/senet hareketi ve yevmiye oluşturulmadı.", fromDate, toDate
    });

    private static (string Key, string Message)? Validate(PaymentInstrumentCreateRequest x)
    {
        if (x.RequestId == Guid.Empty) return ("requestId", "İstek kimliği zorunludur.");
        if (!Enum.IsDefined(x.Type) || !Enum.IsDefined(x.Direction)) return ("type", "Enstrüman türü ve yönü geçersiz.");
        if (string.IsNullOrWhiteSpace(x.InstrumentNumber) || x.InstrumentNumber.Trim().Length > 80) return ("instrumentNumber", "Çek/senet numarası 1–80 karakter olmalıdır.");
        if (string.IsNullOrWhiteSpace(x.CounterpartyName) || x.CounterpartyName.Trim().Length > 160) return ("counterpartyName", "Cari unvanı 1–160 karakter olmalıdır.");
        if (string.IsNullOrWhiteSpace(x.BankName) || x.BankName.Trim().Length > 120) return ("bankName", "Banka adı 1–120 karakter olmalıdır.");
        if (x.CurrencyCode is null || x.CurrencyCode.Trim().Length != 3 || !x.CurrencyCode.Trim().All(char.IsAsciiLetter)) return ("currencyCode", "Para birimi üç harfli ISO kodu olmalıdır.");
        if (x.Amount <= 0 || x.Amount > 9999999999999999.99m) return ("amount", "Tutar sıfırdan büyük ve desteklenen aralıkta olmalıdır.");
        if (x.DueDate < x.IssueDate) return ("dueDate", "Vade tarihi düzenleme tarihinden önce olamaz.");
        if (x.PortfolioDate < x.IssueDate) return ("portfolioDate", "Portföy tarihi düzenleme tarihinden önce olamaz.");
        if (x.Notes?.Length > 500) return ("notes", "Not en fazla 500 karakter olabilir.");
        return null;
    }

    private static bool SameCreate(PaymentInstrument x, PaymentInstrumentCreateRequest r, string currency) => x.Type == r.Type && x.Direction == r.Direction && x.CounterpartyAccountId == r.CounterpartyAccountId &&
        x.InstrumentNumber == r.InstrumentNumber.Trim() && x.CounterpartyName == r.CounterpartyName.Trim() && x.BankName == r.BankName.Trim() &&
        x.CurrencyCode == currency && x.Amount == r.Amount && x.IssueDate == r.IssueDate && x.DueDate == r.DueDate && x.PortfolioDate == r.PortfolioDate;

    private static async Task<IResult?> ReplayIfSameAsync(PaymentInstrument x, Guid requestId, string eventType, TenantDbContext db, CancellationToken ct)
    {
        if (requestId == Guid.Empty) return Validation("requestId", "İstek kimliği zorunludur.");
        var prior = await db.PaymentInstrumentEvents.AsNoTracking().SingleOrDefaultAsync(e => e.TenantId == x.TenantId && e.RequestId == requestId, ct);
        if (prior is null) return null;
        return prior.PaymentInstrumentId == x.Id && prior.EventType == eventType ? Results.Ok(View(x)) : Results.Conflict(new { error = "İstek kimliği daha önce farklı bir olayda kullanılmış." });
    }

    private static async Task<IResult> SaveAction(TenantDbContext db, PaymentInstrument item, CancellationToken ct, IDbContextTransaction? transaction = null)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kayıt eşzamanlı olarak değişti. Yenileyip tekrar deneyin." }); }
        catch (DbUpdateException ex) when (UniqueViolation(ex)) { return Results.Conflict(new { error = "Bu istek kimliği daha önce işlendi veya kayıt başka bir işlemle değişti." }); }
        if (transaction is not null) await transaction.CommitAsync(ct);
        var version = Convert.ToBase64String(item.RowVersion);
        return Results.Ok(View(item) with { RowVersion = version });
    }

    private static PaymentInstrumentEvent NewEvent(PaymentInstrument item, Guid requestId, string eventType,
        PaymentInstrumentStatus? previous, PaymentInstrumentStatus current, DateOnly date, string? note, Guid? movementId, Guid actorId) =>
        new() { TenantId = item.TenantId, PaymentInstrumentId = item.Id, RequestId = requestId, EventType = eventType,
            PreviousStatus = previous, NewStatus = current, EventDate = date, Note = note, FinancialAccountTransactionId = movementId, CreatedByUserId = actorId };

    private static AuditEvent Audit(Guid tenantId, Guid actorId, string action, PaymentInstrument item, string? note) =>
        new() { TenantId = tenantId, UserId = actorId, Action = action, Resource = $"{item.Type}:{item.Code}:{item.Status}:{Clean(note)}" };

    private static PaymentInstrumentView View(PaymentInstrument x) => new(x.Id, x.Code, x.Type, x.Direction, x.Status,
        x.InstrumentNumber, x.CounterpartyName, x.BankName, x.CurrencyCode, x.Amount, x.IssueDate, x.DueDate,
        x.PortfolioDate, x.EndorsedTo, x.EndorsedAt, x.CollectedAt, x.FinancialAccountId,
        x.FinancialAccountTransactionId, x.CounterpartyAccountId, x.Notes, Convert.ToBase64String(x.RowVersion), x.CreatedAt);

    private static bool Version(PaymentInstrument item, string? value)
    {
        try
        {
            var bytes = Convert.FromBase64String(value ?? "");
            if (bytes.Length != 8) return false;
            // Use the tracked SQL rowversion as the original value. A mismatched submitted value fails before any state change.
            return bytes.SequenceEqual(item.RowVersion);
        }
        catch (FormatException) { return false; }
    }

    private static IResult VersionConflict(PaymentInstrument x) => Results.Conflict(new { error = "Kayıt güncel değil. Yenileyip tekrar deneyin.", rowVersion = Convert.ToBase64String(x.RowVersion) });
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
    private static string InstrumentLabel(PaymentInstrumentType type) => type == PaymentInstrumentType.Check ? "Çek" : "Senet";
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static bool TenantId(ClaimsPrincipal user, out Guid id) => Guid.TryParse(user.FindFirstValue("tenant_id"), out id);
    private static bool TenantAdmin(ClaimsPrincipal user, out Guid id) => TenantId(user, out id) && user.FindFirstValue("role") == "TenantAdmin";
    private static bool UserId(ClaimsPrincipal user, out Guid id) => Guid.TryParse(user.FindFirstValue("sub"), out id);
    private static bool UniqueViolation(DbUpdateException ex) => ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
}

internal sealed record PaymentInstrumentCreateRequest(Guid RequestId, PaymentInstrumentType Type,
    PaymentInstrumentDirection Direction, string InstrumentNumber, string CounterpartyName, string BankName,
    string CurrencyCode, decimal Amount, DateOnly IssueDate, DateOnly DueDate, DateOnly PortfolioDate, string? Notes,
    Guid? CounterpartyAccountId = null);
internal sealed record PaymentInstrumentInvoiceApplicationRequest(Guid RequestId, string? RowVersion, Guid InvoiceId,
    decimal Amount, DateOnly? EventDate);
internal sealed record PaymentInstrumentActionRequest(Guid RequestId, string? RowVersion,
    DateOnly? EventDate = null, Guid? FinancialAccountId = null, string? EndorsedTo = null, string? Note = null);
internal sealed record PaymentInstrumentView(Guid Id, string Code, PaymentInstrumentType Type,
    PaymentInstrumentDirection Direction, PaymentInstrumentStatus Status, string InstrumentNumber,
    string CounterpartyName, string BankName, string CurrencyCode, decimal Amount, DateOnly IssueDate,
    DateOnly DueDate, DateOnly PortfolioDate, string? EndorsedTo, DateTimeOffset? EndorsedAt,
    DateTimeOffset? CollectedAt, Guid? FinancialAccountId, Guid? FinancialAccountTransactionId, Guid? CounterpartyAccountId,
    string? Notes, string RowVersion, DateTimeOffset CreatedAt);
internal sealed record PaymentInstrumentEventView(Guid Id, string EventType, PaymentInstrumentStatus? PreviousStatus,
    PaymentInstrumentStatus NewStatus, DateOnly EventDate, string? Note, Guid? FinancialAccountTransactionId, DateTimeOffset CreatedAt);
