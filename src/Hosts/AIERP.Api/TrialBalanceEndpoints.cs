using System.Security.Claims;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

public static class TrialBalanceEndpoints
{
    public static RouteGroupBuilder MapTrialBalanceEndpoint(this RouteGroupBuilder group)
    {
        group.MapGet("/trial-balance", async (DateOnly? from, DateOnly? to, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            if (from.HasValue && to.HasValue && from.Value > to.Value)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["dateRange"] = ["Başlangıç tarihi bitiş tarihinden sonra olamaz."] });

            var startDate = from;
            var endDate = to;
            var journalLines = from entry in db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId)
                               join line in db.JournalEntryLines.AsNoTracking() on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                               select new { entry.EntryDate, line.AccountId, line.Debit, line.Credit };
            var openingEntries = from line in journalLines where startDate.HasValue && line.EntryDate < startDate.Value select line;
            var openingTotals = await (from line in openingEntries
                                       group line by line.AccountId into grouped
                                       select new { AccountId = grouped.Key, Debit = grouped.Sum(x => x.Debit), Credit = grouped.Sum(x => x.Credit) })
                .ToDictionaryAsync(x => x.AccountId);
            var periodEntries = from line in journalLines
                                where (!startDate.HasValue || line.EntryDate >= startDate.Value) && (!endDate.HasValue || line.EntryDate <= endDate.Value)
                                select line;
            var periodTotals = await (from line in periodEntries
                                      group line by line.AccountId into grouped
                                      select new { AccountId = grouped.Key, Debit = grouped.Sum(x => x.Debit), Credit = grouped.Sum(x => x.Credit) })
                .ToDictionaryAsync(x => x.AccountId);
            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Code)
                .Select(x => new { x.Id, x.Code, x.Name, x.IsActive }).ToListAsync();
            var rows = accounts.Select(account =>
            {
                openingTotals.TryGetValue(account.Id, out var opening);
                periodTotals.TryGetValue(account.Id, out var period);
                var openingDebit = opening?.Debit ?? 0m;
                var openingCredit = opening?.Credit ?? 0m;
                var debit = period?.Debit ?? 0m;
                var credit = period?.Credit ?? 0m;
                var balance = openingDebit - openingCredit + debit - credit;
                return new { accountId = account.Id, account.Code, account.Name, account.IsActive, openingDebit, openingCredit, debit, credit,
                    balanceDebit = Math.Max(0m, balance), balanceCredit = Math.Max(0m, -balance) };
            }).ToList();
            var totalOpeningDebit = rows.Sum(x => x.openingDebit);
            var totalOpeningCredit = rows.Sum(x => x.openingCredit);
            var totalDebit = rows.Sum(x => x.debit);
            var totalCredit = rows.Sum(x => x.credit);
            var totalBalanceDebit = rows.Sum(x => x.balanceDebit);
            var totalBalanceCredit = rows.Sum(x => x.balanceCredit);
            return Results.Ok(new { from = startDate, to = endDate, accounts = rows, totalOpeningDebit, totalOpeningCredit, totalDebit, totalCredit,
                totalBalanceDebit, totalBalanceCredit, isBalanced = totalDebit == totalCredit && totalBalanceDebit == totalBalanceCredit });
        });
        return group;
    }
}
