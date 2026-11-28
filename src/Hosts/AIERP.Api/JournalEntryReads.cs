using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>The journal entry detail read shared by <c>GET …/general-ledger/entries/{id}</c> and the voucher's document view.</summary>
internal static class JournalEntryReads
{
    internal static async Task<JournalEntryView?> ViewAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct)
    {
        var entry = await db.JournalEntries.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (entry is null) return null;
        var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && entry.Lines.Select(l => l.AccountId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var lines = entry.Lines.OrderBy(x => x.LineNumber).Select(x => new JournalEntryLineView(x.LineNumber, x.AccountId,
            accounts[x.AccountId].Code, accounts[x.AccountId].Name, x.Description, x.Debit, x.Credit)).ToList();
        var reversedBy = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == JournalReversalRules.ReversalSourceType && x.SourceId == entry.Id)
            .Select(x => new { x.Id, x.Code }).FirstOrDefaultAsync(ct);
        var reversalOfCode = entry.SourceType == JournalReversalRules.ReversalSourceType
            ? await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == entry.SourceId).Select(x => x.Code).FirstOrDefaultAsync(ct)
            : null;
        return new JournalEntryView(entry.Id, entry.Code, entry.EntryDate, entry.Description, entry.SourceType,
            entry.SourceId, entry.CreatedAt, lines.Sum(x => x.Debit), lines.Sum(x => x.Credit), lines, reversedBy is not null, entry.AccountingBasis)
        { ReversedByEntryId = reversedBy?.Id, ReversedByEntryCode = reversedBy?.Code, ReversalOfEntryCode = reversalOfCode };
    }
}
