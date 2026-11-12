using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// TMS 7 / IAS 7 statement of cash flows built from tenant journal postings.
/// The operating section uses the indirect method; investing, financing and the
/// effect of exchange-rate changes on cash are derived from the counterpart lines of
/// journal entries that move cash-equivalent accounts. Read-only and uncertified:
/// it has not been reviewed by an accountant.
/// </summary>
public static class StatutoryCashFlowStatementEndpoints
{
    // Fiscal-year close/opening entries are bookkeeping transfers, not cash or income
    // events; including them would zero period net income or double opening balances.
    internal static readonly string[] ExcludedSourceTypes = ["FiscalYearClose", "FiscalYearOpening"];

    public static RouteGroupBuilder MapStatutoryCashFlowStatementEndpoint(this RouteGroupBuilder group)
    {
        group.MapGet("/financial-statements/tms7/statement-of-cash-flows", async (DateOnly? from, DateOnly? to, string? basis,
            ClaimsPrincipal principal, TenantDbContext db, CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var reportBasis = TrialBalanceEndpoints.NormalizeBasis(basis);
            if (reportBasis is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["basis"] = ["Rapor standardı TDHP, IFRS veya UFRS olmalıdır."] });
            var start = from ?? new DateOnly(DateTime.UtcNow.Year, 1, 1);
            var end = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            if (start > end || end.DayNumber - start.DayNumber > 365)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["dateRange"] = ["Tarih aralığı sıralı olmalı ve en fazla 366 takvim günü kapsamalıdır."] });
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(cancellationToken);
            if (baseCurrency is null) return Results.Forbid();

            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
                .Select(x => new StatutoryCashFlowAccount(x.Id, x.Code, x.Name, x.StatementSection, x.CurrencyCode)).ToListAsync(cancellationToken);
            var mappingRows = await db.LedgerAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.MappingKey.StartsWith(FinancialStatementEndpoints.CashFlowClassificationPrefix))
                .Select(x => new { x.MappingKey, x.AccountId }).ToListAsync(cancellationToken);
            var classifications = mappingRows.Select(x => (x.AccountId, Classification: FinancialStatementEndpoints.ParseCashFlowClassification(x.MappingKey)))
                .Where(x => x.Classification is not null).GroupBy(x => x.AccountId).ToDictionary(x => x.Key, x => x.Last().Classification!.Value);

            var excludedEntryCount = await db.JournalEntries.AsNoTracking().CountAsync(x => x.TenantId == tenantId
                && x.EntryDate <= end && ExcludedSourceTypes.Contains(x.SourceType), cancellationToken);
            var lines = await (from entry in db.JournalEntries.AsNoTracking()
                               join line in db.JournalEntryLines.AsNoTracking()
                                   on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                               where entry.TenantId == tenantId && entry.EntryDate <= end
                                   && !ExcludedSourceTypes.Contains(entry.SourceType)
                                   && (reportBasis == "TDHP" ? entry.AccountingBasis == "TDHP" : entry.AccountingBasis == "TDHP" || entry.AccountingBasis == "IFRS")
                               select new StatutoryCashFlowLine(entry.Id, entry.Code, entry.EntryDate, line.AccountId, line.Debit, line.Credit))
                .ToListAsync(cancellationToken);

            var foreignCurrencies = accounts.Where(x => x.CurrencyCode is not null && !x.CurrencyCode.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase))
                .Select(x => x.CurrencyCode!.ToUpperInvariant()).Distinct().ToArray();
            var latestRateDates = foreignCurrencies.Length == 0 ? new Dictionary<string, DateOnly>() : (await db.TenantExchangeRates.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && foreignCurrencies.Contains(x.CurrencyCode) && x.RateDate <= end)
                    .GroupBy(x => x.CurrencyCode).Select(g => new { CurrencyCode = g.Key, RateDate = g.Max(x => x.RateDate) }).ToListAsync(cancellationToken))
                .ToDictionary(x => x.CurrencyCode.ToUpperInvariant(), x => x.RateDate);

            var statement = StatutoryCashFlowCalculator.Calculate(start, end, baseCurrency, accounts, classifications, lines, latestRateDates);
            return Results.Ok(new
            {
                standard = "TMS 7", method = "Indirect", basis = reportBasis, from = start, to = end, baseCurrencyCode = baseCurrency,
                statement.Operating, statement.Investing, statement.Financing,
                statement.EffectOfExchangeRateChanges, statement.NetChangeInCash,
                statement.Reconciliation, statement.CashAccounts, statement.NonCashInvestingFinancingEntries,
                statement.Warnings, excludedFiscalCloseEntryCount = excludedEntryCount,
                isComplete = statement.Warnings.Count == 0,
                certified = false, accountantReviewed = false,
                note = "Muhasebeci tarafından incelenmemiş taslak TMS 7 nakit akış tablosudur; yasal finansal tablo olarak kullanılmamalıdır."
            });
        });
        return group;
    }
}

