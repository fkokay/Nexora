using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>One balanced journal line a module source produces, numbered and truncated exactly as it is persisted.</summary>
internal sealed record JournalTransferDraftLine(int LineNumber, Guid AccountId, string Description, decimal Debit, decimal Credit);

/// <summary>
/// Result of building a module source's journal entry without persisting it. <see cref="BlockingReason"/> carries the
/// message that <c>POST /transfer</c> returns as 409; <see cref="NotFound"/> maps to 404.
/// </summary>
internal sealed record JournalTransferDraft(bool NotFound, string? BlockingReason, DateOnly? EntryDate, string? SourceCode,
    string? Description, IReadOnlyList<JournalTransferDraftLine> Lines);

public sealed record JournalTransferPreviewLine(int LineNumber, Guid AccountId, string AccountCode, string AccountName,
    decimal Debit, decimal Credit, string Description);

public sealed record JournalTransferPreview(string SourceType, Guid SourceId, string? Code, DateOnly? EntryDate, string? Description,
    IReadOnlyList<JournalTransferPreviewLine> Lines, decimal TotalDebit, decimal TotalCredit, bool CanTransfer, string? BlockingReason);

/// <summary>
/// Module journal transfer (<c>POST /transfer</c>) and its dry run (<c>POST /transfer/preview</c>). Both call
/// <see cref="BuildJournalTransferAsync"/>, so the previewed lines are exactly the lines the transfer persists; the preview
/// only reads (no lock, no transaction, no journal or audit write).
/// </summary>
internal static class GeneralLedgerTransferEndpoints
{
    private const string UnsupportedSourceMessage = "Desteklenen kaynak: satış/alış faturası, bağımsız alış taslağı, irsaliye, mal kabul, satış/tedarikçi iadesi, tahsilat, ödeme, kur değerleme veya stok maliyeti.";

