using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Side-effect free previews of the sales quote, order and standalone invoice writes (Satış Aşama B, decision 3): the same body as
/// the write (plus an optional <c>rowKey</c> per line), the same amount calculation (<see cref="SalesDocumentCalculator"/>) and
/// the same field errors for the inputs the amounts depend on. Nothing is written: no document number, customer, stock, ledger,
/// audit or request-key row. Number, idempotency, stock availability, risk limit, closed period, custom field, e-document, note
/// and revision / request link checks stay with the write. The routes resolve as the documents' create permission.
/// </summary>
internal static class SalesDocumentPreviewEndpoints
{
    private const int MaxInvoiceLines = 200;
    private const int MaxOrderLines = 200;
    private const decimal MaxQuantityOrPrice = 99999999999999.9999m;

    internal static void MapSalesDocumentPreviewEndpoints(this WebApplication app)
    {
        app.MapGroup("/api/sales/invoices").WithTags("Satış Faturaları").RequireAuthorization()
            .MapPost("/preview", async (SalesInvoicePreviewRequest request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
                TenantOf(principal) is { } tenantId ? await PreviewInvoiceAsync(request, tenantId, db, ct) : Results.Forbid());
        app.MapGroup("/api/sales/quotes").WithTags("Satış Teklifleri").RequireAuthorization()
            .MapPost("/preview", async (SalesQuotePreviewRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
                TenantOf(principal) is { } tenantId ? await PreviewQuoteAsync(request, tenantId, db) : Results.Forbid());
        app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization()
            .MapPost("/preview", async (SalesOrderPreviewRequest request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
                TenantOf(principal) is { } tenantId ? await PreviewOrderAsync(request, tenantId, db, ct) : Results.Forbid());
    }

    private static Guid? TenantOf(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId) ? tenantId : null;

    private static IResult Invalid(string key, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    private static bool IsSalesCustomer(CustomerAccount? customer) =>
        customer is { IsActive: true, Type: CounterpartyType.Customer or CounterpartyType.Both or CounterpartyType.Dealer };

    /// <summary>The checks of <c>POST /api/sales/invoices</c> that decide its amounts, in the write's order and wording.</summary>
    private static async Task<IResult> PreviewInvoiceAsync(SalesInvoicePreviewRequest request, Guid tenantId, TenantDbContext db, CancellationToken ct)
    {
        var lines = request.Lines?.Select(x => x.ToWrite()).ToArray();
        if (request.CustomerId == Guid.Empty || lines is null || lines.Length == 0 || lines.Length > MaxInvoiceLines)
            return Invalid("invoice", "Müşteri seçin ve 1–200 fatura satırı ekleyin.");
        if (lines.Any(x => x.StockItemId == Guid.Empty || x.Quantity <= 0 || x.Quantity > MaxQuantityOrPrice || x.Quantity != decimal.Round(x.Quantity, 4)
            || x.UnitPrice < 0 || x.UnitPrice > MaxQuantityOrPrice || x.DiscountPercent is < 0 or > 100 || x.VatPercent is < 0 or > 100))
            return Invalid("lines", "Satır miktarı, fiyat, iskonto veya KDV oranı geçersiz.");
        var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId, ct);
        if (!IsSalesCustomer(customer)) return Invalid("customerId", "Aktif bir müşteri seçilmelidir.");
        var (taxProfile, taxProfileError) = await AccountingRuleProfileEndpoints.ResolveDocumentProfileAsync(db, tenantId, request.InvoiceDate, request.AccountingProfileCode, ct);
        if (taxProfileError is not null) return Results.Conflict(new { error = taxProfileError });
        var stockIds = lines.Select(x => x.StockItemId).Distinct().ToArray();
        var stockItems = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id) && x.IsActive).ToDictionaryAsync(x => x.Id, ct);
        if (stockItems.Count != stockIds.Length) return Invalid("lines", "Fatura satırlarından biri bulunamadı veya aktif değil.");
        var normalized = new List<SalesQuoteLineWriteRequest>();
        foreach (var input in lines)
        {
            var item = stockItems[input.StockItemId];
            if (!string.IsNullOrWhiteSpace(input.UnitCode) && !string.Equals(input.UnitCode.Trim(), item.UnitCode, StringComparison.OrdinalIgnoreCase))
                return Invalid($"lines[{input.StockItemId}].unitCode", "Bağımsız faturada stok kartının temel birimi kullanılmalıdır.");
            normalized.Add(SalesDocumentCalculator.NormalizeInvoiceLine(input, item, request.WarehouseId ?? Guid.Empty, request.InvoiceType));
        }
        try
        {
            return Results.Ok(SalesDocumentCalculator.InvoicePreview(customer!.CurrencyCode, taxProfile, request.InvoiceDate, normalized,
                request.Lines!.Select(x => x.RowKey).ToArray()));
        }
        catch (OverflowException) { return Results.Conflict(new { error = "Fatura toplamı desteklenen decimal(18,2) sınırını aşıyor." }); }
    }

    /// <summary>The checks of <c>POST /api/sales/quotes</c> that decide its amounts, in the write's order and wording.</summary>
    private static async Task<IResult> PreviewQuoteAsync(SalesQuotePreviewRequest request, Guid tenantId, TenantDbContext db)
    {
        var lines = request.Lines?.Select(x => x.ToWrite()).ToArray();
        var write = new SalesQuoteWriteRequest("", request.CustomerId, request.QuoteDate, request.ValidUntil, request.CurrencyCode ?? "", null,
            lines!, ProspectCustomerName: request.ProspectCustomerName);
        if (SalesQuoteValidation.Validate(write) is { } errors) return Results.ValidationProblem(errors);
        var customer = request.CustomerId is { } customerId
            ? await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == customerId && x.IsActive)
            : null;
        if (request.CustomerId is not null && !IsSalesCustomer(customer))
            return Invalid("customerId", "Aktif müşteri türünde bir cari seçilmelidir.");
        var currencyCode = request.CurrencyCode!.Trim().ToUpperInvariant();
        if (customer is not null && currencyCode != customer.CurrencyCode)
            return Invalid("currencyCode", $"Teklif dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır.");
        var itemIds = lines!.Select(x => x.StockItemId).Distinct().ToArray();
        var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        if (items.Count != itemIds.Length) return Invalid("lines", "Satırlardaki stok kartlarından biri bulunamadı veya pasif.");
        var (normalized, lineErrors) = await SalesDocumentCalculator.NormalizeQuoteLinesAsync(db, tenantId, lines, currencyCode, request.QuoteDate, items);
        if (lineErrors is not null) return Results.ValidationProblem(lineErrors);
        try { return Results.Ok(SalesDocumentCalculator.Preview(currencyCode, normalized!, request.Lines!.Select(x => x.RowKey).ToArray())); }
        catch (OverflowException) { return Invalid("lines", "Teklif toplamı desteklenen decimal(18,2) sınırını aşıyor."); }
    }

