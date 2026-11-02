using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public sealed record SettlementJournalPostingResult(JournalEntry? Entry, string? Error)
{
    public bool Succeeded => Entry is not null;
}

/// <summary>
/// Creates the general-ledger entry for an already validated customer collection or supplier payment.
/// The caller owns the settlement transaction and locks the tenant row before invoking this helper,
/// which serializes the closed-period check against fiscal-year close.
/// </summary>
public static class InvoiceSettlementJournalPosting
{
    public static async Task<SettlementJournalPostingResult> CreateAsync(
        TenantDbContext db,
        Guid tenantId,
        string sourceType,
        Guid sourceId,
        string sourceCode,
        string counterpartyName,
        DateOnly entryDate,
        string currencyCode,
        decimal amount,
        string paymentMethod,
        Guid? financialAccountId,
        Guid? userId,
        CancellationToken cancellationToken = default)
    {
        if (sourceType is not ("CustomerCollection" or "SupplierPayment"))
            throw new ArgumentOutOfRangeException(nameof(sourceType));

        var existing = await db.JournalEntries.Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == sourceId, cancellationToken);
        if (existing is not null) return new(existing, null);

        var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, entryDate, cancellationToken);
        if (closedPeriod is { } closed)
            return new(null, $"{closed.FromDate:yyyy-MM-dd}–{closed.ToDate:yyyy-MM-dd} dönemi kapalı; hareket deftere kaydedilemez.");

        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, cancellationToken);
        if (tenant is null) return new(null, "Firma bulunamadı.");

        var exchangeRate = currencyCode == tenant.BaseCurrencyCode ? 1m
            : await db.TenantExchangeRates.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= entryDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
                .Select(x => (decimal?)x.Rate).FirstOrDefaultAsync(cancellationToken) ?? 0m;
        if (exchangeRate <= 0)
            return new(null, $"{entryDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; hareket yevmiyeye aktarılamadı.");

        decimal amountBase;
        try { amountBase = decimal.Round(amount * exchangeRate, 2, MidpointRounding.AwayFromZero); }
        catch (OverflowException) { return new(null, "Hareket baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor."); }
        if (amountBase <= 0 || amountBase > 9999999999999999.99m)
            return new(null, "Hareket baz para birimi tutarı yevmiye sınırları dışında.");

        var settlementKey = financialAccountId is { } accountId
            ? LedgerMappingKeys.FinancialAccountPrefix + accountId.ToString("D")
            : sourceType == "CustomerCollection"
                ? paymentMethod == "Card" ? LedgerMappingKeys.CustomerCardClearing : LedgerMappingKeys.CustomerCheckClearing
                : paymentMethod == "Card" ? LedgerMappingKeys.SupplierCardClearing : LedgerMappingKeys.SupplierCheckClearing;
        var controlKey = sourceType == "CustomerCollection" ? LedgerMappingKeys.SalesReceivable : LedgerMappingKeys.PurchasePayable;
        var mappings = await db.LedgerAccountMappings.AsNoTracking()
            .Where(x => x.TenantId == tenantId && (x.MappingKey == settlementKey || x.MappingKey == controlKey))
            .Join(db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive),
                mapping => new { mapping.TenantId, Id = mapping.AccountId },
                account => new { account.TenantId, account.Id },
                (mapping, account) => new { mapping.MappingKey, AccountId = account.Id })
            .ToDictionaryAsync(x => x.MappingKey, x => x.AccountId, cancellationToken);
        if (!mappings.TryGetValue(settlementKey, out var settlementAccountId)
            || !mappings.TryGetValue(controlKey, out var controlAccountId))
            return new(null, sourceType == "CustomerCollection"
                ? "Tahsilatın kasa/banka ve müşteri alacak hesap eşleştirmeleri etkin hesaplara yapılmamış."
                : "Ödemenin kasa/banka ve tedarikçi borç hesap eşleştirmeleri etkin hesaplara yapılmamış.");
        if (settlementAccountId == controlAccountId)
            return new(null, sourceType == "CustomerCollection"
                ? "Tahsilat karşı hesabı ve müşteri alacak hesabı farklı olmalıdır."
                : "Ödeme karşı hesabı ve tedarikçi borç hesabı farklı olmalıdır.");

        var isCollection = sourceType == "CustomerCollection";
        var entry = new JournalEntry
        {
            TenantId = tenantId,
            Code = $"YV-{Guid.NewGuid():N}",
            EntryDate = entryDate,
            Description = (isCollection ? "Müşteri tahsilatı" : "Tedarikçi ödemesi") + $" · {sourceCode}"
                + (currencyCode == tenant.BaseCurrencyCode ? "" : $" · {currencyCode}/{tenant.BaseCurrencyCode} {exchangeRate}"),
            SourceType = sourceType,
            SourceId = sourceId,
            CreatedByUserId = userId
        };
        var debitAccountId = isCollection ? settlementAccountId : controlAccountId;
        var creditAccountId = isCollection ? controlAccountId : settlementAccountId;
        entry.Lines.Add(new JournalEntryLine
        {
            TenantId = tenantId, JournalEntryId = entry.Id, AccountId = debitAccountId, LineNumber = 1,
            Description = $"{sourceCode} · {counterpartyName}", Debit = amountBase, Credit = 0m
        });
        entry.Lines.Add(new JournalEntryLine
        {
            TenantId = tenantId, JournalEntryId = entry.Id, AccountId = creditAccountId, LineNumber = 2,
            Description = $"{sourceCode} · {counterpartyName}", Debit = 0m, Credit = amountBase
        });
        db.JournalEntries.Add(entry);
        return new(entry, null);
    }
}
