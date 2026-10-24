using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

public static class FinancialStatementEndpoints
{
    public static RouteGroupBuilder MapBalanceSheetEndpoint(this RouteGroupBuilder group)
    {
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
}
