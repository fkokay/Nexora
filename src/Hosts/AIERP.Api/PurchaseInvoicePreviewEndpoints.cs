using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Amounts of the purchase invoice a goods receipt would produce. The receipt invoice endpoint
/// (<c>POST /api/purchasing/receipts/{id}/invoice</c>) and its preview both use this calculation, so the preview shows exactly
/// what saving posts: each line is charged incrementally over the order line's earlier posted invoices, and tax follows the
/// resolved accounting profile.
/// </summary>
internal static class PurchaseInvoiceCalculation
{
    internal sealed record Line(PurchaseReceiptLine Source, SalesQuoteLineAmounts Amounts, string TaxBreakdownJson);

    /// <summary>Quantities and amounts already invoiced (posted invoices) per order line of the order.</summary>
    internal static Task<Dictionary<int, (decimal Quantity, SalesQuoteLineAmounts Amounts)>> LoadInvoicedAsync(TenantDbContext db, Guid tenantId,
        Guid orderId, CancellationToken ct = default) =>
        db.PurchaseInvoiceLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.PurchaseReceiptLine.PurchaseOrderId == orderId && x.PurchaseInvoice.Status == PurchaseInvoiceStatus.Posted)
            .GroupBy(x => x.OrderLineNumber)
            .Select(g => new { Number = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) })
            .ToDictionaryAsync(x => x.Number, x => (Quantity: x.Quantity, Amounts: new SalesQuoteLineAmounts(x.Subtotal, x.Discount, x.Tax, x.Total)), ct);

    /// <summary>The invoice lines of the receipt lines (with their order lines loaded), in the given order.</summary>
    internal static IReadOnlyList<Line> CalculateLines(IEnumerable<PurchaseReceiptLine> receiptLines,
        IReadOnlyDictionary<int, (decimal Quantity, SalesQuoteLineAmounts Amounts)> invoiced, AccountingRuleProfile? taxProfile, DateOnly invoiceDate)
    {
        var lines = new List<Line>();
        foreach (var source in receiptLines)
        {
            var previous = invoiced.GetValueOrDefault(source.OrderLineNumber);
            var orderLine = source.OrderLine;
            var amounts = PurchaseInvoiceWorkflow.CalculateIncrementalAmounts(orderLine.StockItemId, orderLine.UnitPrice,
                orderLine.DiscountPercent, orderLine.VatPercent, previous.Quantity, previous.Amounts ?? new SalesQuoteLineAmounts(0, 0, 0, 0), source.Quantity);
            var assessment = AccountingRuleTaxCalculator.Calculate(taxProfile, amounts.LineSubtotal - amounts.DiscountAmount, orderLine.VatPercent, invoiceDate, "Purchase");
            lines.Add(new Line(source, amounts with { TaxAmount = assessment.TaxTotal, LineTotal = assessment.GrandTotal }, assessment.TaxBreakdownJson));
        }
        return lines;
    }
}

