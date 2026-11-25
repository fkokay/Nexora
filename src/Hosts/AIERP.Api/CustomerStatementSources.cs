using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// The source document of customer statement lines (cari.ekstre "Belgeye git"). One query per document kind for the whole
/// statement; a reversal takes its original movement's document, since a cancellation's reversal keeps no source key.
/// </summary>
internal static class CustomerStatementSources
{
    internal sealed record Keys(Guid? SalesInvoiceId, Guid? CustomerCollectionId, Guid? SalesReturnId, Guid? PurchaseInvoiceId,
        Guid? PurchaseInvoiceDraftId, Guid? SupplierPaymentId, Guid? SupplierReturnId)
    {
        public bool IsEmpty => SalesInvoiceId is null && CustomerCollectionId is null && SalesReturnId is null && PurchaseInvoiceId is null
            && PurchaseInvoiceDraftId is null && SupplierPaymentId is null && SupplierReturnId is null;
    }

    internal sealed record Source(string Type, Guid Id, string? Code, Guid? OpenId);

    /// <summary>The source of each entry id; entries without a document are absent.</summary>
    public static async Task<Dictionary<Guid, Source>> ResolveAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<(Guid Id, Guid? ReversalOfId, Keys Keys)> entries)
    {
        var keys = entries.ToDictionary(x => x.Id, x => x.Keys);
        var originalIds = entries.Where(x => x.Keys.IsEmpty && x.ReversalOfId is not null).Select(x => x.ReversalOfId!.Value).Distinct().ToList();
        if (originalIds.Count > 0)
        {
            var originals = await db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId && originalIds.Contains(x.Id))
                .Select(x => new { x.Id, Keys = new Keys(x.SalesInvoiceId, x.CustomerCollectionId, x.SalesReturnId, x.PurchaseInvoiceId,
                    x.PurchaseInvoiceDraftId, x.SupplierPaymentId, x.SupplierReturnId) })
                .ToDictionaryAsync(x => x.Id, x => x.Keys);
            foreach (var entry in entries.Where(x => x.Keys.IsEmpty && x.ReversalOfId is not null))
                if (originals.TryGetValue(entry.ReversalOfId!.Value, out var original)) keys[entry.Id] = original;
        }

        List<Guid> Ids(Func<Keys, Guid?> key) => keys.Values.Select(key).OfType<Guid>().Distinct().ToList();
        var salesInvoiceIds = Ids(x => x.SalesInvoiceId);
        var collectionIds = Ids(x => x.CustomerCollectionId);
        var salesReturnIds = Ids(x => x.SalesReturnId);
        var purchaseInvoiceIds = Ids(x => x.PurchaseInvoiceId);
        var draftIds = Ids(x => x.PurchaseInvoiceDraftId);
        var paymentIds = Ids(x => x.SupplierPaymentId);
        var supplierReturnIds = Ids(x => x.SupplierReturnId);

        var salesInvoices = salesInvoiceIds.Count == 0 ? [] : await db.SalesInvoices.AsNoTracking()
            .Where(x => x.TenantId == tenantId && salesInvoiceIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);
        var collections = collectionIds.Count == 0 ? [] : await db.CustomerCollections.AsNoTracking()
            .Where(x => x.TenantId == tenantId && collectionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);
        // A collection is recorded against one invoice; with several allocations the first one opens.
        var collectionInvoices = collectionIds.Count == 0 ? [] : (await db.CustomerCollectionAllocations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && collectionIds.Contains(x.CustomerCollectionId))
                .Select(x => new { x.CustomerCollectionId, x.SalesInvoiceId, x.Id }).ToListAsync())
            .GroupBy(x => x.CustomerCollectionId).ToDictionary(x => x.Key, x => x.OrderBy(y => y.Id).First().SalesInvoiceId);
        var salesReturns = salesReturnIds.Count == 0 ? [] : await db.SalesReturns.AsNoTracking()
            .Where(x => x.TenantId == tenantId && salesReturnIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);
        var purchaseInvoices = purchaseInvoiceIds.Count == 0 ? [] : await db.PurchaseInvoices.AsNoTracking()
            .Where(x => x.TenantId == tenantId && purchaseInvoiceIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);
        var drafts = draftIds.Count == 0 ? [] : await db.PurchaseInvoiceDrafts.AsNoTracking()
            .Where(x => x.TenantId == tenantId && draftIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.InvoiceNumber);
        var payments = paymentIds.Count == 0 ? [] : await db.SupplierPayments.AsNoTracking()
            .Where(x => x.TenantId == tenantId && paymentIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => new { x.Code, x.PurchaseInvoiceId });
        var supplierReturns = supplierReturnIds.Count == 0 ? [] : await db.SupplierReturns.AsNoTracking()
            .Where(x => x.TenantId == tenantId && supplierReturnIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);

        static string? Code<T>(Dictionary<Guid, T> map, Guid id, Func<T, string?> code) => map.TryGetValue(id, out var value) ? code(value) : null;
        var result = new Dictionary<Guid, Source>();
        foreach (var (entryId, k) in keys)
        {
            Source? source =
                k.SalesInvoiceId is { } si ? new("SalesInvoice", si, Code(salesInvoices, si, x => x), salesInvoices.ContainsKey(si) ? si : null)
                : k.CustomerCollectionId is { } cc ? new("CustomerCollection", cc, Code(collections, cc, x => x),
                    collectionInvoices.TryGetValue(cc, out var invoice) ? invoice : null)
                : k.SalesReturnId is { } sr ? new("SalesReturn", sr, Code(salesReturns, sr, x => x), salesReturns.ContainsKey(sr) ? sr : null)
                : k.PurchaseInvoiceId is { } pi ? new("PurchaseInvoice", pi, Code(purchaseInvoices, pi, x => x), purchaseInvoices.ContainsKey(pi) ? pi : null)
                : k.PurchaseInvoiceDraftId is { } pd ? new("PurchaseInvoiceDraft", pd, Code(drafts, pd, x => x), drafts.ContainsKey(pd) ? pd : null)
                : k.SupplierPaymentId is { } sp ? new("SupplierPayment", sp, Code(payments, sp, x => x.Code),
                    payments.TryGetValue(sp, out var payment) ? payment.PurchaseInvoiceId : null)
                : k.SupplierReturnId is { } su ? new("SupplierReturn", su, Code(supplierReturns, su, x => x), supplierReturns.ContainsKey(su) ? su : null)
                : null;
            if (source is not null) result[entryId] = source;
        }
        return result;
    }
}
