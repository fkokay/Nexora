using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>A sales document line as entered (<see cref="Input"/>) and normalized to the stock card base unit and the document
/// currency (<see cref="Base"/>, the values the line stores and its amounts are computed from).</summary>
internal sealed record NormalizedSalesLine(SalesQuoteLineWriteRequest Input, SalesQuoteLineWriteRequest Base, string EnteredCurrencyCode, decimal Rate);

/// <summary>
/// The amount calculation of the sales quote, order and standalone invoice write handlers, shared with their side-effect free
/// preview endpoints (<c>satis.teklif.hesapla</c>, <c>satis.siparis.hesapla</c>, <c>satis.fatura.onizle</c>) so a preview shows
/// exactly what saving stores. Line normalization reads the tenant's stock unit conversions and exchange rates; nothing is written.
/// The quote and order rules differ on purpose (a quote line may carry an entered exchange rate, an order line may not; their
/// error keys differ) and are kept as the handlers had them.
/// </summary>
internal static class SalesDocumentCalculator
{
    private const decimal MaxQuantityOrPrice = 99999999999999.9999m;

    private static Dictionary<string, string[]> Error(string key, string message) => new() { [key] = [message] };

    /// <summary>Quote lines (POST and PUT /api/sales/quotes): entered or dated exchange rate, unit factor to the base unit.</summary>
    public static async Task<(List<NormalizedSalesLine>? Lines, Dictionary<string, string[]>? Errors)> NormalizeQuoteLinesAsync(TenantDbContext db,
        Guid tenantId, IReadOnlyList<SalesQuoteLineWriteRequest> lines, string currencyCode, DateOnly quoteDate, IReadOnlyDictionary<Guid, StockItem> items)
    {
        var sourceCurrencies = lines.Select(x => SalesQuoteCurrencyConversion.NormalizeCurrency(x.CurrencyCode, currencyCode)).Append(currencyCode).Distinct().ToArray();
        var fxSnapshot = await SalesQuoteCurrencyConversion.LoadAsync(db, tenantId, quoteDate, sourceCurrencies);
        var normalizedLines = new List<NormalizedSalesLine>();
        for (var i = 0; i < lines.Count; i++)
        {
            var input = lines[i]; var item = items[input.StockItemId];
            var lineCurrency = SalesQuoteCurrencyConversion.NormalizeCurrency(input.CurrencyCode, currencyCode);
            if (!SalesQuoteCurrencyConversion.IsCurrencyCode(lineCurrency) || !SalesQuoteCurrencyConversion.IsCurrencyCode(currencyCode))
                return (null, Error($"lines[{i}].currencyCode", "Para birimi üç harfli ISO kodu olmalıdır."));
            decimal exchangeRate;
            if (input.ExchangeRateToQuoteCurrency is { } enteredRate)
            {
                if (lineCurrency == currencyCode && enteredRate != 1m)
                    return (null, Error($"lines[{i}].exchangeRateToQuoteCurrency", "Teklif döviziyle aynı dövizde kur 1 olmalıdır."));
                exchangeRate = enteredRate;
            }
            else if (!SalesQuoteCurrencyConversion.TryGetConversion(fxSnapshot, lineCurrency, currencyCode, out exchangeRate))
                return (null, Error($"lines[{i}].currencyCode", $"{lineCurrency} ile {currencyCode} arasında {quoteDate:yyyy-MM-dd} tarihli kur bulunamadı."));
            var factor = await UnitFactorAsync(db, tenantId, item, input.UnitCode);
            if (factor is null) return (null, Error($"lines[{i}].unitCode", "Stok kartı için bu birim etkin değil."));
            try
            {
                var baseQuantity = checked(input.Quantity * factor.Value); var basePrice = checked(input.UnitPrice * exchangeRate) / factor.Value;
                if (baseQuantity <= 0m || baseQuantity > MaxQuantityOrPrice || baseQuantity != decimal.Round(baseQuantity, 4) || basePrice > MaxQuantityOrPrice)
                    return (null, Error($"lines[{i}]", "Birim dönüşümü temel miktar ve fiyat için desteklenen hassasiyet sınırını aşıyor."));
                normalizedLines.Add(new(input, input with { Quantity = baseQuantity, UnitPrice = basePrice, UnitCode = item.UnitCode }, lineCurrency, exchangeRate));
            }
            catch (OverflowException) { return (null, Error($"lines[{i}]", "Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor.")); }
        }
        return (normalizedLines, null);
    }

