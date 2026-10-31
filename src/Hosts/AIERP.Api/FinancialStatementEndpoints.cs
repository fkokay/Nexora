using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

public static class FinancialStatementEndpoints
{
    private const string CashFlowClassificationPrefix = "financial-statement.cash-flow-classification:";

    public static RouteGroupBuilder MapBalanceSheetEndpoint(this RouteGroupBuilder group)
    {
        group.MapGet("/financial-statements/tms7/cash-flow-classifications", async (ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var rows = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId && x.MappingKey.StartsWith(CashFlowClassificationPrefix))
                .Select(x => new { x.MappingKey, x.AccountId }).ToListAsync();
            var classes = rows.Select(x => (x.AccountId, Classification: ParseCashFlowClassification(x.MappingKey)))
                .Where(x => x.Classification is not null).GroupBy(x => x.AccountId).ToDictionary(x => x.Key, x => x.Last().Classification!.Value);
            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Code)
                .Select(x => new { x.Id, x.Code, x.Name, StatementSection = x.StatementSection.ToString(), x.IsActive }).ToListAsync();
            return Results.Ok(accounts.Select(x => new { x.Id, x.Code, x.Name, x.StatementSection, x.IsActive,
                classification = classes.TryGetValue(x.Id, out var classification) ? classification.ToString() : CashFlowStatementClassification.Unclassified.ToString() }));
        });
        group.MapPut("/financial-statements/tms7/cash-flow-classifications/{accountId:guid}", async (Guid accountId,
            CashFlowStatementClassificationWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            if (!Enum.TryParse<CashFlowStatementClassification>(request.Classification, true, out var classification) || !Enum.IsDefined(classification))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["classification"] = ["Geçerli bir TMS 7 hesap sınıflandırması seçin."] });
            var account = await db.LedgerAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == accountId);
            if (account is null) return Results.NotFound();
            if (!CashFlowClassificationFits(classification, account.StatementSection))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["classification"] = ["Seçilen sınıflandırma hesap türüyle uyumlu değil."] });
            var existing = await db.LedgerAccountMappings.Where(x => x.TenantId == tenantId && x.MappingKey.StartsWith(CashFlowClassificationPrefix) && x.AccountId == accountId).ToListAsync();
            db.LedgerAccountMappings.RemoveRange(existing);
            if (classification != CashFlowStatementClassification.Unclassified)
                db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = tenantId,
                    MappingKey = CashFlowClassificationKey(accountId, classification), AccountId = accountId });
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId,
                UserId = Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub"), out var userId) ? userId : null,
                Action = "finance.general-ledger.tms7-cash-flow-classification-updated", Resource = $"{account.Code}:{classification}" });
            await db.SaveChangesAsync();
            return Results.Ok(new { accountId, classification = classification.ToString() });
        });
        group.MapGet("/financial-statements/tms7/cash-flow", async (DateOnly? from, DateOnly? to, string? method, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var selectedMethod = string.IsNullOrWhiteSpace(method) ? "Indirect" : method.Trim();
            if (!selectedMethod.Equals("Indirect", StringComparison.OrdinalIgnoreCase) &&
                !selectedMethod.Equals("Direct", StringComparison.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["method"] = ["Yöntem Direct veya Indirect olmalıdır."] });
            selectedMethod = selectedMethod.Equals("Direct", StringComparison.OrdinalIgnoreCase) ? "Direct" : "Indirect";
            var start = from ?? new DateOnly(DateTime.UtcNow.Year, 1, 1);
            var end = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            if (start > end || end.DayNumber - start.DayNumber > 365)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["dateRange"] = ["Tarih aralığı sıralı olmalı ve en fazla 366 takvim günü kapsamalıdır."] });
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
            if (baseCurrency is null) return Results.Forbid();

            var accountRows = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
                .Select(x => new { x.Id, x.Code, x.Name, x.IsActive, x.StatementSection }).ToListAsync();
            var mappingRows = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId && x.MappingKey.StartsWith(CashFlowClassificationPrefix))
                .Select(x => new { x.MappingKey, x.AccountId }).ToListAsync();
            var classificationByAccount = mappingRows.Select(x => (x.AccountId, Classification: ParseCashFlowClassification(x.MappingKey)))
                .Where(x => x.Classification is not null).GroupBy(x => x.AccountId).ToDictionary(x => x.Key, x => x.Last().Classification!.Value);

            var openingBalances = await (from entry in db.JournalEntries.AsNoTracking()
                join line in db.JournalEntryLines.AsNoTracking() on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                where entry.TenantId == tenantId && entry.EntryDate < start
                group line by line.AccountId into g select new { AccountId = g.Key, Balance = g.Sum(x => x.Debit - x.Credit) }).ToDictionaryAsync(x => x.AccountId, x => x.Balance);
            var closingBalances = await (from entry in db.JournalEntries.AsNoTracking()
                join line in db.JournalEntryLines.AsNoTracking() on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                where entry.TenantId == tenantId && entry.EntryDate <= end
                group line by line.AccountId into g select new { AccountId = g.Key, Balance = g.Sum(x => x.Debit - x.Credit) }).ToDictionaryAsync(x => x.AccountId, x => x.Balance);
            var periodBalances = await (from entry in db.JournalEntries.AsNoTracking()
                join line in db.JournalEntryLines.AsNoTracking() on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                where entry.TenantId == tenantId && entry.EntryDate >= start && entry.EntryDate <= end
                group line by line.AccountId into g select new { AccountId = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) }).ToDictionaryAsync(x => x.AccountId);

            decimal ProfitLoss(LedgerAccountStatementSection section, decimal debit, decimal credit) => section == LedgerAccountStatementSection.Revenue ? credit - debit : debit - credit;
            var netProfitLoss = accountRows.Where(x => x.StatementSection is LedgerAccountStatementSection.Revenue or LedgerAccountStatementSection.Expense)
                .Sum(x => { periodBalances.TryGetValue(x.Id, out var p); return ProfitLoss(x.StatementSection, p?.Debit ?? 0m, p?.Credit ?? 0m); });
            decimal nonCashAdjustments = 0m, workingCapitalChanges = 0m, investingFinancingPnlAdjustments = 0m;
            var pAndLUnclassified = 0;
            foreach (var account in accountRows.Where(x => x.StatementSection is LedgerAccountStatementSection.Revenue or LedgerAccountStatementSection.Expense))
            {
                periodBalances.TryGetValue(account.Id, out var period);
                var amount = ProfitLoss(account.StatementSection, period?.Debit ?? 0m, period?.Credit ?? 0m);
                if (amount == 0m) continue;
                if (!classificationByAccount.TryGetValue(account.Id, out var classification)) { pAndLUnclassified++; continue; }
                switch (classification)
                {
                    case CashFlowStatementClassification.NonCashExpense: nonCashAdjustments += amount; break;
                    case CashFlowStatementClassification.NonCashIncome: nonCashAdjustments -= amount; break;
                    case CashFlowStatementClassification.InvestingGain: investingFinancingPnlAdjustments -= amount; break;
                    case CashFlowStatementClassification.InvestingLoss: investingFinancingPnlAdjustments += amount; break;
                    case CashFlowStatementClassification.FinancingGain: investingFinancingPnlAdjustments -= amount; break;
                    case CashFlowStatementClassification.FinancingLoss: investingFinancingPnlAdjustments += amount; break;
                    case CashFlowStatementClassification.ProfitLossBase: break;
                    default: pAndLUnclassified++; break;
                }
            }
            var unclassifiedBalanceAccounts = new List<string>();
            decimal openingCash = 0m, closingCash = 0m;
            foreach (var account in accountRows)
            {
                openingBalances.TryGetValue(account.Id, out var openingRaw); closingBalances.TryGetValue(account.Id, out var closingRaw);
                periodBalances.TryGetValue(account.Id, out var period);
                var changed = openingRaw != 0m || closingRaw != 0m || period is not null;
                if (!changed || account.StatementSection is LedgerAccountStatementSection.Revenue or LedgerAccountStatementSection.Expense) continue;
                if (!classificationByAccount.TryGetValue(account.Id, out var classification))
                { unclassifiedBalanceAccounts.Add(account.Code); continue; }
                var openingNormal = account.StatementSection is LedgerAccountStatementSection.Asset ? openingRaw : -openingRaw;
                var closingNormal = account.StatementSection is LedgerAccountStatementSection.Asset ? closingRaw : -closingRaw;
                switch (classification)
                {
                    case CashFlowStatementClassification.CashEquivalent:
                        openingCash += openingNormal; closingCash += closingNormal; break;
                    case CashFlowStatementClassification.WorkingCapitalAsset: workingCapitalChanges += openingNormal - closingNormal; break;
                    case CashFlowStatementClassification.WorkingCapitalLiability: workingCapitalChanges += closingNormal - openingNormal; break;
                    case CashFlowStatementClassification.Excluded: break;
                    default: unclassifiedBalanceAccounts.Add(account.Code); break;
                }
            }
            var movements = await db.FinancialAccountTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.TransactionDate >= start && x.TransactionDate <= end)
                .GroupBy(x => new { x.CurrencyCode, x.TransactionDate, x.CashFlowCategory, x.Direction })
                .Select(g => new { g.Key.CurrencyCode, g.Key.TransactionDate, g.Key.CashFlowCategory, g.Key.Direction, Amount = g.Sum(x => x.Amount), Count = g.Count() }).ToListAsync();
            var currencies = movements.Select(x => x.CurrencyCode).Distinct().Where(x => x != baseCurrency).ToArray();
            var rates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && currencies.Contains(x.CurrencyCode) && x.RateDate <= end)
                .OrderBy(x => x.RateDate).Select(x => new { x.CurrencyCode, x.RateDate, x.Rate }).ToListAsync();
            decimal investing = 0m, financing = 0m, directOperating = 0m, directOperatingInflows = 0m, directOperatingOutflows = 0m;
            var unclassifiedMovementCount = 0; var missingFlowRateCount = 0; var openingAdjustmentCount = 0;
            foreach (var movement in movements)
            {
                var rate = movement.CurrencyCode == baseCurrency ? 1m : rates.Where(x => x.CurrencyCode == movement.CurrencyCode && x.RateDate <= movement.TransactionDate)
                    .OrderByDescending(x => x.RateDate).Select(x => (decimal?)x.Rate).FirstOrDefault();
                if (rate is null) { missingFlowRateCount += movement.Count; continue; }
                var signed = (movement.Direction == FinancialDirection.Inflow ? 1m : -1m) * movement.Amount * rate.Value;
                switch (movement.CashFlowCategory)
                {
                    case CashFlowCategory.Operating:
                        directOperating += signed;
                        if (movement.Direction == FinancialDirection.Inflow) directOperatingInflows += movement.Amount * rate.Value;
                        else directOperatingOutflows += movement.Amount * rate.Value;
                        break;
                    case CashFlowCategory.Investing: investing += signed; break;
                    case CashFlowCategory.Financing: financing += signed; break;
                    case CashFlowCategory.InternalTransfer: break;
                    case CashFlowCategory.OpeningBalance: openingAdjustmentCount += movement.Count; break;
                    default: unclassifiedMovementCount += movement.Count; break;
                }
            }
            var indirectOperating = netProfitLoss + nonCashAdjustments + workingCapitalChanges + investingFinancingPnlAdjustments;
            var operating = selectedMethod == "Direct" ? directOperating : indirectOperating;
            var cashMovement = closingCash - openingCash;
            var netClassifiedFlows = operating + investing + financing;
            var reconciliationDifference = cashMovement - netClassifiedFlows;
            var operatingMethodDifference = operating - directOperating;
            var complete = unclassifiedBalanceAccounts.Count == 0 && pAndLUnclassified == 0 && unclassifiedMovementCount == 0 &&
                missingFlowRateCount == 0 && openingAdjustmentCount == 0 && decimal.Abs(reconciliationDifference) <= 0.01m && decimal.Abs(operatingMethodDifference) <= 0.01m;
            return Results.Ok(new { standard = "TMS 7", method = selectedMethod, from = start, to = end, baseCurrencyCode = baseCurrency,
                openingCashAndCashEquivalents = openingCash, closingCashAndCashEquivalents = closingCash,
                operating = new { netProfitLoss, nonCashAdjustments, workingCapitalChanges, investingFinancingPnlAdjustments, netCashFlow = operating,
                    indirectMethodCashFlow = indirectOperating, directOperatingCashFlowComparison = directOperating,
                    directOperatingInflows, directOperatingOutflows, methodDifference = operatingMethodDifference },
                investing = new { netCashFlow = investing }, financing = new { netCashFlow = financing },
                reconciliation = new { netChangeInCash = cashMovement, classifiedCashFlows = netClassifiedFlows, difference = reconciliationDifference },
                unclassifiedMovementCount, missingFlowRateCount, openingAdjustmentCount, pAndLUnclassifiedAccountCount = pAndLUnclassified,
                unclassifiedBalanceAccounts, isComplete = complete, certified = false,
                note = "Taslak TMS 7 raporudur; firma hesap sınıflandırmaları ve mutabakatı tamamlanmadan finansal tablo olarak kullanılmamalıdır." });
        });
        group.MapGet("/financial-statements/cash-flow", async (DateOnly? from, DateOnly? to, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var start = from ?? new DateOnly(DateTime.UtcNow.Year, 1, 1);
            var end = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            if (start > end) return Results.BadRequest(new { error = "Başlangıç tarihi bitiş tarihinden sonra olamaz." });
            var tenantExists = await db.Tenants.AsNoTracking().AnyAsync(x => x.Id == tenantId);
            if (!tenantExists) return Results.Forbid();
            var accountTransactions = db.FinancialAccountTransactions.AsNoTracking().Where(x => x.TenantId == tenantId);
            var opening = await accountTransactions.Where(x => x.TransactionDate < start)
                .GroupBy(x => x.CurrencyCode)
                .Select(g => new { CurrencyCode = g.Key, Amount = g.Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount) })
                .ToDictionaryAsync(x => x.CurrencyCode, x => x.Amount);
            var periodGroups = await accountTransactions.Where(x => x.TransactionDate >= start && x.TransactionDate <= end)
                .GroupBy(x => new { x.CurrencyCode, x.CashFlowCategory, x.Direction })
                .Select(g => new { g.Key.CurrencyCode, g.Key.CashFlowCategory, g.Key.Direction, Amount = g.Sum(x => x.Amount), Count = g.Count() })
                .ToListAsync();
            var closing = await accountTransactions.Where(x => x.TransactionDate <= end)
                .GroupBy(x => x.CurrencyCode)
                .Select(g => new { CurrencyCode = g.Key, Amount = g.Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount) })
                .ToDictionaryAsync(x => x.CurrencyCode, x => x.Amount);
            var currencies = opening.Keys.Concat(closing.Keys).Concat(periodGroups.Select(x => x.CurrencyCode))
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x, StringComparer.OrdinalIgnoreCase).Select(currency =>
                {
                    decimal Net(CashFlowCategory category) => periodGroups.Where(x => x.CurrencyCode == currency && x.CashFlowCategory == category)
                        .Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount);
                    var operating = Net(CashFlowCategory.Operating);
                    var investing = Net(CashFlowCategory.Investing);
                    var financing = Net(CashFlowCategory.Financing);
                    var internalTransfers = Net(CashFlowCategory.InternalTransfer);
                    var unclassified = Net(CashFlowCategory.Unclassified);
                    var openingAdjustments = Net(CashFlowCategory.OpeningBalance);
                    var netChange = operating + investing + financing + internalTransfers + unclassified + openingAdjustments;
                    opening.TryGetValue(currency, out var openingBalance);
                    closing.TryGetValue(currency, out var closingBalance);
                    return new { currencyCode = currency, openingBalance, operating, investing, financing, internalTransfers,
                        unclassified, openingAdjustments, netChange, closingBalance, reconciles = openingBalance + netChange == closingBalance };
                }).ToList();
            var unclassifiedCount = periodGroups.Where(x => x.CashFlowCategory == CashFlowCategory.Unclassified).Sum(x => x.Count);
            return Results.Ok(new { from = start, to = end, currencies, unclassifiedMovementCount = unclassifiedCount,
                isComplete = unclassifiedCount == 0, basis = "CashAndBankMovements", statutory = false });
        });
        group.MapGet("/financial-statements/income-statement", async (DateOnly? from, DateOnly? to, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var start = from ?? new DateOnly(DateTime.UtcNow.Year, 1, 1);
            var end = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            if (start > end) return Results.BadRequest(new { error = "Başlangıç tarihi bitiş tarihinden sonra olamaz." });
            var baseCurrencyCode = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
                .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
            if (baseCurrencyCode is null) return Results.Forbid();
            var amounts = await (from entry in db.JournalEntries.AsNoTracking()
                                 join line in db.JournalEntryLines.AsNoTracking()
                                   on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                                 where entry.TenantId == tenantId && entry.EntryDate >= start && entry.EntryDate <= end
                                 group line by line.AccountId into grouped
                                 select new { AccountId = grouped.Key, Debit = grouped.Sum(x => x.Debit), Credit = grouped.Sum(x => x.Credit) })
                .ToDictionaryAsync(x => x.AccountId);
            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId
                    && (x.StatementSection == LedgerAccountStatementSection.Revenue || x.StatementSection == LedgerAccountStatementSection.Expense))
                .OrderBy(x => x.StatementSection).ThenBy(x => x.Code)
                .Select(x => new { x.Id, x.Code, x.Name, x.IsActive, x.StatementSection }).ToListAsync();
            var rows = accounts.Select(account =>
            {
                amounts.TryGetValue(account.Id, out var amount);
                var debit = amount?.Debit ?? 0m;
                var credit = amount?.Credit ?? 0m;
                var balance = account.StatementSection == LedgerAccountStatementSection.Revenue ? credit - debit : debit - credit;
                return new { accountId = account.Id, account.Code, account.Name, account.IsActive,
                    statementSection = account.StatementSection.ToString(), debit, credit, balance };
            }).ToList();
            var revenue = rows.Where(row => row.statementSection == LedgerAccountStatementSection.Revenue.ToString()).Sum(row => row.balance);
            var expenses = rows.Where(row => row.statementSection == LedgerAccountStatementSection.Expense.ToString()).Sum(row => row.balance);
            var unclassifiedMovementCount = await (from entry in db.JournalEntries.AsNoTracking()
                join line in db.JournalEntryLines.AsNoTracking() on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                join account in db.LedgerAccounts.AsNoTracking() on new { line.TenantId, line.AccountId } equals new { account.TenantId, AccountId = account.Id }
                where entry.TenantId == tenantId && entry.EntryDate >= start && entry.EntryDate <= end
                    && account.StatementSection == LedgerAccountStatementSection.Unclassified && (line.Debit != 0m || line.Credit != 0m)
                select account.Id).Distinct().CountAsync();
            return Results.Ok(new { from = start, to = end, baseCurrencyCode, accounts = rows,
                totals = new { revenue, expenses, netIncome = revenue - expenses },
                unclassifiedAccountCount = unclassifiedMovementCount, isComplete = unclassifiedMovementCount == 0 });
        });
        group.MapGet("/financial-statements/balance-sheet", async (DateOnly? asOfDate, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var date = asOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var baseCurrencyCode = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
                .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
            if (baseCurrencyCode is null) return Results.Forbid();
            var amounts = await (from entry in db.JournalEntries.AsNoTracking()
                                 join line in db.JournalEntryLines.AsNoTracking()
                                   on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                                 where entry.TenantId == tenantId && entry.EntryDate <= date
                                 group line by line.AccountId into grouped
                                 select new { AccountId = grouped.Key, Debit = grouped.Sum(x => x.Debit), Credit = grouped.Sum(x => x.Credit) })
                .ToDictionaryAsync(x => x.AccountId);
            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Code).Select(x => new { x.Id, x.Code, x.Name, x.IsActive, x.StatementSection }).ToListAsync();
            var rows = accounts.Select(account =>
            {
                amounts.TryGetValue(account.Id, out var amount);
                var debit = amount?.Debit ?? 0m;
                var credit = amount?.Credit ?? 0m;
                return new { accountId = account.Id, account.Code, account.Name, account.IsActive,
                    statementSection = account.StatementSection.ToString(), debit, credit, balance = debit - credit };
            }).ToList();
            decimal Total(LedgerAccountStatementSection section, bool creditNormal) => rows
                .Where(row => row.statementSection == section.ToString())
                .Sum(row => creditNormal ? -row.balance : row.balance);
            var assets = Total(LedgerAccountStatementSection.Asset, false);
            var liabilities = Total(LedgerAccountStatementSection.Liability, true);
            var equity = Total(LedgerAccountStatementSection.Equity, true);
            var revenue = Total(LedgerAccountStatementSection.Revenue, true);
            var expenses = Total(LedgerAccountStatementSection.Expense, false);
            var cumulativeResult = revenue - expenses;
            var liabilitiesAndEquity = liabilities + equity + cumulativeResult;
            var unclassified = rows.Where(row => row.statementSection == LedgerAccountStatementSection.Unclassified.ToString()
                && row.debit + row.credit != 0m).ToList();
            var difference = assets - liabilitiesAndEquity;
            return Results.Ok(new { asOfDate = date, baseCurrencyCode, accounts = rows,
                totals = new { assets, liabilities, equity, revenue, expenses, cumulativeResult, liabilitiesAndEquity, difference },
                unclassifiedAccountCount = unclassified.Count, unclassifiedAccounts = unclassified,
                isComplete = unclassified.Count == 0, isBalanced = unclassified.Count == 0 && difference == 0m });
        });
        return group;
    }

    private static CashFlowStatementClassification? ParseCashFlowClassification(string key)
    {
        if (!key.StartsWith(CashFlowClassificationPrefix, StringComparison.Ordinal)) return null;
        var parts = key[CashFlowClassificationPrefix.Length..].Split(':', 2);
        return parts.Length == 2 && Enum.TryParse<CashFlowStatementClassification>(parts[1], true, out var value) && Enum.IsDefined(value) ? value : null;
    }
    private static string CashFlowClassificationKey(Guid accountId, CashFlowStatementClassification classification) =>
        $"{CashFlowClassificationPrefix}{accountId:D}:{classification}";
    private static bool CashFlowClassificationFits(CashFlowStatementClassification classification, LedgerAccountStatementSection section) => classification switch
    {
        CashFlowStatementClassification.Unclassified => true,
        CashFlowStatementClassification.Excluded => section is LedgerAccountStatementSection.Asset or LedgerAccountStatementSection.Liability or LedgerAccountStatementSection.Equity or LedgerAccountStatementSection.Unclassified,
        CashFlowStatementClassification.CashEquivalent or CashFlowStatementClassification.WorkingCapitalAsset => section == LedgerAccountStatementSection.Asset,
        CashFlowStatementClassification.WorkingCapitalLiability => section == LedgerAccountStatementSection.Liability,
        CashFlowStatementClassification.ProfitLossBase or CashFlowStatementClassification.NonCashIncome or CashFlowStatementClassification.InvestingGain or CashFlowStatementClassification.FinancingGain => section == LedgerAccountStatementSection.Revenue,
        CashFlowStatementClassification.NonCashExpense or CashFlowStatementClassification.InvestingLoss or CashFlowStatementClassification.FinancingLoss => section == LedgerAccountStatementSection.Expense,
        _ => false
    };
}

public enum CashFlowStatementClassification { Unclassified = 0, CashEquivalent = 1, WorkingCapitalAsset = 2, WorkingCapitalLiability = 3, Excluded = 4,
    ProfitLossBase = 5, NonCashExpense = 6, NonCashIncome = 7, InvestingGain = 8, InvestingLoss = 9, FinancingGain = 10, FinancingLoss = 11 }
public sealed record CashFlowStatementClassificationWriteRequest(string Classification);