    /// <summary>The checks of <c>POST /api/sales/orders</c> that decide its amounts, in the write's order and wording.</summary>
    private static async Task<IResult> PreviewOrderAsync(SalesOrderPreviewRequest request, Guid tenantId, TenantDbContext db, CancellationToken ct)
    {
        var lines = request.Lines?.Select(x => x.ToWrite()).ToArray();
        if (lines is null || lines.Length is < 1 or > MaxOrderLines) return Invalid("lines", "Sipariş 1–200 stok satırı içermelidir.");
        var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive, ct);
        if (!IsSalesCustomer(customer)) return Invalid("customerId", "Aktif müşteri türünde bir cari seçilmelidir.");
        var currencyCode = string.IsNullOrWhiteSpace(request.CurrencyCode) ? customer!.CurrencyCode : request.CurrencyCode.Trim().ToUpperInvariant();
        if (currencyCode != customer!.CurrencyCode)
            return Invalid("currencyCode", $"Sipariş dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır.");
        var itemIds = lines.Select(x => x.StockItemId).Distinct().ToArray();
        var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        if (items.Count != itemIds.Length) return Invalid("lines", "Satırlardaki stok kartlarından biri bulunamadı veya pasif.");
        var (normalized, lineErrors) = await SalesDocumentCalculator.NormalizeOrderLinesAsync(db, tenantId, lines, currencyCode!, request.OrderDate, items, ct);
        if (lineErrors is not null) return Results.ValidationProblem(lineErrors);
        try { return Results.Ok(SalesDocumentCalculator.Preview(currencyCode!, normalized!, request.Lines!.Select(x => x.RowKey).ToArray())); }
        catch (OverflowException) { return Invalid("lines", "Sipariş toplamı desteklenen decimal(18,2) sınırını aşıyor."); }
    }
}