    /// <summary>Order lines (POST and PUT /api/sales/orders): exchange rate of the order date, unit factor to the base unit.</summary>
    public static async Task<(List<NormalizedSalesLine>? Lines, Dictionary<string, string[]>? Errors)> NormalizeOrderLinesAsync(TenantDbContext db,
        Guid tenantId, IReadOnlyList<SalesQuoteLineWriteRequest> lines, string currencyCode, DateOnly orderDate, IReadOnlyDictionary<Guid, StockItem> items,
        CancellationToken ct)
    {
        var lineCurrencies = lines.Select(x => SalesQuoteCurrencyConversion.NormalizeCurrency(x.CurrencyCode, currencyCode)).Distinct().ToArray();
        if (lineCurrencies.Any(x => !SalesQuoteCurrencyConversion.IsCurrencyCode(x)))
            return (null, Error("lines", "Satır para birimi üç büyük harfli ISO kodu olmalıdır."));
        var fx = await SalesQuoteCurrencyConversion.LoadAsync(db, tenantId, orderDate, lineCurrencies.Append(currencyCode));
        var normalizedLines = new List<NormalizedSalesLine>();
        for (var i = 0; i < lines.Count; i++)
        {
            var input = lines[i]; var item = items[input.StockItemId];
            var enteredCurrency = SalesQuoteCurrencyConversion.NormalizeCurrency(input.CurrencyCode, currencyCode);
            if (!SalesQuoteCurrencyConversion.TryGetConversion(fx, enteredCurrency, currencyCode, out var rate))
                return (null, Error($"lines[{i}].currencyCode", $"{enteredCurrency} para biriminden {currencyCode} para birimine sipariş tarihli kur bulunamadı."));
            var unitCode = string.IsNullOrWhiteSpace(input.UnitCode) ? item.UnitCode : input.UnitCode.Trim().ToUpperInvariant();
            decimal factor = 1m;
            if (!string.Equals(unitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase))
            {
                var conversion = await db.StockItemUnitConversions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unitCode).Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync(ct);
                if (conversion is null) return (null, Error($"lines[{i}].unitCode", "Stok kartı için bu birim etkin değil."));
                factor = conversion.Value;
            }
            try
            {
                var quantity = checked(input.Quantity * factor); var price = checked(input.UnitPrice * rate / factor);
                if (input.Quantity <= 0 || quantity > MaxQuantityOrPrice || quantity != decimal.Round(quantity, 4) || input.UnitPrice < 0 || price > MaxQuantityOrPrice || input.DiscountPercent is < 0 or > 100 || input.VatPercent is < 0 or > 100)
                    return (null, Error($"lines[{i}]", "Miktar, fiyat, iskonto veya KDV değeri geçerli değil."));
                normalizedLines.Add(new(input, input with { Quantity = quantity, UnitPrice = price, UnitCode = item.UnitCode, CurrencyCode = currencyCode }, enteredCurrency, rate));
            }
            catch (OverflowException) { return (null, Error($"lines[{i}]", "Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor.")); }
        }
        return (normalizedLines, null);
    }

    /// <summary>Document totals of normalized quote / order lines; throws <see cref="OverflowException"/> beyond decimal(18,2).</summary>
    public static SalesQuoteTotals Totals(IEnumerable<NormalizedSalesLine> lines) =>
        SalesQuoteValidation.Sum(lines.Select(x => SalesQuoteValidation.Calculate(x.Base)));

    /// <summary>A standalone invoice line as stored: the card's base unit, the line (or header) warehouse and VAT-included for Retail.</summary>
    public static SalesQuoteLineWriteRequest NormalizeInvoiceLine(SalesQuoteLineWriteRequest input, StockItem item, Guid headerWarehouseId, SalesInvoiceType invoiceType) =>
        input with { UnitCode = item.UnitCode, WarehouseId = input.WarehouseId ?? headerWarehouseId, IsVatIncluded = invoiceType == SalesInvoiceType.Retail };

    /// <summary>
    /// A standalone invoice line's amounts: subtotal and discount as a quote line, tax and total from the document's tax profile
    /// (VAT plus the profile's extra taxes, net of withholding). Throws <see cref="OverflowException"/> beyond decimal(18,2).
    /// </summary>
    public static (SalesQuoteLineAmounts Amounts, string TaxBreakdownJson) InvoiceLine(SalesQuoteLineWriteRequest normalized, AccountingRuleProfile? profile, DateOnly invoiceDate)
    {
        var amounts = SalesQuoteValidation.Calculate(normalized);
        var assessment = AccountingRuleTaxCalculator.Calculate(profile, amounts.LineSubtotal - amounts.DiscountAmount, normalized.VatPercent, invoiceDate, "Sales");
        return (amounts with { TaxAmount = assessment.TaxTotal, LineTotal = assessment.GrandTotal }, assessment.TaxBreakdownJson);
    }

    /// <summary>Same rule as Program.ResolveStockUnitFactorAsync (the quote handlers' unit factor).</summary>
    private static async Task<decimal?> UnitFactorAsync(TenantDbContext db, Guid tenantId, StockItem item, string? requestedUnitCode)
    {
        var unitCode = string.IsNullOrWhiteSpace(requestedUnitCode) ? item.UnitCode : requestedUnitCode.Trim().ToUpperInvariant();
        if (string.Equals(unitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase)) return 1m;
        return await db.StockItemUnitConversions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unitCode)
            .Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync();
    }

    // ---- Preview result ----

    /// <summary>A quote / order preview: each line's amounts from its base values, VAT grouped by rate.</summary>
    public static SalesDocumentPreview Preview(string currencyCode, IReadOnlyList<NormalizedSalesLine> lines, IReadOnlyList<string?> rowKeys)
    {
        var totals = Totals(lines);
        var previewLines = lines.Select((line, index) =>
        {
            var amounts = SalesQuoteValidation.Calculate(line.Base);
            return PreviewLine(rowKeys[index], index, line, amounts, 0m);
        }).ToArray();
        var taxes = previewLines.Zip(lines).GroupBy(x => x.Second.Base.VatPercent).OrderByDescending(x => x.Key)
            .Select(group => new SalesDocumentPreviewTax("VAT", "KDV", group.Key, "Additive", group.Sum(x => x.First.TaxableAmount), group.Sum(x => x.First.TaxAmount)))
            .ToArray();
        return Build(currencyCode, null, totals, previewLines, taxes);
    }

    /// <summary>A standalone invoice preview: line amounts and taxes from the tax profile, the same calls as the write.</summary>
    public static SalesDocumentPreview InvoicePreview(string currencyCode, AccountingRuleProfile? profile, DateOnly invoiceDate,
        IReadOnlyList<SalesQuoteLineWriteRequest> normalizedLines, IReadOnlyList<string?> rowKeys)
    {
        var computed = normalizedLines.Select(line => InvoiceLine(line, profile, invoiceDate)).ToArray();
        var totals = SalesQuoteValidation.Sum(computed.Select(x => x.Amounts));
        var breakdowns = computed.Select(x => AccountingRuleTaxCalculator.ReadBreakdown(x.TaxBreakdownJson)).ToArray();
        var previewLines = normalizedLines.Select((line, index) => PreviewLine(rowKeys[index], index,
            new NormalizedSalesLine(line, line, currencyCode, 1m), computed[index].Amounts,
            breakdowns[index].Where(x => x.Treatment == "Withholding").Sum(x => x.Amount))).ToArray();
        // By code and rate: the stored breakdown (AccountingRuleTaxCalculator.Aggregate) keys on the code only, so mixed VAT rates
        // would collapse into one row.
        var taxes = breakdowns.SelectMany(x => x)
            .GroupBy(x => (Code: x.Code.ToUpperInvariant(), x.Rate, x.Treatment))
            .OrderBy(x => x.Key.Treatment == "Withholding").ThenBy(x => x.Key.Code == "VAT" ? 0 : 1).ThenByDescending(x => x.Key.Rate)
            .Select(group => new SalesDocumentPreviewTax(group.First().Code, group.First().Name, group.Key.Rate, group.Key.Treatment,
                group.Sum(x => x.TaxableAmount), group.Sum(x => x.Amount)))
            .ToArray();
        return Build(currencyCode, profile?.ProfileCode, totals, previewLines, taxes);
    }

    private static SalesDocumentPreviewLine PreviewLine(string? rowKey, int index, NormalizedSalesLine line, SalesQuoteLineAmounts amounts, decimal withholding) =>
        new(rowKey, index + 1, line.Base.StockItemId, line.Base.UnitCode ?? "", line.Base.Quantity, line.Base.UnitPrice,
            string.IsNullOrWhiteSpace(line.Input.UnitCode) ? line.Base.UnitCode ?? "" : line.Input.UnitCode.Trim().ToUpperInvariant(),
            line.Input.Quantity, line.EnteredCurrencyCode, line.Input.UnitPrice, line.Rate,
            amounts.LineSubtotal, amounts.DiscountAmount, amounts.LineSubtotal - amounts.DiscountAmount, amounts.TaxAmount, withholding, amounts.LineTotal);

    private static SalesDocumentPreview Build(string currencyCode, string? profileCode, SalesQuoteTotals totals,
        IReadOnlyList<SalesDocumentPreviewLine> lines, IReadOnlyList<SalesDocumentPreviewTax> taxes)
    {
        var withholding = lines.Sum(x => x.WithholdingAmount);
        return new SalesDocumentPreview(currencyCode, profileCode, lines.Count, totals.Subtotal, totals.DiscountTotal,
            totals.Subtotal - totals.DiscountTotal, totals.TaxTotal, totals.GrandTotal + withholding, withholding, totals.GrandTotal, lines, taxes);
    }
}