    public static RouteGroupBuilder MapGeneralLedgerTransferEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/transfer/preview", PreviewAsync);
        group.MapPost("/transfer", TransferAsync);
        return group;
    }

    private static bool IsSupportedSourceType(string sourceType) =>
        sourceType is "SalesInvoice" or "PurchaseInvoice" or "StandaloneInvoiceDraft" or "PurchaseReceipt" or "SalesDelivery" or "SalesReturn" or "SupplierReturn" or "CustomerCollection" or "SupplierPayment" or "FxRevaluation" or "InventoryCostAdjustment";

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) => Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
    private static Guid? GetUserId(ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;

    private static async Task<IResult> TransferAsync(JournalTransferRequest request, ClaimsPrincipal principal, TenantDbContext db)
    {
        if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
        var sourceType = request.SourceType.Trim();
        if (!IsSupportedSourceType(sourceType)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["sourceType"] = [UnsupportedSourceMessage] });
        await using var tx = await db.Database.BeginTransactionAsync();
        // The tenant row lock serializes postings against fiscal-year close; the in-memory test provider has no locks.
        var tenant = db.Database.IsRelational()
            ? await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync()
            : await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId);
        if (tenant is null) return Results.NotFound();
        var draft = await BuildJournalTransferAsync(db, tenantId, tenant.BaseCurrencyCode, sourceType, request.SourceId);
        if (draft.NotFound) return Results.NotFound();
        if (draft.BlockingReason is not null) return Results.Conflict(new { error = draft.BlockingReason });
        var entry = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = draft.EntryDate!.Value,
            Description = draft.Description!, SourceType = sourceType, SourceId = request.SourceId, CreatedByUserId = GetUserId(principal) };
        foreach (var line in draft.Lines) entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = line.AccountId,
            LineNumber = line.LineNumber, Description = line.Description, Debit = line.Debit, Credit = line.Credit });
        db.JournalEntries.Add(entry);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.transferred", Resource = $"{sourceType}:{draft.SourceCode}:{entry.Code}" });
        await db.SaveChangesAsync(); await tx.CommitAsync();
        return Results.Created($"/api/finance/general-ledger/entries/{entry.Id}", new { entry.Id, entry.Code, entry.EntryDate, entry.Description, entry.SourceType, entry.SourceId, TotalDebit = entry.Lines.Sum(x => x.Debit), TotalCredit = entry.Lines.Sum(x => x.Credit) });
    }

    private static async Task<IResult> PreviewAsync(JournalTransferRequest request, ClaimsPrincipal principal, TenantDbContext db)
    {
        if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
        var sourceType = request.SourceType?.Trim() ?? "";
        if (!IsSupportedSourceType(sourceType)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["sourceType"] = [UnsupportedSourceMessage] });
        var baseCurrencyCode = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
        if (baseCurrencyCode is null) return Results.NotFound();
        var draft = await BuildJournalTransferAsync(db, tenantId, baseCurrencyCode, sourceType, request.SourceId);
        if (draft.NotFound) return Results.NotFound();
        var accountIds = draft.Lines.Select(x => x.AccountId).Distinct().ToArray();
        var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && accountIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => new { x.Code, x.Name });
        var lines = draft.Lines.Select(x => new JournalTransferPreviewLine(x.LineNumber, x.AccountId,
            accounts.GetValueOrDefault(x.AccountId)?.Code ?? "", accounts.GetValueOrDefault(x.AccountId)?.Name ?? "",
            x.Debit, x.Credit, x.Description)).ToList();
        return Results.Ok(new JournalTransferPreview(sourceType, request.SourceId, draft.SourceCode, draft.EntryDate, draft.Description,
            lines, lines.Sum(x => x.Debit), lines.Sum(x => x.Credit), draft.BlockingReason is null, draft.BlockingReason));
    }

    internal static async Task<bool> HasUnreversedJournalEntryAsync(TenantDbContext db, Guid tenantId, string sourceType, Guid sourceId)
    {
        var entryId = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == sourceId)
            .Select(x => (Guid?)x.Id).SingleOrDefaultAsync();
        return entryId is { } id && !await db.JournalEntries.AsNoTracking()
            .AnyAsync(x => x.TenantId == tenantId && x.SourceType == "ManualReversal" && x.SourceId == id);
    }

    private static JournalTransferDraft Blocked(string reason) => new(false, reason, null, null, null, []);
    private static JournalTransferDraft SourceNotFound() => new(true, null, null, null, null, []);

    /// <summary>
    /// Builds the balanced journal entry of a posted module source with the same checks, order and messages the transfer
    /// has always used: already transferred, source state, totals, FX rate, mappings, closed fiscal period and balance.
    /// Reads only; never adds or saves entities.
    /// </summary>
    internal static async Task<JournalTransferDraft> BuildJournalTransferAsync(TenantDbContext db, Guid tenantId, string baseCurrencyCode,
        string sourceType, Guid sourceId)
    {
        if (await db.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == sourceId)) return Blocked("Bu kaynak daha önce deftere aktarılmıştır.");
        var map = await db.LedgerAccountMappings.Where(x => x.TenantId == tenantId).ToDictionaryAsync(x => x.MappingKey, x => x.AccountId);
        var activeAccounts = await db.LedgerAccounts.Where(x => x.TenantId == tenantId && x.IsActive).ToDictionaryAsync(x => x.Id);
        var lines = new List<(Guid AccountId, string Description, decimal Debit, decimal Credit)>();
        DateOnly entryDate; string sourceCode; string description;
        if (sourceType == "SalesReturn")
        {
            var source = await db.SalesReturns.Include(x => x.SalesInvoice).Include(x => x.Customer).Include(x => x.Lines).ThenInclude(x => x.SalesInvoiceLine)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != SalesReturnStatus.Posted) return Blocked("İptal edilmiş satış iadesi deftere aktarılamaz.");
            var netRevenue = source.Subtotal - source.DiscountTotal;
            IReadOnlyList<AccountingTaxBreakdownLine> taxRows;
            try
            {
                var invoiceLineIds = source.Lines.Select(x => x.SalesInvoiceLineId).Distinct().ToArray();
                var priorQuantities = await db.SalesReturnLines.AsNoTracking().Where(x => x.TenantId == tenantId && invoiceLineIds.Contains(x.SalesInvoiceLineId)
                        && x.SalesReturn.Status == SalesReturnStatus.Posted && x.SalesReturn.CreatedAt < source.CreatedAt)
                    .GroupBy(x => x.SalesInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity) })
                    .ToDictionaryAsync(x => x.Id, x => x.Quantity);
                taxRows = source.Lines.SelectMany(line => AccountingRuleTaxCalculator.CalculateIncrementalReturnBreakdown(
                    line.SalesInvoiceLine.TaxBreakdownJson, line.SalesInvoiceLine.Quantity,
                    priorQuantities.GetValueOrDefault(line.SalesInvoiceLineId), line.Quantity, line.TaxAmount,
                    line.LineSubtotal - line.DiscountAmount + line.TaxAmount - line.LineTotal)).ToArray();
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or ArgumentOutOfRangeException or OverflowException)
            { return Blocked("Satış iadesinin kaynak fatura vergi kırılımı geçersiz."); }
            var withholdingAmount = taxRows.Where(x => x.Treatment == "Withholding").Sum(x => x.Amount);
            if (taxRows.Where(x => x.Treatment != "Withholding").Sum(x => x.Amount) != source.TaxTotal
                || source.GrandTotal <= 0 || netRevenue < 0 || source.TaxTotal < 0 || withholdingAmount < 0
                || netRevenue + source.TaxTotal - withholdingAmount != source.GrandTotal)
                return Blocked("Satış iadesi toplamları deftere aktarım için tutarlı değil.");
            var currencyCode = source.SalesInvoice.CurrencyCode;
            var baseCurrency = baseCurrencyCode;
            var exchangeRate = currencyCode == baseCurrency ? 1m
                : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= source.ReturnDate)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
            if (exchangeRate <= 0) return Blocked($"{source.ReturnDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; satış iadesi aktarılmadı.");
            decimal invoiceBase, taxBase, withholdingBase;
            try
            {
                invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
                var translatedTaxRows = taxRows.Select(row => (Row: row, AmountBase: decimal.Round(row.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero))).ToArray();
                taxBase = translatedTaxRows.Where(x => x.Row.Treatment != "Withholding").Sum(x => x.AmountBase);
                withholdingBase = translatedTaxRows.Where(x => x.Row.Treatment == "Withholding").Sum(x => x.AmountBase);
                taxRows = translatedTaxRows.Select(x => x.Row with { Amount = x.AmountBase }).ToArray();
            }
            catch (OverflowException) { return Blocked("Satış iadesi baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor."); }
            var revenueBase = invoiceBase - taxBase + withholdingBase;
            if (invoiceBase <= 0 || revenueBase < 0 || invoiceBase > 9999999999999999.99m || taxBase > 9999999999999999.99m || withholdingBase > 9999999999999999.99m)
                return Blocked("Satış iadesi baz para birimi tutarları yevmiye sınırları dışında.");
            if (!map.TryGetValue(LedgerMappingKeys.SalesReceivable, out var receivableId)
                || !map.TryGetValue(LedgerMappingKeys.SalesRevenue, out var revenueId)
                || !activeAccounts.ContainsKey(receivableId) || !activeAccounts.ContainsKey(revenueId))
                return Blocked("Satış iadesinin alacak ve gelir hesap eşleştirmeleri tamamlanmamış.");
            if (receivableId == revenueId) return Blocked("Satış iadesi alacak ve gelir hesapları farklı olmalıdır.");
            entryDate = source.ReturnDate; sourceCode = source.Code;
            description = currencyCode == baseCurrency ? $"Satış iadesi · {source.Code}" : $"Satış iadesi · {source.Code} · {currencyCode}/{baseCurrency} {exchangeRate}";
            var additiveTaxAccounts = new HashSet<Guid>();
            var withholdingTaxAccounts = new HashSet<Guid>();
            foreach (var tax in taxRows.Where(x => x.Amount > 0))
            {
                var isWithholding = tax.Treatment == "Withholding";
                var mappingKey = !string.IsNullOrWhiteSpace(source.SalesInvoice.AccountingProfileCode)
                    ? AccountingRuleProfileEndpoints.TaxRuleMappingKey(source.SalesInvoice.AccountingProfileCode, "Sales", tax.Code) : "";
                var fallbackKey = isWithholding ? LedgerMappingKeys.SalesWithholdingReceivable : LedgerMappingKeys.SalesTaxPayable;
                Guid mappedId = default;
                var hasAccount = mappingKey.Length > 0 && map.TryGetValue(mappingKey, out mappedId);
                if (!hasAccount && (mappingKey.Length == 0 || tax.Code is "VAT" or "KDV")) hasAccount = map.TryGetValue(fallbackKey, out mappedId);
                if (!hasAccount || !activeAccounts.ContainsKey(mappedId))
                    return Blocked($"Satış iadesi {tax.Code} vergisi için mevzuat profiline ait muhasebe hesabı eşleştirilmemiş.");
                if (mappedId == receivableId || mappedId == revenueId)
                    return Blocked($"Satış iadesi {tax.Code} vergi hesabı alacak ve gelir hesaplarından farklı olmalıdır.");
                if (isWithholding)
                {
                    if (additiveTaxAccounts.Contains(mappedId)) return Blocked("Tevkifat hesabı hesaplanan vergi hesaplarından ayrı olmalıdır.");
                    withholdingTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · {tax.Name} tevkifat iade düzeltmesi", 0, tax.Amount));
                }
                else
                {
                    if (withholdingTaxAccounts.Contains(mappedId)) return Blocked("Hesaplanan vergi hesabı tevkifat hesabından ayrı olmalıdır.");
                    additiveTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · {tax.Name} iade düzeltmesi", tax.Amount, 0));
                }
            }
            if (revenueBase > 0) lines.Add((revenueId, $"{source.Code} · Satış iade düzeltmesi", revenueBase, 0));
            lines.Add((receivableId, $"{source.Code} · {source.Customer.Name}", 0, invoiceBase));
            var returnLineIds = source.Lines.Select(x => x.Id).ToArray();
            var movements = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SalesReturnLineId.HasValue
                    && returnLineIds.Contains(x.SalesReturnLineId.Value) && x.ReversalOfId == null)
                .Select(x => new { x.Quantity, x.UnitCostBase }).ToListAsync();
            if (movements.Count != returnLineIds.Length || movements.Any(x => x.UnitCostBase is null))
                return Blocked("Satış iadesinin stok maliyet hareketleri eksik veya maliyetsiz; deftere aktarılmadı.");
            var stockCostBase = movements.Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
            if (stockCostBase > 9999999999999999.99m) return Blocked("Satış iadesi stok maliyeti yevmiye tutar sınırını aşıyor.");
            if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
                || !map.TryGetValue(LedgerMappingKeys.SalesCost, out var cogsId)
                || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(cogsId))
                return Blocked("Satış iadesinin stok ve maliyet karşı hesabı eşleştirilmemiş.");
            if (inventoryId == cogsId) return Blocked("İade stok ve maliyet karşı hesapları farklı olmalıdır.");
            if (stockCostBase > 0)
            {
                lines.Add((inventoryId, $"{source.Code} · İade stok maliyeti", stockCostBase, 0));
                lines.Add((cogsId, $"{source.Code} · Satılan mal maliyeti düzeltmesi", 0, stockCostBase));
            }
        }
        else if (sourceType == "SupplierReturn")
        {
            var source = await db.SupplierReturns.Include(x => x.PurchaseInvoice).Include(x => x.Supplier).Include(x => x.Lines).ThenInclude(x => x.PurchaseInvoiceLine)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != SupplierReturnStatus.Posted) return Blocked("İptal edilmiş tedarikçi iadesi deftere aktarılamaz.");
            var netCost = source.Subtotal - source.DiscountTotal;
            IReadOnlyList<AccountingTaxBreakdownLine> taxRows;
            try
            {
                var invoiceLineIds = source.Lines.Select(x => x.PurchaseInvoiceLineId).Distinct().ToArray();
                var priorQuantities = await db.SupplierReturnLines.AsNoTracking().Where(x => x.TenantId == tenantId && invoiceLineIds.Contains(x.PurchaseInvoiceLineId)
                        && x.SupplierReturn.Status == SupplierReturnStatus.Posted && x.SupplierReturn.CreatedAt < source.CreatedAt)
                    .GroupBy(x => x.PurchaseInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity) })
                    .ToDictionaryAsync(x => x.Id, x => x.Quantity);
                taxRows = source.Lines.SelectMany(line => AccountingRuleTaxCalculator.CalculateIncrementalReturnBreakdown(
                    line.PurchaseInvoiceLine.TaxBreakdownJson, line.PurchaseInvoiceLine.Quantity,
                    priorQuantities.GetValueOrDefault(line.PurchaseInvoiceLineId), line.Quantity, line.TaxAmount,
                    line.LineSubtotal - line.DiscountAmount + line.TaxAmount - line.LineTotal)).ToArray();
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or ArgumentOutOfRangeException or OverflowException)
            { return Blocked("Tedarikçi iadesinin kaynak fatura vergi kırılımı geçersiz."); }
            var withholdingAmount = taxRows.Where(x => x.Treatment == "Withholding").Sum(x => x.Amount);
            if (taxRows.Where(x => x.Treatment != "Withholding").Sum(x => x.Amount) != source.TaxTotal
                || source.GrandTotal <= 0 || netCost < 0 || source.TaxTotal < 0 || withholdingAmount < 0
                || netCost + source.TaxTotal - withholdingAmount != source.GrandTotal)
                return Blocked("Tedarikçi iadesi toplamları deftere aktarım için tutarlı değil.");
            var currencyCode = source.PurchaseInvoice.CurrencyCode;
            var baseCurrency = baseCurrencyCode;
            var exchangeRate = currencyCode == baseCurrency ? 1m
                : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= source.ReturnDate)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
            if (exchangeRate <= 0) return Blocked($"{source.ReturnDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; tedarikçi iadesi aktarılmadı.");
            decimal invoiceBase, taxBase, withholdingBase;
            try
            {
                invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
                var translatedTaxRows = taxRows.Select(row => (Row: row, AmountBase: decimal.Round(row.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero))).ToArray();
                taxBase = translatedTaxRows.Where(x => x.Row.Treatment != "Withholding").Sum(x => x.AmountBase);
                withholdingBase = translatedTaxRows.Where(x => x.Row.Treatment == "Withholding").Sum(x => x.AmountBase);
                taxRows = translatedTaxRows.Select(x => x.Row with { Amount = x.AmountBase }).ToArray();
            }
            catch (OverflowException) { return Blocked("Tedarikçi iadesi baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor."); }
            var costBase = invoiceBase - taxBase + withholdingBase;
            if (invoiceBase <= 0 || costBase < 0 || invoiceBase > 9999999999999999.99m || taxBase > 9999999999999999.99m || withholdingBase > 9999999999999999.99m)
                return Blocked("Tedarikçi iadesi baz para birimi tutarları yevmiye sınırları dışında.");
            if (!map.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payableId)
                || !map.TryGetValue(LedgerMappingKeys.PurchaseCost, out var costId)
                || !activeAccounts.ContainsKey(payableId) || !activeAccounts.ContainsKey(costId))
                return Blocked("Tedarikçi iadesinin borç ve maliyet hesap eşleştirmeleri tamamlanmamış.");
            if (payableId == costId) return Blocked("Tedarikçi iadesi borç ve maliyet hesapları farklı olmalıdır.");
            entryDate = source.ReturnDate; sourceCode = source.Code;
            description = currencyCode == baseCurrency ? $"Tedarikçi iadesi · {source.Code}" : $"Tedarikçi iadesi · {source.Code} · {currencyCode}/{baseCurrency} {exchangeRate}";
            lines.Add((payableId, $"{source.Code} · {source.Supplier.Name}", invoiceBase, 0));
            if (costBase > 0) lines.Add((costId, $"{source.Code} · Alış iade düzeltmesi", 0, costBase));
            var additiveTaxAccounts = new HashSet<Guid>();
            var withholdingTaxAccounts = new HashSet<Guid>();
            foreach (var tax in taxRows.Where(x => x.Amount > 0))
            {
                var isWithholding = tax.Treatment == "Withholding";
                var mappingKey = !string.IsNullOrWhiteSpace(source.PurchaseInvoice.AccountingProfileCode)
                    ? AccountingRuleProfileEndpoints.TaxRuleMappingKey(source.PurchaseInvoice.AccountingProfileCode, "Purchase", tax.Code) : "";
                var fallbackKey = isWithholding ? LedgerMappingKeys.PurchaseWithholdingPayable : LedgerMappingKeys.PurchaseTaxRecoverable;
                Guid mappedId = default;
                var hasAccount = mappingKey.Length > 0 && map.TryGetValue(mappingKey, out mappedId);
                if (!hasAccount && (mappingKey.Length == 0 || tax.Code is "VAT" or "KDV")) hasAccount = map.TryGetValue(fallbackKey, out mappedId);
                if (!hasAccount || !activeAccounts.ContainsKey(mappedId))
                    return Blocked($"Tedarikçi iadesi {tax.Code} vergisi için mevzuat profiline ait muhasebe hesabı eşleştirilmemiş.");
                if (mappedId == payableId || mappedId == costId)
                    return Blocked($"Tedarikçi iadesi {tax.Code} vergi hesabı borç ve maliyet hesaplarından farklı olmalıdır.");
                if (isWithholding)
                {
                    if (additiveTaxAccounts.Contains(mappedId)) return Blocked("Tevkifat hesabı vergi indirimi hesaplarından ayrı olmalıdır.");
                    withholdingTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · {tax.Name} tevkifat iade düzeltmesi", tax.Amount, 0));
                }
                else
                {
                    if (withholdingTaxAccounts.Contains(mappedId)) return Blocked("Vergi indirimi hesabı tevkifat hesabından ayrı olmalıdır.");
                    additiveTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · {tax.Name} iade düzeltmesi", 0, tax.Amount));
                }
            }
            var returnLineIds = source.Lines.Select(x => x.Id).ToArray();
            var movements = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SupplierReturnLineId.HasValue
                    && returnLineIds.Contains(x.SupplierReturnLineId.Value) && x.ReversalOfId == null)
                .Select(x => new { x.Quantity, x.UnitCostBase }).ToListAsync();
            if (movements.Count != returnLineIds.Length || movements.Any(x => x.UnitCostBase is null))
                return Blocked("Tedarikçi iadesinin stok maliyet hareketleri eksik veya maliyetsiz; deftere aktarılmadı.");
            var stockCostBase = movements.Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
            if (stockCostBase > 9999999999999999.99m) return Blocked("Tedarikçi iadesi stok maliyeti yevmiye tutar sınırını aşıyor.");
            if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
                || !map.TryGetValue(LedgerMappingKeys.PurchaseCost, out var cogsId)
                || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(cogsId))
                return Blocked("Tedarikçi iadesinin stok ve maliyet karşı hesabı eşleştirilmemiş.");
            if (inventoryId == cogsId) return Blocked("İade stok ve maliyet karşı hesapları farklı olmalıdır.");
            if (stockCostBase > 0)
            {
                lines.Add((cogsId, $"{source.Code} · Tedarikçi iade stok maliyeti", stockCostBase, 0));
                lines.Add((inventoryId, $"{source.Code} · Stok azalışı", 0, stockCostBase));
            }
        }
        else if (sourceType == "CustomerCollection")
        {
            var source = await db.CustomerCollections.Include(x => x.Customer).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != CustomerCollectionStatus.Posted)
                return Blocked("İptal edilmiş tahsilat deftere aktarılamaz.");
            var baseCurrency = baseCurrencyCode;
            var exchangeRate = source.CurrencyCode == baseCurrency ? 1m
                : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == source.CurrencyCode && x.RateDate <= source.CollectionDate)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
            if (exchangeRate <= 0) return Blocked($"{source.CollectionDate:yyyy-MM-dd} tarihli {source.CurrencyCode} kuru bulunamadı; tahsilat deftere aktarılmadı.");
            decimal amountBase;
            try { amountBase = decimal.Round(source.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero); }
            catch (OverflowException) { return Blocked("Tahsilat baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor."); }
            if (amountBase <= 0 || amountBase > 9999999999999999.99m) return Blocked("Tahsilat baz para birimi tutarı yevmiye sınırları dışında.");
            var cashKey = source.FinancialAccountId is { } financialAccountId
                ? LedgerMappingKeys.FinancialAccountPrefix + financialAccountId
                : source.PaymentMethod == "Card" ? LedgerMappingKeys.CustomerCardClearing : LedgerMappingKeys.CustomerCheckClearing;
            if (!map.TryGetValue(cashKey, out var cashId) || !map.TryGetValue(LedgerMappingKeys.SalesReceivable, out var receivableId)
                || !activeAccounts.ContainsKey(cashId) || !activeAccounts.ContainsKey(receivableId))
                return Blocked("Tahsilatın kasa/banka ve müşteri alacak hesap eşleştirmeleri tamamlanmamış.");
            if (cashId == receivableId) return Blocked("Tahsilat karşı hesabı ve müşteri alacak hesabı farklı olmalıdır.");
            entryDate = source.CollectionDate; sourceCode = source.Code;
            description = source.CurrencyCode == baseCurrency ? $"Müşteri tahsilatı · {source.Code}" : $"Müşteri tahsilatı · {source.Code} · {source.CurrencyCode}/{baseCurrency} {exchangeRate}";
            lines.Add((cashId, $"{source.Code} · {source.Customer.Name}", amountBase, 0));
            lines.Add((receivableId, $"{source.Code} · {source.Customer.Name}", 0, amountBase));
        }
        else if (sourceType == "SupplierPayment")
        {
            var source = await db.SupplierPayments.Include(x => x.Supplier).Include(x => x.PurchaseInvoice)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != SupplierPaymentStatus.Posted)
                return Blocked("İptal edilmiş ödeme deftere aktarılamaz.");
            var currencyCode = source.PurchaseInvoice.CurrencyCode;
            var baseCurrency = baseCurrencyCode;
            var exchangeRate = currencyCode == baseCurrency ? 1m
                : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= source.PaymentDate)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
            if (exchangeRate <= 0) return Blocked($"{source.PaymentDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; ödeme deftere aktarılmadı.");
            decimal amountBase;
            try { amountBase = decimal.Round(source.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero); }
            catch (OverflowException) { return Blocked("Tedarikçi ödemesi baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor."); }
            if (amountBase <= 0 || amountBase > 9999999999999999.99m) return Blocked("Tedarikçi ödemesi baz para birimi tutarı yevmiye sınırları dışında.");
            var cashKey = source.FinancialAccountId is { } financialAccountId
                ? LedgerMappingKeys.FinancialAccountPrefix + financialAccountId
                : source.PaymentMethod == "Card" ? LedgerMappingKeys.SupplierCardClearing : LedgerMappingKeys.SupplierCheckClearing;
            if (!map.TryGetValue(cashKey, out var cashId) || !map.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payableId)
                || !activeAccounts.ContainsKey(cashId) || !activeAccounts.ContainsKey(payableId))
                return Blocked("Ödemenin kasa/banka ve tedarikçi borç hesap eşleştirmeleri tamamlanmamış.");
            if (cashId == payableId) return Blocked("Ödeme karşı hesabı ve tedarikçi borç hesabı farklı olmalıdır.");
            entryDate = source.PaymentDate; sourceCode = source.Code;
            description = currencyCode == baseCurrency ? $"Tedarikçi ödemesi · {source.Code}" : $"Tedarikçi ödemesi · {source.Code} · {currencyCode}/{baseCurrency} {exchangeRate}";
            lines.Add((payableId, $"{source.Code} · {source.Supplier.Name}", amountBase, 0));
            lines.Add((cashId, $"{source.Code} · {source.Supplier.Name}", 0, amountBase));
        }
        else if (sourceType == "PurchaseReceipt")
        {
            var source = await db.PurchaseReceipts.Include(x => x.PurchaseOrder).ThenInclude(x => x.Supplier)
                .Include(x => x.Lines).ThenInclude(x => x.InventoryTransactions)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != PurchaseReceiptStatus.Posted) return Blocked("İptal edilmiş mal kabul deftere aktarılamaz.");
            var invoiceIds = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseReceiptId == source.Id)
                .Select(x => x.Id).ToListAsync();
            if (invoiceIds.Count > 0 && await db.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "PurchaseInvoice" && invoiceIds.Contains(x.SourceId)))
                return Blocked("Alış faturası zaten deftere aktarılmış. Önce faturayı ters kayıtla kapatıp yeniden aktarın.");
            var stockCostBase = source.Lines.SelectMany(x => x.InventoryTransactions).Where(x => x.UnitCostBase.HasValue)
                .Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
            if (source.Lines.Count == 0 || source.Lines.SelectMany(x => x.InventoryTransactions).Any(x => !x.UnitCostBase.HasValue) || stockCostBase <= 0)
                return Blocked("Mal kabul stok maliyetleri eksik veya sıfır; deftere aktarılmadı.");
            if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
                || !map.TryGetValue(LedgerMappingKeys.PurchaseReceiptAccrual, out var accrualId)
                || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(accrualId))
                return Blocked("Mal kabul stok ve faturası gelmemiş mal hesap eşleştirmeleri tamamlanmamış.");
            if (inventoryId == accrualId) return Blocked("Stok ve faturası gelmemiş mal hesapları farklı olmalıdır.");
            entryDate = source.ReceiptDate; sourceCode = source.Code;
            description = $"Mal kabul · {source.Code} · {source.PurchaseOrder.Supplier.Name}";
            lines.Add((inventoryId, $"{source.Code} · Stok girişi", stockCostBase, 0));
            lines.Add((accrualId, $"{source.Code} · Faturası gelmemiş mal", 0, stockCostBase));
        }
        else if (sourceType == "PurchaseInvoice")
        {
            var source = await db.PurchaseInvoices.Include(x => x.Lines).Include(x => x.Supplier).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != PurchaseInvoiceStatus.Posted) return Blocked("İptal edilmiş alış faturası deftere aktarılamaz.");
            var netCost = source.Subtotal - source.DiscountTotal;
            IReadOnlyList<AccountingTaxBreakdownLine> taxRows;
            try { taxRows = AccountingRuleTaxCalculator.ReadBreakdown(source.TaxBreakdownJson); }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or OverflowException)
            { return Blocked("Alış faturası vergi anlık görüntüsü geçersiz."); }
            var withholdingAmount = taxRows.Where(x => x.Treatment == "Withholding").Sum(x => x.Amount);
            if (taxRows.Count > 0 && taxRows.Where(x => x.Treatment != "Withholding").Sum(x => x.Amount) != source.TaxTotal)
                return Blocked("Alış faturası vergi dökümü ile vergi toplamı uyuşmuyor.");
            if (source.GrandTotal <= 0 || netCost < 0 || source.TaxTotal < 0 || withholdingAmount < 0 || netCost + source.TaxTotal - withholdingAmount != source.GrandTotal)
                return Blocked("Alış faturası toplamları deftere aktarım için tutarlı değil.");
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
            var exchangeRate = source.CurrencyCode == baseCurrency ? 1m
                : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == source.CurrencyCode && x.RateDate <= source.InvoiceDate)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
            if (exchangeRate <= 0) return Blocked($"{source.InvoiceDate:yyyy-MM-dd} tarihli {source.CurrencyCode} kuru bulunamadı; alış faturası deftere aktarılmadı.");
            decimal invoiceBase, taxBase, withholdingBase;
            try
            {
                invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
                var postingTaxRows = taxRows.Count > 0 ? taxRows : source.TaxTotal > 0
                    ? [new AccountingTaxBreakdownLine("VAT", "KDV / VAT", 0, "Additive", "Net", source.TaxTotal, source.TaxTotal)]
                    : Array.Empty<AccountingTaxBreakdownLine>();
                var translatedTaxRows = postingTaxRows.Select(row => (Row: row, AmountBase: decimal.Round(row.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero))).ToArray();
                taxBase = translatedTaxRows.Where(x => x.Row.Treatment != "Withholding").Sum(x => x.AmountBase);
                withholdingBase = translatedTaxRows.Where(x => x.Row.Treatment == "Withholding").Sum(x => x.AmountBase);
                taxRows = translatedTaxRows.Select(x => x.Row with { Amount = x.AmountBase }).ToArray();
            }
            catch (Exception ex) when (ex is OverflowException or JsonException or InvalidOperationException) { return Blocked("Alış faturası vergi dökümü geçersiz veya baz para birimine çevrildiğinde yevmiye sınırını aşıyor."); }
            var costBase = invoiceBase - taxBase + withholdingBase;
            if (invoiceBase <= 0 || taxBase < 0 || costBase < 0 || invoiceBase > 9999999999999999.99m
                || taxBase > 9999999999999999.99m || costBase > 9999999999999999.99m || withholdingBase > 9999999999999999.99m)
                return Blocked("Alış faturası baz para birimi tutarları yevmiye sınırları dışında.");
            var receiptEntry = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "PurchaseReceipt" && x.SourceId == source.PurchaseReceiptId);
            var clearReceiptAccrual = receiptEntry is not null
                && await HasUnreversedJournalEntryAsync(db, tenantId, "PurchaseReceipt", source.PurchaseReceiptId);
            entryDate = source.InvoiceDate; sourceCode = source.Code;
            description = source.CurrencyCode == baseCurrency ? $"Alış faturası · {source.Code}" : $"Alış faturası · {source.Code} · {source.CurrencyCode}/{baseCurrency} {exchangeRate}";
            if (!map.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payableId)
                || !map.TryGetValue(LedgerMappingKeys.PurchaseCost, out var costId)
                || !activeAccounts.ContainsKey(payableId) || !activeAccounts.ContainsKey(costId))
                return Blocked("Alış faturası borç ve maliyet hesap eşleştirmeleri tamamlanmamış.");
            if (payableId == costId) return Blocked("Alış borç ve maliyet hesapları farklı hesaplara eşlenmelidir.");
            lines.Add((payableId, $"{source.Code} · {source.Supplier.Name}", 0, invoiceBase));
            if (clearReceiptAccrual)
            {
                if (!map.TryGetValue(LedgerMappingKeys.PurchaseReceiptAccrual, out var accrualId) || !activeAccounts.ContainsKey(accrualId))
                    return Blocked("Mal kabul aktarılmış; faturası gelmemiş mal hesabı eşleştirmesi tamamlanmamış.");
                if (accrualId == payableId || accrualId == costId)
                    return Blocked("Faturası gelmemiş mal, borç ve maliyet hesapları birbirinden farklı olmalıdır.");
                var accruedBase = receiptEntry!.Lines.Where(x => x.AccountId == accrualId).Sum(x => x.Credit - x.Debit);
                if (accruedBase <= 0) return Blocked("Mal kabul yevmiyesinde kapatılabilir GRNI alacağı bulunamadı.");
                lines.Add((accrualId, $"{source.Code} · Mal kabul tahakkukunun kapatılması", accruedBase, 0));
                var variance = costBase - accruedBase;
                if (variance > 0) lines.Add((costId, $"{source.Code} · Alış maliyet farkı", variance, 0));
                else if (variance < 0) lines.Add((costId, $"{source.Code} · Alış maliyet farkı", 0, -variance));
            }
            else if (costBase > 0) lines.Add((costId, $"{source.Code} · Alış maliyeti", costBase, 0));
            var additiveTaxAccounts = new HashSet<Guid>();
            var withholdingTaxAccounts = new HashSet<Guid>();
            foreach (var tax in taxRows.Where(x => x.Amount > 0))
            {
                var isWithholding = tax.Treatment == "Withholding";
                var mappingKey = !string.IsNullOrWhiteSpace(source.AccountingProfileCode)
                    ? AccountingRuleProfileEndpoints.TaxRuleMappingKey(source.AccountingProfileCode, "Purchase", tax.Code) : "";
                var fallbackKey = isWithholding ? LedgerMappingKeys.PurchaseWithholdingPayable : LedgerMappingKeys.PurchaseTaxRecoverable;
                Guid mappedId = default;
                var hasAccount = mappingKey.Length > 0 && map.TryGetValue(mappingKey, out mappedId);
                if (!hasAccount && (mappingKey.Length == 0 || tax.Code is "VAT" or "KDV")) hasAccount = map.TryGetValue(fallbackKey, out mappedId);
                if (!hasAccount || !activeAccounts.ContainsKey(mappedId))
                    return Blocked($"Alış faturası {tax.Code} vergisi için mevzuat profiline ait muhasebe hesabı eşleştirilmemiş.");
                if (mappedId == payableId || mappedId == costId || clearReceiptAccrual && mappedId == map.GetValueOrDefault(LedgerMappingKeys.PurchaseReceiptAccrual))
                    return Blocked($"Alış faturası {tax.Code} vergi hesabı borç, maliyet ve mal kabul tahakkuk hesaplarından farklı olmalıdır.");
                if (isWithholding)
                {
                    if (additiveTaxAccounts.Contains(mappedId)) return Blocked("Tevkifat hesabı vergi indirimi hesaplarından ayrı olmalıdır.");
                    withholdingTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · {tax.Name} tevkifatı", 0, tax.Amount));
                }
                else
                {
                    if (withholdingTaxAccounts.Contains(mappedId)) return Blocked("Vergi indirimi hesabı tevkifat hesabından ayrı olmalıdır.");
                    additiveTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · İndirilecek {tax.Name}", tax.Amount, 0));
                }
            }
        }
        else if (sourceType == "SalesDelivery")
        {
            var source = await db.SalesDeliveries.Include(x => x.Order).ThenInclude(x => x!.Customer).Include(x => x.Invoice).ThenInclude(x => x!.Customer)
                .Include(x => x.Lines).ThenInclude(x => x.InventoryTransactions)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != SalesDeliveryStatus.Posted) return Blocked("İptal edilmiş irsaliye deftere aktarılamaz.");
            var movements = source.Lines.SelectMany(x => x.InventoryTransactions).Where(x => x.ReversalOfId == null).ToList();
            if (source.Lines.Count == 0 || movements.Count != source.Lines.Count || movements.Any(x => x.Direction != InventoryDirection.Issue || x.UnitCostBase is null))
                return Blocked("İrsaliye stok hareketleri eksik veya maliyet anlık görüntüsü bulunmuyor; deftere aktarılmadı.");
            var stockCostBase = movements.Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
            if (stockCostBase <= 0 || stockCostBase > 9999999999999999.99m)
                return Blocked("İrsaliye stok maliyeti yevmiye tutar sınırları dışında.");
            if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
                || !map.TryGetValue(LedgerMappingKeys.SalesCost, out var costId)
                || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(costId))
                return Blocked("İrsaliye stok ve satılan mal maliyeti hesap eşleştirmeleri tamamlanmamış.");
            if (inventoryId == costId) return Blocked("İrsaliye stok ve satılan mal maliyeti hesapları farklı olmalıdır.");
            entryDate = source.DeliveryDate; sourceCode = source.Code;
            description = $"Satış irsaliyesi · {source.Code} · {source.Invoice?.Customer.Name ?? source.Order?.Customer.Name ?? "Siparişsiz satış"}";
            lines.Add((costId, $"{source.Code} · Satılan mal maliyeti", stockCostBase, 0));
            lines.Add((inventoryId, $"{source.Code} · Stok çıkışı", 0, stockCostBase));
        }
        else if (sourceType == "SalesInvoice")
        {
            var source = await db.SalesInvoices.Include(x => x.Lines).Include(x => x.Customer).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.Status != SalesInvoiceStatus.Posted) return Blocked("İptal edilmiş satış faturası deftere aktarılamaz.");
            var netRevenue = source.Subtotal - source.DiscountTotal;
            IReadOnlyList<AccountingTaxBreakdownLine> taxRows;
            try { taxRows = AccountingRuleTaxCalculator.ReadBreakdown(source.TaxBreakdownJson); }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or OverflowException)
            { return Blocked("Satış faturası vergi anlık görüntüsü geçersiz."); }
            var withholdingAmount = taxRows.Where(x => x.Treatment == "Withholding").Sum(x => x.Amount);
            if (taxRows.Count > 0 && taxRows.Where(x => x.Treatment != "Withholding").Sum(x => x.Amount) != source.TaxTotal)
                return Blocked("Satış faturası vergi dökümü ile vergi toplamı uyuşmuyor.");
            if (source.GrandTotal <= 0 || netRevenue < 0 || source.TaxTotal < 0 || withholdingAmount < 0 || netRevenue + source.TaxTotal - withholdingAmount != source.GrandTotal)
                return Blocked("Satış faturası toplamları deftere aktarım için tutarlı değil.");
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
            var exchangeRate = source.CurrencyCode == baseCurrency ? 1m
                : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == source.CurrencyCode && x.RateDate <= source.InvoiceDate)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
            if (exchangeRate <= 0) return Blocked($"{source.InvoiceDate:yyyy-MM-dd} tarihli {source.CurrencyCode} kuru bulunamadı; satış faturası deftere aktarılmadı.");
            decimal invoiceBase, taxBase, withholdingBase;
            try
            {
                invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
                var postingTaxRows = taxRows.Count > 0 ? taxRows : source.TaxTotal > 0
                    ? [new AccountingTaxBreakdownLine("VAT", "KDV / VAT", 0, "Additive", "Net", source.TaxTotal, source.TaxTotal)]
                    : Array.Empty<AccountingTaxBreakdownLine>();
                var translatedTaxRows = postingTaxRows.Select(row => (Row: row, AmountBase: decimal.Round(row.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero))).ToArray();
                taxBase = translatedTaxRows.Where(x => x.Row.Treatment != "Withholding").Sum(x => x.AmountBase);
                withholdingBase = translatedTaxRows.Where(x => x.Row.Treatment == "Withholding").Sum(x => x.AmountBase);
                taxRows = translatedTaxRows.Select(x => x.Row with { Amount = x.AmountBase }).ToArray();
            }
            catch (Exception ex) when (ex is OverflowException or JsonException or InvalidOperationException) { return Blocked("Satış faturası vergi dökümü geçersiz veya baz para birimine çevrildiğinde yevmiye sınırını aşıyor."); }
            var revenueBase = invoiceBase - taxBase + withholdingBase;
            if (invoiceBase <= 0 || taxBase < 0 || revenueBase < 0 || invoiceBase > 9999999999999999.99m
                || taxBase > 9999999999999999.99m || revenueBase > 9999999999999999.99m || withholdingBase > 9999999999999999.99m)
                return Blocked("Satış faturası baz para birimi tutarları yevmiye sınırları dışında.");
            entryDate = source.InvoiceDate; sourceCode = source.Code;
            description = source.CurrencyCode == baseCurrency ? $"Satış faturası · {source.Code}" : $"Satış faturası · {source.Code} · {source.CurrencyCode}/{baseCurrency} {exchangeRate}";
            if (!map.TryGetValue(LedgerMappingKeys.SalesReceivable, out var receivableId)
                || !map.TryGetValue(LedgerMappingKeys.SalesRevenue, out var revenueId)
                || !activeAccounts.ContainsKey(receivableId) || !activeAccounts.ContainsKey(revenueId))
                return Blocked("Satış faturası alacak ve gelir hesap eşleştirmeleri tamamlanmamış.");
            if (receivableId == revenueId) return Blocked("Satış alacak ve gelir hesapları farklı hesaplara eşlenmelidir.");
            lines.Add((receivableId, $"{source.Code} · {source.Customer.Name}", invoiceBase, 0));
            if (revenueBase > 0) lines.Add((revenueId, $"{source.Code} · Satış geliri", 0, revenueBase));
            var additiveTaxAccounts = new HashSet<Guid>();
            var withholdingTaxAccounts = new HashSet<Guid>();
            foreach (var tax in taxRows.Where(x => x.Amount > 0))
            {
                var isWithholding = tax.Treatment == "Withholding";
                var mappingKey = !string.IsNullOrWhiteSpace(source.AccountingProfileCode)
                    ? AccountingRuleProfileEndpoints.TaxRuleMappingKey(source.AccountingProfileCode, "Sales", tax.Code) : "";
                var fallbackKey = isWithholding ? LedgerMappingKeys.SalesWithholdingReceivable : LedgerMappingKeys.SalesTaxPayable;
                Guid mappedId = default;
                var hasAccount = mappingKey.Length > 0 && map.TryGetValue(mappingKey, out mappedId);
                if (!hasAccount && (mappingKey.Length == 0 || tax.Code is "VAT" or "KDV")) hasAccount = map.TryGetValue(fallbackKey, out mappedId);
                if (!hasAccount || !activeAccounts.ContainsKey(mappedId))
                    return Blocked($"Satış faturası {tax.Code} vergisi için mevzuat profiline ait muhasebe hesabı eşleştirilmemiş.");
                if (mappedId == receivableId || mappedId == revenueId)
                    return Blocked($"Satış faturası {tax.Code} vergi hesabı alacak ve gelir hesaplarından farklı olmalıdır.");
                if (isWithholding)
                {
                    if (additiveTaxAccounts.Contains(mappedId)) return Blocked("Tevkifat hesabı hesaplanan vergi hesaplarından ayrı olmalıdır.");
                    withholdingTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · {tax.Name} tevkif edilen alacağı", tax.Amount, 0));
                }
                else
                {
                    if (withholdingTaxAccounts.Contains(mappedId)) return Blocked("Hesaplanan vergi hesabı tevkifat hesabından ayrı olmalıdır.");
                    additiveTaxAccounts.Add(mappedId);
                    lines.Add((mappedId, $"{source.Code} · Hesaplanan {tax.Name}", 0, tax.Amount));
                }
            }
        }
        else if (sourceType == "FxRevaluation")
        {
            var source = await db.FxRevaluationVouchers.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            entryDate = source.AsOfDate; sourceCode = source.Code; description = $"Kur değerleme · {source.Code}";
            foreach (var line in source.Lines.Where(x => x.AdjustmentBase != 0))
            {
                var controlKey = line.Direction == FxRevaluationDirection.Receivable ? LedgerMappingKeys.FxReceivable : LedgerMappingKeys.FxPayable;
                var debitKey = line.AdjustmentBase > 0 ? controlKey : LedgerMappingKeys.FxLoss;
                var creditKey = line.AdjustmentBase > 0 ? LedgerMappingKeys.FxGain : controlKey;
                if (!map.TryGetValue(debitKey, out var debitId) || !map.TryGetValue(creditKey, out var creditId) || !activeAccounts.ContainsKey(debitId) || !activeAccounts.ContainsKey(creditId))
                    return Blocked("Kur değerlemenin kullandığı hesap eşleştirmeleri tamamlanmamış. Genel muhasebe ayarlarını tamamlayın; kaynak fiş değişmedi.");
                if (debitId == creditId) return Blocked("Borç ve alacak tarafı aynı hesaba eşlenmiş. Eşleştirmeleri ayrı tenant hesaplarına yönlendirin.");
                var amount = Math.Abs(line.AdjustmentBase);
                lines.Add((debitId, $"{line.InvoiceCode} · {line.CounterpartyName}", amount, 0));
                lines.Add((creditId, $"{line.InvoiceCode} · {line.CounterpartyName}", 0, amount));
            }
        }
        else
        {
            var source = await db.InventoryCostAdjustments.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == sourceId);
            if (source is null) return SourceNotFound();
            if (source.PurchaseInvoiceDraftId.HasValue)
                return Blocked("Bu stok maliyet farkı tedarikçi faturası yevmiyesinde zaten muhasebeleştiriliyor; ikinci kez aktarılamaz.");
            entryDate = source.EntryDate; sourceCode = source.Code; description = $"Stok maliyet hareketi · {source.Code} · {source.Description}";
            var offsetKey = source.Kind switch { InventoryCostAdjustmentKind.LandedCost => LedgerMappingKeys.InventoryLandedCostOffset, InventoryCostAdjustmentKind.Reversal => LedgerMappingKeys.InventoryReversalOffset, _ => LedgerMappingKeys.InventoryRevaluationOffset };
            if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var stockId) || !map.TryGetValue(offsetKey, out var offsetId) || !activeAccounts.ContainsKey(stockId) || !activeAccounts.ContainsKey(offsetId))
                return Blocked("Stok hareketinin kullandığı hesap eşleştirmeleri tamamlanmamış. Genel muhasebe ayarlarını tamamlayın; kaynak hareket değişmedi.");
            if (stockId == offsetId) return Blocked("Stok ve karşı hesap aynı hesaba eşlenmiş. Eşleştirmeleri ayrı tenant hesaplarına yönlendirin.");
            var stockInfo = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && source.Lines.Select(l => l.StockItemId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);
            foreach (var line in source.Lines.Where(x => x.AmountBase != 0))
            {
                var amount = Math.Abs(line.AmountBase); var stockCode = stockInfo.GetValueOrDefault(line.StockItemId, "Stok");
                if (line.AmountBase > 0) { lines.Add((stockId, $"{source.Code} · {stockCode}", amount, 0)); lines.Add((offsetId, $"{source.Code} · {stockCode}", 0, amount)); }
                else { lines.Add((offsetId, $"{source.Code} · {stockCode}", amount, 0)); lines.Add((stockId, $"{source.Code} · {stockCode}", 0, amount)); }
            }
        }
        var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, entryDate);
        var draftLines = lines.Select((line, index) => new JournalTransferDraftLine(index + 1, line.AccountId,
            line.Description.Length > 240 ? line.Description[..240] : line.Description, line.Debit, line.Credit)).ToList();
        var entryDescription = description.Length > 240 ? description[..240] : description;
        string? blockingReason = closedPeriod is { } closed
            ? $"{closed.FromDate:yyyy-MM-dd}–{closed.ToDate:yyyy-MM-dd} dönemi kapalı; kaynak fiş bu tarihe aktarılamaz."
            : lines.Count < 2 || lines.Sum(x => x.Debit) <= 0 || lines.Sum(x => x.Debit) != lines.Sum(x => x.Credit)
                ? "Kaynak fişte aktarılabilir dengeli bir tutar bulunamadı."
                : null;
        return new JournalTransferDraft(false, blockingReason, entryDate, sourceCode, entryDescription, draftLines);
    }
}
