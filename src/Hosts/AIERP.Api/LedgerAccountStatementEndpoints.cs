using System.Security.Claims;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

public static class LedgerAccountStatementEndpoints
{
    public static RouteGroupBuilder MapLedgerAccountStatementEndpoint(this RouteGroupBuilder group)
    {
        group.MapGet("/accounts/{accountId:guid}/statement", async (
            Guid accountId,
            DateOnly? from,
            DateOnly? to,
            int? page,
            int? pageSize,
            ClaimsPrincipal principal,
            TenantDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId))
                return Results.Forbid();

            var normalizedPage = page ?? 1;
            var normalizedPageSize = pageSize ?? 50;
            var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
            if (from.HasValue && to.HasValue && from.Value > to.Value)
                errors["dateRange"] = ["Başlangıç tarihi bitiş tarihinden sonra olamaz."];
            if (normalizedPage < 1)
                errors["page"] = ["Sayfa 1 veya daha büyük olmalıdır."];
            if (normalizedPageSize is < 1 or > 200)
                errors["pageSize"] = ["Sayfa boyutu 1 ile 200 arasında olmalıdır."];
            if (normalizedPage >= 1 && normalizedPageSize is >= 1 and <= 200
                && normalizedPage - 1 > int.MaxValue / normalizedPageSize)
                errors["page"] = ["Sayfa numarası desteklenen aralığın dışındadır."];
            if (errors.Count > 0)
                return Results.ValidationProblem(errors);

            var account = await db.LedgerAccounts.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Id == accountId)
                .Select(x => new { x.Id, x.Code, x.Name, x.IsActive })
                .SingleOrDefaultAsync(cancellationToken);
            if (account is null)
                return Results.NotFound();

            var journalLines =
                from entry in db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId)
                join line in db.JournalEntryLines.AsNoTracking()
                    on new { entry.TenantId, JournalEntryId = entry.Id }
                    equals new { line.TenantId, line.JournalEntryId }
                where line.AccountId == accountId
                select new { entry.Id, entry.Code, entry.EntryDate, entry.Description, entry.SourceType, line.LineNumber, LineDescription = line.Description, line.Debit, line.Credit };

            var openingLines = journalLines.Where(line => from.HasValue && line.EntryDate < from.Value);
            var opening = await openingLines.GroupBy(_ => 1)
                .Select(g => new { Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) })
                .SingleOrDefaultAsync(cancellationToken);
            var openingDebit = opening?.Debit ?? 0m;
            var openingCredit = opening?.Credit ?? 0m;

            var periodLines = journalLines
                .Where(x => (!from.HasValue || x.EntryDate >= from.Value)
                    && (!to.HasValue || x.EntryDate <= to.Value));
            var totals = await periodLines.GroupBy(_ => 1)
                .Select(g => new { Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit), Count = g.Count() })
                .SingleOrDefaultAsync(cancellationToken);
            var totalCount = totals?.Count ?? 0;
            var totalDebit = totals?.Debit ?? 0m;
            var totalCredit = totals?.Credit ?? 0m;
            var closingBalance = openingDebit - openingCredit + totalDebit - totalCredit;

            var lines = await periodLines
                .OrderBy(x => x.EntryDate).ThenBy(x => x.Code).ThenBy(x => x.LineNumber)
                .Skip((normalizedPage - 1) * normalizedPageSize)
                .Take(normalizedPageSize)
                .Select(x => new
                {
                    journalEntryId = x.Id,
                    journalEntryCode = x.Code,
                    x.EntryDate,
                    journalDescription = x.Description,
                    x.SourceType,
                    x.LineNumber,
                    lineDescription = x.LineDescription,
                    x.Debit,
                    x.Credit
                })
                .ToListAsync(cancellationToken);

            return Results.Ok(new
            {
                account,
                from,
                to,
                openingDebit,
                openingCredit,
                openingBalanceDebit = Math.Max(0m, openingDebit - openingCredit),
                openingBalanceCredit = Math.Max(0m, openingCredit - openingDebit),
                totalDebit,
                totalCredit,
                closingBalanceDebit = Math.Max(0m, closingBalance),
                closingBalanceCredit = Math.Max(0m, -closingBalance),
                totalCount,
                page = normalizedPage,
                pageSize = normalizedPageSize,
                totalPages = (int)Math.Ceiling(totalCount / (double)normalizedPageSize),
                lines
            });
        });
        return group;
    }
}