/// <summary>
/// What saving a sales quote, order or standalone invoice would store (<c>POST /api/sales/{quotes|orders|invoices}/preview</c>).
/// <see cref="GrandTotal"/> is the stored grand total; <see cref="GrossTotal"/> = taxable + tax, before withholding.
/// </summary>
public sealed record SalesDocumentPreview(string CurrencyCode, string? AccountingProfileCode, int LineCount, decimal Subtotal, decimal DiscountTotal,
    decimal TaxableTotal, decimal TaxTotal, decimal GrossTotal, decimal WithholdingTotal, decimal GrandTotal,
    IReadOnlyList<SalesDocumentPreviewLine> Lines, IReadOnlyList<SalesDocumentPreviewTax> Taxes);

/// <summary>One previewed line in body order; <see cref="RowKey"/> echoes the request line's key (the page's draft key).</summary>
public sealed record SalesDocumentPreviewLine(string? RowKey, int LineNumber, Guid StockItemId, string UnitCode, decimal Quantity, decimal UnitPrice,
    string EnteredUnitCode, decimal EnteredQuantity, string EnteredCurrencyCode, decimal EnteredUnitPrice, decimal ExchangeRate,
    decimal LineSubtotal, decimal DiscountAmount, decimal TaxableAmount, decimal TaxAmount, decimal WithholdingAmount, decimal LineTotal);

