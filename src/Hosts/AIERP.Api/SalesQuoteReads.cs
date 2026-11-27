using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>The sales quote detail read shared by <c>GET /api/sales/quotes/{id}</c> and the quote's document view.</summary>
internal static class SalesQuoteReads
{
    internal static async Task<SalesQuoteView?> ViewAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct)
    {
        var quote = await db.SalesQuotes.AsNoTracking().Include(x => x.Customer).Include(x => x.Lines).Include(x => x.Order).Include(x => x.SourceSalesRequest)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (quote is null) return null;
        var lines = quote.Lines.OrderBy(x => x.LineNumber).Select(x => new SalesQuoteLineView(x.LineNumber, x.StockItemId,
            x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
            x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.EnteredCurrencyCode, x.EnteredUnitPrice,
            x.EnteredUnitCode, x.ExchangeRateToQuoteCurrency, x.IsVatIncluded, x.SourceSalesRequestLineNumber)).ToList();
        var customFields = await (from definition in db.SalesQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
            join value in db.SalesQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
            from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
        return new SalesQuoteView(quote.Id, quote.Code, quote.CustomerId, quote.Customer?.Name ?? quote.ProspectCustomerName ?? "Teklif alıcısı", quote.QuoteDate,
            quote.ValidUntil, quote.CurrencyCode, quote.Status, quote.Notes, quote.Subtotal, quote.DiscountTotal,
            quote.TaxTotal, quote.GrandTotal, quote.CreatedAt, lines, quote.Order is not null, customFields,
            quote.RevisionGroupId, quote.RevisionNumber, quote.DeliveryTerms, quote.SalespersonEmployeeId, quote.Customer?.Code,
            quote.SourceSalesRequestId, quote.SourceSalesRequest?.Code)
        {
            // Same display values as the list row (system page detail; the legacy screen takes them from the row).
            SalespersonName = quote.SalespersonEmployeeId is { } salespersonId
                ? await db.EmployeeRecords.AsNoTracking().Where(employee => employee.TenantId == tenantId && employee.Id == salespersonId)
                    .Select(employee => employee.PersonnelCode + " · " + employee.FullName).FirstOrDefaultAsync()
                : null,
            SalesOrderId = quote.Order?.Id,
            SalesOrderCode = quote.Order?.Code,
            ProspectCustomerName = quote.CustomerId is null ? quote.ProspectCustomerName : null
        };
    }
}
