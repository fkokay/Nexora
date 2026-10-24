using System.Security.Claims;
using System.Data;
using System.Security.Cryptography;
using System.Text;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

internal static class FiscalYearCloseEndpoints
{
    private const string CloseSource = "FiscalYearClose";
    private const string OpeningSource = "FiscalYearOpening";

    public static RouteGroupBuilder MapFiscalYearCloseEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/fiscal-year-close", CloseAsync).RequireAuthorization();
        return group;
    }

    public static async Task<(DateOnly FromDate, DateOnly ToDate)?> FindClosedPeriodAsync(
        TenantDbContext db, Guid tenantId, DateOnly entryDate, CancellationToken cancellationToken = default)
    {
        var codes = await db.JournalEntries.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SourceType == CloseSource)
            .Select(x => x.Code)
            .ToListAsync(cancellationToken);
        foreach (var code in codes)
            if (TryReadRange(code, out var from, out var to) && from <= entryDate && entryDate <= to)
                return (from, to);
        return null;
    }

    /// <summary>
    /// Acquires the same tenant-row lock used by fiscal-year close. Every journal posting must call
    /// this inside its write transaction before checking the date or creating ledger effects, so a
    /// close and a posting cannot both pass their checks concurrently.
    /// </summary>
    public static Task<bool> LockTenantForPostingAsync(
        TenantDbContext db, Guid tenantId, CancellationToken cancellationToken = default) => db.Database.IsRelational()
            ? db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}")
                .AnyAsync(cancellationToken)
            : db.Tenants.AnyAsync(x => x.Id == tenantId, cancellationToken);

    private static async Task<IResult> CloseAsync(FiscalYearCloseRequest request, ClaimsPrincipal principal, TenantDbContext db,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)
            || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();

        if (request.FromDate > request.ToDate || request.ToDate == DateOnly.MaxValue
            || request.ToDate.DayNumber - request.FromDate.DayNumber > 366)
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["dateRange"] = ["Kapanış aralığı sıralı olmalı, en fazla 367 gün sürmeli ve sonraki gün taşmamalıdır."]
            });

        var retainedEarnings = await db.LedgerAccounts.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.RetainedEarningsAccountId && x.IsActive, cancellationToken);
        if (retainedEarnings is null || retainedEarnings.StatementSection != LedgerAccountStatementSection.Equity)
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["retainedEarningsAccountId"] = ["Aynı firmaya ait etkin bir Özkaynak hesabı seçilmelidir."]
            });

        IDbContextTransaction? transaction = null;
        try
        {
            if (db.Database.IsRelational())
                transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var tenantExists = await LockTenantForPostingAsync(db, tenantId, cancellationToken);
            if (!tenantExists) return Results.NotFound();

            var rangeCode = RangeCode(request.FromDate, request.ToDate);
            var existingCloses = await db.JournalEntries.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.SourceType == CloseSource)
                .Select(x => x.Code).ToListAsync(cancellationToken);
            var laterClose = existingCloses.FirstOrDefault(code => TryReadRange(code, out var start, out _) && start > request.ToDate);
            if (laterClose is not null)
                return Results.Conflict(new { error = "Daha sonraki bir mali dönem zaten kapatılmış. Kapanışları kronolojik sırayla oluşturun veya önce sonraki dönemin kapanışını çözün.", code = laterClose });
            var overlappingCode = existingCloses.FirstOrDefault(code => TryReadRange(code, out var start, out var end)
                && request.FromDate <= end && start <= request.ToDate);
            if (overlappingCode is not null)
                return Results.Conflict(new { error = "Bu tarih aralığı veya aralıkla çakışan bir mali yıl daha önce kapatılmıştır.", code = overlappingCode });

            var sourceId = StableId($"close|{tenantId:N}|{rangeCode}");
            var openingSourceId = StableId($"opening|{tenantId:N}|{rangeCode}");
            if (await db.JournalEntries.AnyAsync(x => x.TenantId == tenantId &&
                    ((x.SourceType == CloseSource && x.SourceId == sourceId) || (x.SourceType == OpeningSource && x.SourceId == openingSourceId)), cancellationToken))
                return Results.Conflict(new { error = "Bu mali yılın kapanış/açılış fişleri zaten oluşturulmuş." });

            var balances = await (from entry in db.JournalEntries.AsNoTracking()
                                  join line in db.JournalEntryLines.AsNoTracking()
                                      on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                                  where entry.TenantId == tenantId && entry.EntryDate <= request.ToDate
                                  group line by line.AccountId into accountLines
                                  select new AccountNetBalance(accountLines.Key,
                                      accountLines.Sum(line => line.Debit - line.Credit)))
                .ToDictionaryAsync(x => x.AccountId, x => x.Net, cancellationToken);
            if (balances.Count == 0 || balances.All(x => x.Value == 0m))
                return Results.Conflict(new { error = "Kapanış için devredilecek bir yevmiye bakiyesi bulunamadı." });

            var existingJournalIsBalanced = await (from entry in db.JournalEntries.AsNoTracking()
                                                    join line in db.JournalEntryLines.AsNoTracking()
                                                        on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                                                    where entry.TenantId == tenantId && entry.EntryDate <= request.ToDate
                                                    group line by entry.Id into entryLines
                                                    select entryLines.Sum(line => line.Debit - line.Credit))
                .AllAsync(net => net == 0m, cancellationToken);
            if (!existingJournalIsBalanced)
                return Results.Conflict(new { error = "Kapanış aralığından önceki yevmiye hareketlerinde dengelenmemiş fiş var." });

            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
                .ToDictionaryAsync(x => x.Id, cancellationToken);
            if (balances.Keys.Any(id => !accounts.ContainsKey(id))) return Results.Conflict(new { error = "Firma hesabı bulunamayan yevmiye satırı var." });

            var priorProfitAndLoss = await (from entry in db.JournalEntries.AsNoTracking()
                                             join line in db.JournalEntryLines.AsNoTracking()
                                                 on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                                             join account in db.LedgerAccounts.AsNoTracking()
                                                 on new { line.TenantId, AccountId = line.AccountId } equals new { account.TenantId, AccountId = account.Id }
                                             where entry.TenantId == tenantId && entry.EntryDate < request.FromDate
                                                 && (account.StatementSection == LedgerAccountStatementSection.Revenue
                                                     || account.StatementSection == LedgerAccountStatementSection.Expense)
                                             group line by line.AccountId into accountLines
                                             select new AccountNetBalance(accountLines.Key, accountLines.Sum(line => line.Debit - line.Credit)))
                .ToListAsync(cancellationToken);
            if (priorProfitAndLoss.Any(x => x.Net != 0m))
                return Results.Conflict(new { error = "Önceki dönemin gelir/gider hesapları sıfırlanmamış. Önceki mali yılı kapatmadan bu dönem devredilemez." });

            var profitAndLoss = await (from entry in db.JournalEntries.AsNoTracking()
                                       join line in db.JournalEntryLines.AsNoTracking()
                                           on new { entry.TenantId, JournalEntryId = entry.Id } equals new { line.TenantId, line.JournalEntryId }
                                       join account in db.LedgerAccounts.AsNoTracking()
                                           on new { line.TenantId, AccountId = line.AccountId } equals new { account.TenantId, AccountId = account.Id }
                                       where entry.TenantId == tenantId && entry.EntryDate >= request.FromDate && entry.EntryDate <= request.ToDate
                                           && (account.StatementSection == LedgerAccountStatementSection.Revenue
                                               || account.StatementSection == LedgerAccountStatementSection.Expense)
                                       group line by line.AccountId into accountLines
                                       select new AccountNetBalance(accountLines.Key, accountLines.Sum(line => line.Debit - line.Credit)))
                .ToListAsync(cancellationToken);
            var profitAndLossLines = profitAndLoss.Where(x => x.Net != 0m)
                .OrderBy(x => accounts[x.AccountId].Code, StringComparer.Ordinal).ToArray();
            var closingLines = new List<(Guid AccountId, decimal Net)>(profitAndLossLines.Length + 1);
            foreach (var accountBalance in profitAndLossLines) closingLines.Add((accountBalance.AccountId, -accountBalance.Net));
            var netResult = profitAndLossLines.Sum(x => x.Net);
            if (netResult != 0m) closingLines.Add((retainedEarnings.Id, netResult));

            var closingEntry = new JournalEntry
            {
                TenantId = tenantId, Code = rangeCode, EntryDate = request.ToDate,
                Description = $"Mali dönem kapanışı {request.FromDate:yyyy-MM-dd} – {request.ToDate:yyyy-MM-dd}",
                SourceType = CloseSource, SourceId = sourceId,
                CreatedByUserId = ParseUserId(principal)
            };
            AddNetLines(closingEntry, closingLines, "Dönem sonucu kapanışı");

            var balancesAfterClose = new Dictionary<Guid, decimal>(balances);
            foreach (var (accountId, net) in closingLines) balancesAfterClose[accountId] = balancesAfterClose.GetValueOrDefault(accountId) + net;
            var openingLines = balancesAfterClose.Where(x => x.Value != 0m).OrderBy(x => accounts[x.Key].Code, StringComparer.Ordinal)
                .Select(x => (x.Key, x.Value)).ToArray();
            if (openingLines.Length == 0 || openingLines.Sum(x => x.Value) != 0m)
                return Results.Conflict(new { error = "Kapanış sonrası açılış bakiyeleri dengelenmiyor; fişler değiştirilmedi." });

            var openingDate = request.ToDate.AddDays(1);
            var openingEntry = new JournalEntry
            {
                TenantId = tenantId, Code = $"FY-OPEN-{rangeCode[9..]}", EntryDate = openingDate,
                Description = $"Açılış bakiyeleri · {openingDate:yyyy-MM-dd}",
                SourceType = OpeningSource, SourceId = openingSourceId,
                CreatedByUserId = ParseUserId(principal)
            };
            AddNetLines(openingEntry, openingLines, "Önceki dönem kapanışından devreden bakiye");

            db.JournalEntries.AddRange(closingEntry, openingEntry);
            if (ParseUserId(principal) is { } userId)
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                    Action = "finance.general-ledger.fiscal-year-closed", Resource = rangeCode });
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/finance/general-ledger/entries/{openingEntry.Id}", new
            {
                range = new { fromDate = request.FromDate, toDate = request.ToDate },
                closingEntry = new { closingEntry.Id, closingEntry.Code, totalDebit = closingEntry.Lines.Sum(x => x.Debit), totalCredit = closingEntry.Lines.Sum(x => x.Credit) },
                openingEntry = new { openingEntry.Id, openingEntry.Code, openingEntry.EntryDate,
                    totalDebit = openingEntry.Lines.Sum(x => x.Debit), totalCredit = openingEntry.Lines.Sum(x => x.Credit) },
                carriedAccountCount = openingEntry.Lines.Count
            });
        }
        finally
        {
            if (transaction is not null) await transaction.DisposeAsync();
        }
    }

    private static void AddNetLines(JournalEntry entry, IEnumerable<(Guid AccountId, decimal Net)> lines, string description)
    {
        var number = 1;
        foreach (var (accountId, net) in lines.Where(x => x.Net != 0m))
            entry.Lines.Add(new JournalEntryLine
            {
                TenantId = entry.TenantId, JournalEntryId = entry.Id, AccountId = accountId,
                LineNumber = number++, Description = description,
                Debit = Math.Max(0m, net), Credit = Math.Max(0m, -net)
            });
    }

    private static string RangeCode(DateOnly from, DateOnly to) => $"FY-CLOSE-{from:yyyyMMdd}-{to:yyyyMMdd}";

    private static bool TryReadRange(string code, out DateOnly from, out DateOnly to)
    {
        from = default; to = default;
        return code.StartsWith("FY-CLOSE-", StringComparison.Ordinal)
            && code.Length == 26
            && DateOnly.TryParseExact(code.Substring(9, 8), "yyyyMMdd", out from)
            && DateOnly.TryParseExact(code.Substring(18, 8), "yyyyMMdd", out to);
    }

    private static Guid StableId(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return new Guid(bytes.AsSpan(0, 16));
    }

    private static Guid? ParseUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out var id) ? id : null;

    private sealed record AccountNetBalance(Guid AccountId, decimal Net);
}

public sealed record FiscalYearCloseRequest(DateOnly FromDate, DateOnly ToDate, Guid RetainedEarningsAccountId);