/// <summary>A tax of the preview: VAT by rate, then the tax profile's extra taxes and withholdings.</summary>
public sealed record SalesDocumentPreviewTax(string Code, string Name, decimal Rate, string Treatment, decimal TaxableAmount, decimal Amount);

/// <summary>A preview request line: the write line plus the page's optional row key (echoed in the result, never stored).</summary>
public sealed record SalesPreviewLineRequest(Guid StockItemId, decimal Quantity, decimal UnitPrice, decimal DiscountPercent = 0, decimal VatPercent = 20,
    string? UnitCode = null, Guid? WarehouseId = null, string? CurrencyCode = null, decimal? ExchangeRateToQuoteCurrency = null,
    bool IsVatIncluded = false, int? SalesRequestLineNumber = null, string? RowKey = null)
{
    public SalesQuoteLineWriteRequest ToWrite() => new(StockItemId, Quantity, UnitPrice, DiscountPercent, VatPercent, UnitCode, WarehouseId,
        CurrencyCode, ExchangeRateToQuoteCurrency, IsVatIncluded, SalesRequestLineNumber);
}

/// <summary>The fields of a standalone invoice write that its amounts depend on (other write fields are accepted and ignored).</summary>
public sealed record SalesInvoicePreviewRequest(Guid CustomerId, DateOnly InvoiceDate, IReadOnlyList<SalesPreviewLineRequest>? Lines,
    Guid? WarehouseId = null, string? AccountingProfileCode = null, SalesInvoiceType InvoiceType = SalesInvoiceType.Wholesale);

/// <summary>The fields of a quote write that its amounts depend on (other write fields are accepted and ignored).</summary>
public sealed record SalesQuotePreviewRequest(DateOnly QuoteDate, DateOnly ValidUntil, string CurrencyCode, IReadOnlyList<SalesPreviewLineRequest>? Lines,
    Guid? CustomerId = null, string? ProspectCustomerName = null);

/// <summary>
/// The fields of an order write that its amounts depend on (other write fields are accepted and ignored). An omitted currency is
/// the customer's (the only one the write accepts), so a card can preview before it has read the customer.
/// </summary>
public sealed record SalesOrderPreviewRequest(Guid CustomerId, DateOnly OrderDate, IReadOnlyList<SalesPreviewLineRequest>? Lines, string? CurrencyCode = null);

/// <summary><c>GET /api/sales/quotes/exchange-rates</c>: the latest tenant rate per currency dated on or before the rate date.</summary>
public sealed record SalesExchangeRatesView(string BaseCurrencyCode, IReadOnlyList<SalesExchangeRateView> Rates);
/// <summary>Base-currency units for one unit of <see cref="CurrencyCode"/>.</summary>
public sealed record SalesExchangeRateView(string CurrencyCode, decimal Rate, DateOnly RateDate);