public sealed record StatutoryCashFlowAccount(Guid Id, string Code, string Name, LedgerAccountStatementSection Section, string? CurrencyCode);
public sealed record StatutoryCashFlowLine(Guid EntryId, string EntryCode, DateOnly EntryDate, Guid AccountId, decimal Debit, decimal Credit);

public sealed record StatutoryCashFlowAmountLine(Guid AccountId, string Code, string Name, string Classification, decimal Amount);
public sealed record StatutoryCashFlowActivityLine(Guid AccountId, string Code, string Name, string Classification, decimal Inflows, decimal Outflows, decimal NetCashFlow);
public sealed record StatutoryCashFlowOperating(decimal NetProfitLoss, IReadOnlyList<StatutoryCashFlowAmountLine> Adjustments, decimal AdjustmentsTotal,
    IReadOnlyList<StatutoryCashFlowAmountLine> WorkingCapitalChanges, decimal WorkingCapitalTotal, decimal NetCashFlow);
public sealed record StatutoryCashFlowActivity(IReadOnlyList<StatutoryCashFlowActivityLine> Lines, decimal Inflows, decimal Outflows, decimal NetCashFlow);
public sealed record StatutoryCashFlowReconciliation(decimal OpeningCashAndCashEquivalents, decimal NetChangeInCash, decimal ExpectedClosingCashAndCashEquivalents,
    decimal ClosingCashAndCashEquivalents, decimal Difference, bool Reconciles);
public sealed record StatutoryCashFlowCashAccount(Guid AccountId, string Code, string Name, string? CurrencyCode, decimal OpeningBalance, decimal ClosingBalance);
public sealed record StatutoryCashFlowNonCashEntry(Guid EntryId, string EntryCode, DateOnly EntryDate, IReadOnlyList<string> AccountCodes);
public sealed record StatutoryCashFlowWarningAccount(Guid AccountId, string Code, string Name, string Section, string Classification, decimal PeriodMovement, string? CurrencyCode, DateOnly? LatestRateDate);
public sealed record StatutoryCashFlowWarning(string Code, string Message, IReadOnlyList<StatutoryCashFlowWarningAccount> Accounts);
public sealed record StatutoryCashFlowStatement(StatutoryCashFlowOperating Operating, StatutoryCashFlowActivity Investing, StatutoryCashFlowActivity Financing,
    decimal EffectOfExchangeRateChanges, decimal NetChangeInCash, StatutoryCashFlowReconciliation Reconciliation,
    IReadOnlyList<StatutoryCashFlowCashAccount> CashAccounts, IReadOnlyList<StatutoryCashFlowNonCashEntry> NonCashInvestingFinancingEntries,
    IReadOnlyList<StatutoryCashFlowWarning> Warnings);

public static class StatutoryCashFlowCalculator
{
    public const decimal ReconciliationTolerance = 0.005m;

