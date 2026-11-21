using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Reads the Finans system pages need beyond the legacy screens: the cash/bank list summary cards (finans.hesap.ozet) and a
/// single ledger account (finans.muhasebe.hesap.getir, the source record of the PUT that replaces the account). Both sit
/// under the existing resources (erp.finance-accounts, erp.general-ledger), so their read permission is the list's.
/// </summary>
public static class FinanceSystemPageEndpoints
{
    internal const string AccountTypeError = "Hesap türü Cash (kasa) veya Bank (banka) olmalıdır.";

    /// <summary>An empty value means every type; otherwise only the names Cash and Bank (case-insensitive, no numbers).</summary>
    internal static bool TryParseAccountType(string? value, out FinancialAccountType? type)
    {
        type = null;
        if (string.IsNullOrWhiteSpace(value)) return true;
        var text = value.Trim();
        if (text.Equals(nameof(FinancialAccountType.Cash), StringComparison.OrdinalIgnoreCase)) type = FinancialAccountType.Cash;
        else if (text.Equals(nameof(FinancialAccountType.Bank), StringComparison.OrdinalIgnoreCase)) type = FinancialAccountType.Bank;
        return type is not null;
    }

    public static void MapFinanceSystemPageEndpoints(this WebApplication app)
    {
        app.MapGet("/api/finance/accounts/summary", async (string? type, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            if (!TryParseAccountType(type, out var accountType))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["type"] = [AccountTypeError] });
            var accounts = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && (accountType == null || x.Type == accountType))
                .Select(x => new
                {
                    x.IsActive, x.CurrencyCode,
                    Balance = x.Transactions.Sum(t => (decimal?)(t.Direction == FinancialDirection.Inflow ? t.Amount : -t.Amount)) ?? 0m
                }).ToListAsync(ct);
            var currencies = accounts.Select(x => x.CurrencyCode).Distinct(StringComparer.Ordinal).ToArray();
            // A total across currencies would add unlike amounts: it is reported only for a single currency (legacy "—").
            return Results.Ok(new FinancialAccountListSummary(accounts.Count, accounts.Count(x => x.IsActive), accounts.Count(x => !x.IsActive),
                accounts.Count(x => x.Balance < 0), currencies.Length, currencies.Length == 1 ? accounts.Sum(x => x.Balance) : null,
                currencies.Length == 1 ? currencies[0] : null));
        }).RequireAuthorization();

        app.MapGet("/api/finance/general-ledger/accounts/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var account = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new LedgerAccountView(x.Id, x.Code, x.Name, x.IsActive, x.StatementSection.ToString(),
                    db.JournalEntryLines.Any(line => line.TenantId == tenantId && line.AccountId == x.Id), x.AccountType.ToString(), x.NormalBalance.ToString(),
                    x.CurrencyCode, x.IfrsAccountCode, x.IfrsAccountName, x.IfrsStatementSection.ToString()))
                .SingleOrDefaultAsync(ct);
            return account is null ? Results.NotFound() : Results.Ok(account);
        }).RequireAuthorization();
    }
}