/// <summary>Invoice preview of a goods receipt (taslak 21, decision 6): the receipt invoice computation without any write.</summary>
internal static class PurchaseInvoicePreviewEndpoints
{
    internal static void MapPurchaseInvoicePreviewEndpoints(this WebApplication app)
    {
        // Permission: the same as saving the invoice, erp.purchase-receipts.create (PlatformPermissionCatalog maps this GET).
        app.MapGroup("/api/purchasing/receipts").WithTags("Mal Kabuller").RequireAuthorization()
            .MapGet("/{id:guid}/invoice-preview", async (Guid id, DateOnly? invoiceDate, string? accountingProfileCode, ClaimsPrincipal principal,
                TenantDbContext db, CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                var date = invoiceDate ?? PurchasingDisplay.Today;
                // The save request's own validation and normalization; the invoice number is not part of a preview.
                var candidate = new PurchaseInvoiceCreateRequest("ONIZLEME", date, AccountingProfileCode: accountingProfileCode);
                if (PurchaseInvoiceValidation.Validate(candidate) is { } errors) return Results.ValidationProblem(errors);
                var profileCode = PurchaseInvoiceValidation.Normalize(candidate).AccountingProfileCode;

                // The same checks, in the same order and with the same messages as the save; plain reads, no locks.
                var receipt = await db.PurchaseReceipts.AsNoTracking().Include(x => x.PurchaseOrder)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
                if (receipt is null) return Results.NotFound();
                var order = receipt.PurchaseOrder;
                if (receipt.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş mal kabul için alış faturası oluşturulamaz." });
                var activeInvoiceId = await db.PurchaseInvoices.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.PurchaseReceiptId == id && x.Status == PurchaseInvoiceStatus.Posted)
                    .Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
                if (activeInvoiceId is not null)
                    return Results.Conflict(new { error = "Bu mal kabul için aktif alış faturası zaten var.", invoiceId = activeInvoiceId });
                var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, date, ct);
                if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closedPeriod, "alış faturası") is { } closedConflict) return closedConflict;
                var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == order.SupplierId, ct);
                if (supplier is null || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
                    return Results.Conflict(new { error = "Sipariş tedarikçi hesabı kullanılamıyor." });
                var (taxProfile, taxProfileError) = await AccountingRuleProfileEndpoints.ResolveDocumentProfileAsync(db, tenantId, date, profileCode, ct);
                if (taxProfileError is not null) return Results.Conflict(new { error = taxProfileError });
                if (supplier.CurrencyCode != order.CurrencyCode) return Results.Conflict(new { error = "Tedarikçinin döviz kodu sipariş para birimiyle eşleşmiyor." });
                if (date.DayNumber > DateOnly.MaxValue.DayNumber - supplier.PaymentTermDays)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["invoiceDate"] = ["Tedarikçi vadesiyle hesaplanan son ödeme tarihi desteklenen tarih aralığını aşıyor."] });
                var receiptLines = await db.PurchaseReceiptLines.AsNoTracking().Include(x => x.OrderLine)
                    .Where(x => x.TenantId == tenantId && x.ReceiptId == id).OrderBy(x => x.OrderLineNumber).ToListAsync(ct);
                if (receiptLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen mal kabul faturalanamaz." });
                var invoiced = await PurchaseInvoiceCalculation.LoadInvoicedAsync(db, tenantId, order.Id, ct);
                var lines = PurchaseInvoiceCalculation.CalculateLines(receiptLines, invoiced, taxProfile, date);
                SalesQuoteTotals totals;
                try { totals = SalesQuoteValidation.Sum(lines.Select(x => x.Amounts)); }
                catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
                if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Toplamı sıfır veya negatif olan mal kabulden alış faturası oluşturulamaz." });

                var previewLines = lines.Select(x => new PurchaseInvoicePreviewLine(x.Source.OrderLineNumber, x.Source.StockItemId, x.Source.StockCode,
                    x.Source.StockName, x.Source.UnitCode, x.Source.Quantity, x.Source.OrderLine.UnitPrice, x.Source.OrderLine.DiscountPercent,
                    x.Source.OrderLine.VatPercent, x.Amounts.LineSubtotal, x.Amounts.DiscountAmount, x.Amounts.TaxAmount, x.Amounts.LineTotal,
                    x.TaxBreakdownJson)).ToList();
                return Results.Ok(new PurchaseInvoicePreview(receipt.Id, receipt.Code, order.Id, order.Code, supplier.Id, supplier.Name, date,
                    date.AddDays(supplier.PaymentTermDays), supplier.PaymentTermDays, order.CurrencyCode, taxProfile?.ProfileCode, totals.Subtotal,
                    totals.DiscountTotal, totals.TaxTotal, totals.GrandTotal, previewLines.Count,
                    AccountingRuleTaxCalculator.Aggregate(lines.Select(x => x.TaxBreakdownJson)), previewLines));
            });
    }
}

/// <summary>The invoice a receipt would produce (satinalma.faturaGirisi.onizleme); <c>AccountingProfileCode</c> is the resolved profile.</summary>
internal sealed record PurchaseInvoicePreview(Guid PurchaseReceiptId, string ReceiptCode, Guid PurchaseOrderId, string PurchaseOrderCode,
    Guid SupplierId, string SupplierName, DateOnly InvoiceDate, DateOnly DueDate, int PaymentTermDays, string CurrencyCode,
    string? AccountingProfileCode, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, int LineCount,
    string TaxBreakdownJson, IReadOnlyList<PurchaseInvoicePreviewLine> Lines);

/// <summary>One line of <see cref="PurchaseInvoicePreview"/> (satinalma.faturaGirisi.onizlemeSatirlari).</summary>
internal sealed record PurchaseInvoicePreviewLine(int OrderLineNumber, Guid StockItemId, string StockCode, string StockName, string UnitCode,
    decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal, decimal DiscountAmount,
    decimal TaxAmount, decimal LineTotal, string TaxBreakdownJson);
