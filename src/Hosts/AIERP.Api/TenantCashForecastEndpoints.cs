using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class TenantCashForecastEndpoints
{
    public static void MapTenantCashForecastEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/finance/cash-flow").WithTags("Finans · Nakit tahmini").RequireAuthorization();
        group.MapGet("/forecast", async (DateOnly? from, int? months, string? currencyCode, ClaimsPrincipal user,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var start = from ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var horizon = months ?? 12;
            if (horizon is < 1 or > 24) return Results.BadRequest(new { error = "Tahmin ufku 1–24 ay arasında olmalıdır." });
            if (start < new DateOnly(2000, 1, 1)) return Results.BadRequest(new { error = "Başlangıç tarihi 01.01.2000 veya sonrası olmalıdır." });
            var requestedCurrency = string.IsNullOrWhiteSpace(currencyCode) ? null : currencyCode.Trim().ToUpperInvariant();
            if (requestedCurrency is not null && (requestedCurrency.Length != 3 || requestedCurrency.Any(c => c is < 'A' or > 'Z')))
                return Results.BadRequest(new { error = "Döviz kodu üç büyük harfli ISO kodu olmalıdır." });
            DateOnly endExclusive;
            try { endExclusive = start.AddMonths(horizon); }
            catch (ArgumentOutOfRangeException) { return Results.BadRequest(new { error = "Başlangıç tarihi seçilen tahmin ufku için çok ileri." }); }
            var firstMonth = new DateOnly(start.Year, start.Month, 1);
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
                .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(ct);
            if (string.IsNullOrWhiteSpace(baseCurrency)) return Results.Forbid();
            baseCurrency = baseCurrency.Trim().ToUpperInvariant();

            var transactions = db.FinancialAccountTransactions.AsNoTracking().Where(x => x.TenantId == tenantId);
            var openingRows = await transactions.Where(x => x.TransactionDate < start)
                .GroupBy(x => x.CurrencyCode).Select(g => new { Currency = g.Key,
                    Amount = g.Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount) }).ToListAsync(ct);
            var futureMovementRows = await transactions.Where(x => x.TransactionDate >= start && x.TransactionDate < endExclusive)
                .GroupBy(x => new { x.CurrencyCode, x.TransactionDate.Year, x.TransactionDate.Month })
                .Select(g => new { g.Key.CurrencyCode, g.Key.Year, g.Key.Month,
                    Amount = g.Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount), Count = g.Count() }).ToListAsync(ct);

            var sales = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)
                .Select(x => new { x.Id, x.Code, x.Customer.Name, x.CurrencyCode, x.InvoiceDate, x.GrandTotal, Terms = x.Customer.PaymentTermDays })
                .ToListAsync(ct);
            var collected = await db.CustomerCollectionAllocations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.CustomerCollection.Status == CustomerCollectionStatus.Posted)
                .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.Id, x => x.Amount, ct);
            var salesReturns = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted)
                .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) })
                .ToDictionaryAsync(x => x.Id, x => x.Amount, ct);

            var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
                .Select(x => new { x.Id, x.Code, Counterparty = x.Supplier.Name, x.CurrencyCode, x.DueDate, x.GrandTotal }).ToListAsync(ct);
            var paid = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted)
                .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.Id, x => x.Amount, ct);
            var purchaseReturns = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted)
                .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) })
                .ToDictionaryAsync(x => x.Id, x => x.Amount, ct);
            var instruments = await db.PaymentInstruments.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Status == PaymentInstrumentStatus.Portfolio)
                .Select(x => new { x.CurrencyCode, x.Direction, x.DueDate, x.Amount }).ToListAsync(ct);
            var creditPayments = await db.CreditFacilitySchedules.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Status == CreditFacilityScheduleStatus.Planned && x.CreditFacility.Status == CreditFacilityStatus.Active)
                .Select(x => new { x.DueDate, x.CreditFacility.CurrencyCode, Amount = x.PrincipalAmount + x.InterestAmount + x.FeeAmount })
                .ToListAsync(ct);

            var currencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var row in openingRows) currencies.Add(row.Currency);
            foreach (var row in futureMovementRows) currencies.Add(row.CurrencyCode);
            foreach (var invoice in sales) currencies.Add(invoice.CurrencyCode);
            foreach (var invoice in purchases) currencies.Add(invoice.CurrencyCode);
            foreach (var instrument in instruments) currencies.Add(instrument.CurrencyCode);
            foreach (var payment in creditPayments) currencies.Add(payment.CurrencyCode);
            if (requestedCurrency is not null) currencies.IntersectWith([requestedCurrency]);

            var exchangeRates = await db.TenantExchangeRates.AsNoTracking()
                .Where(x => x.TenantId == tenantId && currencies.Contains(x.CurrencyCode) && x.RateDate <= endExclusive.AddDays(-1))
                .OrderBy(x => x.RateDate).ThenBy(x => x.Revision)
                .Select(x => new { x.CurrencyCode, x.RateDate, x.Revision, x.Rate }).ToListAsync(ct);
            decimal? RateAt(string currency, DateOnly date) => currency.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase)
                ? 1m
                : exchangeRates.Where(x => x.CurrencyCode == currency && x.RateDate <= date)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
                    .Select(x => (decimal?)x.Rate).FirstOrDefault();
            DateOnly? RateDateAt(string currency, DateOnly date) => currency.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase)
                ? date
                : exchangeRates.Where(x => x.CurrencyCode == currency && x.RateDate <= date)
                    .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
                    .Select(x => (DateOnly?)x.RateDate).FirstOrDefault();

            var flows = new Dictionary<(string Currency, DateOnly Month), ForecastMonthAccumulator>();
            ForecastMonthAccumulator Get(string currency, DateOnly dueDate)
            {
                var month = dueDate < start ? firstMonth : new DateOnly(dueDate.Year, dueDate.Month, 1);
                var key = (currency, month);
                if (!flows.TryGetValue(key, out var value)) flows[key] = value = new ForecastMonthAccumulator();
                return value;
            }
            foreach (var invoice in sales)
            {
                var due = invoice.InvoiceDate.AddDays(invoice.Terms);
                if (due >= endExclusive) continue;
                var outstanding = Math.Max(0m, invoice.GrandTotal - collected.GetValueOrDefault(invoice.Id) - salesReturns.GetValueOrDefault(invoice.Id));
                if (outstanding <= 0m) continue;
                var row = Get(invoice.CurrencyCode, due); row.Receivables += outstanding; row.OverdueReceivables += due < start ? outstanding : 0m;
            }
            foreach (var invoice in purchases)
            {
                if (invoice.DueDate >= endExclusive) continue;
                var outstanding = Math.Max(0m, invoice.GrandTotal - paid.GetValueOrDefault(invoice.Id) - purchaseReturns.GetValueOrDefault(invoice.Id));
                if (outstanding <= 0m) continue;
                var row = Get(invoice.CurrencyCode, invoice.DueDate); row.Payables += outstanding; row.OverduePayables += invoice.DueDate < start ? outstanding : 0m;
            }
            foreach (var instrument in instruments)
            {
                if (instrument.DueDate >= endExclusive) continue;
                var row = Get(instrument.CurrencyCode, instrument.DueDate);
                if (instrument.Direction == PaymentInstrumentDirection.Receivable)
                {
                    row.InstrumentReceivables += instrument.Amount;
                    if (instrument.DueDate < start) row.OverdueInstrumentReceivables += instrument.Amount;
                }
                else
                {
                    row.InstrumentPayables += instrument.Amount;
                    if (instrument.DueDate < start) row.OverdueInstrumentPayables += instrument.Amount;
                }
            }
            foreach (var payment in creditPayments)
            {
                if (payment.DueDate >= endExclusive) continue;
                var row = Get(payment.CurrencyCode, payment.DueDate);
                row.CreditFacilityPayments += payment.Amount;
                if (payment.DueDate < start) row.OverdueCreditFacilityPayments += payment.Amount;
            }
            foreach (var movement in futureMovementRows)
            {
                var row = Get(movement.CurrencyCode, new DateOnly(movement.Year, movement.Month, 1));
                row.PostedMovements += movement.Amount; row.PostedMovementCount += movement.Count;
            }

            var output = new List<CashForecastCurrencyView>();
            foreach (var currency in currencies.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                var opening = openingRows.Where(x => x.Currency.Equals(currency, StringComparison.OrdinalIgnoreCase)).Sum(x => x.Amount);
                var monthsOut = new List<CashForecastMonthView>(horizon);
                for (var i = 0; i < horizon; i++)
                {
                    var month = firstMonth.AddMonths(i);
                    flows.TryGetValue((currency, month), out var flow);
                    flow ??= new ForecastMonthAccumulator();
                    var net = flow.Receivables + flow.InstrumentReceivables - flow.Payables - flow.InstrumentPayables - flow.CreditFacilityPayments + flow.PostedMovements;
                    var closing = opening + net;
                    var rate = RateAt(currency, month);
                    var rateDate = RateDateAt(currency, month);
                    monthsOut.Add(new CashForecastMonthView(month, opening, flow.Receivables, flow.Payables,
                        flow.InstrumentReceivables, flow.InstrumentPayables, flow.CreditFacilityPayments, flow.PostedMovements, flow.PostedMovementCount,
                        flow.OverdueReceivables, flow.OverduePayables, flow.OverdueInstrumentReceivables,
                        flow.OverdueInstrumentPayables, flow.OverdueCreditFacilityPayments, net, closing,
                        rate is null ? null : decimal.Round(closing * rate.Value, 2, MidpointRounding.AwayFromZero), rate, rateDate));
                    opening = closing;
                }
                output.Add(new CashForecastCurrencyView(currency, monthsOut));
            }
            return Results.Ok(new CashForecastView(start, horizon, endExclusive.AddDays(-1), baseCurrency,
                "Baz para birimi karşılığı, her tahmin ayının ilk gününde geçerli son tenant kuru ile yalnızca gösterim amacıyla hesaplanır; muhasebe değerlemesi değildir. Kur bulunmayan para birimlerinin baz para karşılığı boş kalır. Bütçe tahakkukları dahil değildir; yalnız açık fatura bakiyeleri, portföy enstrümanları, aktif kredi taksitleri ve ileri tarihli kayıtlı kasa/banka hareketleri dahil edilir. Gecikmiş kalemler ilk tahmin ayına yerleştirilir.", output));
        });
    }

    private sealed class ForecastMonthAccumulator
    {
        public decimal Receivables { get; set; }
        public decimal Payables { get; set; }
        public decimal InstrumentReceivables { get; set; }
        public decimal InstrumentPayables { get; set; }
        public decimal CreditFacilityPayments { get; set; }
        public decimal PostedMovements { get; set; }
        public int PostedMovementCount { get; set; }
        public decimal OverdueReceivables { get; set; }
        public decimal OverduePayables { get; set; }
        public decimal OverdueInstrumentReceivables { get; set; }
        public decimal OverdueInstrumentPayables { get; set; }
        public decimal OverdueCreditFacilityPayments { get; set; }
    }
}

public sealed record CashForecastView(DateOnly From, int Months, DateOnly Through, string BaseCurrencyCode, string Assumptions, IReadOnlyList<CashForecastCurrencyView> Currencies);
public sealed record CashForecastCurrencyView(string CurrencyCode, IReadOnlyList<CashForecastMonthView> Months);
public sealed record CashForecastMonthView(DateOnly PeriodStart, decimal OpeningBalance, decimal Receivables, decimal Payables,
    decimal InstrumentReceivables, decimal InstrumentPayables, decimal CreditFacilityPayments, decimal PostedMovements, int PostedMovementCount,
    decimal OverdueReceivables, decimal OverduePayables, decimal OverdueInstrumentReceivables, decimal OverdueInstrumentPayables,
    decimal OverdueCreditFacilityPayments, decimal NetChange, decimal ClosingBalance, decimal? BaseCurrencyClosingBalance,
    decimal? AppliedExchangeRate, DateOnly? AppliedExchangeRateDate);