    private enum Activity { None, Investing, Financing }

    /// <summary>
    /// Calculates the statement. <paramref name="lines"/> must contain every posting on
    /// or before <paramref name="end"/> (opening cash needs the history before
    /// <paramref name="start"/>). Amounts are journal base-currency postings; nothing
    /// is converted here. <paramref name="latestRateDates"/> only drives the warning for
    /// foreign-currency cash accounts without a tenant rate on or before the end date.
    /// </summary>
    public static StatutoryCashFlowStatement Calculate(DateOnly start, DateOnly end, string baseCurrency,
        IReadOnlyCollection<StatutoryCashFlowAccount> accounts, IReadOnlyDictionary<Guid, CashFlowStatementClassification> classifications,
        IReadOnlyCollection<StatutoryCashFlowLine> lines, IReadOnlyDictionary<string, DateOnly> latestRateDates)
    {
        var accountById = accounts.ToDictionary(x => x.Id);
        CashFlowStatementClassification ClassOf(Guid accountId) => classifications.TryGetValue(accountId, out var value) ? value : CashFlowStatementClassification.Unclassified;
        bool IsCash(Guid accountId) => ClassOf(accountId) == CashFlowStatementClassification.CashEquivalent && accountById.TryGetValue(accountId, out var a) && a.Section == LedgerAccountStatementSection.Asset;
        bool IsProfitLoss(Guid accountId) => accountById.TryGetValue(accountId, out var a) && a.Section is LedgerAccountStatementSection.Revenue or LedgerAccountStatementSection.Expense;

        var periodLines = lines.Where(x => x.EntryDate >= start && x.EntryDate <= end).ToList();

        // Cash and cash equivalents from the ledger.
        var cashAccounts = accounts.Where(x => IsCash(x.Id)).OrderBy(x => x.Code, StringComparer.Ordinal).Select(account =>
        {
            var opening = lines.Where(x => x.AccountId == account.Id && x.EntryDate < start).Sum(x => x.Debit - x.Credit);
            var closing = lines.Where(x => x.AccountId == account.Id).Sum(x => x.Debit - x.Credit);
            return new StatutoryCashFlowCashAccount(account.Id, account.Code, account.Name, account.CurrencyCode, opening, closing);
        }).ToList();
        var openingCash = cashAccounts.Sum(x => x.OpeningBalance);
        var closingCash = cashAccounts.Sum(x => x.ClosingBalance);

        // Per-entry analysis of cash entries for investing, financing and FX effect.
        var investing = new Dictionary<Guid, (decimal Inflows, decimal Outflows)>();
        var financing = new Dictionary<Guid, (decimal Inflows, decimal Outflows)>();
        var exchangeDifferenceInCash = new Dictionary<Guid, decimal>();
        var excludedInCashEntries = new Dictionary<Guid, decimal>();
        var nonCashEntries = new List<StatutoryCashFlowNonCashEntry>();
        static void AddFlow(Dictionary<Guid, (decimal Inflows, decimal Outflows)> target, Guid accountId, decimal amount)
        {
            if (amount == 0m) return;
            var current = target.GetValueOrDefault(accountId);
            target[accountId] = amount > 0m ? (current.Inflows + amount, current.Outflows) : (current.Inflows, current.Outflows - amount);
        }
        Activity ActivityOf(Guid accountId) => ClassOf(accountId) switch
        {
            CashFlowStatementClassification.InvestingAsset or CashFlowStatementClassification.InvestingLiability
                or CashFlowStatementClassification.InvestingGain or CashFlowStatementClassification.InvestingLoss => Activity.Investing,
            CashFlowStatementClassification.FinancingLiability or CashFlowStatementClassification.FinancingEquity
                or CashFlowStatementClassification.FinancingGain or CashFlowStatementClassification.FinancingLoss => Activity.Financing,
            _ => Activity.None
        };
        foreach (var entry in periodLines.GroupBy(x => x.EntryId))
        {
            var entryLines = entry.ToList();
            var counterparts = entryLines.Where(x => !IsCash(x.AccountId)).GroupBy(x => x.AccountId)
                .Select(g => (AccountId: g.Key, CashEffect: g.Sum(x => x.Credit - x.Debit))).Where(x => x.CashEffect != 0m).ToList();
            var hasCash = entryLines.Any(x => IsCash(x.AccountId));
            if (!hasCash)
            {
                // TMS 7.43: investing/financing transactions without cash are disclosed, not presented.
                // Entries whose only other side is a non-cash or reclassified P&L item (depreciation,
                // interest accrual, disposal gain/loss) are adjustments, not separate transactions.
                var activityLines = counterparts.Where(x => !IsProfitLoss(x.AccountId) && ActivityOf(x.AccountId) != Activity.None).ToList();
                var otherSide = counterparts.Where(x => !activityLines.Contains(x) && !(IsProfitLoss(x.AccountId) && ClassOf(x.AccountId) is
                    CashFlowStatementClassification.NonCashExpense or CashFlowStatementClassification.NonCashIncome or
                    CashFlowStatementClassification.InvestingGain or CashFlowStatementClassification.InvestingLoss or
                    CashFlowStatementClassification.FinancingGain or CashFlowStatementClassification.FinancingLoss)).ToList();
                if (activityLines.Count > 0 && (otherSide.Count > 0 || activityLines.Select(x => ActivityOf(x.AccountId)).Distinct().Count() > 1))
                {
                    var first = entryLines[0];
                    nonCashEntries.Add(new StatutoryCashFlowNonCashEntry(first.EntryId, first.EntryCode, first.EntryDate,
                        counterparts.Select(x => accountById.TryGetValue(x.AccountId, out var a) ? a.Code : x.AccountId.ToString())
                            .OrderBy(x => x, StringComparer.Ordinal).ToArray()));
                }
                continue;
            }
            foreach (var activity in new[] { Activity.Investing, Activity.Financing })
            {
                var target = activity == Activity.Investing ? investing : financing;
                var sectionLines = counterparts.Where(x => ActivityOf(x.AccountId) == activity).ToList();
                if (sectionLines.Count == 0) continue;
                var balanceSheetLines = sectionLines.Where(x => !IsProfitLoss(x.AccountId)).ToList();
                if (balanceSheetLines.Count == 0)
                {
                    foreach (var line in sectionLines) AddFlow(target, line.AccountId, line.CashEffect);
                    continue;
                }
                // Gross receipts/payments per entry: balance-sheet lines (and, for investing, the
                // disposal gain/loss that forms part of the proceeds) are presented under the lead
                // account; financing P&L items such as interest stay on their own disclosure line.
                var lead = balanceSheetLines.OrderByDescending(x => decimal.Abs(x.CashEffect))
                    .ThenBy(x => accountById.TryGetValue(x.AccountId, out var a) ? a.Code : "", StringComparer.Ordinal).First().AccountId;
                var folded = sectionLines.Where(x => !IsProfitLoss(x.AccountId) || activity == Activity.Investing).Sum(x => x.CashEffect);
                AddFlow(target, lead, folded);
                if (activity == Activity.Financing)
                    foreach (var line in sectionLines.Where(x => IsProfitLoss(x.AccountId))) AddFlow(target, line.AccountId, line.CashEffect);
            }
            foreach (var line in counterparts)
            {
                var classification = ClassOf(line.AccountId);
                if (classification == CashFlowStatementClassification.ExchangeDifference && IsProfitLoss(line.AccountId))
                    exchangeDifferenceInCash[line.AccountId] = exchangeDifferenceInCash.GetValueOrDefault(line.AccountId) + line.CashEffect;
                else if (classification == CashFlowStatementClassification.Excluded)
                    excludedInCashEntries[line.AccountId] = excludedInCashEntries.GetValueOrDefault(line.AccountId) + line.CashEffect;
            }
        }

        // Operating activities, indirect method.
        var periodByAccount = periodLines.GroupBy(x => x.AccountId).ToDictionary(g => g.Key, g => (Debit: g.Sum(x => x.Debit), Credit: g.Sum(x => x.Credit)));
        decimal Period(Guid accountId) { var p = periodByAccount.GetValueOrDefault(accountId); return p.Credit - p.Debit; }
        var orderedAccounts = accounts.OrderBy(x => x.Code, StringComparer.Ordinal).ToList();
        var netProfitLoss = orderedAccounts.Where(x => IsProfitLoss(x.Id)).Sum(x => Period(x.Id));
        var adjustments = new List<StatutoryCashFlowAmountLine>();
        var workingCapital = new List<StatutoryCashFlowAmountLine>();
        var unclassified = new List<StatutoryCashFlowWarningAccount>();
        var misclassified = new List<StatutoryCashFlowWarningAccount>();
        foreach (var account in orderedAccounts)
        {
            var hasMovement = periodByAccount.ContainsKey(account.Id);
            if (!hasMovement) continue;
            var classification = ClassOf(account.Id);
            var resultEffect = Period(account.Id); // credit − debit: income/liability increase is positive
            var warning = new StatutoryCashFlowWarningAccount(account.Id, account.Code, account.Name, account.Section.ToString(), classification.ToString(),
                -resultEffect, account.CurrencyCode, null);
            if (account.Section == LedgerAccountStatementSection.Unclassified || classification == CashFlowStatementClassification.Unclassified)
            {
                unclassified.Add(warning);
                continue;
            }
            if (!FinancialStatementEndpoints.CashFlowClassificationFits(classification, account.Section)) { misclassified.Add(warning); continue; }
            var adjustment = IsProfitLoss(account.Id) ? classification switch
            {
                CashFlowStatementClassification.NonCashExpense or CashFlowStatementClassification.NonCashIncome
                    or CashFlowStatementClassification.InvestingGain or CashFlowStatementClassification.InvestingLoss
                    or CashFlowStatementClassification.FinancingGain or CashFlowStatementClassification.FinancingLoss => -resultEffect,
                CashFlowStatementClassification.ExchangeDifference => -exchangeDifferenceInCash.GetValueOrDefault(account.Id),
                _ => 0m
            } : 0m;
            if (adjustment != 0m) adjustments.Add(new StatutoryCashFlowAmountLine(account.Id, account.Code, account.Name, classification.ToString(), adjustment));
            if (classification is CashFlowStatementClassification.WorkingCapitalAsset or CashFlowStatementClassification.WorkingCapitalLiability && resultEffect != 0m)
                workingCapital.Add(new StatutoryCashFlowAmountLine(account.Id, account.Code, account.Name, classification.ToString(), resultEffect));
        }
        var adjustmentsTotal = adjustments.Sum(x => x.Amount);
        var workingCapitalTotal = workingCapital.Sum(x => x.Amount);
        var operating = new StatutoryCashFlowOperating(netProfitLoss, adjustments, adjustmentsTotal, workingCapital, workingCapitalTotal,
            netProfitLoss + adjustmentsTotal + workingCapitalTotal);

        StatutoryCashFlowActivity BuildActivity(Dictionary<Guid, (decimal Inflows, decimal Outflows)> flows)
        {
            var activityLines = flows.Select(x =>
            {
                var account = accountById[x.Key];
                return new StatutoryCashFlowActivityLine(account.Id, account.Code, account.Name, ClassOf(account.Id).ToString(),
                    x.Value.Inflows, x.Value.Outflows, x.Value.Inflows - x.Value.Outflows);
            }).OrderBy(x => x.Code, StringComparer.Ordinal).ToList();
            return new StatutoryCashFlowActivity(activityLines, activityLines.Sum(x => x.Inflows), activityLines.Sum(x => x.Outflows), activityLines.Sum(x => x.NetCashFlow));
        }
        var investingActivity = BuildActivity(investing);
        var financingActivity = BuildActivity(financing);
        var fxEffect = exchangeDifferenceInCash.Values.Sum();
        var netChange = operating.NetCashFlow + investingActivity.NetCashFlow + financingActivity.NetCashFlow + fxEffect;
        var expectedClosing = openingCash + netChange;
        var difference = closingCash - expectedClosing;
        var reconciliation = new StatutoryCashFlowReconciliation(openingCash, netChange, expectedClosing, closingCash, difference,
            decimal.Abs(difference) <= ReconciliationTolerance);

        var warnings = new List<StatutoryCashFlowWarning>();
        if (cashAccounts.Count == 0)
            warnings.Add(new StatutoryCashFlowWarning("NoCashEquivalentAccounts",
                "Nakit ve nakit benzeri olarak sınıflandırılmış hesap yok; dönem başı ve sonu nakit hesaplanamaz.", []));
        if (unclassified.Count > 0)
            warnings.Add(new StatutoryCashFlowWarning("UnclassifiedAccounts",
                "Dönem hareketi olan hesaplar TMS 7 sınıflandırması olmadan raporlandı: bilanço hesapları hiçbir faaliyete alınmadı, gelir/gider hesapları yalnızca dönem kârında kaldı.", unclassified));
        if (misclassified.Count > 0)
            warnings.Add(new StatutoryCashFlowWarning("IncompatibleClassification",
                "Hesap sınıflandırması defter sınıfıyla uyumlu değil; hesap tabloya dahil edilmedi.", misclassified));
        if (excludedInCashEntries.Count > 0)
            warnings.Add(new StatutoryCashFlowWarning("ExcludedAccountInCashEntry",
                "Kapsam dışı işaretlenen hesaplar nakit hareketi içeren fişlerde kullanılmış; bu nakit akışı hiçbir faaliyete atanmadı.",
                excludedInCashEntries.Select(x => { var a = accountById[x.Key];
                    return new StatutoryCashFlowWarningAccount(a.Id, a.Code, a.Name, a.Section.ToString(), ClassOf(a.Id).ToString(), x.Value, a.CurrencyCode, null); })
                    .OrderBy(x => x.Code, StringComparer.Ordinal).ToList()));
        var missingRates = cashAccounts.Where(x => x.CurrencyCode is not null && !x.CurrencyCode.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase)
                && (x.OpeningBalance != 0m || x.ClosingBalance != 0m) && !latestRateDates.ContainsKey(x.CurrencyCode.ToUpperInvariant()))
            .Select(x => { var a = accountById[x.AccountId];
                return new StatutoryCashFlowWarningAccount(a.Id, a.Code, a.Name, a.Section.ToString(), ClassOf(a.Id).ToString(), x.ClosingBalance - x.OpeningBalance, a.CurrencyCode, null); })
            .ToList();
        if (missingRates.Count > 0)
            warnings.Add(new StatutoryCashFlowWarning("ForeignCurrencyRateMissing",
                "Yabancı para nakit hesabı için dönem sonuna kadar firma kuru yok; defterdeki baz para tutarı değerlemesiz kullanıldı ve kur etkisi doğrulanamadı.", missingRates));
        if (!reconciliation.Reconciles)
            warnings.Add(new StatutoryCashFlowWarning("ReconciliationDifference",
                "Dönem başı nakit + net nakit değişimi dönem sonu nakit ile eşleşmiyor; hesap sınıflandırmalarını kontrol edin.", []));

        return new StatutoryCashFlowStatement(operating, investingActivity, financingActivity, fxEffect, netChange, reconciliation,
            cashAccounts, nonCashEntries.OrderBy(x => x.EntryDate).ThenBy(x => x.EntryCode, StringComparer.Ordinal).ToList(), warnings);
    }
}
